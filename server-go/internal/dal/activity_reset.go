package dal

import (
	"errors"
	"log"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/gorm"
)

// activitySeedKey 活动初始化 seed 的唯一标识。
// 服务启动时执行一次：清空全部队伍 / 队员 / 打卡 / 时间线记录，重建默认 10 支空队伍
// （emblem 留空，徽章由队长先到先得抢选）。执行后在 activity_seed_state 写入标记，
// 之后每次重启都会跳过，保证「只执行一次」，不会反复清掉群员已产生的数据。
const activitySeedKey = "hell-board-v1"

// RunStartupActivityReset 服务启动时调用（幂等，只执行一次）：
//   - activity_seed_state 已有对应标记 → 跳过，不打任何业务数据
//   - 无标记 → 清空活动业务表并重建 10 支默认队伍，同一事务内写入标记
//
// 整个流程在单个事务里完成：若中途失败整体回滚，不会出现「清了数据却没写标记」的中间态。
// 服务启动时绝不会误清数据——只有标记缺失的那一次会重置。
func RunStartupActivityReset() {
	var st model.ActivitySeedState
	err := DB.Where("seed_key = ?", activitySeedKey).First(&st).Error
	if err == nil {
		log.Printf("活动初始化 seed 已执行过（%s），跳过本次启动重置", st.AppliedAt.Format("2006-01-02 15:04:05"))
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		log.Printf("Warning: 检查活动初始化 seed 状态失败: %v", err)
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
