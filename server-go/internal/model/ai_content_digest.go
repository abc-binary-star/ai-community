package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AIContentDigest AI 内容派生物的二级缓存。
//
// 一级缓存在进程内，多副本部署时各副本独立、命中率按副本数衰减；
// 本表作为跨副本的共享层。Kind 区分产物类型（enrich / title / summary / tags），
// NormHash 由 digest.NormHash 生成，已做归一化，只改排版不会击穿。
type AIContentDigest struct {
	ID       string `gorm:"primaryKey" json:"id"`
	NormHash string `gorm:"uniqueIndex:idx_ai_digest_hash_kind;not null" json:"normHash"`
	Kind     string `gorm:"uniqueIndex:idx_ai_digest_hash_kind;size:32;not null" json:"kind"`
	// Payload 产物内容。结构化产物（如 enrich）存 JSON 字符串，
	// 单值产物存原文，由调用方按 Kind 解释。
	Payload   string    `gorm:"type:text;not null;default:''" json:"payload"`
	HitCount  int       `gorm:"not null;default:0" json:"hitCount"`
	ExpiresAt time.Time `gorm:"index;not null" json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (a *AIContentDigest) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}
