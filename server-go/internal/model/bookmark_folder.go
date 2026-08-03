package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// BookmarkFolder 收藏夹分类
type BookmarkFolder struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:50;not null" json:"name"`
	UserID    string    `gorm:"index;not null" json:"userId"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// BeforeCreate 自动生成 UUID
func (f *BookmarkFolder) BeforeCreate(tx *gorm.DB) error {
	if f.ID == "" {
		f.ID = uuid.New().String()
	}
	return nil
}
