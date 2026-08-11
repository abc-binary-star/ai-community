// Package service: AssetRunService 资产试玩与运行快照服务（B3 + B4）
//
// 在帖子详情页或资产详情页运行 Prompt 资产：
//   - 按资产 InputVariables 声明校验用户传入的 inputs，必填项缺失直接拒绝
//   - 用字符串替换把 {{var}} 占位替换为用户输入值
//   - 通过 ai.ChatDetailed 调用 LLM，返回输出文本 + 模型 + 用量 + 耗时
//   - 运行结果（成功或失败）落 AssetRun 快照，供历史回看、分享、复现使用
//   - 运行成功后异步累加资产的 RunCount
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ailimit"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// AssetRunService 资产试玩与运行快照服务
type AssetRunService struct {
	assetSvc *AssetService
}

// NewAssetRunService 构造默认实现
func NewAssetRunService() *AssetRunService {
	return &AssetRunService{assetSvc: &AssetService{}}
}

// assetVarTokenPattern 模板中的变量占位：{{name}} 或 {{ name }}
var assetVarTokenPattern = regexp.MustCompile(`\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}`)

// Run 运行资产。
// 流程：加载资产 -> 校验可见性 -> 校验输入 -> 渲染模板 -> 调用 LLM -> 落快照 -> 累加运行计数。
// 失败时返回 AssetError；LLM 错误原样透传给调用方（由 handler 决定 HTTP 状态码）。
// 无论成功失败都会落一条 AssetRun 快照（failed + error_message），便于排查与回看。
func (s *AssetRunService) Run(ctx context.Context, assetID, userID string, req types.RunAssetReq) (*types.RunAssetResult, error) {
	if assetID == "" || userID == "" {
		return nil, ErrAssetInvalidInput
	}
	if !ai.Enabled() {
		return nil, &AssetError{Msg: "AI 功能未开启", Code: 503}
	}

	// 加载资产并校验可见性
	var rec model.Asset
	if err := dal.DB.WithContext(ctx).Preload("Author").First(&rec, "id = ?", assetID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssetNotFound
		}
		return nil, err
	}
	if !canViewAsset(&rec, userID) {
		return nil, ErrAssetNotFound
	}
	// 仅 prompt 类型支持试玩
	if rec.Type != model.AssetTypePrompt {
		return nil, &AssetError{Msg: "当前资产类型暂不支持试玩", Code: 400}
	}

	// 解析输入变量声明 + 校验用户输入
	declared := decodeInputVariables(rec.InputVariables)
	if err := validateInputs(declared, req.Inputs); err != nil {
		return nil, err
	}

	// 渲染模板：替换 {{var}} 占位
	rendered := renderTemplate(rec.PromptTemplate, req.Inputs)

	// 合并默认参数与用户覆盖参数
	params := decodeDefaultParams(rec.DefaultParams)
	if req.Params != nil {
		if req.Params.MaxTokens > 0 {
			params.MaxTokens = req.Params.MaxTokens
		}
		if req.Params.Temperature > 0 {
			params.Temperature = req.Params.Temperature
		}
		// model 字段忽略用户覆盖，统一由后端管理
	}
	if params.MaxTokens <= 0 {
		params.MaxTokens = 1000
	}
	if params.Temperature <= 0 {
		params.Temperature = 0.3
	}

	// 调用 LLM；限制检查由 ailimit 中间件在进入 handler 前完成，
	// 这里 ai.ChatDetailed 会再次执行 preCheckHook（与现有 rewrite 等接口一致）。
	start := time.Now()
	output, usage, modelName, err := ai.ChatDetailed(ctx, ai.ChatRequest{
		User:        rendered,
		MaxTokens:   params.MaxTokens,
		Temperature: params.Temperature,
		UserID:      userID,
		Feature:     string(ailimit.FeatureAssetRun),
	})
	durationMs := int(time.Since(start).Milliseconds())

	// 落运行快照（成功 / 失败均落，失败时记录错误信息）
	runID := s.persistRun(ctx, assetRunSnapshot{
		AssetID:          assetID,
		UserID:           userID,
		Inputs:           req.Inputs,
		Params:           params,
		Output:           output,
		Model:            modelName,
		Usage:            usage,
		DurationMs:       durationMs,
		Err:              err,
	})

	if err != nil {
		log.Printf("[AssetRun] 调用 LLM 失败, assetID=%s, userID=%s, err=%v", assetID, userID, err)
		return nil, err
	}

	// 异步累加运行计数（失败仅告警，不影响用户拿到结果）
	if s.assetSvc != nil {
		go func() {
			bg, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			s.assetSvc.IncrementRunCount(bg, assetID)
		}()
	}

	return &types.RunAssetResult{
		Output:     output,
		Model:      modelName,
		Params:     params,
		Usage:      types.RunUsage(usage),
		DurationMs: durationMs,
		RunID:      runID,
	}, nil
}

