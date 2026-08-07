package service

import (
	"context"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// SubmitFeedback 提交活动反馈（bug / 需求）。登录用户即可提交，
// 反馈进入管理员监督台（审批台）的待处理列表。
func (s *ActivityService) SubmitFeedback(ctx context.Context, userID string, req types.ActivityFeedbackReq) (*types.ActivityFeedbackDTO, error) {
	content := strings.TrimSpace(req.Content)
	if content == "" {
		return nil, ErrActivityInvalidInput
	}

	fb := model.ActivityFeedback{
		UserID:  userID,
		Type:    req.Type,
		Content: content,
		Contact: strings.TrimSpace(req.Contact),
		Status:  model.FeedbackStatusPending,
	}
	if err := dal.DB.WithContext(ctx).Create(&fb).Error; err != nil {
		return nil, err
	}
	dto := feedbackToDTO(&fb, "")
	return &dto, nil
}

// ListFeedback 管理员查看反馈列表（审批台），支持按状态筛选并分页。
func (s *ActivityService) ListFeedback(ctx context.Context, status string, page, pageSize int) (map[string]any, error) {
	q := dal.DB.WithContext(ctx).Model(&model.ActivityFeedback{})
	if status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}

	var rows []model.ActivityFeedback
	if err := q.Preload("User").
		Order("created_at desc").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	items := make([]types.ActivityFeedbackDTO, 0, len(rows))
	for i := range rows {
		items = append(items, feedbackToDTO(&rows[i], displayNameOf(&rows[i].User)))
	}
	return map[string]any{
		"items":      items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": pagination.TotalPages(int(total), pageSize),
	}, nil
}

// ResolveFeedback 管理员将反馈标记为已处理，可附处理回复。
func (s *ActivityService) ResolveFeedback(ctx context.Context, feedbackID string, req types.ActivityFeedbackResolveReq) (*types.ActivityFeedbackDTO, error) {
	var fb model.ActivityFeedback
	if err := dal.DB.WithContext(ctx).First(&fb, "id = ?", feedbackID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityFeedbackNotFound
		}
		return nil, err
	}

	fb.Status = model.FeedbackStatusResolved
	fb.Reply = strings.TrimSpace(req.Reply)
	if err := dal.DB.WithContext(ctx).Model(&fb).
		Updates(map[string]any{
			"status":     fb.Status,
			"reply":      fb.Reply,
			"updated_at": time.Now(),
		}).Error; err != nil {
		return nil, err
	}
	dto := feedbackToDTO(&fb, "")
	return &dto, nil
}

// feedbackToDTO 反馈转 DTO；userName 为空时由调用方负责查询
func feedbackToDTO(fb *model.ActivityFeedback, userName string) types.ActivityFeedbackDTO {
	return types.ActivityFeedbackDTO{
		ID:        fb.ID,
		UserID:    fb.UserID,
		UserName:  userName,
		Type:      fb.Type,
		Content:   fb.Content,
		Contact:   fb.Contact,
		Status:    fb.Status,
		Reply:     fb.Reply,
		CreatedAt: fb.CreatedAt.Format(time.RFC3339),
	}
}
