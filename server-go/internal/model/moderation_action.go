package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 账号状态：active 正常 / muted 禁言（可读不可写）/ suspended 停用（临时封禁，不可登录）/ banned 封禁（永久）。
// 定时处罚（mute/suspend）到期后由 lazy 刷新逻辑恢复为 active。
const (
	UserStatusActive    = "active"
	UserStatusMuted     = "muted"
	UserStatusSuspended = "suspended"
	UserStatusBanned    = "banned"
)

// 处罚类型与状态
const (
	ModerationActionWarning  = "warning"
	ModerationActionMute     = "mute"
	ModerationActionSuspend  = "suspend"
	ModerationActionBan      = "ban"

	ModerationActionActive  = "active"
	ModerationActionExpired = "expired"
	ModerationActionRevoked = "revoked"
)

// ModerationAction 账号处罚记录。
// 处罚自动生效（StartsAt）、可到期（EndsAt，nil 表示永久）、可申诉（AppealID）、可撤销（Status=revoked）。
// 所有状态变化与操作者、时间一并落库，形成不可静默覆盖的审计轨迹。
type ModerationAction struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	UserID    string    `gorm:"index;not null" json:"userId"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Action    string    `gorm:"size:20;not null;index" json:"action"` // warning | mute | suspend | ban
	Reason    string    `gorm:"size:500" json:"reason"`
	Evidence  string    `gorm:"size:2000" json:"evidence"`
	ActorID   *string   `json:"actorId"`
	Actor     *User     `gorm:"foreignKey:ActorID;constraint:OnDelete:SET NULL" json:"-"`
	StartsAt  time.Time `gorm:"index" json:"startsAt"`
	EndsAt    *time.Time `gorm:"index" json:"endsAt"` // 到期时间；nil 表示永久
	Status    string    `gorm:"size:20;default:active;index" json:"status"` // active | expired | revoked
	AppealID  *string   `json:"appealId"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (m *ModerationAction) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.New().String()
	}
	return nil
}
