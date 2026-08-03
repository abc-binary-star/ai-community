package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// FollowGroup 关注分组
type FollowGroup struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:50;not null" json:"name"`
	UserID    string    `gorm:"index;not null" json:"userId"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// BeforeCreate 自动生成 UUID
func (g *FollowGroup) BeforeCreate(tx *gorm.DB) error {
	if g.ID == "" {
		g.ID = uuid.New().String()
	}
	return nil
}
