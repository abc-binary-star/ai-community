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
		if err := s.checkRollableTx(tx, &team, now); err != nil {
			return err
		}
		value := hellboard.RollDice()
		return s.moveTeamTx(tx, &team, me, value, now, &out)
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// AdvanceTeam 队长手动前进指定格数（1–6 格，替代掷骰）。
//
// 与 RollDice 共用同一套前进逻辑，仅步数由队长指定而非随机生成，
// 供不想用程序摇骰子的队伍使用（同样仅待前进态可用、点亮离开格）。
func (s *ActivityService) AdvanceTeam(ctx context.Context, userID string, steps int) (*types.ActivityRollResultDTO, error) {
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
	if steps < 1 || steps > hellboard.DiceFaces {
		return nil, ErrActivityInvalidInput
	}

	var out types.ActivityRollResultDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var team model.ActivityTeam
		if err := tx.Clauses(lockForUpdate()).First(&team, "id = ?", me.TeamID).Error; err != nil {
			return err
		}
		if err := s.checkRollableTx(tx, &team, now); err != nil {
			return err
		}
		return s.moveTeamTx(tx, &team, me, steps, now, &out)
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// checkRollableTx 掷骰 / 手动前进的前置校验（需在事务内且队伍行已加锁）：
// 计时到期先结算，随后校验状态为待前进。
func (s *ActivityService) checkRollableTx(tx *gorm.DB, team *model.ActivityTeam, now time.Time) error {
	// 计时到期先结算，让「到期后立刻前进」这条路径可用
	if hellboard.TimerExpired(team, now) {
		if err := s.settleTimerTx(tx, team, now); err != nil {
			return err
		}
		if err := tx.First(team, "id = ?", team.ID).Error; err != nil {
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
	return nil
}

// moveTeamTx 队伍前进公共逻辑：点亮离开格 → 前进 steps 步 → 处理计时 / 轮次 / 状态。
// 掷骰（RollDice）与手动前进（AdvanceTeam）共用，保证两条路径状态机一致。
// 前置条件：队伍已锁定且通过 checkRollableTx 校验。
func (s *ActivityService) moveTeamTx(tx *gorm.DB, team *model.ActivityTeam, me *model.ActivityMember, steps int, now time.Time, out *types.ActivityRollResultDTO) error {
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
	reason := hellboard.LitReasonFor(team, leavingTile)
	if err := s.markLitTx(tx, team, team.Position, reason, now); err != nil {
		return err
	}
	if !alreadyLit {
		out.LitTile = team.Position
		out.LitReason = reason
	}

	from := team.Position
	to := hellboard.Advance(from, steps)
	landedPenalty := to == hellboard.PenaltyTileIndex

	team.Position = to
	// 离开格子后任务进度清零；保底计数为全队全局累计，跨格不清零（P1-5 全局保底）
	team.TileProgress = 0
	if hellboard.CrossesStart(from, steps) {
		team.Lap++
	}
	if landedPenalty {
		// 前进落入第 8 格的那一刻启动 72 小时计时（P1-6）
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
		Value:    steps,
		FromTile: from,
		ToTile:   to,
		Lap:      team.Lap,
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
		fmt.Sprintf("队伍前进 %d 格，棋子从第 %d 格到第 %d 格", steps, from, to)); err != nil {
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
	out.Value = steps
	out.FromTile = from
	out.ToTile = to
	out.TimerStarted = landedPenalty
	out.Team = teamToDTO(team, members, litAfter)
	return nil
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
