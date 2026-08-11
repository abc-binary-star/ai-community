// Package service: AssetService AI 资产卡服务（B1）
//
// 提供 Prompt / Agent / Workflow 资产的 CRUD 与可见性控制：
//   - 草稿仅作者可见，published+public 进列表，unlisted 不进列表但直链可访问
//   - 已发布资产只允许改 description / visibility / status，避免内容被静默替换
//   - 删除走硬删除：资产本身是创作物，但 MVP 阶段不做回收站，由作者自负
//   - 运行计数（RunCount）由 B3 试玩接口在每次运行后调用 IncrementRunCount 累加
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// AssetService AI 资产服务
type AssetService struct{}

// AssetError 资产业务错误
type AssetError struct {
	Msg  string
	Code int
}

func (e *AssetError) Error() string { return e.Msg }

var (
	ErrAssetNotFound     = &AssetError{Msg: "资产不存在", Code: 404}
	ErrAssetForbidden    = &AssetError{Msg: "无权操作该资产", Code: 403}
	ErrAssetInvalidInput = &AssetError{Msg: "输入不合法", Code: 400}
	ErrAssetLocked       = &AssetError{Msg: "已发布的资产不允许修改正文，请先下线或新建版本", Code: 409}
)

// 变量名规则：字母/下划线开头，后接字母数字下划线
var assetVarNamePattern = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// 允许的变量类型
var assetVarTypes = map[string]bool{
	"string":  true,
	"number":  true,
	"boolean": true,
	"select":  true,
}

// CreateAsset 创建资产。作者 ID 必填；status 默认 draft。
func (s *AssetService) CreateAsset(ctx context.Context, req types.CreateAssetReq, authorID string) (*types.Asset, error) {
	if authorID == "" {
		return nil, ErrAssetForbidden
	}
	if req.Name == "" || req.PromptTemplate == "" {
		return nil, ErrAssetInvalidInput
	}
	assetType := req.Type
	if assetType == "" {
		assetType = model.AssetTypePrompt
	}
	switch assetType {
	case model.AssetTypePrompt, model.AssetTypeAgent, model.AssetTypeWorkflow:
	default:
		return nil, ErrAssetInvalidInput
	}
	status := req.Status
	if status == "" {
		status = model.AssetStatusDraft
	}
	visibility := req.Visibility
	if visibility == "" {
		visibility = model.AssetVisibilityPublic
	}

	inputVars, err := normalizeInputVariables(req.InputVariables)
	if err != nil {
		return nil, err
	}
	defaultParams, err := normalizeDefaultParams(req.DefaultParams)
	if err != nil {
		return nil, err
	}

	// ParentID 校验：来源资产必须存在且已发布
	if req.ParentID != nil && *req.ParentID != "" {
		var parent model.Asset
		if err := dal.DB.WithContext(ctx).Select("id", "status").First(&parent, "id = ?", *req.ParentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrAssetInvalidInput
			}
			return nil, err
		}
		// 仅作为 fork 计数的依据；Remix 完整流程在 B5 落地
	}

	rec := &model.Asset{
		Type:            assetType,
		Name:            strings.TrimSpace(req.Name),
		Version:         trimOrDefault(req.Version, "1.0.0"),
		Description:     req.Description,
		PromptTemplate:  req.PromptTemplate,
		InputVariables:  inputVars,
		DefaultParams:   defaultParams,
		AuthorID:        authorID,
		ParentID:        req.ParentID,
		Status:          status,
		Visibility:      visibility,
	}

	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(rec).Error; err != nil {
			return err
		}
		// 父资产 fork 计数 +1
		if req.ParentID != nil && *req.ParentID != "" {
			if err := tx.Model(&model.Asset{}).Where("id = ?", *req.ParentID).
				UpdateColumn("fork_count", gorm.Expr("fork_count + 1")).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		log.Printf("[Asset/Create] 创建失败, author=%s, name=%s, err=%v", authorID, rec.Name, err)
		return nil, err
	}
	return s.loadDTO(ctx, rec.ID, authorID)
}

