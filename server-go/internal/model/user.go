package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User 用户表
type User struct {
	ID          string  `gorm:"primaryKey" json:"id"`
	Username    string  `gorm:"uniqueIndex;size:20;not null" json:"username"`
	Email       string  `gorm:"uniqueIndex;not null" json:"email"`
	Password    string  `gorm:"not null" json:"-"`
	Avatar      *string `json:"avatar"`
	Bio         *string `json:"bio"`
	DisplayName *string `json:"displayName"`
	Role        string  `gorm:"type:varchar(20);default:'user';not null" json:"role"`
	// Plan 当前套餐：free / pro。管理员不受 AI 配额限制（role=admin）。
	Plan string `gorm:"type:varchar(20);default:'free';not null;index" json:"plan"`
	// PlanExpiresAt 订阅到期时间；为空表示长期（管理员或非订阅账号）。
	PlanExpiresAt *time.Time    `json:"planExpiresAt"`
	CreatedAt     time.Time     `gorm:"index" json:"createdAt"`
	UpdatedAt     time.Time     `json:"updatedAt"`
	Posts         []Post        `gorm:"foreignKey:AuthorID" json:"-"`
	Comments      []Comment     `gorm:"foreignKey:AuthorID" json:"-"`
	PostLikes     []PostLike    `gorm:"foreignKey:UserID" json:"-"`
	CommentLikes  []CommentLike `gorm:"foreignKey:UserID" json:"-"`
	Bookmarks     []Bookmark    `gorm:"foreignKey:UserID" json:"-"`
	Following     []Follow      `gorm:"foreignKey:FollowerID" json:"-"`
	Followers     []Follow      `gorm:"foreignKey:FollowingID" json:"-"`
}

// BeforeCreate 自动生成 UUID（保持与 Prisma cuid 格式不同的 UUID）
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return nil
}
