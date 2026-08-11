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
// - 类型开关（comment/like/follow 等）关闭时丢弃：用户明确选择不接收该类型
// - 免打扰只抑制触达，不阻止落库：通知始终入库，标记 Suppressed 等待补推
// - like/follow 类型检查是否已存在，防重复
// - 失败仅记日志，不阻断主流程
func Create(ctx context.Context, input CreateInput) {
	if input.ActorID == input.UserID {
		return
	}

	var pref model.NotificationPreference
	prefExists := false
	err := dal.DB.WithContext(ctx).Where("user_id = ?", input.UserID).First(&pref).Error
	if err == nil {
		prefExists = true
	} else if err != gorm.ErrRecordNotFound {
		// 查询偏好失败不阻断主流程，按默认（允许）处理
		log.Printf("查询通知偏好失败: userID=%s, err=%v", input.UserID, err)
	}

	// 类型开关：关闭的类型直接丢弃
	if prefExists && !allowsType(&pref, input.Type) {
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

	// 免打扰时段：通知照常落库，仅标记抑制与可补推时间
	if prefExists && pref.DoNotDisturb {
		now := time.Now()
		if inQuietWindow(now, pref.QuietStartHour, pref.QuietEndHour) {
			notif.Suppressed = true
			end := quietEndTime(now, pref.QuietStartHour, pref.QuietEndHour)
			notif.DeliverableAt = &end
		}
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

// allowsType 检查接收者是否允许接收该类型通知（仅类型开关）。
// 关闭类型意味着用户明确不接收，通知直接丢弃。
func allowsType(pref *model.NotificationPreference, notifType string) bool {
	switch notifType {
	case "comment":
		return pref.Comment
	case "reply":
		return pref.Reply
	case "like":
		return pref.Like
	case "follow":
		return pref.Follow
	case "mention":
		return pref.Mention
	}
	return true
}

// inQuietWindow 判断当前时刻是否处于免打扰时段（支持跨午夜，如 22:00-08:00）
func inQuietWindow(now time.Time, start, end int) bool {
	if start < end {
		return now.Hour() >= start && now.Hour() < end
	}
	return now.Hour() >= start || now.Hour() < end
}

// quietEndTime 返回当前免打扰时段结束的可补推时间。
// 当天窗口（如 01:00-05:00）：结束在当天 end 时；
// 跨午夜窗口（如 22:00-08:00）：凌晨时段结束在当天 end 时，深夜时段结束在次日 end 时。
func quietEndTime(now time.Time, start, end int) time.Time {
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	if start >= end && now.Hour() >= start {
		// 跨午夜且当前处于 start 之后（22:00-24:00），补推在次日
		return day.AddDate(0, 0, 1).Add(time.Duration(end) * time.Hour)
	}
	return day.Add(time.Duration(end) * time.Hour)
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
