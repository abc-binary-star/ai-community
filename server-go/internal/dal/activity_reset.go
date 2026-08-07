package dal

import (
	"log"

	"gorm.io/gorm"
)

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

// ResetActivityData 幂等重置活动业务数据：清空全部队伍 / 队员 / 打卡 / 时间线等记录，
// 并按默认 10 支队伍重建（emblem 全部留空，徽章由队长先到先得抢选）。
//
// 破坏性操作，仅通过 `go run ./cmd/seed-activity` 手动执行：
// 服务启动时绝不会调用本函数，避免误清生产数据。
// 可重复执行：每次都会清空并重建，最终态一致。
func ResetActivityData() (int, error) {
	created := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, table := range activityBusinessTables {
			if err := tx.Exec("DELETE FROM " + table).Error; err != nil {
				return err
			}
		}
		if err := tx.Create(&defaultActivityTeams).Error; err != nil {
			return err
		}
		created = len(defaultActivityTeams)
		return nil
	})
	if err != nil {
		return 0, err
	}
	log.Printf("活动数据已重置：清空业务表并重建 %d 支默认队伍", created)
	return created, nil
}
