package service

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// MessageService 私信服务
type MessageService struct{}

// MessageError 私信业务错误
type MessageError struct {
	Msg  string
	Code int
}

func (e *MessageError) Error() string { return e.Msg }

// normalizePair 规范化会话双方 ID（字典序），保证同一对用户只有一条会话
func normalizePair(id1, id2 string) (string, string) {
	if id1 < id2 {
		return id1, id2
	}
	return id2, id1
}

// GetOrCreateConversation 获取或创建与某用户的会话
func (s *MessageService) GetOrCreateConversation(ctx context.Context, userID, recipientID string) (*types.Conversation, error) {
	if recipientID == "" {
		return nil, &MessageError{Msg: "参数不合法", Code: 400}
	}
	if recipientID == userID {
		return nil, &MessageError{Msg: "不能和自己私信", Code: 400}
	}

	// 接收方必须存在
	var recipient model.User
	if err := dal.DB.WithContext(ctx).Select("id").First(&recipient, "id = ?", recipientID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &MessageError{Msg: "用户不存在", Code: 404}
		}
		log.Printf("[Message/GetOrCreateConversation] failed to get recipient, recipientID=%s, err=%v", recipientID, err)
		return nil, err
	}

	a, b := normalizePair(userID, recipientID)
	var conv model.Conversation
	err := dal.DB.WithContext(ctx).Where("user_a_id = ? AND user_b_id = ?", a, b).First(&conv).Error
	if err == gorm.ErrRecordNotFound {
		conv = model.Conversation{UserAID: a, UserBID: b}
		if err := dal.DB.WithContext(ctx).Create(&conv).Error; err != nil {
			log.Printf("[Message/GetOrCreateConversation] failed to create conversation, userAID=%s, userBID=%s, err=%v", a, b, err)
			return nil, err
		}
	} else if err != nil {
		log.Printf("[Message/GetOrCreateConversation] failed to get conversation, userAID=%s, userBID=%s, err=%v", a, b, err)
		return nil, err
	}

	return s.conversationToDTO(ctx, &conv, userID)
}

