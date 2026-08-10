package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Post 帖子表
type Post struct {
	ID         string         `gorm:"primaryKey" json:"id"`
	Title      string         `gorm:"size:100;not null" json:"title"`
	Content    string         `gorm:"type:text;not null" json:"content"`
	ContentDoc datatypes.JSON `gorm:"type:jsonb" json:"contentDoc,omitempty"`
	// ContentFormat markdown | richtext；用于搜索/AI 下游读取时判断投影是否有效
	ContentFormat string  `gorm:"size:32;default:markdown;index" json:"contentFormat"`
	AuthorID      string  `gorm:"index;not null" json:"authorId"`
	Author        User    `gorm:"foreignKey:AuthorID;constraint:OnDelete:CASCADE" json:"author"`
	Channel       string  `gorm:"default:general;index" json:"channel"`
	Status        string  `gorm:"size:20;default:published;index" json:"status"` // published / draft
	LikeCount     int     `gorm:"default:0" json:"likeCount"`
	ViewCount     int     `gorm:"default:0" json:"viewCount"`
	Edited        bool    `gorm:"default:false" json:"edited"`
	IsPinned      bool    `gorm:"default:false;index" json:"isPinned"`
	IsFeatured    bool    `gorm:"default:false;index" json:"isFeatured"`
	AiSummary     *string `gorm:"type:text" json:"aiSummary,omitempty"`
	Font          string  `gorm:"size:50;default:default" json:"font,omitempty"`
	CoverURL      *string `gorm:"size:512" json:"coverUrl,omitempty"`
	// ContentDocEnabled 富文本 contentDoc 是否启用同步
	ContentDocEnabled bool `gorm:"default:true;index" json:"contentDocEnabled"`
	// EditorDowngraded 用户是否使用降级 Markdown 编辑（富文本开启时仍回退到 markdown）
	EditorDowngraded bool `gorm:"default:false" json:"editorDowngraded"`
	// ContentDigest 归一化正文摘要，编辑后锚点重算时跳过未变内容
	ContentDigest string     `gorm:"size:128;index" json:"contentDigest,omitempty"`
	CreatedAt     time.Time  `gorm:"index" json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	Comments      []Comment  `gorm:"foreignKey:PostID" json:"-"`
	Likes         []PostLike `gorm:"foreignKey:PostID" json:"-"`
	Bookmarks     []Bookmark `gorm:"foreignKey:PostID" json:"-"`
	Tags          []Tag      `gorm:"many2many:post_tags" json:"tags"`
}

func (p *Post) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}
