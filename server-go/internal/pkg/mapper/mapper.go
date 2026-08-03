package mapper

import (
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
func PublicUserToDTO(u *model.User, postCount, followerCount, followingCount int, isFollowing bool) types.PublicUser {
	return types.PublicUser{
		ID:            u.ID,
		Username:      u.Username,
		Avatar:        u.Avatar,
		Bio:           u.Bio,
		DisplayName:   u.DisplayName,
		Role:          u.Role,
		PostCount:     postCount,
		FollowerCount: followerCount,
		FollowingCount: followingCount,
		IsFollowing:   isFollowing,
		CreatedAt:     u.CreatedAt.Format(time.RFC3339),
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
		CreatedAt:   u.CreatedAt.Format(time.RFC3339),
	}
}

// PostToDTO 将 Post model 转为 Post DTO（liked/bookmarked/tags 由调用方设置）
func PostToDTO(p *model.Post, commentCount int, liked, bookmarked bool, tagNames []string) types.Post {
	tags := tagNames
	if tags == nil {
		tags = []string{}
	}
	return types.Post{
		ID:           p.ID,
		Title:        p.Title,
		Content:      p.Content,
		Channel:      p.Channel,
		Status:       p.Status,
		AuthorID:     p.AuthorID,
		Author:       AuthorToDTO(&p.Author),
		CommentCount: commentCount,
		LikeCount:    p.LikeCount,
		ViewCount:    p.ViewCount,
		Liked:        liked,
		Bookmarked:   bookmarked,
		Edited:       p.Edited,
		IsPinned:     p.IsPinned,
		IsFeatured:   p.IsFeatured,
		Tags:         tags,
		CreatedAt:    p.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    p.UpdatedAt.Format(time.RFC3339),
	}
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
		ID:        n.ID,
		Type:      n.Type,
		ActorID:   n.ActorID,
		ActorName: actorName,
		PostID:    n.PostID,
		CommentID: n.CommentID,
		Content:   n.Content,
		Read:      n.Read,
		CreatedAt: n.CreatedAt.Format(time.RFC3339),
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
