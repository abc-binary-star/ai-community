package notification

import (
	"context"
	"errors"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

var mentionRegex = regexp.MustCompile(`@([a-zA-Z0-9_\x{4e00}-\x{9fff}]{2,20})`)

// CreateInput 创建通知的参数
type CreateInput struct {
	UserID       string
	Type         string // comment | like | follow | reply | mention
	ActorID      string
	PostID       string
	CommentID    string
	AnnotationID string
	Content      string
}

// Create 创建一条通知。
// - 跳过自己给自己的通知
// - 遵循接收者的通知偏好（类型开关 + 免打扰时段）
// - like/follow 类型检查是否已存在，防重复
// - 失败仅记日志，不阻断主流程
func Create(ctx context.Context, input CreateInput) {
	if input.ActorID == input.UserID {
		return
	}
	if !allowsPreference(ctx, input.UserID, input.Type) {
		return
	}

	actorID := &input.ActorID
	var postID, commentID, annotationID *string
	var content *string
	if input.PostID != "" {
		postID = &input.PostID
	}
	if input.CommentID != "" {
		commentID = &input.CommentID
	}
	if input.AnnotationID != "" {
		annotationID = &input.AnnotationID
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
		if input.AnnotationID != "" {
			query = query.Where("annotation_id = ?", input.AnnotationID)
		}
		if err := query.First(&existing).Error; err == nil {
			return // 已存在，跳过
		} else if err != gorm.ErrRecordNotFound {
			log.Printf("查询已有通知失败: %v", err)
			return
		}
	}

	notif := &model.Notification{
		UserID:       input.UserID,
		Type:         input.Type,
		ActorID:      actorID,
		PostID:       postID,
		CommentID:    commentID,
		AnnotationID: annotationID,
		Content:      content,
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
	cid := ""
	if len(commentID) > 0 {
		cid = commentID[0]
	}
	createMentionNotifications(ctx, content, actorID, postID, cid, "")
}

// CreateAnnotationMentionNotifications 想法正文/回复中的 @提及通知
func CreateAnnotationMentionNotifications(ctx context.Context, content, actorID, postID, annotationID string) {
	createMentionNotifications(ctx, content, actorID, postID, "", annotationID)
}

func createMentionNotifications(ctx context.Context, content, actorID, postID, commentID, annotationID string) {
	usernames := ParseMentions(content)
	if len(usernames) == 0 {
		return
	}

	var users []model.User
	if err := dal.DB.WithContext(ctx).Where("username IN ?", usernames).Select("id").Find(&users).Error; err != nil {
		log.Printf("查询提及用户失败: %v", err)
		return
	}

	// 截断过长内容（按 rune 计，避免截断中文产生乱码）
	notifContent := content
	runes := []rune(content)
	if len(runes) > 50 {
		notifContent = string(runes[:50]) + "…"
	}

	for _, u := range users {
		Create(ctx, CreateInput{
			UserID:       u.ID,
			Type:         "mention",
			ActorID:      actorID,
			PostID:       postID,
			CommentID:    commentID,
			AnnotationID: annotationID,
			Content:      notifContent,
		})
	}
}

// allowsPreference 检查接收者是否允许接收该类型通知（类型开关 + 免打扰时段）
func allowsPreference(ctx context.Context, userID, notifType string) bool {
	var pref model.NotificationPreference
	err := dal.DB.WithContext(ctx).Where("user_id = ?", userID).First(&pref).Error
	if err != nil {
		// 未设置偏好或查询失败：默认允许，不阻断主流程
		return true
	}

	// 类型开关
	switch notifType {
	case "comment":
		if !pref.Comment {
			return false
		}
	case "reply":
		if !pref.Reply {
			return false
		}
	case "like":
		if !pref.Like {
			return false
		}
	case "follow":
		if !pref.Follow {
			return false
		}
	case "mention":
		if !pref.Mention {
			return false
		}
	}

	// 免打扰时段（支持跨午夜，如 22:00-08:00）
	if pref.DoNotDisturb {
		hour := time.Now().Hour()
		start, end := pref.QuietStartHour, pref.QuietEndHour
		if start < end {
			if hour >= start && hour < end {
				return false
			}
		} else {
			if hour >= start || hour < end {
				return false
			}
		}
	}
	return true
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
