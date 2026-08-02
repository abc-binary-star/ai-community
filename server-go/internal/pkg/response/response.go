package response

import (
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

// JSON 成功响应
func JSON(c *app.RequestContext, data interface{}) {
	c.JSON(consts.StatusOK, data)
}

// Created 201 响应
func Created(c *app.RequestContext, data interface{}) {
	c.JSON(consts.StatusCreated, data)
}

// Error 错误响应
func Error(c *app.RequestContext, status int, msg string) {
	c.JSON(status, map[string]string{"error": msg})
}

// BadRequest 400
func BadRequest(c *app.RequestContext, msg string) {
	Error(c, consts.StatusBadRequest, msg)
}

// Unauthorized 401
func Unauthorized(c *app.RequestContext, msg string) {
	Error(c, consts.StatusUnauthorized, msg)
}

// Forbidden 403
func Forbidden(c *app.RequestContext, msg string) {
	Error(c, consts.StatusForbidden, msg)
}

// NotFound 404
func NotFound(c *app.RequestContext, msg string) {
	Error(c, consts.StatusNotFound, msg)
}

// Conflict 409
func Conflict(c *app.RequestContext, msg string) {
	Error(c, consts.StatusConflict, msg)
}

// OK 简单 { ok: true } 响应
func OK(c *app.RequestContext) {
	c.JSON(consts.StatusOK, map[string]bool{"ok": true})
}
