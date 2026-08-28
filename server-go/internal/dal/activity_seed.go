package dal

import (
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// seedActivityTiles 写入百格地图定义（新玩法「九月彩虹桥 · 读书大富翁」）。
//
// 旧玩法为 20 格任务棋盘，本轮改造切换到 100 格：表内行数不足 100 或
// 官方百格表迁移标记缺失时整体重建（旧数据作废）；已按官方表迁移过的库
// 保留运营后续调整过的文案与效果参数。
func seedActivityTiles() {
	var count int64
	if err := DB.Model(&model.ActivityTile{}).Count(&count).Error; err != nil {
		log.Printf("Warning: 检查活动棋盘格子失败: %v", err)
		return
	}

	// 官方百格表迁移标记：一次写入后不再整表重建，尊重运营调整
	var st model.ActivityMigrationState
	markApplied := DB.Where("migration_key = ?", officialTilesKey).First(&st).Error == nil

	if count >= int64(len(hellboard.Tiles)) && markApplied {
		return // 已是官方 100 格且迁移完毕，跳过
	}

	tiles := make([]model.ActivityTile, 0, len(hellboard.Tiles))
	for _, d := range hellboard.Tiles {
		tiles = append(tiles, model.ActivityTile{
			Index:  d.Index,
			Kind:   string(d.Kind),
			Title:  d.Title,
			Effect: string(d.Effect),
			Param:  d.Param,
			Twin:   d.Twin,
		})
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		// 旧玩法/暂设版本数据整体作废，重建为官方百格表
		if err := tx.Where("1 = 1").Delete(&model.ActivityTile{}).Error; err != nil {
			return err
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&tiles).Error; err != nil {
			return err
		}
		return tx.Create(&model.ActivityMigrationState{MigrationKey: officialTilesKey}).Error
	})
	if err != nil {
		log.Printf("Warning: 初始化百格地图失败: %v", err)
		return
	}
	log.Printf("官方百格地图初始化完成，共 %d 格", len(tiles))
}

// officialTilesKey 官方《100格棋盘格子表》迁移标记
const officialTilesKey = "hell-board-sept-official-tiles"

// defaultActivityTeams 默认 6 支队伍，对应六色纯色：红橙黄绿蓝紫。
// 仅在队伍表为空时创建（服务首次启动/生产初始化），之后运营可通过后台增删改。
// emblem 为彩虹徽章 key（前端渲染彩虹徽记）。
var defaultActivityTeams = []model.ActivityTeam{
	{Name: "赤虹一队", Color: "#ef4444", Emblem: "rainbow-crest-1"},
	{Name: "橙光二队", Color: "#f97316", Emblem: "rainbow-crest-2"},
	{Name: "金辉三队", Color: "#eab308", Emblem: "rainbow-crest-3"},
	{Name: "青叶四队", Color: "#22c55e", Emblem: "rainbow-crest-4"},
	{Name: "湛蓝五队", Color: "#3b82f6", Emblem: "rainbow-crest-5"},
	{Name: "紫霞六队", Color: "#8b5cf6", Emblem: "rainbow-crest-6"},
}

// seedActivityTeams 队伍表为空时创建默认队伍，幂等：已有队伍则跳过，
// 避免服务重启覆盖运营调整。
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

// septemberResetKey 九月开局重置迁移标记：把旧玩法遗留的队伍状态清零。
const septemberResetKey = "hell-board-sept-rainbow-team-reset"

// migrateSeptemberTeamReset 九月彩虹桥开局一次性重置：
// 旧玩法（八月读书地狱）遗留的 position/status 等字段清零，
// 保证所有队伍从起点（0 格 / 集彩虹中）开始新赛程。仅执行一次。
func migrateSeptemberTeamReset() {
	var st model.ActivityMigrationState
	err := DB.Where("migration_key = ?", septemberResetKey).First(&st).Error
	if err == nil {
		return // 已执行过
	}
	if !isNotFound(err) {
		log.Printf("Warning: 检查九月开局重置标记失败: %v", err)
		return
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		// 一次性重置全部队伍；显式 Where 避免触发 GORM 全表更新保护（ErrMissingWhereClause）
		if err := tx.Model(&model.ActivityTeam{}).Where("1 = 1").Updates(map[string]any{
			"position":       0,
			"status":         model.TeamStatusCollecting,
			"points":         0,
			"universal_dice": 0,
			"roll_chances":   0,
			"rainbow_count":  0,
			"week_min_delta": 0,
			"color_blocks":   "{}",
			"buffs":          "[]",
			"champion_at":    nil,
		}).Error; err != nil {
			return err
		}
		return tx.Create(&model.ActivityMigrationState{
			MigrationKey: septemberResetKey,
		}).Error
	})
	if err != nil {
		log.Printf("Warning: 九月开局重置失败（本次跳过，重启会重试）: %v", err)
		return
	}
	log.Printf("九月开局重置完成：全部队伍回到起点")
}

func isNotFound(err error) bool {
	return err == gorm.ErrRecordNotFound
}
