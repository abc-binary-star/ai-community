package service

import (
	"context"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// ReportService 举报与内容审核服务
type ReportService struct{}

// ReportError 举报业务错误
type ReportError struct {
	Msg  string
	Code int
}

func (e *ReportError) Error() string { return e.Msg }

var (
	ErrReportNotFound         = &ReportError{Msg: "举报不存在", Code: 404}
	ErrAlreadyReported        = &ReportError{Msg: "你已经举报过该内容", Code: 400}
	ErrReportAlreadyHandled   = &ReportError{Msg: "该举报已被处理", Code: 400}
)

// reportBodyLimit 目标内容快照截断长度
const reportBodyLimit = 200

// CreateReport 创建举报（同一用户对同一目标只能举报一次）
func (s *ReportService) CreateReport(ctx context.Context, reporterID string, req types.CreateReportReq) (*types.Report, error) {
	// 校验目标存在
	switch req.TargetType {
	case "post":
		var cnt int64
		dal.DB.WithContext(ctx).Model(&model.Post{}).Where("id = ?", req.TargetID).Count(&cnt)
		if cnt == 0 {
			return nil, ErrPostNotFound
		}
	case "comment":
		var cnt int64
		dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("id = ?", req.TargetID).Count(&cnt)
		if cnt == 0 {
			return nil, ErrCommentNotFound
		}
	default:
		return nil, ErrInvalidInput
	}

	// 不能举报自己的内容
	if req.TargetType == "post" {
		var post model.Post
		if err := dal.DB.WithContext(ctx).Select("author_id").First(&post, "id = ?", req.TargetID).Error; err == nil && post.AuthorID == reporterID {
			return nil, &ReportError{Msg: "不能举报自己的内容", Code: 400}
		}
	} else if req.TargetType == "comment" {
		var comment model.Comment
		if err := dal.DB.WithContext(ctx).Select("author_id").First(&comment, "id = ?", req.TargetID).Error; err == nil && comment.AuthorID == reporterID {
			return nil, &ReportError{Msg: "不能举报自己的内容", Code: 400}
		}
	}

	// 同一用户对同一目标存在未处理举报时禁止重复提交
	var cnt int64
	dal.DB.WithContext(ctx).Model(&model.Report{}).
		Where("reporter_id = ? AND target_type = ? AND target_id = ? AND status = ?", reporterID, req.TargetType, req.TargetID, "pending").
		Count(&cnt)
	if cnt > 0 {
		return nil, ErrAlreadyReported
	}

	report := &model.Report{
		ReporterID: reporterID,
		TargetType: req.TargetType,
		TargetID:   req.TargetID,
		Reason:     strings.TrimSpace(req.Reason),
		Status:     "pending",
	}
	if err := dal.DB.WithContext(ctx).Create(report).Error; err != nil {
		return nil, err
	}

	var created model.Report
	if err := dal.DB.WithContext(ctx).Preload("Reporter").Preload("Handler").First(&created, "id = ?", report.ID).Error; err != nil {
		return nil, err
	}
	dto := s.mapReportToDTO(ctx, &created)
	return &dto, nil
}

// ListReports 审核队列（分页），可按状态过滤，默认待处理
func (s *ReportService) ListReports(ctx context.Context, status string, page, pageSize int) (*types.Paginated[types.Report], error) {
	if status == "" {
		status = "pending"
	}

	query := dal.DB.WithContext(ctx).Model(&model.Report{}).Where("status = ?", status)

	var total int64
	query.Count(&total)

	var reports []model.Report
	if err := query.Preload("Reporter").Preload("Handler").
		Order("created_at ASC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&reports).Error; err != nil {
		return nil, err
	}

	// 批量填充目标内容快照
	s.fillTargetSnapshots(ctx, reports)

	items := make([]types.Report, 0, len(reports))
	for i := range reports {
		items = append(items, s.mapReportToDTO(ctx, &reports[i]))
	}

	return &types.Paginated[types.Report]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// HandleReport 处理举报：approved 删除目标内容；rejected 仅记录。同时同步该目标的其他待处理举报
func (s *ReportService) HandleReport(ctx context.Context, reportID, handlerID string, req types.HandleReportReq) (*types.Report, error) {
	var report model.Report
	if err := dal.DB.WithContext(ctx).First(&report, "id = ?", reportID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrReportNotFound
		}
		return nil, err
	}
	if report.Status != "pending" {
		return nil, ErrReportAlreadyHandled
	}

	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 处理当前举报
		if err := tx.Model(&model.Report{}).Where("id = ?", reportID).Updates(map[string]interface{}{
			"status":     req.Status,
			"handled_by": handlerID,
			"note":       strings.TrimSpace(req.Note),
		}).Error; err != nil {
			return err
		}

		if req.Status == "approved" {
			// 删除目标内容（可能已被删除，容错）
			switch report.TargetType {
			case "post":
				tx.Delete(&model.Post{}, "id = ?", report.TargetID)
			case "comment":
				tx.Delete(&model.Comment{}, "id = ?", report.TargetID)
			}
			// 同步处理同目标的其他待处理举报
			tx.Model(&model.Report{}).
				Where("target_type = ? AND target_id = ? AND status = ? AND id <> ?", report.TargetType, report.TargetID, "pending", reportID).
				Updates(map[string]interface{}{"status": "approved", "handled_by": handlerID, "note": "同目标内容已被处置"})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	var updated model.Report
	if err := dal.DB.WithContext(ctx).Preload("Reporter").Preload("Handler").First(&updated, "id = ?", reportID).Error; err != nil {
		return nil, err
	}
	s.fillTargetSnapshots(ctx, []model.Report{updated})

	dto := s.mapReportToDTO(ctx, &updated)
	return &dto, nil
}

// fillTargetSnapshots 批量填充举报目标的标题与内容预览（帖子取标题+正文，评论取正文）
func (s *ReportService) fillTargetSnapshots(ctx context.Context, reports []model.Report) {
	postIDs := make([]string, 0)
	commentIDs := make([]string, 0)
	for _, r := range reports {
		if r.TargetType == "post" {
			postIDs = append(postIDs, r.TargetID)
		} else if r.TargetType == "comment" {
			commentIDs = append(commentIDs, r.TargetID)
		}
	}

	postMeta := make(map[string]struct{ Title, Content string }, len(postIDs))
	if len(postIDs) > 0 {
		var posts []model.Post
		dal.DB.WithContext(ctx).Select("id", "title", "content").Where("id IN ?", postIDs).Find(&posts)
		for _, p := range posts {
			postMeta[p.ID] = struct{ Title, Content string }{p.Title, p.Content}
		}
	}

	commentBodies := make(map[string]string, len(commentIDs))
	if len(commentIDs) > 0 {
		var comments []model.Comment
		dal.DB.WithContext(ctx).Select("id", "content").Where("id IN ?", commentIDs).Find(&comments)
		for _, c := range comments {
			commentBodies[c.ID] = c.Content
		}
	}

	for i := range reports {
		if reports[i].TargetType == "post" {
			m := postMeta[reports[i].TargetID]
			reports[i].TargetTitle = m.Title
			reports[i].TargetBody = truncateContentBy(m.Content, reportBodyLimit)
		} else if reports[i].TargetType == "comment" {
			reports[i].TargetBody = truncateContentBy(commentBodies[reports[i].TargetID], reportBodyLimit)
		}
	}
}

// truncateContentBy 按 rune 截断字符串到指定长度，超出加省略号
func truncateContentBy(content string, maxLen int) string {
	runes := []rune(content)
	if len(runes) > maxLen {
		return string(runes[:maxLen]) + "…"
	}
	return content
}

// mapReportToDTO 将 Report model 转为 DTO
func (s *ReportService) mapReportToDTO(ctx context.Context, r *model.Report) types.Report {
	var handler *types.PublicUser
	if r.Handler != nil {
		h := mapper.AuthorToDTO(r.Handler)
		handler = &h
	}
	return types.Report{
		ID:          r.ID,
		ReporterID:  r.ReporterID,
		Reporter:    mapper.AuthorToDTO(&r.Reporter),
		TargetType:  r.TargetType,
		TargetID:    r.TargetID,
		TargetTitle: r.TargetTitle,
		TargetBody:  r.TargetBody,
		Reason:      r.Reason,
		Status:      r.Status,
		HandledBy:   r.HandledBy,
		Handler:     handler,
		Note:        r.Note,
		CreatedAt:   r.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   r.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
