package sanction

import (
	"context"
	"errors"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/gorm"
)

// ErrForbidden 写操作被账号状态拦截
var ErrForbidden = errors.New("账号状态不允许该操作")

// EffectiveStatus 返回用户当前生效的账号状态，并在处罚到期时懒刷新：
// 定时处罚（mute/suspend）过期后自动恢复 active，同时把对应处罚记录标记为 expired。
// 首次查询代价为一次 user 查询 + 一次处罚记录查询，可接受。
func EffectiveStatus(ctx context.Context, userID string) (string, error) {
	var user model.User
	if err := dal.DB.WithContext(ctx).Select("id", "status").First(&user, "id = ?", userID).Error; err != nil {
		return model.UserStatusActive, err
	}
	if user.Status == model.UserStatusActive {
		return model.UserStatusActive, nil
	}

	var action model.ModerationAction
	err := dal.DB.WithContext(ctx).
		Where("user_id = ? AND status = ?", userID, model.ModerationActionActive).
		Order("created_at DESC").
		First(&action).Error
	if err != nil {
		// 无生效处罚记录时保持现状，不静默解封
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return user.Status, nil
		}
		return user.Status, err
	}

	// 定时处罚到期：标记记录 expired 并恢复 active
	if action.EndsAt != nil && action.EndsAt.Before(time.Now()) {
		dal.DB.WithContext(ctx).Model(&model.ModerationAction{}).
			Where("id = ?", action.ID).
			Update("status", model.ModerationActionExpired)
		dal.DB.WithContext(ctx).Model(&model.User{}).
			Where("id = ? AND status = ?", userID, user.Status).
			Update("status", model.UserStatusActive)
		return model.UserStatusActive, nil
	}

	return user.Status, nil
}

// CanWrite 校验用户当前是否允许发布内容（发帖、想法、私信等）。
// muted 禁言可读不可写；suspended / banned 在认证层已拦截，这里兜底。
func CanWrite(ctx context.Context, userID string) error {
	if userID == "" {
		return ErrForbidden
	}
	status, err := EffectiveStatus(ctx, userID)
	if err != nil {
		return err
	}
	switch status {
	case model.UserStatusMuted:
		return errors.New("账号已被禁言，无法发布内容")
	case model.UserStatusSuspended, model.UserStatusBanned:
		return ErrForbidden
	}
	return nil
}
