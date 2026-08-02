package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Conversation 私信会话（两个用户之间一对一）
// UserAID / UserBID 按字典序存储，保证同一对用户只会有一条会话记录
type Conversation struct {
	ID            string    `gorm:"primaryKey" json:"id"`
	UserAID       string    `gorm:"uniqueIndex:idx_conv_pair,priority:1;not null" json:"userAId"`
	UserBID       string    `gorm:"uniqueIndex:idx_conv_pair,priority:2;not null" json:"userBId"`
	LastMessage   string    `gorm:"type:text" json:"lastMessage"` // 最后一条消息预览
	LastMessageAt time.Time `gorm:"index" json:"lastMessageAt"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func (c *Conversation) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}

// Message 私信消息
type Message struct {
	ID             string       `gorm:"primaryKey" json:"id"`
	ConversationID string       `gorm:"index;not null" json:"conversationId"`
	Conversation   Conversation `gorm:"foreignKey:ConversationID;constraint:OnDelete:CASCADE" json:"-"`
	SenderID       string       `gorm:"index;not null" json:"senderId"`
	Sender         User         `gorm:"foreignKey:SenderID;constraint:OnDelete:CASCADE" json:"-"`
	Content        string       `gorm:"type:text;not null" json:"content"`
	ReadAt         *time.Time   `gorm:"index" json:"readAt"` // 接收方已读时间，nil 表示未读
	CreatedAt      time.Time    `gorm:"index" json:"createdAt"`
}

func (m *Message) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.New().String()
	}
	return nil
}
