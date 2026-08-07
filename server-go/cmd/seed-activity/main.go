package main

import (
	"flag"
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/joho/godotenv"
)

// seed-activity 手动重置活动「无限循环读书地狱」业务数据：
// 清空全部队伍 / 队员 / 打卡 / 时间线等记录，重建默认 10 支空队伍（emblem 留空，徽章先到先得）。
//
// 破坏性命令，仅在活动重新开局时使用。执行方式：
//
//	cd server-go && go run ./cmd/seed-activity --yes
//
// 安全设计：
//   - 不加 --yes 时进入 dry-run：只打印目标数据库与将要清理的表，不执行任何删除。
//   - 启动时打印实际连接的数据库主机 / 库名，方便核对是否连对了环境（历史教训：
//     之前 seed「没生效」大概率是连到了错误的库——.env 里没有 DATABASE_URL 时，
//     命令会回落到 localhost 默认库，而线上服务用的是系统注入的 DATABASE_URL）。
//   - 幂等：可重复执行，每次都会清空并重建到相同终态；服务启动时绝不会调用本函数。
func main() {
	yes := flag.Bool("yes", false, "确认执行：不加该参数只做 dry-run 预览，不删除任何数据")
	flag.Parse()

	// 多路径加载 .env：无论从仓库根目录还是 server-go 目录运行都能读到。
	// godotenv 不会覆盖进程已有的环境变量，线上注入的 DATABASE_URL 仍然优先。
	loadEnvFiles()

	cfg := conf.Load()
	printTargetDatabase(cfg.DatabaseURL)

	// 复用服务端 dal.Init：连接数据库 + 自动迁移 + 棋盘格子定义保持不变
	dal.Init(cfg)

	plan := dal.BuildActivityResetPlan()
	fmt.Printf("\n本次重置将清理 %d 张活动业务表并重建 %d 支队伍：\n", len(plan.Tables), len(plan.TeamNames))
	for _, t := range plan.Tables {
		fmt.Printf("  - 清空 %s\n", t)
	}
	for _, t := range plan.TeamNames {
		fmt.Printf("  - 新建队伍：%s\n", t)
	}

	if !*yes {
		fmt.Println("\n已进入 dry-run，未执行任何删除。确认无误后加 --yes 重新运行。")
		return
	}

	result, err := dal.ResetActivityData()
	if err != nil {
		log.Fatalf("活动数据重置失败: %v", err)
	}
	fmt.Println("\n重置完成：")
	for table, n := range result.RowsCleared {
		if n > 0 {
			fmt.Printf("  - %s 清理 %d 行\n", table, n)
		}
	}
	fmt.Printf("  - 重建队伍 %d 支\n", result.TeamsCreated)
	log.Printf("完成：已清空活动业务数据并重建 %d 支队伍，棋盘与任务文案保持不变", result.TeamsCreated)
}

// loadEnvFiles 从多个候选路径加载 .env，提升「在任何目录跑都生效」的容错。
func loadEnvFiles() {
	candidates := []string{".env", "../.env", "server-go/.env"}
	for _, p := range candidates {
		if err := godotenv.Load(p); err == nil {
			log.Printf("已加载环境文件 %s", p)
			return
		}
	}
	log.Println("未找到 .env（使用进程环境变量与默认值）")
}

// printTargetDatabase 解析 DATABASE_URL 并打印主机与库名（脱敏），核对连接目标。
func printTargetDatabase(databaseURL string) {
	host, db := "unknown", "unknown"
	if u, err := url.Parse(databaseURL); err == nil {
		host = u.Host
		db = strings.TrimPrefix(u.Path, "/")
	}
	fmt.Printf("连接数据库：host=%s db=%s\n", host, db)
}
