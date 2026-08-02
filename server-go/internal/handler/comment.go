package handler

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/middleware"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var commentService = &service.CommentService{}

func handleCommentError(c *app.RequestContext, err error) {
	if ce, ok := err.(*service.CommentError); ok {
		response.Error(c, ce.Code, ce.Msg)
		return
	}
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// ========== Comment Handlers ==========

// ListComments 获取帖子评论列表（根评论分页 + 回复预览）
func ListComments(ctx context.Context, c *app.RequestContext) {
	postID := c.Param("id")
	currentUserID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := commentService.ListComments(ctx, postID, currentUserID, page, pageSize)
	if err != nil {
		handleCommentError(c, err)
		return
	}
	response.JSON(c, result)
}

// ListReplies 分页加载某条评论的回复
func ListReplies(ctx context.Context, c *app.RequestContext) {
	commentID := c.Param("id")
	currentUserID := middleware.GetCurrentUserID(c)
	page, pageSize := pagination.Parse(c)

	result, err := commentService.ListReplies(ctx, commentID, currentUserID, page, pageSize)
	if err != nil {
		handleCommentError(c, err)
		return
	}
	response.JSON(c, result)
}

// CreateComment 创建评论或回复
func CreateComment(ctx context.Context, c *app.RequestContext) {
	var req types.CreateCommentReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	postID := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	comment, err := commentService.CreateComment(ctx, postID, userID, req)
	if err != nil {
		handleCommentError(c, err)
		return
	}
	response.Created(c, comment)
}

// UpdateComment 编辑评论（仅作者）
func UpdateComment(ctx context.Context, c *app.RequestContext) {
	var req types.UpdateCommentReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	commentID := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	comment, err := commentService.UpdateComment(ctx, commentID, userID, req)
	if err != nil {
		handleCommentError(c, err)
		return
	}
	response.JSON(c, comment)
}

// DeleteComment 删除评论（仅作者）
func DeleteComment(ctx context.Context, c *app.RequestContext) {
	commentID := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	if err := commentService.DeleteComment(ctx, commentID, userID); err != nil {
		handleCommentError(c, err)
		return
	}
	response.OK(c)
}

// LikeComment 点赞评论
func LikeComment(ctx context.Context, c *app.RequestContext) {
	commentID := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	likeCount, alreadyLiked, err := commentService.LikeComment(ctx, commentID, userID)
	if err != nil {
		handleCommentError(c, err)
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

// UnlikeComment 取消点赞评论
func UnlikeComment(ctx context.Context, c *app.RequestContext) {
	commentID := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	likeCount, err := commentService.UnlikeComment(ctx, commentID, userID)
	if err != nil {
		handleCommentError(c, err)
		return
	}

	response.JSON(c, map[string]interface{}{
		"ok":        true,
		"liked":     false,
		"likeCount": likeCount,
	})
}
