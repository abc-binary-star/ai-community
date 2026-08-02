package main

import (
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/jwt"
	"github.com/abc-binary-star/ai-community/server-go/internal/router"
	"github.com/cloudwego/hertz/pkg/app/server"
)

func main() {
	// 加载配置
	cfg := conf.Load()

	// 初始化数据库
	dal.Init(cfg)

	// 初始化 JWT
	jwt.Init(cfg.JWTSecret)

	// 创建 Hertz 服务器
	h := server.Default(server.WithHostPorts(":" + cfg.Port))

	// 注册路由
	router.Register(h, cfg)

	// 启动服务
	log.Printf("🚀 Server running on http://localhost:%s", cfg.Port)
	log.Printf("   CORS allowed: %v", cfg.CORSOrigins)
	h.Spin()
}
