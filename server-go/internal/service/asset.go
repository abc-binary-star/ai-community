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

// assetPredefinedTags 预定义标签白名单。
// 作者手动输入相近标签时归并到此处，避免「写作/文案」等同义词碎片化。
// 小写存储，查询与归并统一按小写匹配。
var assetPredefinedTags = []string{
	"写作", "文案", "摘要", "续写",
	"翻译", "本地化",
	"分析", "解读", "总结",
	"角色扮演", "对话", "问答",
	"格式化", "转换", "提取",
}

// assetPredefinedTagSet 用于 O(1) 查找预定义标签
var assetPredefinedTagSet = func() map[string]bool {
	m := make(map[string]bool, len(assetPredefinedTags))
	for _, t := range assetPredefinedTags {
		m[t] = true
	}
	return m
}()

// assetTagMaxCount 标签数量上限
const assetTagMaxCount = 5

// assetTagMaxLen 单个标签长度上限（rune 数）
const assetTagMaxLen = 10

// normalizeTags 校验并归并资产标签：
//   - 数量 0-5 个（允许空，表示不打标签）
//   - 单个标签 ≤ 10 字符
//   - 去重 + 去空格
//   - 预定义白名单中的标签原样保留；非预定义标签尝试归并到相近预定义标签
//   - 归并失败（无相近项）时保留原始标签，允许自定义标签存在
func normalizeTags(tags []string) ([]string, error) {
	if len(tags) == 0 {
		return []string{}, nil
	}
	if len(tags) > assetTagMaxCount {
		return nil, fmt.Errorf("%w: 标签最多 %d 个", ErrAssetInvalidInput, assetTagMaxCount)
	}
	seen := make(map[string]bool, len(tags))
	result := make([]string, 0, len(tags))
	for _, raw := range tags {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		if len([]rune(t)) > assetTagMaxLen {
			return nil, fmt.Errorf("%w: 标签长度不能超过 %d 个字符: %s", ErrAssetInvalidInput, assetTagMaxLen, t)
		}
		// 归并：预定义标签直接命中
		if assetPredefinedTagSet[t] {
			if !seen[t] {
				seen[t] = true
				result = append(result, t)
			}
			continue
		}
		// 归并：尝试找相近的预定义标签（编辑距离 ≤ 2）
		merged := mergeToPredefinedTag(t)
		if merged != "" {
			if !seen[merged] {
				seen[merged] = true
				result = append(result, merged)
			}
			continue
		}
		// 无法归并：保留原始标签（允许自定义）
		if !seen[t] {
			seen[t] = true
			result = append(result, t)
		}
	}
	return result, nil
}

// mergeToPredefinedTag 尝试将自定义标签归并到最相近的预定义标签。
// 遍历全部预定义标签取编辑距离最小者；最小距离 ≤ 2 视为相近（如「文按」->「文案」）。
// 返回归并后的标签；无法归并返回空串。
func mergeToPredefinedTag(tag string) string {
	best := ""
	bestDist := assetTagMaxLen + 1
	for _, pre := range assetPredefinedTags {
		if d := editDistance(tag, pre); d < bestDist {
			bestDist = d
			best = pre
		}
	}
	if bestDist <= 2 {
		return best
	}
	return ""
}

// editDistance 计算两个字符串的 Levenshtein 编辑距离。
// 用于标签归并：距离 ≤ 2 视为相近。
func editDistance(a, b string) int {
	ra := []rune(a)
	rb := []rune(b)
	la := len(ra)
	lb := len(rb)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}
	dp := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		dp[j] = j
	}
	for i := 1; i <= la; i++ {
		prev := dp[0]
		dp[0] = i
		for j := 1; j <= lb; j++ {
			tmp := dp[j]
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			dp[j] = minInt(minInt(dp[j]+1, dp[j-1]+1), prev+cost)
			prev = tmp
		}
	}
	return dp[lb]
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
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
	tags, err := normalizeTags(req.Tags)
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
		Tags:            tags,
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
// 支持按 authorID / type / tag / 关键字过滤；sort 控制排序；分页。
// 搜索范围：name + description + prompt_template（C1 升级）。
func (s *AssetService) ListAssets(ctx context.Context, viewerID, authorID, assetType, tag, keyword, sort string, page, pageSize int) (*types.Paginated[types.Asset], error) {
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
	// 标签过滤：jsonb @> 包含查询，tags 列存 ["写作","翻译"] 格式
	if tag = strings.TrimSpace(tag); tag != "" {
		q = q.Where("tags @> ?::jsonb", `["`+tag+`"]`)
	}
	// 搜索范围扩展到 prompt_template（C1 升级）
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("(name ILIKE ? OR description ILIKE ? OR prompt_template ILIKE ?)", like, like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}
	// 排序：latest（默认）/ hot（运行次数）/ forks（派生次数）
	orderClause := "created_at DESC"
	switch sort {
	case "", "latest":
		orderClause = "created_at DESC"
	case "hot":
		orderClause = "run_count DESC, created_at DESC"
	case "forks":
		orderClause = "fork_count DESC, created_at DESC"
	default:
		return nil, fmt.Errorf("%w: 非法的 sort 参数: %s", ErrAssetInvalidInput, sort)
	}
	var rows []model.Asset
	if err := q.Order(orderClause).
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
	if req.Tags != nil {
		tags, err := normalizeTags(*req.Tags)
		if err != nil {
			return nil, err
		}
		updates["tags"] = tags
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

// ListAssetTags 热门资产标签统计（C1）。
// 仅统计 published + public 的资产，按标签出现次数倒序，取 top limit 个。
// 用 jsonb_array_elements_text 把 tags jsonb 数组展开为行后聚合。
func (s *AssetService) ListAssetTags(ctx context.Context, limit int) ([]types.AssetTagStat, error) {
	if limit <= 0 {
		limit = 20
	}
	type tagRow struct {
		Tag   string
		Count int64
	}
	var rows []tagRow
	err := dal.DB.WithContext(ctx).Model(&model.Asset{}).
		Select("jsonb_array_elements_text(tags) AS tag, count(*) AS count").
		Where("status = ? AND visibility = ?",
			model.AssetStatusPublished, model.AssetVisibilityPublic).
		// jsonb_array_length(NULL) 返回 NULL，WHERE 判定为 FALSE 被过滤，空标签数组同样被排除
		Where("jsonb_array_length(tags) > 0").
		Group("tag").
		Order("count DESC, tag ASC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		log.Printf("[Asset/ListAssetTags] 标签统计失败, err=%v", err)
		return nil, err
	}
	items := make([]types.AssetTagStat, 0, len(rows))
	for _, r := range rows {
		items = append(items, types.AssetTagStat{Tag: r.Tag, Count: r.Count})
	}
	return items, nil
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
	tags := a.Tags
	if tags == nil {
		tags = []string{}
	}
	dto := types.Asset{
		ID:             a.ID,
		Type:           a.Type,
		Name:           a.Name,
		Version:        a.Version,
		Description:    a.Description,
		PromptTemplate: a.PromptTemplate,
		InputVariables: decodeInputVariables(a.InputVariables),
		DefaultParams:  decodeDefaultParams(a.DefaultParams),
		Tags:           tags,
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
