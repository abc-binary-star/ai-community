package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PostLike 帖子点赞（postId+userId 联合唯一）
type PostLike struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	PostID    string    `gorm:"uniqueIndex:idx_postlike_post_user;not null;index" json:"postId"`
	Post      Post      `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	UserID    string    `gorm:"uniqueIndex:idx_postlike_post_user;not null" json:"userId"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

func (pl *PostLike) BeforeCreate(tx *gorm.DB) error {
	if pl.ID == "" {
		pl.ID = uuid.New().String()
	}
	return nil
}

// CommentLike 评论点赞（commentId+userId 联合唯一）
type CommentLike struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	CommentID string    `gorm:"uniqueIndex:idx_commentlike_comment_user;not null;index" json:"commentId"`
	Comment   Comment   `gorm:"foreignKey:CommentID;constraint:OnDelete:CASCADE" json:"-"`
	UserID    string    `gorm:"uniqueIndex:idx_commentlike_comment_user;not null" json:"userId"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

func (cl *CommentLike) BeforeCreate(tx *gorm.DB) error {
	if cl.ID == "" {
		cl.ID = uuid.New().String()
	}
	return nil
}
