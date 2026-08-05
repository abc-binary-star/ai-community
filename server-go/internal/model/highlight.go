package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Highlight 帖子划线高亮记录
// Anchor 标识帖子内某个块级段落（前端为段落生成的稳定锚点），
// StartOffset/EndOffset 为该段落纯文本内的字符偏移，用于还原高亮选区。
type Highlight struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	PostID       string    `gorm:"uniqueIndex:idx_highlight_dup;not null;index" json:"postId"`
	Post         Post      `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	UserID       string    `gorm:"uniqueIndex:idx_highlight_dup;not null;index" json:"userId"`
	User         User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Anchor       string    `gorm:"size:200;uniqueIndex:idx_highlight_dup;not null" json:"anchor"`
	StartOffset  int       `gorm:"not null" json:"startOffset"`
	EndOffset    int       `gorm:"not null" json:"endOffset"`
	SelectedText string    `gorm:"type:text;not null" json:"selectedText"`
	Color        string    `gorm:"size:20;default:yellow" json:"color"`
	CreatedAt    time.Time `gorm:"index" json:"createdAt"`
}

func (h *Highlight) BeforeCreate(tx *gorm.DB) error {
	if h.ID == "" {
		h.ID = uuid.New().String()
	}
	return nil
}
