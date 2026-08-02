package handler

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/response"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/service"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

var authService = &service.AuthService{}

// Register 注册
func Register(ctx context.Context, c *app.RequestContext) {
	var req types.RegisterReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	resp, err := authService.Register(ctx, req)
	if err != nil {
		if ae, ok := err.(*service.AuthError); ok {
			response.Error(c, ae.Code, ae.Msg)
			return
		}
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.Created(c, resp)
}

// Login 登录
func Login(ctx context.Context, c *app.RequestContext) {
	var req types.LoginReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	resp, err := authService.Login(ctx, req)
	if err != nil {
		if ae, ok := err.(*service.AuthError); ok {
			response.Error(c, ae.Code, ae.Msg)
			return
		}
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, resp)
}

// RefreshToken 刷新 token
func RefreshToken(ctx context.Context, c *app.RequestContext) {
	var req types.RefreshReq
	if err := c.BindAndValidate(&req); err != nil {
		response.BadRequest(c, "输入不合法")
		return
	}

	token, refreshToken, err := authService.RefreshToken(ctx, req.RefreshToken)
	if err != nil {
		if ae, ok := err.(*service.AuthError); ok {
			response.Error(c, ae.Code, ae.Msg)
			return
		}
		response.Error(c, consts.StatusInternalServerError, "服务器内部错误")
		return
	}
	response.JSON(c, map[string]string{
		"token":        token,
		"refreshToken": refreshToken,
	})
}

// Me 获取当前登录用户
func Me(ctx context.Context, c *app.RequestContext) {
	userID, _ := c.Get("userId")
	uid, _ := userID.(string)

	user, err := authService.GetCurrentUser(ctx, uid)
	if err != nil {
		response.NotFound(c, "用户不存在")
		return
	}
	response.JSON(c, map[string]interface{}{
		"user": mapper.UserToDTO(user),
	})
}
