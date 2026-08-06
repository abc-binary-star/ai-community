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

// defaultActivityTeams 默认队伍。仅在队伍表为空时创建（服务首次启动/生产初始化），
// 之后运营可通过后台增删改。emblem 留空：前端按队伍顺序兜底分配徽章形象，
// 队长可在一次机会内自由改选。
var defaultActivityTeams = []model.ActivityTeam{
	{Name: "推理一队", Color: "#38bdf8"},
	{Name: "悬疑二队", Color: "#f472b6"},
	{Name: "科幻三队", Color: "#34d399"},
	{Name: "幻想四队", Color: "#fbbf24"},
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