// assetRunSnapshot 落快照的中间结构
type assetRunSnapshot struct {
	AssetID    string
	UserID     string
	Inputs     map[string]any
	Params     types.AssetDefaultParams
	Output     string
	Model      string
	Usage      ai.UsageInfo
	DurationMs int
	Err        error
}

// persistRun 落一条运行快照。失败仅告警，不阻断主流程（用户仍能拿到 LLM 结果）。
// 返回快照 ID；落库失败时返回空串。
func (s *AssetRunService) persistRun(ctx context.Context, snap assetRunSnapshot) string {
	inputsRaw, _ := json.Marshal(snap.Inputs)
	if snap.Inputs == nil {
		inputsRaw = json.RawMessage("{}")
	}
	paramsRaw, _ := json.Marshal(snap.Params)

	rec := &model.AssetRun{
		AssetID:          snap.AssetID,
		UserID:           snap.UserID,
		Inputs:           inputsRaw,
		Params:           paramsRaw,
		Output:           snap.Output,
		Model:            snap.Model,
		PromptTokens:     snap.Usage.PromptTokens,
		CompletionTokens: snap.Usage.CompletionTokens,
		TotalTokens:      snap.Usage.TotalTokens,
		DurationMs:       snap.DurationMs,
		Visibility:       model.AssetRunVisibilityPrivate,
	}
	if snap.Err != nil {
		rec.Status = model.AssetRunStatusFailed
		rec.ErrorMessage = truncateErr(snap.Err.Error())
	} else {
		rec.Status = model.AssetRunStatusSuccess
	}

	if err := dal.DB.WithContext(ctx).Create(rec).Error; err != nil {
		log.Printf("[AssetRun] 落快照失败, assetID=%s, userID=%s, err=%v", snap.AssetID, snap.UserID, err)
		return ""
	}
	return rec.ID
}

// truncateErr 限制错误信息长度，避免超长 LLM 错误撑爆字段
func truncateErr(s string) string {
	const max = 1000
	if len(s) > max {
		return s[:max]
	}
	return s
}

// GetRun 查看单条运行快照。
// 可见性：作者可见自己的任意快照；其他人仅可见 public 快照。
func (s *AssetRunService) GetRun(ctx context.Context, runID, viewerID string) (*types.AssetRun, error) {
	var rec model.AssetRun
	if err := dal.DB.WithContext(ctx).
		Preload("Asset").Preload("User").
		First(&rec, "id = ?", runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssetNotFound
		}
		return nil, err
	}
	if !canViewRun(&rec, viewerID) {
		return nil, ErrAssetNotFound
	}
	dto := s.mapToDTO(&rec)
	return &dto, nil
}

