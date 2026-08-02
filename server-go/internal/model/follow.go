package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Follow 关注关系（followerId+followingId 联合唯一）
type Follow struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	FollowerID  string    `gorm:"uniqueIndex:idx_follow_follower_following;not null" json:"followerId"`
	Follower    User      `gorm:"foreignKey:FollowerID;constraint:OnDelete:CASCADE" json:"-"`
	FollowingID string    `gorm:"uniqueIndex:idx_follow_follower_following;not null;index" json:"followingId"`
	Following   User      `gorm:"foreignKey:FollowingID;constraint:OnDelete:CASCADE" json:"-"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (f *Follow) BeforeCreate(tx *gorm.DB) error {
	if f.ID == "" {
		f.ID = uuid.New().String()
	}
	return nil
}
