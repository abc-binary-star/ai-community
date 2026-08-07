package dal

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/gorm"
)

// activitySeedKey 活动初始化 seed 的唯一标识，写入 activity_seed_state 作为「已执行」标记。
const activitySeedKey = "hell-board-v1"

// activityResetEnv 启动重置的显式开关环境变量名。
// 必须显式设为 activityResetToken 才会执行清库，未设置时服务启动绝不删除任何数据。
const activityResetEnv = "ACTIVITY_RESET"

// activityResetToken 开关的唯一合法值。要求写全词而非 true/1，
// 避免手滑或复制粘贴 .env 时误开启破坏性操作。
const activityResetToken = "reset-hell-board-v1"

// RunStartupActivityReset 服务启动时的活动初始化 seed。
//
// 安全设计为「默认永不删数据」，必须三道闸门全部放行才会清库：
//
//	闸门 1（显式开关）：环境变量 ACTIVITY_RESET=reset-hell-board-v1。
//	  未设置或值不匹配 → 直接返回，不读不写任何业务表。
//	  这是最重要的一道：正常迭代部署不带该变量，玩到一半更新版本绝不会清库。
//	闸门 2（只执行一次）：activity_seed_state 已有标记 → 跳过。
//	  即使开关忘记从 .env 移除，重复部署也只会在第一次生效。
//	闸门 3（已开局硬拦截）：库里已有打卡 / 掷骰记录 → 判定活动已开局，
//	  拒绝清空并写入标记，同时打出醒目告警。防的是标记表因备份恢复 /
//	  换库 / 误删而丢失，导致进行中的活动被静默清掉。
//
// 三道闸门都放行时，在单个事务内完成「清空业务表 + 重建 10 支空队伍 + 写标记」，
// 中途失败整体回滚，不会出现「清了数据却没写标记」的中间态。
func RunStartupActivityReset() {
	// 闸门 1：没有显式开关，直接返回。绝大多数部署走这条路径。
	token := strings.TrimSpace(os.Getenv(activityResetEnv))
	if token == "" {
		return
	}
	if token != activityResetToken {
		log.Printf("Warning: %s 值不正确，已忽略活动重置（需精确设为 %s）", activityResetEnv, activityResetToken)
		return
	}

	// 闸门 2：已执行过则跳过，开关留在 .env 里也不会重复清库。
	var st model.ActivitySeedState
	err := DB.Where("seed_key = ?", activitySeedKey).First(&st).Error
	if err == nil {
		log.Printf("活动初始化 seed 已于 %s 执行过，跳过（可从环境变量移除 %s）",
			st.AppliedAt.Format("2006-01-02 15:04:05"), activityResetEnv)
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		log.Printf("Warning: 检查活动初始化 seed 状态失败，为安全起见跳过重置: %v", err)
		return
	}

	// 闸门 3：已开局硬拦截。有打卡或掷骰就说明群员已经在玩，绝不清空。
	if started, detail := activityAlreadyStarted(); started {
		log.Printf("⚠️  检测到活动已开局（%s），已拒绝清库以保护进行中的数据。", detail)
		log.Printf("⚠️  如确实要强制重开，请手动执行：cd server-go && go run ./cmd/seed-activity --yes")
		// 写标记：避免每次启动都重复告警，也防止后续误触
		if err := DB.Create(&model.ActivitySeedState{SeedKey: activitySeedKey, AppliedAt: time.Now()}).Error; err != nil {
			log.Printf("Warning: 写入 seed 标记失败: %v", err)
		}
		return
	}

	result := &ActivityResetResult{RowsCleared: make(map[string]int64, len(activityBusinessTables))}
	err = DB.Transaction(func(tx *gorm.DB) error {
		for _, table := range activityBusinessTables {
			res := tx.Exec("DELETE FROM " + table)
			if res.Error != nil {
				return res.Error
			}
			result.RowsCleared[table] = res.RowsAffected
		}
		if err := tx.Create(&defaultActivityTeams).Error; err != nil {
			return err
		}
		result.TeamsCreated = len(defaultActivityTeams)
		// 写标记：seed 只执行一次，重启服务不再清空
		return tx.Create(&model.ActivitySeedState{SeedKey: activitySeedKey, AppliedAt: time.Now()}).Error
	})
	if err != nil {
		log.Printf("Warning: 活动初始化 seed 执行失败（本次启动跳过，重启会重试）: %v", err)
		return
	}
	log.Printf("活动初始化 seed 完成：清空业务表并重建 %d 支默认队伍", result.TeamsCreated)
}