// ListAssetRuns 列出某资产的运行快照。
// 非资产作者仅可见 public 快照；按 created_at DESC 排序。
func (s *AssetRunService) ListAssetRuns(ctx context.Context, assetID, viewerID string, page, pageSize int) (*types.Paginated[types.AssetRun], error) {
	q := dal.DB.WithContext(ctx).Model(&model.AssetRun{}).
		Preload("Asset").Preload("User").
		Where("asset_id = ?", assetID)
	// 判断查看者是否为资产作者
	var asset model.Asset
	isAuthor := false
	if err := dal.DB.WithContext(ctx).Select("id", "author_id").First(&asset, "id = ?", assetID).Error; err == nil {
		isAuthor = asset.AuthorID == viewerID
	}
	if !isAuthor {
		q = q.Where("visibility = ?", model.AssetRunVisibilityPublic)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}
	var rows []model.AssetRun
	if err := q.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]types.AssetRun, 0, len(rows))
	for i := range rows {
		items = append(items, s.mapToDTO(&rows[i]))
	}
	return &types.Paginated[types.AssetRun]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// ListMyRuns 当前用户的运行历史
// GET /api/assets/runs/me
func (s *AssetRunService) ListMyRuns(ctx context.Context, userID string, page, pageSize int) (*types.Paginated[types.AssetRun], error) {
	q := dal.DB.WithContext(ctx).Model(&model.AssetRun{}).
		Preload("Asset").Preload("User").
		Where("user_id = ?", userID)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}
	var rows []model.AssetRun
	if err := q.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]types.AssetRun, 0, len(rows))
	for i := range rows {
		items = append(items, s.mapToDTO(&rows[i]))
	}
	return &types.Paginated[types.AssetRun]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// UpdateRunVisibility 修改运行快照可见范围（仅作者可改）。
// 设为 public 即「发布结果」用于分享；改回 private 即「撤回分享」。
func (s *AssetRunService) UpdateRunVisibility(ctx context.Context, runID, viewerID, visibility string) (*types.AssetRun, error) {
	switch visibility {
	case model.AssetRunVisibilityPrivate, model.AssetRunVisibilityPublic:
	default:
		return nil, ErrAssetInvalidInput
	}
	var rec model.AssetRun
	if err := dal.DB.WithContext(ctx).First(&rec, "id = ?", runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssetNotFound
		}
		return nil, err
	}
	if rec.UserID != viewerID {
		return nil, ErrAssetForbidden
	}
	if err := dal.DB.WithContext(ctx).Model(&rec).Update("visibility", visibility).Error; err != nil {
		return nil, err
	}
	rec.Visibility = visibility
	dto := s.mapToDTO(&rec)
	return &dto, nil
}

// canViewRun 判断查看者是否可见该运行快照
func canViewRun(r *model.AssetRun, viewerID string) bool {
	if r.UserID == viewerID {
		return true
	}
	return r.Visibility == model.AssetRunVisibilityPublic
}

// mapToDTO 把 model.AssetRun 映射为 types.AssetRun
func (s *AssetRunService) mapToDTO(r *model.AssetRun) types.AssetRun {
	dto := types.AssetRun{
		ID:               r.ID,
		AssetID:          r.AssetID,
		UserID:           r.UserID,
		User:             mapper.AuthorToDTO(&r.User),
		Inputs:           decodeInputsMap(r.Inputs),
		Params:           decodeDefaultParams(r.Params),
		Output:           r.Output,
		Model:            r.Model,
		PromptTokens:     r.PromptTokens,
		CompletionTokens: r.CompletionTokens,
		TotalTokens:      r.TotalTokens,
		DurationMs:       r.DurationMs,
		Status:           r.Status,
		ErrorMessage:     r.ErrorMessage,
		Visibility:       r.Visibility,
		PostID:           r.PostID,
		CreatedAt:        r.CreatedAt.Format(time.RFC3339),
	}
	// Asset 在 Preload 后填充；为空时（资产已删）跳过摘要
	if r.Asset.ID != "" {
		summary := types.AssetSummary{
			ID:      r.Asset.ID,
			Name:    r.Asset.Name,
			Type:    r.Asset.Type,
			Version: r.Asset.Version,
		}
		dto.Asset = &summary
	}
	return dto
}

// decodeInputsMap 反序列化输入；空值兜底为空 map
func decodeInputsMap(raw json.RawMessage) map[string]any {
	m := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &m)
	}
	return m
}