// ListConversations 获取当前用户的会话列表（按最后消息时间倒序）
func (s *MessageService) ListConversations(ctx context.Context, userID string, page, pageSize int) (*types.Paginated[types.Conversation], error) {
	var total int64
	dal.DB.WithContext(ctx).Model(&model.Conversation{}).
		Where("user_a_id = ? OR user_b_id = ?", userID, userID).Count(&total)

	offset := (page - 1) * pageSize
	var rows []model.Conversation
	dal.DB.WithContext(ctx).
		Where("user_a_id = ? OR user_b_id = ?", userID, userID).
		Order("last_message_at DESC NULLS LAST, created_at DESC").
		Offset(offset).Limit(pageSize).
		Find(&rows)

	items := make([]types.Conversation, 0, len(rows))
	for i := range rows {
		item, err := s.conversationToDTO(ctx, &rows[i], userID)
		if err != nil {
			log.Printf("[Message/ListConversations] failed to convert conversation to DTO, convID=%s, err=%v", rows[i].ID, err)
			return nil, err
		}
		items = append(items, *item)
	}

	return &types.Paginated[types.Conversation]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// ListMessages 获取会话消息（keyset 游标分页：beforeID 为上一页最旧消息的 ID）
// 返回按时间正序，hasMore 表示是否还有更早的消息可加载
func (s *MessageService) ListMessages(ctx context.Context, userID, conversationID, beforeID string, limit int) ([]types.Message, bool, error) {
	if _, err := s.getParticipatedConversation(ctx, userID, conversationID); err != nil {
		log.Printf("[Message/ListMessages] failed to verify participation, userID=%s, conversationID=%s, err=%v", userID, conversationID, err)
		return nil, false, err
	}

	q := dal.DB.WithContext(ctx).Model(&model.Message{}).
		Where("conversation_id = ?", conversationID)
	if beforeID != "" {
		// 复合游标：比游标消息更早（时间更早，或同秒且 ID 更小），避免同秒消息被跳过
		var before model.Message
		if err := dal.DB.WithContext(ctx).Select("id", "created_at").
			First(&before, "id = ? AND conversation_id = ?", beforeID, conversationID).Error; err == nil {
			q = q.Where("created_at < ? OR (created_at = ? AND id < ?)", before.CreatedAt, before.CreatedAt, beforeID)
		}
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	// 多查一条用于判断是否还有更早消息
	var rows []model.Message
	if err := q.Preload("Sender").Order("created_at DESC, id DESC").Limit(limit + 1).Find(&rows).Error; err != nil {
		log.Printf("[Message/ListMessages] failed to list messages, conversationID=%s, err=%v", conversationID, err)
		return nil, false, err
	}
	hasMore := false
	if len(rows) > limit {
		hasMore = true
		rows = rows[:limit]
	}

	// 翻转成时间正序
	items := make([]types.Message, 0, len(rows))
	for i := len(rows) - 1; i >= 0; i-- {
		m := &rows[i]
		items = append(items, types.Message{
			ID:             m.ID,
			ConversationID: m.ConversationID,
			SenderID:       m.SenderID,
			SenderName:     m.Sender.Username,
			SenderAvatar:   m.Sender.Avatar,
			Content:        m.Content,
			ReadAt:         timePtrToString(m.ReadAt),
			CreatedAt:      m.CreatedAt.Format(time.RFC3339),
		})
	}
	return items, hasMore, nil
}

// SendMessage 发送消息并更新会话最后一条消息
func (s *MessageService) SendMessage(ctx context.Context, userID, conversationID, content string) (*types.Message, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, &MessageError{Msg: "消息内容不能为空", Code: 400}
	}
	if len([]rune(content)) > 5000 {
		return nil, &MessageError{Msg: "消息内容过长", Code: 400}
	}
	if _, err := s.getParticipatedConversation(ctx, userID, conversationID); err != nil {
		log.Printf("[Message/SendMessage] failed to verify participation, userID=%s, conversationID=%s, err=%v", userID, conversationID, err)
		return nil, err
	}

	now := time.Now()
	msg := model.Message{
		ConversationID: conversationID,
		SenderID:       userID,
		Content:        content,
		CreatedAt:      now,
	}
	if err := dal.DB.WithContext(ctx).Create(&msg).Error; err != nil {
		log.Printf("[Message/SendMessage] failed to create message, conversationID=%s, senderID=%s, err=%v", conversationID, userID, err)
		return nil, err
	}

	// 更新会话最后一条消息（预览截断 80 字）
	preview := content
	if runes := []rune(content); len(runes) > 80 {
		preview = string(runes[:80]) + "…"
	}
	if err := dal.DB.WithContext(ctx).Model(&model.Conversation{}).
		Where("id = ?", conversationID).
		Updates(map[string]interface{}{
			"last_message":    preview,
			"last_message_at": now,
		}).Error; err != nil {
		log.Printf("[Message/SendMessage] failed to update conversation last message, conversationID=%s, err=%v", conversationID, err)
		return nil, err
	}

	var sender model.User
	senderName := ""
	var senderAvatar *string
	if err := dal.DB.WithContext(ctx).Select("username", "avatar").First(&sender, "id = ?", userID).Error; err == nil {
		senderName = sender.Username
		senderAvatar = sender.Avatar
	}

	return &types.Message{
		ID:             msg.ID,
		ConversationID: msg.ConversationID,
		SenderID:       msg.SenderID,
		SenderName:     senderName,
		SenderAvatar:   senderAvatar,
		Content:        msg.Content,
		CreatedAt:      msg.CreatedAt.Format(time.RFC3339),
	}, nil
}

// MarkConversationRead 将会话中对方发来的消息全部标记为已读
func (s *MessageService) MarkConversationRead(ctx context.Context, userID, conversationID string) error {
	if _, err := s.getParticipatedConversation(ctx, userID, conversationID); err != nil {
		log.Printf("[Message/MarkConversationRead] failed to verify participation, userID=%s, conversationID=%s, err=%v", userID, conversationID, err)
		return err
	}
	if err := dal.DB.WithContext(ctx).Model(&model.Message{}).
		Where("conversation_id = ? AND sender_id <> ? AND read_at IS NULL", conversationID, userID).
		Update("read_at", time.Now()).Error; err != nil {
		log.Printf("[Message/MarkConversationRead] failed to mark messages read, conversationID=%s, err=%v", conversationID, err)
		return err
	}
	return nil
}

// UnreadCount 当前用户在所有会话中的未读消息总数
func (s *MessageService) UnreadCount(ctx context.Context, userID string) (int64, error) {
	sub := dal.DB.WithContext(ctx).Model(&model.Conversation{}).
		Where("user_a_id = ? OR user_b_id = ?", userID, userID).
		Select("id")
	var count int64
	err := dal.DB.WithContext(ctx).Model(&model.Message{}).
		Where("conversation_id IN (?) AND sender_id <> ? AND read_at IS NULL", sub, userID).
		Count(&count).Error
	if err != nil {
		log.Printf("[Message/UnreadCount] failed to count unread messages, userID=%s, err=%v", userID, err)
	}
	return count, err
}

// conversationToDTO 会话转 DTO：对端用户 + 未读数
func (s *MessageService) conversationToDTO(ctx context.Context, conv *model.Conversation, userID string) (*types.Conversation, error) {
	otherID := conv.UserBID
	if conv.UserBID == userID {
		otherID = conv.UserAID
	}

	var other model.User
	if err := dal.DB.WithContext(ctx).
		Select("id", "username", "avatar", "bio", "display_name", "created_at").
		First(&other, "id = ?", otherID).Error; err != nil {
		log.Printf("[Message/conversationToDTO] failed to get other user, otherID=%s, err=%v", otherID, err)
		return nil, err
	}

	var unread int64
	dal.DB.WithContext(ctx).Model(&model.Message{}).
		Where("conversation_id = ? AND sender_id = ? AND read_at IS NULL", conv.ID, otherID).
		Count(&unread)

	lastMsgAt := ""
	if !conv.LastMessageAt.IsZero() {
		lastMsgAt = conv.LastMessageAt.Format(time.RFC3339)
	}

	return &types.Conversation{
		ID:            conv.ID,
		OtherUser:     mapper.AuthorToDTO(&other),
		LastMessage:   conv.LastMessage,
		LastMessageAt: lastMsgAt,
		UnreadCount:   int(unread),
	}, nil
}

// getParticipatedConversation 校验当前用户是会话参与者
func (s *MessageService) getParticipatedConversation(ctx context.Context, userID, conversationID string) (*model.Conversation, error) {
	var conv model.Conversation
	if err := dal.DB.WithContext(ctx).First(&conv, "id = ?", conversationID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &MessageError{Msg: "会话不存在", Code: 404}
		}
		log.Printf("[Message/getParticipatedConversation] failed to get conversation, conversationID=%s, err=%v", conversationID, err)
		return nil, err
	}
	if conv.UserAID != userID && conv.UserBID != userID {
		return nil, &MessageError{Msg: "无权访问该会话", Code: 403}
	}
	return &conv, nil
}

// timePtrToString 时间指针转 RFC3339 字符串指针
func timePtrToString(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}
