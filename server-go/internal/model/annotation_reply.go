package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AnnotationReply 批注回复（仅一级结构）
//
// 回复某条回复时，ReplyToUserID 记录被回复者，数据仍归属于根 Annotation，
// 避免深层嵌套（对齐 PRD 6.5）。
type AnnotationReply struct {
	ID           string     `gorm:"primaryKey" json:"id"`
	AnnotationID string     `gorm:"index;not null" json:"annotationId"`
	Annotation   Annotation `gorm:"foreignKey:AnnotationID;constraint:OnDelete:CASCADE" json:"-"`
	UserID       string     `gorm:"index;not null" json:"userId"`
	User         User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user"`
	// ReplyToUserID 被回复者（回复某条回复时非空）
	ReplyToUserID *string `gorm:"index" json:"replyToUserId,omitempty"`
	Body          string  `gorm:"type:text;not null" json:"body"`
	// Status: active / deleted / moderated
	Status    string    `gorm:"size:20;default:active" json:"status"`
	Edited    bool      `gorm:"default:false" json:"edited"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (r *AnnotationReply) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}
