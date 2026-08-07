package dal

import (
	"errors"
	"log"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// seedActivityTiles 写入活动棋盘 20 格定义。
//
// 只在格子不存在时插入：运营通过后台改过的任务文案不会被服务重启覆盖
// （PRD 第 13 节允许运营调整格子任务文案）。
func seedActivityTiles() {
	var count int64
	if err := DB.Model(&model.ActivityTile{}).Count(&count).Error; err != nil {
		log.Printf("Warning: 检查活动棋盘格子失败: %v", err)
		return
	}
	if count >= int64(len(hellboard.Tiles)) {
		return
	}

	tiles := make([]model.ActivityTile, 0, len(hellboard.Tiles))
	for _, d := range hellboard.Tiles {
		tiles = append(tiles, model.ActivityTile{
			Index:       d.Index,
			Title:       d.Title,
			TaskType:    d.TaskType,
			Target:      d.Target,
			Unit:        d.Unit,
			SpecialRule: d.SpecialRule,
		})
	}

	// 主键冲突时跳过，保留已有记录
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&tiles).Error; err != nil {
		log.Printf("Warning: 初始化活动棋盘格子失败: %v", err)
		return
	}
	log.Printf("活动棋盘格子初始化完成，共 %d 格", len(tiles))
}

// migrateDurationTileToMinutes 时长格单位迁移（幂等）：
// 第 19 格「持续看书累计 20 小时」改为内部以分钟存储（1200 分钟），避免零散
// 分钟在累加时被截断（旧 taskDelta 按 分钟/60 整数除法，50 分钟会被记为 0 小时）。
// 仅当目标仍为旧的「20 小时」形态时才执行；运营已改过文案/目标则整体跳过。
// 迁移成功后，将当前停留在第 19 格队伍的已累计进度按小时×60 换算为分钟。
func migrateDurationTileToMinutes() {
	err := DB.Transaction(func(tx *gorm.DB) error {
		// 1) 仅旧形态（unit=小时、target≤20）才迁移，避免覆盖运营调整
		res := tx.Model(&model.ActivityTile{}).
			Where("tile_index = ? AND task_type = ? AND unit = ? AND target <= ?",
				19, model.TaskTypeTotalDuration, "小时", int64(20)).
			Updates(map[string]any{
				"target": int64(1200),
				"unit":   "分钟",
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil // 已是分钟形态或运营改过，跳过进度换算
		}
		// 2) 停留在第 19 格的队伍，历史进度按小时累计，换算为分钟
		return tx.Model(&model.ActivityTeam{}).
			Where("position = ?", 19).
			UpdateColumn("tile_progress", gorm.Expr("tile_progress * 60")).Error
	})
	if err != nil {
		log.Printf("Warning: 时长格分钟迁移失败: %v", err)
		return
	}
	log.Printf("时长格第 19 格已迁移为分钟单位（1200 分钟）")
}

// defaultActivityTeams 默认 10 支队伍。仅在队伍表为空时创建（服务首次启动/生产初始化），
// 之后运营可通过后台增删改。emblem 留空：9 张徽章素材先到先得，队长在管理弹窗内抢选，
// 选满后其余队伍显示「待选徽章」占位。
var defaultActivityTeams = []model.ActivityTeam{
	{Name: "推理一队", Color: "#38bdf8"},
	{Name: "悬疑二队", Color: "#f472b6"},
	{Name: "科幻三队", Color: "#34d399"},
	{Name: "幻想四队", Color: "#fbbf24"},
	{Name: "历史五队", Color: "#a78bfa"},
	{Name: "言情六队", Color: "#fb7185"},
	{Name: "武侠七队", Color: "#f97316"},
	{Name: "都市八队", Color: "#2dd4bf"},
	{Name: "科普九队", Color: "#818cf8"},
	{Name: "文学十队", Color: "#facc15"},
}

// seedActivityTeams 队伍表为空时创建默认队伍，幂等：已有队伍则跳过，
// 避免服务重启覆盖运营调整（PRD 第 13 节）。
func seedActivityTeams() {
	var count int64
	if err := DB.Model(&model.ActivityTeam{}).Count(&count).Error; err != nil {
		log.Printf("Warning: 检查活动队伍失败: %v", err)
		return
	}
	if count > 0 {
		return
	}
	if err := DB.Create(&defaultActivityTeams).Error; err != nil {
		log.Printf("Warning: 初始化活动队伍失败: %v", err)
		return
	}
	log.Printf("活动队伍初始化完成，共 %d 队", len(defaultActivityTeams))
}

// fallbackBackfillMigrationKey 全局保底计数历史回填的迁移唯一标识。
const fallbackBackfillMigrationKey = "hell-board-fallback-global-backfill"

// migrateGlobalFallbackBackfill 一次性回填全局保底计数：
// 把「全局保底计数」功能上线前已终审通过（review_status=approved）的书目数
// 计入各队 fallback_count，使历史通过的书也能参与保底消耗。
//
// 仅执行一次（activity_migration_state 标记防重），之后不会重复覆盖，
// 因此不会影响上线后队伍已发生的保底消耗。这是数据统计回填，不清除任何数据。
func migrateGlobalFallbackBackfill() {
	var st model.ActivityMigrationState
	err := DB.Where("migration_key = ?", fallbackBackfillMigrationKey).First(&st).Error
	if err == nil {
		return // 已执行过
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		log.Printf("Warning: 检查保底回填迁移标记失败: %v", err)
		return
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(`
			UPDATE activity_teams t
			SET fallback_count = sub.cnt
			FROM (
				SELECT team_id, COUNT(*) AS cnt
				FROM activity_checkin_books
				WHERE review_status = ?
				GROUP BY team_id
			) sub
			WHERE t.id = sub.team_id
		`, model.ReviewStatusApproved)
		if res.Error != nil {
			return res.Error
		}
		return tx.Create(&model.ActivityMigrationState{
			MigrationKey: fallbackBackfillMigrationKey,
			AppliedAt:    time.Now(),
		}).Error
	})
	if err != nil {
		log.Printf("Warning: 保底计数历史回填失败（本次跳过，重启会重试）: %v", err)
		return
	}
	log.Printf("全局保底计数已回填：历史终审通过的书目计入各队保底")
}
