package main

import (
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/joho/godotenv"
)

// seed-activity 手动重置活动「无限循环读书地狱」业务数据：
// 清空全部队伍 / 队员 / 打卡 / 时间线等记录，重建默认 10 支队伍（emblem 留空）。
//
// 破坏性命令，仅在活动重新开局时使用，执行方式：
//
//	cd server-go && go run ./cmd/seed-activity
//
// 幂等：可重复执行，每次都会清空并重建到相同终态。
func main() {
	_ = godotenv.Load()
	cfg := conf.Load()

	// 复用服务端 dal.Init：连接数据库 + 自动迁移 + 棋盘格子定义保持不变
	dal.Init(cfg)

	created, err := dal.ResetActivityData()
	if err != nil {
		log.Fatalf("活动数据重置失败: %v", err)
	}
	log.Printf("完成：已清空活动业务数据并重建 %d 支队伍，棋盘与任务文案保持不变", created)
}
