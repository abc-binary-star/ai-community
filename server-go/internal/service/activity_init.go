package service

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// InitializeTeam 队长初始化队伍进度（活动已开始后的补录）。
//
// 活动开跑后很多队伍在线下已打卡、移动过格子，但系统内仍是初始状态。
// 本接口让队长一次性把真实进度录入：起始格（仅留痕）、已点亮格列表、当前格。
// 可重复执行（幂等覆盖）：每次执行都把队伍状态对齐到本次声明的进度，
// 已点亮过的格保持原有「点亮方式」不覆盖。
func (s *ActivityService) InitializeTeam(ctx context.Context, userID string, req types.ActivityTeamInitReq) (*types.ActivityTeamDTO, error) {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return nil, err
	}
	cap, err := s.requireCaptain(ctx, userID)
	if err != nil {
		return nil, err
	}

	// 已点亮格去重并校验范围
	litSet := make(map[int]bool, len(req.LitTiles))
	for _, t := range req.LitTiles {
		if t < 1 || t > hellboard.TileCount {
			return nil, ErrActivityInvalidInput
		}
		litSet[t] = true
	}
	// 当前格是「正在做任务」的格，不能同时是已点亮格
	if litSet[req.CurrentTile] {
		return nil, ErrActivityInvalidInput
	}
	// 惩罚格无阅读任务，只能由掷骰落入并计时，不能作为当前格
	curTile, err := s.getTile(ctx, req.CurrentTile)
	if err != nil {
		return nil, err
	}
	if curTile.TaskType == model.TaskTypeTimedPenalty {
		return nil, ErrActivityInvalidInput
	}

	litOrder := make([]int, 0, len(litSet))
	for t := range litSet {
		litOrder = append(litOrder, t)
	}
	sort.Ints(litOrder)

	var out types.ActivityTeamDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var team model.ActivityTeam
		if err := tx.Clauses(lockForUpdate()).First(&team, "id = ?", cap.TeamID).Error; err != nil {
			return err
		}

		// 对齐到声明的真实进度：当前位置 + 重置当前格任务与计时
		team.Position = req.CurrentTile
		team.TileProgress = 0
		team.FallbackCount = 0
		team.TimerEndsAt = nil
		team.Status = model.TeamStatusInProgress

		// 点亮声明的已打卡格子（幂等：已点亮格保留原有点亮方式）
		for _, idx := range litOrder {
			if err := s.markLitTx(tx, &team, idx, model.LitReasonInitial, now); err != nil {
				return err
			}
		}

		litTiles, err := s.litTilesTx(tx, team.ID)
		if err != nil {
			return err
		}
		// 当前格的任务进度从 0 重新积累；20 格全部点亮即完成
		tile, err := s.getTileTx(tx, team.Position)
		if err != nil {
			return err
		}
		team.Status = hellboard.DeriveStatus(&team, tile, len(litTiles))

		if err := tx.Model(&model.ActivityTeam{}).Where("id = ?", team.ID).
			Updates(map[string]any{
				"position":       team.Position,
				"tile_progress":  team.TileProgress,
				"fallback_count": team.FallbackCount,
				"status":         team.Status,
				"timer_ends_at":  team.TimerEndsAt,
				"last_lit_at":    team.LastLitAt,
			}).Error; err != nil {
			return err
		}

		// 时间线留痕，供后续核对
		litDesc := "无"
		if len(litOrder) > 0 {
			litDesc = fmt.Sprintf("%v", litOrder)
		}
		if err := s.addEvent(tx, team.ID, model.EventTypeManual,
			fmt.Sprintf("队长初始化进度：起始第 %d 格，已点亮 %s，当前第 %d 格", req.StartTile, litDesc, req.CurrentTile)); err != nil {
			return err
		}

		members, err := s.teamMembersTx(tx, team.ID)
		if err != nil {
			return err
		}
		out = teamToDTO(&team, members, litTiles)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}
