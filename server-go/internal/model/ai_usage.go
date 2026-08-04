package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AIUsageLog 单次 AI 调用记录（审计日志）
type AIUsageLog struct {
	ID               string    `gorm:"primaryKey" json:"id"`
	UserID           string    `gorm:"index;not null" json:"userId"`
	Feature          string    `gorm:"type:varchar(50);not null" json:"feature"`
	Model            string    `gorm:"type:varchar(100)" json:"model"`
	PromptTokens     int       `gorm:"default:0" json:"promptTokens"`
	CompletionTokens int       `gorm:"default:0" json:"completionTokens"`
	TotalTokens      int       `gorm:"default:0" json:"totalTokens"`
	DurationMs       int       `gorm:"default:0" json:"durationMs"`
	Success          bool      `gorm:"default:true" json:"success"`
	ErrorMessage     string    `gorm:"type:text" json:"errorMessage,omitempty"`
	CreatedAt        time.Time `gorm:"index" json:"createdAt"`
}

func (l *AIUsageLog) BeforeCreate(tx *gorm.DB) error {
	if l.ID == "" {
		l.ID = uuid.New().String()
	}
	return nil
}

// AIUserQuota 用户每日 AI 配额使用情况
type AIUserQuota struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	UserID       string    `gorm:"uniqueIndex:idx_user_date;not null" json:"userId"`
	Date         string    `gorm:"type:date;uniqueIndex:idx_user_date;not null" json:"date"`
	RequestCount int       `gorm:"default:0" json:"requestCount"`
	TotalTokens  int       `gorm:"default:0" json:"totalTokens"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (q *AIUserQuota) BeforeCreate(tx *gorm.DB) error {
	if q.ID == "" {
		q.ID = uuid.New().String()
	}
	return nil
}

// AIGlobalQuota 全局每日 AI 配额使用情况（单行表，按日期）
type AIGlobalQuota struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	Date         string    `gorm:"type:date;uniqueIndex" json:"date"`
	RequestCount int       `gorm:"default:0" json:"requestCount"`
	TotalTokens  int       `gorm:"default:0" json:"totalTokens"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (q *AIGlobalQuota) BeforeCreate(tx *gorm.DB) error {
	if q.ID == "" {
		q.ID = uuid.New().String()
	}
	return nil
}
