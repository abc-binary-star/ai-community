package handler

import (
	"context"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var appealService = &service.AppealService{}

func handleAppealError(c *app.RequestContext, err error) {
	if ae, ok := err.(*service.AppealError); ok {
		response.Error(c, ae.Code, ae.Msg)
		return
	}
	log.Printf("[Appeal] 未预期的错误: %v", err)
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// CreateAppeal 提交账号申诉（登录用户）
// POST /api/appeals
func CreateAppeal(ctx context.Context, c *app.RequestContext) {
	var req types.CreateAppealReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "申诉内容需 10-2000 字")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	result, err := appealService.CreateAppeal(ctx, userID, req)
	if err != nil {
		handleAppealError(c, err)
		return
	}
	response.Created(c, result)
}

// ListAppeals 申诉列表（管理员/版主）
// GET /api/appeals?status=&page=&pageSize=
func ListAppeals(ctx context.Context, c *app.RequestContext) {
	status := c.Query("status")
	page, pageSize := pagination.Parse(c)

	result, err := appealService.ListAppeals(ctx, status, page, pageSize)
	if err != nil {
		handleAppealError(c, err)
		return
	}
	response.JSON(c, result)
}

// HandleAppeal 处理申诉（管理员/版主）
// PUT /api/appeals/:id
func HandleAppeal(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	var req types.HandleAppealReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	result, err := appealService.HandleAppeal(ctx, id, userID, req)
	if err != nil {
		handleAppealError(c, err)
		return
	}
	response.JSON(c, result)
}