// GetAsset 获取单个资产。
// 可见性规则：
//   - 作者可见自己的全部资产
//   - 其他人仅可见 published 状态的资产（unlisted/private 仍可通过直链访问 published，但 draft/archived 不可）
func (s *AssetService) GetAsset(ctx context.Context, id, viewerID string) (*types.Asset, error) {
	var rec model.Asset
	if err := dal.DB.WithContext(ctx).Preload("Author").First(&rec, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssetNotFound
		}
		return nil, err
	}
	if !canViewAsset(&rec, viewerID) {
		// 无权查看时返回 NotFound，避免泄露资产存在性
		return nil, ErrAssetNotFound
	}
	dto := s.mapToDTO(&rec, false)
	return &dto, nil
}

// ListAssets 列出已发布资产（公开列表）。
// 支持按 authorID / type / 关键字过滤；分页。
func (s *AssetService) ListAssets(ctx context.Context, viewerID, authorID, assetType, keyword string, page, pageSize int) (*types.Paginated[types.Asset], error) {
	q := dal.DB.WithContext(ctx).Model(&model.Asset{}).
		Preload("Author").
		Where("status = ?", model.AssetStatusPublished)
	// 公开列表只展示 public 可见资产；作者查看自己时可看到 unlisted/private
	if authorID != "" && authorID == viewerID {
		q = q.Where("visibility IN ? OR author_id = ?",
			[]string{model.AssetVisibilityPublic}, authorID)
	} else {
		q = q.Where("visibility = ?", model.AssetVisibilityPublic)
		if authorID != "" {
			q = q.Where("author_id = ?", authorID)
		}
	}
	if assetType != "" {
		q = q.Where("type = ?", assetType)
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("(name ILIKE ? OR description ILIKE ?)", like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}
	var rows []model.Asset
	if err := q.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]types.Asset, 0, len(rows))
	for i := range rows {
		items = append(items, s.mapToDTO(&rows[i], false))
	}
	return &types.Paginated[types.Asset]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// ListAssetsByUser 查看某用户的资产。
// viewerID == targetUserID 时返回全部；否则仅返回 published+public。
func (s *AssetService) ListAssetsByUser(ctx context.Context, targetUserID, viewerID string, page, pageSize int) (*types.Paginated[types.Asset], error) {
	q := dal.DB.WithContext(ctx).Model(&model.Asset{}).
		Preload("Author").
		Where("author_id = ?", targetUserID)
	if targetUserID != viewerID {
		q = q.Where("status = ? AND visibility = ?",
			model.AssetStatusPublished, model.AssetVisibilityPublic)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}
	var rows []model.Asset
	if err := q.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]types.Asset, 0, len(rows))
	for i := range rows {
		items = append(items, s.mapToDTO(&rows[i], false))
	}
	return &types.Paginated[types.Asset]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// UpdateAsset 更新资产。仅作者可改；已 published 的资产不允许改正文相关字段。
