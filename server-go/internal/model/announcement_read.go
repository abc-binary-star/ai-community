package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AnnouncementRead 公告已读记录，联合唯一索引保证详情页重复已读请求幂等。
type AnnouncementRead struct {
	ID             string       `gorm:"primaryKey" json:"id"`
	AnnouncementID string       `gorm:"uniqueIndex:idx_ann_read;not null" json:"announcementId"`
	Announcement   Announcement `gorm:"foreignKey:AnnouncementID;constraint:OnDelete:CASCADE" json:"-"`
	UserID         string       `gorm:"uniqueIndex:idx_ann_read;not null;index" json:"userId"`
	User           User         `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt      time.Time    `json:"createdAt"`
}

func (r *AnnouncementRead) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}
