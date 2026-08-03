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

var postService = &service.PostService{}

func handlePostError(c *app.RequestContext, err error) {
	if pe, ok := err.(*service.PostError); ok {
		response.Error(c, pe.Code, pe.Msg)
		return
	}
	log.Printf("[Post] 未预期的错误: %v", err)
	response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
}

// ListPosts 帖子列表
func ListPosts(ctx context.Context, c *app.RequestContext) {
	channel := c.Query("channel")
	if channel == "" {
		channel = "general"
	}
	sort := c.Query("sort")
	if sort == "" {
		sort = "latest"
	}
	q := c.Query("q")
	tag := c.Query("tag")
	status := c.Query("status")
	page, pageSize := pagination.Parse(c)
	userID := middleware.GetCurrentUserID(c)

	result, err := postService.ListPosts(ctx, channel, sort, q, tag, status, userID, page, pageSize)
	if err != nil {
		handlePostError(c, err)
		return
	}
	response.JSON(c, result)
}

// GetPost 帖子详情
func GetPost(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	result, err := postService.GetPost(ctx, id, userID)
	if err != nil {
		handlePostError(c, err)
		return
	}
	response.JSON(c, result)
}

// CreatePost 创建帖子
func CreatePost(ctx context.Context, c *app.RequestContext) {
	var req types.CreatePostReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}
	// 手动验证（确保 vd tag 未生效时也有校验）；草稿允许标题/内容为空
	if req.Status == "draft" {
		if len(req.Title) > 100 {
			response.BadRequest(c, "标题长度需在 100 字以内")
			return
		}
		if len([]rune(req.Content)) > 30000 {
			response.BadRequest(c, "内容长度需在 30000 字以内")
			return
		}
	} else {
		if len(req.Title) < 1 || len(req.Title) > 100 {
			response.BadRequest(c, "标题长度需在 1-100 字之间")
			return
		}
		if len([]rune(req.Content)) < 1 || len([]rune(req.Content)) > 30000 {
			response.BadRequest(c, "内容长度需在 1-30000 字之间")
			return
		}
	}
	if req.Tags != nil && len(req.Tags) > 5 {
		response.BadRequest(c, "最多 5 个标签")
		return
	}
	userID := middleware.GetCurrentUserID(c)

	result, err := postService.CreatePost(ctx, userID, req)
	if err != nil {
		handlePostError(c, err)
		return
	}
	response.Created(c, result)
}

// UpdatePost 更新帖子
func UpdatePost(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	var req types.UpdatePostReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	result, err := postService.UpdatePost(ctx, id, userID, req)
	if err != nil {
		handlePostError(c, err)
		return
	}
	response.JSON(c, result)
}

// DeletePost 删除帖子
func DeletePost(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	if err := postService.DeletePost(ctx, id, userID); err != nil {
		handlePostError(c, err)
		return
	}
	response.OK(c)
}

// SetPostStatus 设置帖子置顶/精华状态（管理员/版主）
func SetPostStatus(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")

	var req types.UpdatePostStatusReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	result, err := postService.SetPostStatus(ctx, id, req)
	if err != nil {
		handlePostError(c, err)
		return
	}
	response.JSON(c, result)
}

// LikePost 点赞帖子
func LikePost(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	likeCount, alreadyLiked, err := postService.LikePost(ctx, id, userID)
	if err != nil {
		handlePostError(c, err)
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

// UnlikePost 取消点赞
func UnlikePost(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	likeCount, err := postService.UnlikePost(ctx, id, userID)
	if err != nil {
		handlePostError(c, err)
		return
	}
	response.JSON(c, map[string]interface{}{
		"ok":        true,
		"liked":     false,
		"likeCount": likeCount,
	})
}

// PopularTags 热门标签
func PopularTags(ctx context.Context, c *app.RequestContext) {
	items, err := postService.PopularTags(ctx)
	if err != nil {
		log.Printf("[PopularTags] 查询热门标签失败: %v", err)
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, map[string]interface{}{"items": items})
}

// SuggestTags AI 标签推荐
func SuggestTags(ctx context.Context, c *app.RequestContext) {
	var req types.SuggestTagsReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	tags, err := postService.SuggestTags(ctx, req.Title, req.Content)
	if err != nil {
		log.Printf("[SuggestTags] AI 标签推荐失败: %v", err)
		response.Error(c, consts.StatusServiceUnavailable, "AI 标签推荐服务暂时不可用")
		return
	}
	response.JSON(c, map[string]interface{}{"tags": tags})
}
