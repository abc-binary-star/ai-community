package service

import (
	"context"
	"errors"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/gorm"
)

// BillingService 订阅与套餐管理（支付渠道接入前的管理端能力）
type BillingService struct{}

// GrantSubscription 管理员手动发放/调整订阅：
// plan=pro 时发放订阅并更新用户套餐；plan=free 时立即降级。
func (s *BillingService) GrantSubscription(ctx context.Context, userID, plan string, days int) (*model.User, error) {
	if plan != "free" && plan != "pro" {
		return nil, errors.New("套餐只能是 free 或 pro")
	}
	if days < 0 {
		return nil, errors.New("天数不能为负数")
	}

	var user model.User
	if err := dal.DB.WithContext(ctx).First(&user, "id = ?", userID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New("用户不存在")
		}
		return nil, err
	}

	now := time.Now()
	var expiresAt *time.Time
	if plan == "pro" && days > 0 {
		t := now.Add(time.Duration(days) * 24 * time.Hour)
		expiresAt = &t
	}

	// 同一用户的旧订阅关闭，新订阅生效
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Subscription{}).
			Where("user_id = ? AND status = 'active'", userID).
			Update("status", "canceled").Error; err != nil {
			return err
		}
		sub := &model.Subscription{
			UserID:    userID,
			Plan:      plan,
			Status:    "active",
			StartedAt: now,
			ExpiresAt: expiresAt,
			Provider:  "manual",
		}
		if err := tx.Create(sub).Error; err != nil {
			return err
		}
		updates := map[string]interface{}{
			"plan":            plan,
			"plan_expires_at": expiresAt,
			"updated_at":      now,
		}
		return tx.Model(&model.User{}).Where("id = ?", userID).Updates(updates).Error
	})
	if err != nil {
		return nil, err
	}

	dal.DB.WithContext(ctx).First(&user, "id = ?", userID)
	return &user, nil
}
