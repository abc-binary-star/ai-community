package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Comment 评论表（自关联支持嵌套）
type Comment struct {
	ID           string        `gorm:"primaryKey" json:"id"`
	Content      string        `gorm:"type:text;not null" json:"content"`
	PostID       string        `gorm:"index;not null" json:"postId"`
	Post         Post          `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	AuthorID     string        `gorm:"index;not null" json:"authorId"`
	Author       User          `gorm:"foreignKey:AuthorID;constraint:OnDelete:CASCADE" json:"author"`
	ParentID     *string       `gorm:"index" json:"parentId"`
	Parent       *Comment      `gorm:"foreignKey:ParentID;constraint:OnDelete:CASCADE" json:"-"`
	Replies      []Comment     `gorm:"foreignKey:ParentID" json:"replies"`
	LikeCount    int           `gorm:"default:0" json:"likeCount"`
	Edited       bool          `gorm:"default:false" json:"edited"`
	CreatedAt    time.Time     `gorm:"index" json:"createdAt"`
	UpdatedAt    time.Time     `json:"updatedAt"`
	CommentLikes []CommentLike `gorm:"foreignKey:CommentID" json:"-"`
}

func (c *Comment) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}
