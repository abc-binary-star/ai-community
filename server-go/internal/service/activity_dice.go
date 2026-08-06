package service

import (
	"context"
	"fmt"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// RollDice 队长掷骰前进（P0-1 队伍级掷骰）。
//
// 全流程在一个事务内完成，队伍行加排他锁：
// 同队伍同时刻仅允许一次进行中的掷骰（PRD 第 12 节幂等与并发保护）。
func (s *ActivityService) RollDice(ctx context.Context, userID string) (*types.ActivityRollResultDTO, error) {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return nil, err
	}
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !me.IsCaptain {
		return nil, ErrActivityNotCaptain
	}

	var out types.ActivityRollResultDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var team model.ActivityTeam
		if err := tx.Clauses(lockForUpdate()).First(&team, "id = ?", me.TeamID).Error; err != nil {
			return err
		}

		// 计时到期先结算，让「到期后立刻掷骰」这条路径可用
		if hellboard.TimerExpired(&team, now) {
			if err := s.settleTimerTx(tx, &team, now); err != nil {
				return err
			}
			if err := tx.First(&team, "id = ?", team.ID).Error; err != nil {
				return err
			}
		}
		if team.Status == model.TeamStatusTimerRunning {
			return ErrActivityTimerRunning
		}
		if team.Status == model.TeamStatusCompleted {
			return ErrActivityCompleted
		}
		if team.Status != model.TeamStatusAwaitingRoll {
			return ErrActivityNotRollable
		}

		leavingTile, err := s.getTileTx(tx, team.Position)
		if err != nil {
			return err
		}

		// 离开的格子首次达成才点亮；已点亮格子重复完成不重复计数（P0-4）
		litBefore, err := s.litTilesTx(tx, team.ID)
		if err != nil {
			return err
		}
		_, alreadyLit := litBefore[team.Position]
		reason := hellboard.LitReasonFor(&team, leavingTile)
		if err := s.markLitTx(tx, &team, team.Position, reason, now); err != nil {
			return err
		}
		if !alreadyLit {
			out.LitTile = team.Position
			out.LitReason = reason
		}

		value := hellboard.RollDice()
		from := team.Position
		to := hellboard.Advance(from, value)
		landedPenalty := to == hellboard.PenaltyTileIndex

		team.Position = to
		// 离开格子后任务进度与保底计数一并清零（PRD 7.3）
		team.TileProgress = 0
		team.FallbackCount = 0
		if hellboard.CrossesStart(from, value) {
			team.Lap++
		}
		if landedPenalty {
			// 掷骰落入第 8 格的那一刻启动 72 小时计时（P1-6）
			ends := now.Add(hellboard.PenaltyHours * time.Hour)
			team.Status = model.TeamStatusTimerRunning
			team.TimerEndsAt = &ends
		} else {
			team.Status = model.TeamStatusInProgress
			team.TimerEndsAt = nil
		}

		litAfter, err := s.litTilesTx(tx, team.ID)
		if err != nil {
			return err
		}
		// 20 格全部点亮即完成，棋子保留在终局位置（验收标准 7）
		if len(litAfter) >= hellboard.TileCount {
			team.Status = model.TeamStatusCompleted
			team.TimerEndsAt = nil
		}

		if err := tx.Model(&model.ActivityTeam{}).Where("id = ?", team.ID).
			Updates(map[string]any{
				"position":       team.Position,
				"tile_progress":  team.TileProgress,
				"fallback_count": team.FallbackCount,
				"lap":            team.Lap,
				"status":         team.Status,
				"timer_ends_at":  team.TimerEndsAt,
				"last_lit_at":    team.LastLitAt,
			}).Error; err != nil {
			return err
		}

		if err := tx.Create(&model.ActivityDiceRoll{
			TeamID:   team.ID,
			RollerID: me.ID,
			Value:    value,
			FromTile: from,
			ToTile:   to,
		}).Error; err != nil {
			return err
		}

		// 时间线留痕（PRD 10.3）
		if out.LitTile != 0 {
			label := "任务达成"
			if reason == model.LitReasonFallback {
				label = "保底完成"
			}
			if err := s.addEvent(tx, team.ID, model.EventTypeLit,
				fmt.Sprintf("第 %d 格已点亮（%s）", from, label)); err != nil {
				return err
			}
		}
		if err := s.addEvent(tx, team.ID, model.EventTypeRoll,
			fmt.Sprintf("队长掷出 %d 点，棋子从第 %d 格前进到第 %d 格", value, from, to)); err != nil {
			return err
		}
		if landedPenalty {
			if err := s.addEvent(tx, team.ID, model.EventTypeTimer,
				fmt.Sprintf("落入第 %d 格，启动 %d 小时惩罚计时", hellboard.PenaltyTileIndex, hellboard.PenaltyHours)); err != nil {
				return err
			}
		}
		if team.Status == model.TeamStatusCompleted {
			if err := s.addEvent(tx, team.ID, model.EventTypeLit,
				"20 格全部点亮，本队完成活动并进入抽奖名单"); err != nil {
				return err
			}
		}

		members, err := s.teamMembersTx(tx, team.ID)
		if err != nil {
			return err
		}
		out.Value = value
		out.FromTile = from
		out.ToTile = to
		out.TimerStarted = landedPenalty
		out.Team = teamToDTO(&team, members, litAfter)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// getTileTx 事务内读取格子定义
func (s *ActivityService) getTileTx(tx *gorm.DB, index int) (*model.ActivityTile, error) {
	var t model.ActivityTile
	if err := tx.First(&t, "tile_index = ?", index).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityTileNotFound
		}
		return nil, err
	}
	return &t, nil
}

// teamMembersTx 事务内读取队伍成员
func (s *ActivityService) teamMembersTx(tx *gorm.DB, teamID string) ([]model.ActivityMember, error) {
	var members []model.ActivityMember
	if err := tx.Preload("User").Where("team_id = ?", teamID).
		Order("created_at asc").Find(&members).Error; err != nil {
		return nil, err
	}
	return members, nil
}
