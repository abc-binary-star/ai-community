package handler

import (
	"context"
	"log"
	"strconv"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var messageService = &service.MessageService{}

// ListConversations 获取当前用户的私信会话列表
// GET /api/messages/conversations
func ListConversations(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := messageService.ListConversations(ctx, userID, page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// CreateConversation 创建（或获取）与某用户的会话
// POST /api/messages/conversations  body: { "recipientId": "xxx" }
func CreateConversation(ctx context.Context, c *app.RequestContext) {
	var req types.CreateConversationReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	conv, err := messageService.GetOrCreateConversation(ctx, userID, req.RecipientID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, conv)
}

// ListMessages 获取会话消息（按时间正序，keyset 游标分页）
// GET /api/messages/conversations/:id/messages?beforeId=xxx&pageSize=50
func ListMessages(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	conversationID := c.Param("id")

	beforeID := c.Query("beforeId")
	limit := 50
	if v := c.Query("pageSize"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	items, hasMore, err := messageService.ListMessages(ctx, userID, conversationID, beforeID, limit)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{"items": items, "hasMore": hasMore})
}

// SendMessage 发送私信消息
// POST /api/messages/conversations/:id/messages  body: { "content": "xxx" }
func SendMessage(ctx context.Context, c *app.RequestContext) {
	var req types.SendMessageReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "参数不合法")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	conversationID := c.Param("id")

	msg, err := messageService.SendMessage(ctx, userID, conversationID, req.Content)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, msg)
}

// DeleteConversation 删除会话及其所有消息
// DELETE /api/messages/conversations/:id
func DeleteConversation(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	conversationID := c.Param("id")

	if err := messageService.DeleteConversation(ctx, userID, conversationID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]bool{"ok": true})
}

// MarkConversationRead 标记会话中对方发来的消息为已读
// POST /api/messages/conversations/:id/read
func MarkConversationRead(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	conversationID := c.Param("id")

	if err := messageService.MarkConversationRead(ctx, userID, conversationID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]bool{"ok": true})
}

// UnreadMessageCount 当前用户未读私信总数
// GET /api/messages/unread-count
func UnreadMessageCount(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)

	count, err := messageService.UnreadCount(ctx, userID)
	if err != nil {
		log.Printf("[Message] 获取未读私信数失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, map[string]int64{"count": count})
}
