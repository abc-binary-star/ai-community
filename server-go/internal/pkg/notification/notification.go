package notification

import (
	"context"
	"errors"
	"log"
	"regexp"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

var mentionRegex = regexp.MustCompile(`@([a-zA-Z0-9_\x{4e00}-\x{9fff}]{2,20})`)

// CreateInput 创建通知的参数
type CreateInput struct {
	UserID    string
	Type      string // comment | like | follow | reply | mention
	ActorID   string
	PostID    string
	CommentID string
	Content   string
}

// Create 创建一条通知。
// - 跳过自己给自己的通知
// - like/follow 类型检查是否已存在，防重复
// - 失败仅记日志，不阻断主流程
func Create(ctx context.Context, input CreateInput) {
	if input.ActorID == input.UserID {
		return
	}

	actorID := &input.ActorID
	var postID, commentID *string
	var content *string
	if input.PostID != "" {
		postID = &input.PostID
	}
	if input.CommentID != "" {
		commentID = &input.CommentID
	}
	if input.Content != "" {
		content = &input.Content
	}

	// like/follow 类型查重
	if input.Type == "like" || input.Type == "follow" {
		var existing model.Notification
		query := dal.DB.WithContext(ctx).Where(
			"user_id = ? AND actor_id = ? AND type = ?",
			input.UserID, input.ActorID, input.Type,
		)
		if input.PostID != "" {
			query = query.Where("post_id = ?", input.PostID)
		}
		if err := query.First(&existing).Error; err == nil {
			return // 已存在，跳过
		}
	}

	notif := &model.Notification{
		UserID:    input.UserID,
		Type:      input.Type,
		ActorID:   actorID,
		PostID:    postID,
		CommentID: commentID,
		Content:   content,
	}
	if err := dal.DB.WithContext(ctx).Create(notif).Error; err != nil {
		log.Printf("创建通知失败: %v", err)
	}
}

// ParseMentions 从文本中解析 @username 提及
func ParseMentions(content string) []string {
	matches := mentionRegex.FindAllStringSubmatch(content, -1)
	seen := make(map[string]bool)
	var usernames []string
	for _, m := range matches {
		if !seen[m[1]] {
			seen[m[1]] = true
			usernames = append(usernames, m[1])
		}
	}
	return usernames
}

// CreateMentionNotifications 解析内容中的 @提及并为每个被提及的用户创建通知
func CreateMentionNotifications(ctx context.Context, content, actorID, postID string, commentID ...string) {
	usernames := ParseMentions(content)
	if len(usernames) == 0 {
		return
	}

	var users []model.User
	dal.DB.WithContext(ctx).Where("username IN ?", usernames).Select("id").Find(&users)

	cid := ""
	if len(commentID) > 0 {
		cid = commentID[0]
	}

	// 截断过长内容（按 rune 计，避免截断中文产生乱码）
	notifContent := content
	runes := []rune(content)
	if len(runes) > 50 {
		notifContent = string(runes[:50]) + "…"
	}

	for _, u := range users {
		Create(ctx, CreateInput{
			UserID:    u.ID,
			Type:      "mention",
			ActorID:   actorID,
			PostID:    postID,
			CommentID: cid,
			Content:   notifContent,
		})
	}
}

// IsUniqueConstraintError 判断是否为唯一约束冲突（PostgreSQL error code 23505）
func IsUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	// 兼容非 pgx 驱动或被包装的错误，回退到字符串匹配
	return strings.Contains(err.Error(), "duplicate key value")
}

// IsNotFoundError 判断是否为记录不存在
func IsNotFoundError(err error) bool {
	return err == gorm.ErrRecordNotFound
}