// activityAlreadyStarted 判断活动是否已经真正开局。
//
// 判据是「有没有产生过不可再造的玩家行为」：打卡、掷骰、审核记录。
// 只有队伍 / 队员而没有这些记录，说明还停在报名建队阶段，重置是安全的
// （开局前反复初始化是正常运营操作）。
// 查询失败时一律按「已开局」处理：宁可不清，也不能误删。
func activityAlreadyStarted() (bool, string) {
	checks := []struct {
		table string
		label string
	}{
		{"activity_checkins", "打卡记录"},
		{"activity_dice_rolls", "掷骰记录"},
		{"activity_reviews", "审核记录"},
	}
	for _, c := range checks {
		var n int64
		if err := DB.Table(c.table).Count(&n).Error; err != nil {
			return true, fmt.Sprintf("统计 %s 失败，按已开局保守处理: %v", c.table, err)
		}
		if n > 0 {
			return true, fmt.Sprintf("已有 %d 条%s", n, c.label)
		}
	}
	return false, ""
}

// activityBusinessTables 活动业务表，按依赖顺序清空（先子表后父表）。
// activity_tiles 格子定义不在其中：棋盘任务文案是运营配置，重置时保留。
var activityBusinessTables = []string{
	"activity_checkin_likes",
	"activity_book_votes",
	"activity_reviews",
	"activity_dice_rolls",
	"activity_events",
	"activity_checkin_books",
	"activity_checkins",
	"activity_team_progress",
	"activity_members",
	"activity_enrollments",
	"activity_teams",
}

// ActivityResetPlan 重置前的执行计划，供 seed 命令 dry-run 预览。
type ActivityResetPlan struct {
	Tables    []string
	TeamNames []string
}

// ActivityResetResult 重置执行结果：每表清理行数与重建队伍数。
type ActivityResetResult struct {
	RowsCleared  map[string]int64
	TeamsCreated int
}

// ActivityResetPlan 返回将要清理的表与重建的队伍（不执行任何删除）。
func BuildActivityResetPlan() ActivityResetPlan {
	names := make([]string, 0, len(defaultActivityTeams))
	for i := range defaultActivityTeams {
		names = append(names, defaultActivityTeams[i].Name)
	}
	return ActivityResetPlan{Tables: append([]string(nil), activityBusinessTables...), TeamNames: names}
}

// ResetActivityData 幂等重置活动业务数据：清空全部队伍 / 队员 / 打卡 / 时间线等记录，
// 并按默认 10 支空队伍重建（emblem 全部留空，徽章由队长先到先得抢选）。
//
// 破坏性操作，仅通过 `go run ./cmd/seed-activity --yes` 手动执行：
// 服务启动时绝不会调用本函数，避免误清生产数据。
// 可重复执行：每次都会清空并重建，最终态一致。
func ResetActivityData() (*ActivityResetResult, error) {
	result := &ActivityResetResult{RowsCleared: make(map[string]int64, len(activityBusinessTables))}
	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, table := range activityBusinessTables {
			res := tx.Exec("DELETE FROM " + table)
			if res.Error != nil {
				return res.Error
			}
			result.RowsCleared[table] = res.RowsAffected
		}
		if err := tx.Create(&defaultActivityTeams).Error; err != nil {
			return err
		}
		result.TeamsCreated = len(defaultActivityTeams)
		return nil
	})
	if err != nil {
		return nil, err
	}
	log.Printf("活动数据已重置：清空业务表并重建 %d 支默认队伍", result.TeamsCreated)
	return result, nil
}
