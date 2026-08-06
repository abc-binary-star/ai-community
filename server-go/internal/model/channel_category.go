package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ChannelCategory 频道分组
type ChannelCategory struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"uniqueIndex;type:varchar(30);not null" json:"name"` // URL slug
	Label     string    `gorm:"type:varchar(50);not null" json:"label"`            // 显示名称
	Icon      string    `gorm:"type:varchar(10)" json:"icon"`                      // emoji 图标
	SortOrder int       `gorm:"default:0" json:"sortOrder"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// BeforeCreate 自动生成 UUID
func (c *ChannelCategory) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}
