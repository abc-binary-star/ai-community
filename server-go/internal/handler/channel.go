package handler

import (
	"context"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var channelService = &service.ChannelService{}

func handleChannelError(c *app.RequestContext, err error) {
	if ce, ok := err.(*service.ChannelError); ok {
		response.Error(c, ce.Code, ce.Msg)
		return
	}
	log.Printf("[Channel] 未预期的错误: %v", err)
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// ListChannels 获取所有频道（无需认证）
// GET /api/channels
func ListChannels(ctx context.Context, c *app.RequestContext) {
	channels, err := channelService.ListChannels(ctx)
	if err != nil {
		handleChannelError(c, err)
		return
	}
	response.JSON(c, channels)
}

// CreateChannel 创建频道（仅 admin/moderator）
// POST /api/channels
func CreateChannel(ctx context.Context, c *app.RequestContext) {
	var req types.CreateChannelReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	result, err := channelService.CreateChannel(ctx, userID, req)
	if err != nil {
		handleChannelError(c, err)
		return
	}
	response.Created(c, result)
}

// UpdateChannel 更新频道信息（仅 admin/moderator）
// PUT /api/channels/:id
func UpdateChannel(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")

	var req types.UpdateChannelReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	result, err := channelService.UpdateChannel(ctx, id, req)
	if err != nil {
		handleChannelError(c, err)
		return
	}
	response.JSON(c, result)
}

// DeleteChannel 删除频道（仅 admin）
// DELETE /api/channels/:id
func DeleteChannel(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")

	if err := channelService.DeleteChannel(ctx, id); err != nil {
		handleChannelError(c, err)
		return
	}
	response.OK(c)
}
