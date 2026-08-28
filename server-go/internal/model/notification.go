package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Notification 通知
type Notification struct {
	ID        string   `gorm:"primaryKey" json:"id"`
	UserID    string   `gorm:"index;not null" json:"userId"`
	User      User     `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Type      string   `gorm:"not null" json:"type"` // comment | like | follow | reply | mention
	ActorID   *string  `gorm:"index" json:"actorId"`
	Actor     *User    `gorm:"foreignKey:ActorID;constraint:OnDelete:SET NULL" json:"-"`
	PostID    *string  `json:"postId"`
	Post      *Post    `gorm:"foreignKey:PostID;constraint:OnDelete:SET NULL" json:"-"`
	CommentID *string  `json:"commentId"`
	Comment   *Comment `gorm:"foreignKey:CommentID;constraint:OnDelete:SET NULL" json:"-"`
	// AnnotationID 想法通知（回复/点赞/@提及），与评论通知互斥
	AnnotationID *string     `json:"annotationId"`
	Annotation   *Annotation `gorm:"foreignKey:AnnotationID;constraint:OnDelete:SET NULL" json:"-"`
	Content      *string     `json:"content"`
	Read         bool        `gorm:"default:false;index" json:"read"`
	// Suppressed 免打扰时段抑制触达（仍入库）；等待 DeliverableAt 后可补推
	Suppressed    bool       `gorm:"default:false;index" json:"suppressed"`
	DeliverableAt *time.Time `gorm:"index" json:"deliverableAt"`
	CreatedAt     time.Time  `json:"createdAt"`
}

func (n *Notification) BeforeCreate(tx *gorm.DB) error {
	if n.ID == "" {
		n.ID = uuid.New().String()
	}
	return nil
}
