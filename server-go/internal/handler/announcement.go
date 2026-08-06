package handler

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
)

var announcementService = &service.AnnouncementService{}

// ListAnnouncements 公告列表
// GET /api/announcements?category=&status=&page=&pageSize=
func ListAnnouncements(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	category := c.Query("category")
	status := c.Query("status")
	page, pageSize := pagination.Parse(c)

	result, err := announcementService.List(ctx, userID, category, status, page, pageSize)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// GetAnnouncement 公告详情
// GET /api/announcements/:id
func GetAnnouncement(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	dto, err := announcementService.Get(ctx, id, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// GetAnnouncementBanner 当前横幅
// GET /api/announcements/banner
func GetAnnouncementBanner(ctx context.Context, c *app.RequestContext) {
	result, err := announcementService.GetBanner(ctx)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, result)
}

// GetAnnouncementUnreadCount 公告未读数
// GET /api/announcements/unread-count
func GetAnnouncementUnreadCount(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	count, err := announcementService.UnreadCount(ctx, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]int64{"count": count})
}

// MarkAnnouncementRead 标记单条公告已读
// POST /api/announcements/:id/read
func MarkAnnouncementRead(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)
	if err := announcementService.MarkRead(ctx, id, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, map[string]bool{"ok": true})
}

// MarkAllAnnouncementsRead 全部标为已读
// POST /api/announcements/read-all
func MarkAllAnnouncementsRead(ctx context.Context, c *app.RequestContext) {
	userID := middleware.GetCurrentUserID(c)
	if err := announcementService.ReadAll(ctx, userID); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}

// CreateAnnouncement 创建公告（仅 admin）
// POST /api/announcements
func CreateAnnouncement(ctx context.Context, c *app.RequestContext) {
	var req types.CreateAnnouncementReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := announcementService.Create(ctx, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.Created(c, dto)
}

// UpdateAnnouncement 编辑公告（仅 admin）
// PUT /api/announcements/:id
func UpdateAnnouncement(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	var req types.UpdateAnnouncementReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := announcementService.Update(ctx, id, userID, req)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// UpdateAnnouncementStatus 发布或下线公告（仅 admin）
// PUT /api/announcements/:id/status
func UpdateAnnouncementStatus(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	var req types.UpdateAnnouncementStatusReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)
	dto, err := announcementService.UpdateStatus(ctx, id, userID, req.Status)
	if err != nil {
		handleServiceError(c, err)
		return
	}
	response.JSON(c, dto)
}

// DeleteAnnouncement 删除草稿或已下线公告（仅 admin）
// DELETE /api/announcements/:id
func DeleteAnnouncement(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	if err := announcementService.Delete(ctx, id); err != nil {
		handleServiceError(c, err)
		return
	}
	response.OK(c)
}
