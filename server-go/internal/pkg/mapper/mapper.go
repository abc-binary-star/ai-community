package mapper

import (
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// UserToDTO 将 User model 转为 User DTO
func UserToDTO(u *model.User) types.User {
	return types.User{
		ID:          u.ID,
		Username:    u.Username,
		Email:       u.Email,
		Avatar:      u.Avatar,
		Bio:         u.Bio,
		DisplayName: u.DisplayName,
		Role:        u.Role,
		CreatedAt:   u.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   u.UpdatedAt.Format(time.RFC3339),
	}
}

// PublicUserToDTO 将 User model 转为带统计的 PublicUser DTO
func PublicUserToDTO(u *model.User, postCount, followerCount, followingCount, likeCount int, channels []string, isFollowing bool) types.PublicUser {
	if channels == nil {
		channels = []string{}
	}
	return types.PublicUser{
		ID:             u.ID,
		Username:       u.Username,
		Avatar:         u.Avatar,
		Bio:            u.Bio,
		DisplayName:    u.DisplayName,
		Role:           u.Role,
		PostCount:      postCount,
		FollowerCount:  followerCount,
		FollowingCount: followingCount,
		LikeCount:      likeCount,
		Channels:       channels,
		IsFollowing:    isFollowing,
		CreatedAt:      u.CreatedAt.Format(time.RFC3339),
	}
}

// AuthorToDTO 将 User model 转为作者信息（不含 email，统计字段默认 0）
func AuthorToDTO(u *model.User) types.PublicUser {
	return types.PublicUser{
		ID:          u.ID,
		Username:    u.Username,
		Avatar:      u.Avatar,
		Bio:         u.Bio,
		DisplayName: u.DisplayName,
		Role:        u.Role,
		Channels:    []string{},
		CreatedAt:   u.CreatedAt.Format(time.RFC3339),
	}
}

// PostToDTO 将 Post model 转为 Post DTO（liked/bookmarked/tags 由调用方设置）
func PostToDTO(p *model.Post, commentCount int, liked, bookmarked bool, tagNames []string) types.Post {
	tags := tagNames
	if tags == nil {
		tags = []string{}
	}
	contentFormat := p.ContentFormat
	if contentFormat == "" {
		if p.ContentDocEnabled && len(p.ContentDoc) > 0 {
			contentFormat = "richtext"
		} else {
			contentFormat = "markdown"
		}
	}
	return types.Post{
		ID:                p.ID,
		Title:             p.Title,
		Content:           p.Content,
		ContentDoc:        append([]byte(nil), p.ContentDoc...),
		ContentFormat:     contentFormat,
		Channel:           p.Channel,
		Status:            p.Status,
		AuthorID:          p.AuthorID,
		Author:            AuthorToDTO(&p.Author),
		CommentCount:      commentCount,
		LikeCount:         p.LikeCount,
		ViewCount:         p.ViewCount,
		Liked:             liked,
		Bookmarked:        bookmarked,
		Edited:            p.Edited,
		IsPinned:          p.IsPinned,
		IsFeatured:        p.IsFeatured,
		AiSummary:         p.AiSummary,
		Font:              p.Font,
		CoverURL:          p.CoverURL,
		ContentDocEnabled: p.ContentDocEnabled,
		EditorDowngraded:  p.EditorDowngraded,
		Tags:              tags,
		CreatedAt:         p.CreatedAt.Format(time.RFC3339),
		UpdatedAt:         p.UpdatedAt.Format(time.RFC3339),
	}
}

func PostToListDTO(p *model.Post, commentCount int, liked, bookmarked bool, tagNames []string) types.Post {
	dto := PostToDTO(p, commentCount, liked, bookmarked, tagNames)
	dto.ContentDoc = nil
	return dto
}

// CommentToDTO 将 Comment model 转为 Comment DTO
func CommentToDTO(c *model.Comment, liked bool, replies []types.Comment, replyCount int) types.Comment {
	if replies == nil {
		replies = []types.Comment{}
	}
	return types.Comment{
		ID:         c.ID,
		Content:    c.Content,
		PostID:     c.PostID,
		AuthorID:   c.AuthorID,
		Author:     AuthorToDTO(&c.Author),
		ParentID:   c.ParentID,
		Replies:    replies,
		ReplyCount: replyCount,
		LikeCount:  c.LikeCount,
		Liked:      liked,
		Edited:     c.Edited,
		CreatedAt:  c.CreatedAt.Format(time.RFC3339),
		UpdatedAt:  c.UpdatedAt.Format(time.RFC3339),
	}
}

// NotificationToDTO 将 Notification model 转为 Notification DTO
func NotificationToDTO(n *model.Notification, actorName *string) types.Notification {
	return types.Notification{
		ID:           n.ID,
		Type:         n.Type,
		ActorID:      n.ActorID,
		ActorName:    actorName,
		PostID:       n.PostID,
		CommentID:    n.CommentID,
		AnnotationID: n.AnnotationID,
		Content:      n.Content,
		Read:         n.Read,
		CreatedAt:    n.CreatedAt.Format(time.RFC3339),
	}
}

// ExtractTagNames 从 PostTag 关联中提取标签名数组
func ExtractTagNames(tags []model.Tag) []string {
	names := make([]string, 0, len(tags))
	for _, t := range tags {
		names = append(names, t.Name)
	}
	return names
}

func annotationAnchorMeta(anchor, scope string) (format, blockID string) {
	if scope == model.AnnotationScopeWhole || anchor == model.AnnotationWholeAnchor {
		return "whole", ""
	}
	const blockPrefix = "blk:block:"
	if strings.HasPrefix(anchor, blockPrefix) {
		tail := strings.TrimPrefix(anchor, blockPrefix)
		blockID = strings.SplitN(tail, ":", 2)[0]
		if strings.HasPrefix(blockID, "blk_") {
			return "block", blockID
		}
	}
	if strings.HasPrefix(anchor, "md:range:") {
		return "markdown", ""
	}
	if strings.HasPrefix(anchor, "blk_") {
		return "block", anchor
	}
	return "markdown", ""
}

// AnnotationToDTO 将 Annotation model 转为 Annotation DTO。
// liked/folded/replies 由调用方设置。删除/审核状态下隐藏正文及原文定位信息。
func AnnotationToDTO(a *model.Annotation, liked, folded bool, replies []types.AnnotationReply) types.Annotation {
	if replies == nil {
		replies = []types.AnnotationReply{}
	}
	body := a.Body
	selectedText := a.SelectedText
	prefix := a.Prefix
	suffix := a.Suffix
	paragraphSnapshot := a.ParagraphSnapshot
	// deleted 根占位与 moderated 下架：正文及原文定位信息不下发
	if a.Status != model.AnnotationStatusActive {
		body = ""
		selectedText = ""
		prefix = ""
		suffix = ""
		paragraphSnapshot = ""
	}
	anchorFormat, blockID := annotationAnchorMeta(a.Anchor, a.Scope)
	return types.Annotation{
		ID:                 a.ID,
		PostID:             a.PostID,
		AuthorID:           a.UserID,
		Author:             AuthorToDTO(&a.User),
		ParentAnnotationID: a.ParentAnnotationID,
		Scope:              a.Scope,
		Anchor:             a.Anchor,
		AnchorFormat:       anchorFormat,
		BlockID:            blockID,
		StartOffset:        a.StartOffset,
		EndOffset:          a.EndOffset,
		SelectedText:       selectedText,
		Prefix:             prefix,
		Suffix:             suffix,
		ParagraphSnapshot:  paragraphSnapshot,
		Body:               body,
		Visibility:         a.Visibility,
		AnchorStatus:       a.AnchorStatus,
		Status:             a.Status,
		Edited:             a.Edited,
		ReplyCount:         a.ReplyCount,
		LikeCount:          a.LikeCount,
		Liked:              liked,
		Folded:             folded,
		Replies:            replies,
		CreatedAt:          a.CreatedAt.Format(time.RFC3339),
		UpdatedAt:          a.UpdatedAt.Format(time.RFC3339),
	}
}

// AnnotationReplyToDTO 将 AnnotationReply model 转为 DTO。
// folded 由调用方设置；删除/审核状态下隐藏正文。
func AnnotationReplyToDTO(r *model.AnnotationReply, folded bool) types.AnnotationReply {
	body := r.Body
	if r.Status != model.AnnotationStatusActive {
		body = ""
	}
	return types.AnnotationReply{
		ID:            r.ID,
		AnnotationID:  r.AnnotationID,
		AuthorID:      r.UserID,
		Author:        AuthorToDTO(&r.User),
		ReplyToUserID: r.ReplyToUserID,
		Body:          body,
		Status:        r.Status,
		Edited:        r.Edited,
		Folded:        folded,
		CreatedAt:     r.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     r.UpdatedAt.Format(time.RFC3339),
	}
}
