package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Channel 频道表
type Channel struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"uniqueIndex;type:varchar(30);not null" json:"name"`        // URL slug，如 "tech"
	Label       string    `gorm:"type:varchar(50);not null" json:"label"`                    // 显示名称，如 "技术前沿"
	Description string    `gorm:"type:text" json:"description"`                               // 频道描述
	Icon        string    `gorm:"type:varchar(10)" json:"icon"`                               // emoji 图标
	CategoryID  *string   `gorm:"index;type:varchar(36)" json:"categoryId"`                    // 所属分组 ID（可空）
	SortOrder   int       `gorm:"default:0" json:"sortOrder"`                                  // 排序权重
	CreatedBy   string    `gorm:"index" json:"createdBy"`                                      // 创建者
	CreatedAt   time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// BeforeCreate 自动生成 UUID
func (c *Channel) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}
