package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PostSummary 帖子讨论摘要（AI 生成，按帖子缓存）
type PostSummary struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	PostID       string    `gorm:"uniqueIndex;not null" json:"postId"`
	Post         Post      `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	Summary      string    `gorm:"type:text;not null" json:"summary"`
	CommentCount int       `gorm:"not null" json:"commentCount"` // 生成时的评论数快照
	Model        string    `gorm:"size:50" json:"model"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (p *PostSummary) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}
