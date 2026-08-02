package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Tag 标签
type Tag struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"uniqueIndex;not null" json:"name"`
	Posts     []Post    `gorm:"many2many:post_tags" json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

// PostTag 帖子-标签关联（联合主键）
type PostTag struct {
	PostID    string    `gorm:"primaryKey" json:"postId"`
	Post      Post      `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	TagID     string    `gorm:"primaryKey;index" json:"tagId"`
	Tag       Tag       `gorm:"foreignKey:TagID;constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

func (t *Tag) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}
