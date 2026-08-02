package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Bookmark 帖子收藏（postId+userId 联合唯一）
type Bookmark struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	PostID    string    `gorm:"uniqueIndex:idx_bookmark_post_user;not null" json:"postId"`
	Post      Post      `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	UserID    string    `gorm:"uniqueIndex:idx_bookmark_post_user;not null;index" json:"userId"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

func (b *Bookmark) BeforeCreate(tx *gorm.DB) error {
	if b.ID == "" {
		b.ID = uuid.New().String()
	}
	return nil
}
