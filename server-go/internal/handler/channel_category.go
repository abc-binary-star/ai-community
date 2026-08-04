package handler

import (
	"context"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var categoryService = &service.ChannelCategoryService{}

func handleCategoryError(c *app.RequestContext, err error) {
	if ce, ok := err.(*service.ChannelCategoryError); ok {
		response.Error(c, ce.Code, ce.Msg)
		return
	}
	log.Printf("[Category] 未预期的错误: %v", err)
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// ListCategories 获取所有频道分组（无需认证）
// GET /api/channel-categories
func ListCategories(ctx context.Context, c *app.RequestContext) {
	categories, err := categoryService.ListCategories(ctx)
	if err != nil {
		handleCategoryError(c, err)
		return
	}
	response.JSON(c, categories)
}

// CreateCategory 创建频道分组（仅 admin/moderator）
// POST /api/channel-categories
func CreateCategory(ctx context.Context, c *app.RequestContext) {
	var req types.CreateChannelCategoryReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	result, err := categoryService.CreateCategory(ctx, req)
	if err != nil {
		handleCategoryError(c, err)
		return
	}
	response.Created(c, result)
}

// UpdateCategory 更新频道分组（仅 admin/moderator）
// PUT /api/channel-categories/:id
func UpdateCategory(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")

	var req types.UpdateChannelCategoryReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	result, err := categoryService.UpdateCategory(ctx, id, req)
	if err != nil {
		handleCategoryError(c, err)
		return
	}
	response.JSON(c, result)
}

// DeleteCategory 删除频道分组（仅 admin）
// DELETE /api/channel-categories/:id
func DeleteCategory(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")

	if err := categoryService.DeleteCategory(ctx, id); err != nil {
		handleCategoryError(c, err)
		return
	}
	response.OK(c)
}

// GetChannelTree 获取频道树（分组 + 频道，无需认证）
// GET /api/channels/tree
func GetChannelTree(ctx context.Context, c *app.RequestContext) {
	tree, err := channelService.GetChannelTree(ctx)
	if err != nil {
		handleChannelError(c, err)
		return
	}
	response.JSON(c, tree)
}