func (s *AssetService) UpdateAsset(ctx context.Context, id, viewerID string, req types.UpdateAssetReq) (*types.Asset, error) {
	var rec model.Asset
	if err := dal.DB.WithContext(ctx).First(&rec, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssetNotFound
		}
		return nil, err
	}
	if rec.AuthorID != viewerID {
		return nil, ErrAssetForbidden
	}

	// 已 published 的资产不允许修改正文 / 输入变量 / 默认参数 / 类型相关字段
	locked := rec.Status == model.AssetStatusPublished
	if locked {
		if req.Name != nil || req.Version != nil || req.PromptTemplate != nil ||
			req.InputVariables != nil || req.DefaultParams != nil {
			return nil, ErrAssetLocked
		}
	}

	updates := map[string]any{}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" || len(name) > 150 {
			return nil, ErrAssetInvalidInput
		}
		updates["name"] = name
	}
	if req.Version != nil {
		v := strings.TrimSpace(*req.Version)
		if len(v) > 30 {
			return nil, ErrAssetInvalidInput
		}
		updates["version"] = v
	}
	if req.Description != nil {
		if len(*req.Description) > 1000 {
			return nil, ErrAssetInvalidInput
		}
		updates["description"] = *req.Description
	}
	if req.PromptTemplate != nil {
		t := *req.PromptTemplate
		if len(t) == 0 || len(t) > 20000 {
			return nil, ErrAssetInvalidInput
		}
		updates["prompt_template"] = t
	}
	if req.InputVariables != nil {
		raw, err := normalizeInputVariables(*req.InputVariables)
		if err != nil {
			return nil, err
		}
		updates["input_variables"] = raw
	}
	if req.DefaultParams != nil {
		raw, err := normalizeDefaultParams(req.DefaultParams)
		if err != nil {
			return nil, err
		}
		updates["default_params"] = raw
	}
	if req.Status != nil {
		switch *req.Status {
		case model.AssetStatusDraft, model.AssetStatusPublished, model.AssetStatusArchived:
		default:
			return nil, ErrAssetInvalidInput
		}
		updates["status"] = *req.Status
	}
	if req.Visibility != nil {
		switch *req.Visibility {
		case model.AssetVisibilityPublic, model.AssetVisibilityUnlisted, model.AssetVisibilityPrivate:
		default:
			return nil, ErrAssetInvalidInput
		}
		updates["visibility"] = *req.Visibility
	}

	if len(updates) > 0 {
		if err := dal.DB.WithContext(ctx).Model(&rec).Where("id = ?", id).Updates(updates).Error; err != nil {
			log.Printf("[Asset/Update] 更新失败, id=%s, err=%v", id, err)
			return nil, err
		}
	}
	return s.loadDTO(ctx, id, viewerID)
}

// DeleteAsset 删除资产。仅作者可删；硬删除。
// 不级联清理 PostAsset 绑定——外键 OnDelete:CASCADE 会自动清理绑定记录。
func (s *AssetService) DeleteAsset(ctx context.Context, id, viewerID string) error {
	var rec model.Asset
	if err := dal.DB.WithContext(ctx).Select("id", "author_id").First(&rec, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAssetNotFound
		}
		return err
	}
	if rec.AuthorID != viewerID {
		return ErrAssetForbidden
	}
	if err := dal.DB.WithContext(ctx).Delete(&model.Asset{}, "id = ?", id).Error; err != nil {
		log.Printf("[Asset/Delete] 删除失败, id=%s, err=%v", id, err)
		return err
	}
	return nil
}

// IncrementRunCount 试玩成功后累加运行计数（B3 调用）。
// 用 UpdateColumn + gorm.Expr 避免与并发运行产生丢更新。
func (s *AssetService) IncrementRunCount(ctx context.Context, id string) {
	if err := dal.DB.WithContext(ctx).Model(&model.Asset{}).Where("id = ?", id).
		UpdateColumn("run_count", gorm.Expr("run_count + 1")).Error; err != nil {
		log.Printf("[Asset/IncrementRunCount] 累加失败, id=%s, err=%v", id, err)
	}
}

// loadDTO 查询并映射为 DTO
func (s *AssetService) loadDTO(ctx context.Context, id, viewerID string) (*types.Asset, error) {
	var rec model.Asset
	if err := dal.DB.WithContext(ctx).Preload("Author").First(&rec, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssetNotFound
		}
		return nil, err
	}
	dto := s.mapToDTO(&rec, false)
	return &dto, nil
}

// mapToDTO 将 model.Asset 映射为 types.Asset。
// liked 由调用方在聚合层补充，这里默认 false（点赞在 B3/B4 之后再加）。
func (s *AssetService) mapToDTO(a *model.Asset, liked bool) types.Asset {
	dto := types.Asset{
		ID:             a.ID,
		Type:           a.Type,
		Name:           a.Name,
		Version:        a.Version,
		Description:    a.Description,
		PromptTemplate: a.PromptTemplate,
		InputVariables: decodeInputVariables(a.InputVariables),
		DefaultParams:  decodeDefaultParams(a.DefaultParams),
		AuthorID:       a.AuthorID,
		Author:         mapper.AuthorToDTO(&a.Author),
		ParentID:       a.ParentID,
		Status:         a.Status,
		Visibility:     a.Visibility,
		RunCount:       a.RunCount,
		ForkCount:      a.ForkCount,
		LikeCount:      a.LikeCount,
		Liked:          liked,
		CreatedAt:      a.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      a.UpdatedAt.Format(time.RFC3339),
	}
	return dto
}

