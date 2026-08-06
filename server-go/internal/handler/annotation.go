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

var annotationService = &service.AnnotationService{}

func handleAnnotationError(c *app.RequestContext, err error) {
	if ce, ok := err.(*service.AnnotationError); ok {
		response.Error(c, ce.Code, ce.Msg)
		return
	}
	log.Printf("[Annotation] 未预期的错误: %v", err)
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// ListAnnotations 获取帖子想法列表 + 各段落公开计数
// GET /api/posts/:id/annotations?anchor=&sort=hot|latest&mine=1
func ListAnnotations(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	currentUserID := middleware.GetCurrentUserID(c)
	anchorParam := c.Query("anchor")
	sortParam := c.Query("sort")
	mine := c.Query("mine") == "1" || c.Query("mine") == "true"
	page, pageSize := pagination.Parse(c)

	result, err := annotationService.ListAnnotations(ctx, postID, currentUserID, anchorParam, sortParam, mine, page, pageSize)
	if err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.JSON(c, result)
}

// CreateAnnotation 创建段落想法
// POST /api/posts/:id/annotations
func CreateAnnotation(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	var req types.CreateAnnotationReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	dto, err := annotationService.CreateAnnotation(ctx, postID, userID, req)
	if err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.Created(c, dto)
}

// UpdateAnnotation 编辑想法正文或可见范围
// PATCH /api/posts/:id/annotations/:annotationId
func UpdateAnnotation(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	annotationID := c.Param("annotationId")
	var req types.UpdateAnnotationReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	dto, err := annotationService.UpdateAnnotation(ctx, postID, annotationID, userID, req)
	if err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.JSON(c, dto)
}

// DeleteAnnotation 删除自己的想法
// DELETE /api/posts/:id/annotations/:annotationId
func DeleteAnnotation(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	annotationID := c.Param("annotationId")
	userID := middleware.GetCurrentUserID(c)

	if err := annotationService.DeleteAnnotation(ctx, postID, annotationID, userID); err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.OK(c)
}

// CreateAnnotationReply 回复公开想法
// POST /api/posts/:id/annotations/:annotationId/replies
func CreateAnnotationReply(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	annotationID := c.Param("annotationId")
	var req types.CreateAnnotationReplyReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	dto, err := annotationService.CreateReply(ctx, postID, annotationID, userID, req)
	if err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.Created(c, dto)
}

// ListAnnotationReplies 分页加载想法回复
// GET /api/posts/:id/annotations/:annotationId/replies
func ListAnnotationReplies(ctx context.Context, c *app.RequestContext) {
	annotationID := c.Param("annotationId")
	currentUserID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := annotationService.ListReplies(ctx, annotationID, currentUserID, page, pageSize)
	if err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.JSON(c, result)
}

// UpdateAnnotationReply 编辑自己的回复
// PATCH /api/annotation-replies/:id
func UpdateAnnotationReply(ctx context.Context, c *app.RequestContext) {
	replyID := c.Param("id")
	var req struct {
		Body string `json:"body"`
	}
	if err := c.BindAndValidate(&req); err != nil || req.Body == "" {
		response.BadRequest(c, "输入不合法")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	dto, err := annotationService.UpdateReply(ctx, replyID, userID, req.Body)
	if err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.JSON(c, dto)
}

// DeleteAnnotationReply 删除自己的回复
// DELETE /api/annotation-replies/:id
func DeleteAnnotationReply(ctx context.Context, c *app.RequestContext) {
	replyID := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	if err := annotationService.DeleteReply(ctx, replyID, userID); err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.OK(c)
}

// LikeAnnotation 点赞想法
// POST /api/posts/:id/annotations/:annotationId/like
func LikeAnnotation(ctx context.Context, c *app.RequestContext) {
	annotationID := c.Param("annotationId")
	userID := middleware.GetCurrentUserID(c)

	likeCount, alreadyLiked, err := annotationService.LikeAnnotation(ctx, annotationID, userID)
	if err != nil {
		handleAnnotationError(c, err)
		return
	}
	body := map[string]interface{}{
		"ok":        true,
		"liked":     true,
		"likeCount": likeCount,
	}
	if alreadyLiked {
		response.JSON(c, body)
	} else {
		response.Created(c, body)
	}
}

// UnlikeAnnotation 取消点赞想法
// DELETE /api/posts/:id/annotations/:annotationId/like
func UnlikeAnnotation(ctx context.Context, c *app.RequestContext) {
	annotationID := c.Param("annotationId")
	userID := middleware.GetCurrentUserID(c)

	likeCount, err := annotationService.UnlikeAnnotation(ctx, annotationID, userID)
	if err != nil {
		handleAnnotationError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{
		"ok":        true,
		"liked":     false,
		"likeCount": likeCount,
	})
}