// validateInputs 校验用户输入与变量声明的一致性：
//   - 必填变量必须提供
//   - 类型匹配（select 必须命中 options）
//   - 不允许多余的未知变量（避免用户传任意键污染模板）
func validateInputs(declared []types.AssetInputVariable, inputs map[string]any) error {
	declaredSet := make(map[string]bool, len(declared))
	for _, d := range declared {
		declaredSet[d.Name] = true
		val, ok := inputs[d.Name]
		if d.Required {
			if !ok || val == nil {
				return fmt.Errorf("%w: 缺少必填变量 %s", ErrAssetInvalidInput, d.Name)
			}
		}
		if !ok {
			continue
		}
		if err := validateInputValue(d, val); err != nil {
			return err
		}
	}
	// 拒绝未声明的多余键
	for k := range inputs {
		if !declaredSet[k] {
			return fmt.Errorf("%w: 未声明的输入变量 %s", ErrAssetInvalidInput, k)
		}
	}
	return nil
}

// validateInputValue 按声明类型校验单个值
func validateInputValue(d types.AssetInputVariable, val any) error {
	switch d.Type {
	case "", "string":
		if _, ok := val.(string); !ok {
			return fmt.Errorf("%w: 变量 %s 应为字符串", ErrAssetInvalidInput, d.Name)
		}
	case "number":
		switch v := val.(type) {
		case float64, float32, int, int64, int32:
			_ = v
		default:
			return fmt.Errorf("%w: 变量 %s 应为数字", ErrAssetInvalidInput, d.Name)
		}
	case "boolean":
		if _, ok := val.(bool); !ok {
			return fmt.Errorf("%w: 变量 %s 应为布尔值", ErrAssetInvalidInput, d.Name)
		}
	case "select":
		s, ok := val.(string)
		if !ok {
			return fmt.Errorf("%w: 变量 %s 应为字符串", ErrAssetInvalidInput, d.Name)
		}
		matched := false
		for _, opt := range d.Options {
			if fmt.Sprint(opt) == s {
				matched = true
				break
			}
		}
		if !matched {
			return fmt.Errorf("%w: 变量 %s 的值不在可选项中", ErrAssetInvalidInput, d.Name)
		}
	}
	return nil
}

// renderTemplate 把 {{var}} 占位替换为用户输入值的字符串形式。
// 未在 inputs 中出现的占位保留原文（用户可见，便于定位漏填）。
// 字符串值原样替换；数字/布尔值用 fmt.Sprint 转字符串。
func renderTemplate(tpl string, inputs map[string]any) string {
	return assetVarTokenPattern.ReplaceAllStringFunc(tpl, func(token string) string {
		name := strings.TrimSpace(token[2 : len(token)-2])
		val, ok := inputs[name]
		if !ok || val == nil {
			return token
		}
		switch v := val.(type) {
		case string:
			return v
		case bool:
			return strconv.FormatBool(v)
		case float64:
			// JSON 数字默认解析为 float64；整数去掉小数部分
			if v == float64(int64(v)) {
				return strconv.FormatInt(int64(v), 10)
			}
			return strconv.FormatFloat(v, 'f', -1, 64)
		case float32, int, int64, int32:
			return fmt.Sprint(v)
		default:
			return fmt.Sprint(v)
		}
	})
}

// --- B5：结果分享与复现/Remix ---

