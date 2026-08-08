package handler

import (
	"context"
	"errors"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
	"gorm.io/gorm"
)

var ideaFeedService = &service.IdeaFeedService{}

// ListIdeaFeed 跨帖想法流
// GET /api/ideas?sort=hot|latest&page=&pageSize=
func ListIdeaFeed(ctx context.Context, c *app.RequestContext) {
	currentUserID := middleware.GetCurrentUserID(c)
	sortParam := c.Query("sort")
	page, pageSize := pagination.Parse(c)

	result, err := ideaFeedService.ListFeed(ctx, currentUserID, sortParam, page, pageSize)
	if err != nil {
		log.Printf("[IdeaFeed] 获取想法流失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}

// GetIdea 单条想法详情
// GET /api/ideas/:id
func GetIdea(ctx context.Context, c *app.RequestContext) {
	currentUserID := middleware.GetCurrentUserID(c)
	ideaID := c.Param("id")

	result, err := ideaFeedService.GetIdea(ctx, currentUserID, ideaID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, consts.StatusNotFound, "想法不存在或已不可见")
			return
		}
		log.Printf("[IdeaFeed] 获取想法失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}

// GetIdeaChain 想法纵向链视图
// GET /api/ideas/:id/chain
func GetIdeaChain(ctx context.Context, c *app.RequestContext) {
	currentUserID := middleware.GetCurrentUserID(c)
	ideaID := c.Param("id")

	result, err := ideaFeedService.GetChain(ctx, currentUserID, ideaID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Error(c, consts.StatusNotFound, "想法不存在或已不可见")
			return
		}
		log.Printf("[IdeaFeed] 获取想法链失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, result)
}
