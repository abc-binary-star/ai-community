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

var sanctionService = &service.SanctionService{}

func handleSanctionError(c *app.RequestContext, err error) {
	if se, ok := err.(*service.SanctionError); ok {
		response.Error(c, se.Code, se.Msg)
		return
	}
	if ue, ok := err.(*service.ServiceError); ok {
		response.Error(c, ue.Code, ue.Msg)
		return
	}
	log.Printf("[Sanction] 未预期的错误: %v", err)
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// ApplySanction 发起账号处罚（admin/moderator）
// POST /api/moderation/sanctions
func ApplySanction(ctx context.Context, c *app.RequestContext) {
	var req types.ApplySanctionReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	handlerID := middleware.GetCurrentUserID(c)

	result, err := sanctionService.ApplySanction(ctx, req, handlerID)
	if err != nil {
		handleSanctionError(c, err)
		return
	}
	response.Created(c, result)
}

// RevokeSanction 撤销处罚（admin/moderator）
// POST /api/moderation/sanctions/:id/revoke
func RevokeSanction(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	handlerID := middleware.GetCurrentUserID(c)

	result, err := sanctionService.RevokeSanction(ctx, id, handlerID)
	if err != nil {
		handleSanctionError(c, err)
		return
	}
	response.JSON(c, result)
}

// ListSanctions 处罚记录列表（admin/moderator）
// GET /api/moderation/sanctions?username=&page=&pageSize=
func ListSanctions(ctx context.Context, c *app.RequestContext) {
	username := c.Query("username")
	page, pageSize := pagination.Parse(c)

	result, err := sanctionService.ListSanctions(ctx, username, page, pageSize)
	if err != nil {
		handleSanctionError(c, err)
		return
	}
	response.JSON(c, result)
}