// ReplayRun 一键复现：基于已有快照记录的 inputs + params 重新运行资产。
//
// 复现语义：
//   - 仅可复现 success 状态的快照（failed 无可复现的输入语义）
//   - 仅可复现可见的快照：作者自己的任意快照，或 visibility=public 的他人快照
//   - 复现会消耗调用者的 AI 配额（与正常 Run 一致），落一条新快照属于调用者
//   - 复现使用资产当前版本的 PromptTemplate，而非快照时的版本：
//     快照记录的是「当时的输出」，而复现应当反映资产「现在的能力」，
//     否则作者修复模板后历史结果无法被重新验证，违背复现的初衷
//
// 返回新的 RunAssetResult（含新快照 ID）。
func (s *AssetRunService) ReplayRun(ctx context.Context, runID, userID string) (*types.RunAssetResult, error) {
	if runID == "" || userID == "" {
		return nil, ErrAssetInvalidInput
	}

	var rec model.AssetRun
	if err := dal.DB.WithContext(ctx).
		Preload("Asset").
		First(&rec, "id = ?", runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssetNotFound
		}
		return nil, err
	}
	// 可见性：作者自己的快照任意可复现；他人仅 public
	if !canViewRun(&rec, userID) {
		return nil, ErrAssetNotFound
	}
	// 仅可复现成功快照，避免把 failed 错误信息当成有效输入
	if rec.Status != model.AssetRunStatusSuccess {
		return nil, &AssetError{Msg: "仅成功运行的快照可复现", Code: 400}
	}
	// 资产可能已被删除：外键 OnDelete:CASCADE 会级联删快照，理论上不会到这里
	if rec.Asset.ID == "" {
		return nil, ErrAssetNotFound
	}

	inputs := decodeInputsMap(rec.Inputs)
	params := decodeDefaultParams(rec.Params)

	// 复用主 Run 流程，inputs/params 来自快照；不直接传 req.Params，
	// 因为 Run 内部会做 merge（默认值 + 用户覆盖），这里直接给快照里
	// 当时实际生效的 params 即可，保证「同样的输入跑一次」的语义。
	return s.Run(ctx, rec.AssetID, userID, types.RunAssetReq{
		Inputs: inputs,
		Params: &params,
	})
}

// RemixFromRun 基于运行快照派生新资产。
//
// Remix 语义：
//   - 仅可基于可见快照派生：作者自己的任意快照，或 visibility=public 的他人快照
//   - 派生时拷贝资产当前的 PromptTemplate / InputVariables / DefaultParams，
//     而非快照时的快照——快照只承载「运行结果」，资产本体才是创作物
//   - ParentID 指向来源资产（不是快照），便于 fork 关系统计与回溯
//   - 调用者可覆盖 name / description；不传时用「<原资产名> 的副本」占位
//   - 新资产默认为 draft 状态，作者可改完模板再发布
//
// 返回新创建的资产 DTO。
func (s *AssetRunService) RemixFromRun(ctx context.Context, runID, userID string, req types.RemixFromRunReq) (*types.Asset, error) {
	if runID == "" || userID == "" {
		return nil, ErrAssetInvalidInput
	}

	var rec model.AssetRun
	if err := dal.DB.WithContext(ctx).
		Preload("Asset").
		First(&rec, "id = ?", runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAssetNotFound
		}
		return nil, err
	}
	if !canViewRun(&rec, userID) {
		return nil, ErrAssetNotFound
	}
	if rec.Asset.ID == "" {
		return nil, ErrAssetNotFound
	}
	parent := rec.Asset

	// 默认名：来源资产名 +「的副本」，避免列表里出现一堆同名资产
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.TrimSpace(parent.Name) + " 的副本"
		if len(name) > 150 {
			name = name[:150]
		}
	}
	description := req.Description
	if description == "" {
		// 继承原描述，便于派生资产保留来源说明
		description = parent.Description
	}

	// 复用 CreateAsset 完成校验、序列化、fork 计数等流程；
	// ParentID 指向资产，而非快照，保持 fork 关系链的语义一致
	parentID := parent.ID
	createReq := types.CreateAssetReq{
		Type:            parent.Type,
		Name:            name,
		Version:         "1.0.0",
		Description:     description,
		PromptTemplate:  parent.PromptTemplate,
		InputVariables:  decodeInputVariables(parent.InputVariables),
		DefaultParams:   ptrOfDefaultParams(decodeDefaultParams(parent.DefaultParams)),
		ParentID:        &parentID,
		Status:          model.AssetStatusDraft,
		Visibility:      model.AssetVisibilityPublic,
	}
	return s.assetSvc.CreateAsset(ctx, createReq, userID)
}

// ptrOfDefaultParams 把值类型转为指针，便于直接塞进 CreateAssetReq
func ptrOfDefaultParams(p types.AssetDefaultParams) *types.AssetDefaultParams {
	return &p
}
