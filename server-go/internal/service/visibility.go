package service

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/gorm"
)

// postPublishedScope 公开帖子的统一可见性作用域。
// 帖子列表、搜索、详情、关联内容和推荐必须复用同一套规则：
// 仅允许已发布的帖子，并过滤当前用户屏蔽的作者。
// 草稿走显式私有分支，不经过此作用域。
func postPublishedScope(ctx context.Context, db *gorm.DB, userID string) *gorm.DB {
	q := db.Model(&model.Post{}).Where("status = ?", "published")
	if userID != "" {
		if blocked := blockedIDList(ctx, userID); len(blocked) > 0 {
			q = q.Where("author_id NOT IN ?", blocked)
		}
	}
	return q
}

// commentVisibleScope 评论的统一可见性作用域。
// 评论必须继承父内容可见性：父帖子已发布；同时过滤当前用户屏蔽的作者。
func commentVisibleScope(ctx context.Context, db *gorm.DB, userID string) *gorm.DB {
	q := db.Model(&model.Comment{}).
		Joins("JOIN posts ON posts.id = comments.post_id").
		Where("posts.status = ?", "published")
	if userID != "" {
		if blocked := blockedIDList(ctx, userID); len(blocked) > 0 {
			q = q.Where("comments.author_id NOT IN ?", blocked)
		}
	}
	return q
}
