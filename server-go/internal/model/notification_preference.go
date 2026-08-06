package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// NotificationPreference 用户通知偏好（与 User 一对一）
type NotificationPreference struct {
	ID             string    `gorm:"primaryKey" json:"id"`
	UserID         string    `gorm:"uniqueIndex;not null" json:"userId"`
	Comment        bool      `gorm:"default:true" json:"comment"`       // 收到评论
	Reply          bool      `gorm:"default:true" json:"reply"`         // 收到回复
	Like           bool      `gorm:"default:true" json:"like"`          // 收到点赞
	Follow         bool      `gorm:"default:true" json:"follow"`        // 收到关注
	Mention        bool      `gorm:"default:true" json:"mention"`       // 收到 @提及
	DoNotDisturb   bool      `gorm:"default:false" json:"doNotDisturb"` // 免打扰
	QuietStartHour int       `gorm:"default:22" json:"quietStartHour"`  // 免打扰开始（小时 0-23）
	QuietEndHour   int       `gorm:"default:8" json:"quietEndHour"`     // 免打扰结束（小时 0-23）
	UpdatedAt      time.Time `json:"updatedAt"`
}

func (p *NotificationPreference) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}
