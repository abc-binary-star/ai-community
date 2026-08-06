package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Subscription 订阅记录，用于对账与到期降级。
// 支付渠道接入后由 billing 服务写入；当前可经管理员接口手动发放。
type Subscription struct {
	ID              string     `gorm:"primaryKey" json:"id"`
	UserID          string     `gorm:"index;not null" json:"userId"`
	Plan            string     `gorm:"type:varchar(20);not null" json:"plan"`
	Status          string     `gorm:"type:varchar(20);default:'active';not null;index" json:"status"`
	StartedAt       time.Time  `json:"startedAt"`
	ExpiresAt       *time.Time `json:"expiresAt"`
	Provider        string     `gorm:"type:varchar(50);default:'manual'" json:"provider"`
	ProviderOrderID string     `gorm:"type:varchar(100)" json:"providerOrderId,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

func (s *Subscription) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return nil
}
