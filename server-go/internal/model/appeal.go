package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Appeal 账号申诉：用户对被封禁等处置提出申诉，管理员处理后状态流转。
type Appeal struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	UserID    string    `gorm:"index;not null" json:"userId"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Content   string    `gorm:"size:2000;not null" json:"content"` // 申诉理由
	Status    string    `gorm:"size:20;default:pending;index" json:"status"` // pending | resolved | rejected
	HandledBy *string   `json:"handledBy"`
	Handler   *User     `gorm:"foreignKey:HandledBy;constraint:OnDelete:SET NULL" json:"-"`
	Note      string    `gorm:"size:500" json:"note"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// BeforeCreate 自动生成 UUID
func (a *Appeal) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}