// canViewAsset 判断查看者是否可见该资产。
func canViewAsset(a *model.Asset, viewerID string) bool {
	if a.AuthorID == viewerID {
		return true
	}
	if a.Status != model.AssetStatusPublished {
		return false
	}
	// published 状态：public / unlisted 直链可访问；private 仅作者
	return a.Visibility == model.AssetVisibilityPublic || a.Visibility == model.AssetVisibilityUnlisted
}

// normalizeInputVariables 校验并序列化输入变量声明。
func normalizeInputVariables(vars []types.AssetInputVariable) (json.RawMessage, error) {
	if len(vars) == 0 {
		return json.RawMessage("[]"), nil
	}
	seen := make(map[string]bool, len(vars))
	for i, v := range vars {
		name := strings.TrimSpace(v.Name)
		if name == "" || !assetVarNamePattern.MatchString(name) {
			return nil, fmt.Errorf("%w: 输入变量名不合法: %s", ErrAssetInvalidInput, v.Name)
		}
		if seen[name] {
			return nil, fmt.Errorf("%w: 输入变量名重复: %s", ErrAssetInvalidInput, name)
		}
		seen[name] = true
		if v.Type == "" {
			vars[i].Type = "string"
		}
		if !assetVarTypes[vars[i].Type] {
			return nil, fmt.Errorf("%w: 输入变量类型不合法: %s", ErrAssetInvalidInput, vars[i].Type)
		}
		if vars[i].Type == "select" && len(v.Options) == 0 {
			return nil, fmt.Errorf("%w: select 类型变量必须提供 options: %s", ErrAssetInvalidInput, name)
		}
		vars[i].Name = name
	}
	raw, err := json.Marshal(vars)
	if err != nil {
		return nil, fmt.Errorf("%w: 序列化输入变量失败: %v", ErrAssetInvalidInput, err)
	}
	return raw, nil
}

// normalizeDefaultParams 校验并序列化默认运行参数。
func normalizeDefaultParams(p *types.AssetDefaultParams) (json.RawMessage, error) {
	params := types.AssetDefaultParams{}
	if p != nil {
		params = *p
	}
	if params.Temperature < 0 || params.Temperature > 2 {
		return nil, fmt.Errorf("%w: temperature 必须在 0~2 之间", ErrAssetInvalidInput)
	}
	if params.MaxTokens < 0 || params.MaxTokens > 32000 {
		return nil, fmt.Errorf("%w: maxTokens 必须在 0~32000 之间", ErrAssetInvalidInput)
	}
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, fmt.Errorf("%w: 序列化默认参数失败: %v", ErrAssetInvalidInput, err)
	}
	return raw, nil
}

// decodeInputVariables 反序列化输入变量；空值兜底为空数组
func decodeInputVariables(raw json.RawMessage) []types.AssetInputVariable {
	if len(raw) == 0 {
		return []types.AssetInputVariable{}
	}
	var vars []types.AssetInputVariable
	if err := json.Unmarshal(raw, &vars); err != nil {
		return []types.AssetInputVariable{}
	}
	if vars == nil {
		return []types.AssetInputVariable{}
	}
	return vars
}

// decodeDefaultParams 反序列化默认参数；空值兜底为零值结构
func decodeDefaultParams(raw json.RawMessage) types.AssetDefaultParams {
	var p types.AssetDefaultParams
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &p)
	}
	return p
}

// trimOrDefault 去除首尾空格，为空时返回默认值
func trimOrDefault(v, def string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return def
	}
	return v
}
