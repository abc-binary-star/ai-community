package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AnnotationLike 批注点赞（annotationId+userId 联合唯一）
type AnnotationLike struct {
	ID           string     `gorm:"primaryKey" json:"id"`
	AnnotationID string     `gorm:"uniqueIndex:idx_annotationlike_ann_user;not null;index" json:"annotationId"`
	Annotation   Annotation `gorm:"foreignKey:AnnotationID;constraint:OnDelete:CASCADE" json:"-"`
	UserID       string     `gorm:"uniqueIndex:idx_annotationlike_ann_user;not null" json:"userId"`
	User         User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt    time.Time  `json:"createdAt"`
}

func (l *AnnotationLike) BeforeCreate(tx *gorm.DB) error {
	if l.ID == "" {
		l.ID = uuid.New().String()
	}
	return nil
}
