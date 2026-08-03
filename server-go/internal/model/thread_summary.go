package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ThreadSummary 讨论摘要 v2（段落式总结）
type ThreadSummary struct {
	ID           string         `gorm:"primaryKey" json:"id"`
	PostID       string         `gorm:"uniqueIndex;not null" json:"postId"`
	Post         Post           `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	Points       datatypes.JSON `gorm:"type:jsonb" json:"points"`          // 兼容旧数据，新数据不再使用
	Summary      string         `gorm:"type:text;not null;default:''" json:"summary"` // 段落式摘要正文
	CommentCount int            `gorm:"not null" json:"commentCount"`      // 生成时的评论数快照
	Stale        bool           `gorm:"default:false" json:"stale"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
}

func (t *ThreadSummary) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}
