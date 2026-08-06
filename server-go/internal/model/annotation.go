// Package model: Annotation 批注（段落想法）
//
// 与帖子底部 Comment 区分：Annotation 围绕原文段落或选区锚定，承载「想法」。
// 字段口径对齐 PRD 第 8 节与锚点失效分析（TextQuoteSelector 三件套 + 段落快照）。
package model

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 批注锚定范围
const (
	AnnotationScopeSelection = "selection" // 精确选区
	AnnotationScopeParagraph = "paragraph" // 整段
)

// 可见范围
const (
	AnnotationVisibilityPublic  = "public"
	AnnotationVisibilityPrivate = "private"
)

// 锚点状态
const (
	AnnotationAnchorAttached = "attached" // 正常挂载到段落
	AnnotationAnchorOrphaned = "orphaned" // 原文变更后失去可靠位置
)

// 内容状态
const (
	AnnotationStatusActive    = "active"
	AnnotationStatusDeleted   = "deleted"   // 作者删除（有回复时保留占位）
	AnnotationStatusModerated = "moderated" // 审核下架
)

// Annotation 帖子段落想法（批注）
type Annotation struct {
	ID     string `gorm:"primaryKey" json:"id"`
	PostID string `gorm:"index:idx_annotation_post;not null" json:"postId"`
	Post   Post   `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	UserID string `gorm:"index;not null" json:"userId"`
	User   User   `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user"`
	// Scope: selection / paragraph
	Scope string `gorm:"size:20;not null" json:"scope"`
	// Anchor 段落锚点（前端 data-block-anchor，段落首部文本指纹）
	Anchor string `gorm:"size:200;not null" json:"anchor"`
	// 选区偏移（paragraph 范围时为 0）
	StartOffset int `gorm:"not null" json:"startOffset"`
	EndOffset   int `gorm:"not null" json:"endOffset"`
	// SelectedText 引用文字（exact）
	SelectedText string `gorm:"type:text;not null" json:"selectedText"`
	// TextQuoteSelector 前后文，用于重复文本消歧（作者编辑后重定位）
	Prefix string `gorm:"size:200" json:"prefix"`
	Suffix string `gorm:"size:200" json:"suffix"`
	// ParagraphSnapshot 创建时段落纯文本快照，脱离原文后仍能理解讨论对象
	ParagraphSnapshot string `gorm:"type:text" json:"paragraphSnapshot"`
	// ContentDigest 创建时帖子内容摘要，归一化后内容未变则跳过重算
	ContentDigest string `gorm:"size:128;index" json:"contentDigest"`
	// Body 想法正文
	Body string `gorm:"type:text;not null" json:"body"`
	// BodyDigest 正文摘要，用于幂等防重复提交（service 层 check-before-insert）
	BodyDigest string `gorm:"size:64;index:idx_annotation_post" json:"-"`
	// Visibility: public / private
	Visibility string `gorm:"size:20;default:public;index:idx_annotation_post" json:"visibility"`
	// AnchorStatus: attached / orphaned
	AnchorStatus string `gorm:"size:20;default:attached;index" json:"anchorStatus"`
	// Status: active / deleted / moderated
	Status     string            `gorm:"size:20;default:active;index:idx_annotation_post" json:"status"`
	Edited     bool              `gorm:"default:false" json:"edited"`
	ReplyCount int               `gorm:"default:0" json:"replyCount"`
	LikeCount  int               `gorm:"default:0" json:"likeCount"`
	CreatedAt  time.Time         `gorm:"index" json:"createdAt"`
	UpdatedAt  time.Time         `json:"updatedAt"`
	Replies    []AnnotationReply `gorm:"foreignKey:AnnotationID" json:"-"`
	Likes      []AnnotationLike  `gorm:"foreignKey:AnnotationID" json:"-"`
}

func (a *Annotation) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	if a.BodyDigest == "" {
		a.BodyDigest = bodyDigest(a.Body)
	}
	return nil
}

// bodyDigest 返回正文归一化后的 sha256 摘要，用于幂等去重。
func bodyDigest(body string) string {
	s := strings.TrimSpace(body)
	if s == "" {
		return ""
	}
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
