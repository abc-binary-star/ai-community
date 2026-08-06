package dal

import (
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
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
