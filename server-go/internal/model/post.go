package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Post 帖子表
type Post struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	Title      string    `gorm:"size:100;not null" json:"title"`
	Content    string    `gorm:"type:text;not null" json:"content"`
	AuthorID   string    `gorm:"index;not null" json:"authorId"`
	Author     User      `gorm:"foreignKey:AuthorID;constraint:OnDelete:CASCADE" json:"author"`
	Channel    string    `gorm:"default:general;index" json:"channel"`
	LikeCount  int       `gorm:"default:0" json:"likeCount"`
	ViewCount  int       `gorm:"default:0" json:"viewCount"`
	Edited     bool      `gorm:"default:false" json:"edited"`
	IsPinned   bool      `gorm:"default:false;index" json:"isPinned"`
	IsFeatured bool      `gorm:"default:false;index" json:"isFeatured"`
	CreatedAt  time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
	Comments   []Comment `gorm:"foreignKey:PostID" json:"-"`
	Likes      []PostLike `gorm:"foreignKey:PostID" json:"-"`
	Bookmarks  []Bookmark `gorm:"foreignKey:PostID" json:"-"`
	Tags       []Tag     `gorm:"many2many:post_tags" json:"tags"`
}

func (p *Post) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}
