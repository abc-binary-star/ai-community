package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Report 举报表
// TargetType: post / comment；Status: pending / approved / rejected
type Report struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	ReporterID string    `gorm:"index;not null" json:"reporterId"`
	Reporter   User      `gorm:"foreignKey:ReporterID;constraint:OnDelete:CASCADE" json:"reporter"`
	TargetType string    `gorm:"size:20;not null;index" json:"targetType"`
	TargetID   string    `gorm:"not null;index" json:"targetId"`
	Reason     string    `gorm:"size:500;not null" json:"reason"`
	Status     string    `gorm:"size:20;default:pending;index" json:"status"`
	HandledBy  *string   `json:"handledBy"`
	Handler    *User     `gorm:"foreignKey:HandledBy" json:"handler"`
	Note       string    `gorm:"size:500" json:"note"`
	CreatedAt  time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`

	// 目标内容快照（仅展示用，不入库）
	TargetTitle string `gorm:"-" json:"targetTitle"`
	TargetBody  string `gorm:"-" json:"targetBody"`
}

func (r *Report) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}
