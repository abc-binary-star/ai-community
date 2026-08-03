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

var reportService = &service.ReportService{}

func handleReportError(c *app.RequestContext, err error) {
	if re, ok := err.(*service.ReportError); ok {
		response.Error(c, re.Code, re.Msg)
		return
	}
	// 目标不存在等错误复用 CommentError
	if ce, ok := err.(*service.CommentError); ok {
		response.Error(c, ce.Code, ce.Msg)
		return
	}
	log.Printf("[Report] 未预期的错误: %v", err)
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// CreateReport 举报内容（帖子/评论）
func CreateReport(ctx context.Context, c *app.RequestContext) {
	var req types.CreateReportReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	result, err := reportService.CreateReport(ctx, userID, req)
	if err != nil {
		handleReportError(c, err)
		return
	}
	response.Created(c, result)
}

// ListReports 审核队列（管理员/版主）
func ListReports(ctx context.Context, c *app.RequestContext) {
	status := c.Query("status")
	page, pageSize := pagination.Parse(c)

	result, err := reportService.ListReports(ctx, status, page, pageSize)
	if err != nil {
		handleReportError(c, err)
		return
	}
	response.JSON(c, result)
}

// HandleReport 处理举报（通过则删除目标内容 / 拒绝）
func HandleReport(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	var req types.HandleReportReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	result, err := reportService.HandleReport(ctx, id, userID, req)
	if err != nil {
		handleReportError(c, err)
		return
	}
	response.JSON(c, result)
}
