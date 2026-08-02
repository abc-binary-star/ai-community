package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Block 屏蔽关系（blockerId+blockedId 联合唯一）
type Block struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	BlockerID string    `gorm:"uniqueIndex:idx_block_relation;not null" json:"blockerId"`
	Blocker   User      `gorm:"foreignKey:BlockerID;constraint:OnDelete:CASCADE" json:"-"`
	BlockedID string    `gorm:"uniqueIndex:idx_block_relation;not null;index" json:"blockedId"`
	Blocked   User      `gorm:"foreignKey:BlockedID;constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

func (b *Block) BeforeCreate(tx *gorm.DB) error {
	if b.ID == "" {
		b.ID = uuid.New().String()
	}
	return nil
}
