package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 公告分类
const (
	AnnouncementCategoryModeration  = "moderation"  // 处置公示
	AnnouncementCategoryRule        = "rule"        // 规则调整
	AnnouncementCategoryFeature     = "feature"     // 功能更新
	AnnouncementCategoryMaintenance = "maintenance" // 系统维护
	AnnouncementCategoryActivity    = "activity"    // 活动通知
)

// 公告分级
const (
	AnnouncementLevelUrgent    = "urgent"
	AnnouncementLevelImportant = "important"
	AnnouncementLevelNormal    = "normal"
)

// 公告状态
const (
	AnnouncementStatusDraft     = "draft"
	AnnouncementStatusPublished = "published"
	AnnouncementStatusOffline   = "offline"
)

// Announcement 官方公告，独立于 Post 的领域模型。
// PenaltyList 以 JSON 文本存储处置公示名单，详情接口解析后下发。
type Announcement struct {
	ID          string     `gorm:"primaryKey" json:"id"`
	Title       string     `gorm:"size:100;not null" json:"title"`
	Content     string     `gorm:"type:text;not null" json:"content"`
	Category    string     `gorm:"size:20;not null;index" json:"category"`
	Level       string     `gorm:"size:20;default:normal;index" json:"level"`
	Status      string     `gorm:"size:20;default:draft;index" json:"status"`
	IsPinned    bool       `gorm:"default:false;index" json:"isPinned"`
	PublishAt   time.Time  `gorm:"index;not null" json:"publishAt"`
	ExpireAt    *time.Time `gorm:"index" json:"expireAt,omitempty"`
	PenaltyList *string    `gorm:"type:text" json:"-"`
	Edited      bool       `gorm:"default:false" json:"edited"`
	AuthorID    string     `gorm:"index;not null" json:"authorId"`
	Author      User       `gorm:"foreignKey:AuthorID;constraint:OnDelete:CASCADE" json:"author"`
	CreatedAt   time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

func (a *Announcement) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}
