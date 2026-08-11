package service

import (
	"context"
	"log"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// SanctionService 账号处罚服务
type SanctionService struct{}

// SanctionError 处罚业务错误
type SanctionError struct {
	Msg  string
	Code int
}

func (e *SanctionError) Error() string { return e.Msg }

var (
	ErrSanctionNotFound     = &SanctionError{Msg: "处罚记录不存在", Code: 404}
	ErrSanctionInvalidInput = &SanctionError{Msg: "输入不合法", Code: 400}
	ErrSanctionInactive     = &SanctionError{Msg: "该处罚记录已失效", Code: 400}
)

// ApplySanction 对用户执行处罚并落审计记录。
// action: warning（警告，不改变状态）/ mute（禁言，可读不可写）/
// suspend（停用，不可登录，可到期）/ ban（封禁，不可登录，永久）。
// durationDays > 0 表示定时处罚，到期自动恢复；否则为永久。
// 同一用户同时只保留一条生效处罚：新处罚会使旧的生效处罚置为 revoked。
func (s *SanctionService) ApplySanction(ctx context.Context, req types.ApplySanctionReq, handlerID string) (*types.ModerationAction, error) {
	switch req.Action {
	case model.ModerationActionWarning, model.ModerationActionMute, model.ModerationActionSuspend, model.ModerationActionBan:
	default:
		return nil, ErrSanctionInvalidInput
	}
	if req.Action != model.ModerationActionWarning && req.DurationDays < 0 {
		return nil, ErrSanctionInvalidInput
	}

	var user model.User
	if err := dal.DB.WithContext(ctx).Select("id", "username", "role", "status").Where("username = ?", req.Username).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	if user.Role == "admin" {
		return nil, &SanctionError{Msg: "不能处罚管理员", Code: 403}
	}

	now := time.Now()
	rec := &model.ModerationAction{
		UserID:   user.ID,
		Action:   req.Action,
		Reason:   req.Reason,
		Evidence: req.Evidence,
		ActorID:  &handlerID,
		StartsAt: now,
		Status:   model.ModerationActionActive,
	}
	if req.DurationDays > 0 {
		end := now.AddDate(0, 0, req.DurationDays)
		rec.EndsAt = &end
	}

	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 撤销该用户此前仍生效的处罚
		if err := tx.Model(&model.ModerationAction{}).
			Where("user_id = ? AND status = ?", user.ID, model.ModerationActionActive).
			Update("status", model.ModerationActionRevoked).Error; err != nil {
			return err
		}
		if err := tx.Create(rec).Error; err != nil {
			return err
		}
		// warning 不限制账号；mute/suspend/ban 写入对应生效状态
		newStatus := model.UserStatusActive
		switch req.Action {
		case model.ModerationActionMute:
			newStatus = model.UserStatusMuted
		case model.ModerationActionSuspend:
			newStatus = model.UserStatusSuspended
		case model.ModerationActionBan:
			newStatus = model.UserStatusBanned
		}
		return tx.Model(&model.User{}).Where("id = ?", user.ID).Update("status", newStatus).Error
	})
	if err != nil {
		log.Printf("[Sanction/ApplySanction] 处罚失败, username=%s, action=%s, err=%v", req.Username, req.Action, err)
		return nil, err
	}

	return s.loadDTO(ctx, rec.ID)
}

// RevokeSanction 撤销一条生效中的处罚，并恢复账号状态。
func (s *SanctionService) RevokeSanction(ctx context.Context, sanctionID, handlerID string) (*types.ModerationAction, error) {
	var rec model.ModerationAction
	if err := dal.DB.WithContext(ctx).First(&rec, "id = ?", sanctionID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrSanctionNotFound
		}
		return nil, err
	}
	if rec.Status != model.ModerationActionActive {
		return nil, ErrSanctionInactive
	}

	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.ModerationAction{}).
			Where("id = ?", sanctionID).
			Update("status", model.ModerationActionRevoked).Error; err != nil {
			return err
		}
		// 该处罚是账号受限状态的来源时，一并恢复
		return tx.Model(&model.User{}).
			Where("id = ? AND status IN ?", rec.UserID,
				[]string{model.UserStatusMuted, model.UserStatusSuspended, model.UserStatusBanned}).
			Update("status", model.UserStatusActive).Error
	})
	if err != nil {
		log.Printf("[Sanction/RevokeSanction] 撤销处罚失败, sanctionID=%s, handler=%s, err=%v", sanctionID, handlerID, err)
		return nil, err
	}

	return s.loadDTO(ctx, sanctionID)
}

// ListSanctions 管理员查看处罚记录（可按用户名过滤 + 分页）。
func (s *SanctionService) ListSanctions(ctx context.Context, username string, page, pageSize int) (*types.Paginated[types.ModerationAction], error) {
	query := dal.DB.WithContext(ctx).Model(&model.ModerationAction{}).
		Preload("User").
		Preload("Actor")
	if username != "" {
		query = query.Joins("JOIN users ON users.id = moderation_actions.user_id").
			Where("users.username = ?", username)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	var rows []model.ModerationAction
	if err := query.
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	items := make([]types.ModerationAction, 0, len(rows))
	for i := range rows {
		items = append(items, s.mapToDTO(&rows[i]))
	}

	return &types.Paginated[types.ModerationAction]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

func (s *SanctionService) loadDTO(ctx context.Context, id string) (*types.ModerationAction, error) {
	var rec model.ModerationAction
	if err := dal.DB.WithContext(ctx).Preload("User").Preload("Actor").First(&rec, "id = ?", id).Error; err != nil {
		return nil, err
	}
	dto := s.mapToDTO(&rec)
	return &dto, nil
}

func (s *SanctionService) mapToDTO(a *model.ModerationAction) types.ModerationAction {
	dto := types.ModerationAction{
		ID:        a.ID,
		UserID:    a.UserID,
		User:      mapper.AuthorToDTO(&a.User),
		Action:    a.Action,
		Reason:    a.Reason,
		Evidence:  a.Evidence,
		ActorID:   a.ActorID,
		Status:    a.Status,
		AppealID:  a.AppealID,
		StartsAt:  a.StartsAt.Format(time.RFC3339),
		CreatedAt: a.CreatedAt.Format(time.RFC3339),
		UpdatedAt: a.UpdatedAt.Format(time.RFC3339),
	}
	if a.Actor != nil {
		actor := mapper.AuthorToDTO(a.Actor)
		dto.Actor = &actor
	}
	if a.EndsAt != nil {
		v := a.EndsAt.Format(time.RFC3339)
		dto.EndsAt = &v
	}
	return dto
}
