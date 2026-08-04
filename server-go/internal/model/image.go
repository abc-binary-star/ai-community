package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Image 图片上传记录
type Image struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	UserID    string    `gorm:"index;not null" json:"userId"`
	URL       string    `gorm:"size:512;not null" json:"url"`
	ThumbURL  string    `gorm:"size:512" json:"thumbUrl,omitempty"`
	Width     int       `json:"width"`
	Height    int       `json:"height"`
	Size      int64     `json:"size"`
	MimeType  string    `gorm:"size:50" json:"mimeType"`
	Purpose   string    `gorm:"size:20" json:"purpose"` // avatar/cover/post
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

// BeforeCreate 自动生成 UUID
func (i *Image) BeforeCreate(tx *gorm.DB) error {
	if i.ID == "" {
		i.ID = uuid.New().String()
	}
	return nil
}
