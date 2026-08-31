package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 弈骰流程：群里读完打卡、投出骰子后，由本队队长在这里录入点数。
// 服务端权威：按 100 格地图规则移动队伍、结算格子效果（前进/后退/互换/特殊
// 功能/buff）、累计积分并自动兑换万能骰子、判定冲线。前端只负责表现与展示。

// RecordRoll 录入一次普通掷骰（消耗 1 次掷骰机会）。
func (s *ActivityService) RecordRoll(ctx context.Context, userID string, req types.ActivityRollReq) (*types.ActivityRollResultDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !me.IsCaptain {
		return nil, ErrActivityNotCaptain
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return nil, err
	}

	tiles := s.tileMap(ctx)
	var out *types.ActivityRollResultDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		team, err := s.getTeamTxLocked(tx, me.TeamID)
		if err != nil {
			return err
		}
		if team.Status == model.TeamStatusCompleted {
			return ErrActivityCompleted
		}
		st, err := hellboard.TeamStateFromModel(team)
		if err != nil {
			return err
		}
		if !st.ConsumeRollChance() {
			return ErrActivityNotRollable
		}
		outcome := st.Roll(req.Value, false, tiles, hellboard.RandStep, hellboard.RandLucky)
		if err := s.persistRollTx(ctx, tx, team, me, st, outcome, false); err != nil {
			return err
		}
		out, err = s.rollResultDTO(ctx, team, me, outcome)
		return err
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// UseUniversalDice 使用 1 枚万能骰子（无视当前格子效果，不消耗掷骰机会）。
func (s *ActivityService) UseUniversalDice(ctx context.Context, userID string, req types.ActivityRollReq) (*types.ActivityRollResultDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !me.IsCaptain {
		return nil, ErrActivityNotCaptain
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return nil, err
	}

	tiles := s.tileMap(ctx)
	var out *types.ActivityRollResultDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		team, err := s.getTeamTxLocked(tx, me.TeamID)
		if err != nil {
			return err
		}
		if team.Status == model.TeamStatusCompleted {
			return ErrActivityCompleted
		}
		st, err := hellboard.TeamStateFromModel(team)
		if err != nil {
			return err
		}
		outcome := st.UseUniversalDice(req.Value, tiles, hellboard.RandStep, hellboard.RandLucky)
		if len(outcome.Results) > 0 && contains(outcome.Results, "道具封印") {
			if err := s.applyStateTx(tx, team, st); err != nil {
				return err
			}
			s.addEvent(tx, team.ID, model.EventTypeTile, "道具封印：本次使用万能骰子被禁止")
			out, err = s.rollResultDTO(ctx, team, me, outcome)
			return err
		}
		if err := s.persistRollTx(ctx, tx, team, me, st, outcome, true); err != nil {
			return err
		}
		out, err = s.rollResultDTO(ctx, team, me, outcome)
		return err
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// CompleteCycle 声明本轮彩虹集齐：群里 7 色色块集齐后由队长在 App 内登记，
// 获得 1 次掷骰机会（受彩虹加成/卡顿 buff 修正）。
func (s *ActivityService) CompleteCycle(ctx context.Context, userID string) (*types.ActivityTeamDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !me.IsCaptain {
		return nil, ErrActivityNotCaptain
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return nil, err
	}

	var teamDTO *types.ActivityTeamDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		team, err := s.getTeamTxLocked(tx, me.TeamID)
		if err != nil {
			return err
		}
		if team.Status == model.TeamStatusCompleted {
			return ErrActivityCompleted
		}
		st, err := hellboard.TeamStateFromModel(team)
		if err != nil {
			return err
		}
		chances := st.GrantCycle()
		if err := s.applyStateTx(tx, team, st); err != nil {
			return err
		}
		_ = s.addEvent(tx, team.ID, model.EventTypeCycle,
			fmt.Sprintf("本轮彩虹集齐，获得 %d 次掷骰机会（累计 %d）", max(chances, 0), st.RollChances))
		members, err := s.loadTeamMembersTx(tx, team.ID)
		if err != nil {
			return err
		}
		team.Members = members
		dto := s.teamToDTO(team)
		teamDTO = &dto
		return nil
	})
	if err != nil {
		return nil, err
	}
	return teamDTO, nil
}

// --- 内部辅助 ---

// tileMap 读取百格定义；返回按格号取定义的闭包（供引擎结算用）
func (s *ActivityService) tileMap(ctx context.Context) func(int) *hellboard.TileDef {
	var tiles []model.ActivityTile
	if err := dal.DB.WithContext(ctx).Order("tile_index asc").Find(&tiles).Error; err != nil || len(tiles) == 0 {
		// 兜底用内置表
		m := hellboard.TilesByIndex()
		return func(i int) *hellboard.TileDef { return m[i] }
	}
	m := make(map[int]*hellboard.TileDef, len(tiles))
	for i := range tiles {
		t := tiles[i]
		m[t.Index] = &hellboard.TileDef{
			Index:  t.Index,
			Kind:   hellboard.TileKind(t.Kind),
			Title:  t.Title,
			Effect: hellboard.EffectKey(t.Effect),
			Param:  t.Param,
			Twin:   t.Twin,
		}
	}
	return func(i int) *hellboard.TileDef { return m[i] }
}

// getTeamTxLocked 事务内读取队伍并加行级锁
func (s *ActivityService) getTeamTxLocked(tx *gorm.DB, teamID string) (*model.ActivityTeam, error) {
	var t model.ActivityTeam
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&t, "id = ?", teamID).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityTeamNotFound
		}
		return nil, err
	}
	return &t, nil
}

// applyStateTx 把引擎状态写回队伍模型并落库；状态随冲线翻转
func (s *ActivityService) applyStateTx(tx *gorm.DB, team *model.ActivityTeam, st hellboard.TeamGameState) error {
	if err := hellboard.ApplyTeamState(team, st); err != nil {
		return err
	}
	team.Status = hellboard.DerivedStatus(st)
	return tx.Model(team).Select(
		"position", "points", "universal_dice", "roll_chances", "rainbow_count",
		"week_min_delta", "color_blocks", "buffs", "status", "champion_at",
	).Updates(team).Error
}

// persistRollTx 落库一次掷骰/万能骰子结算（含事件、冲线）
func (s *ActivityService) persistRollTx(ctx context.Context, tx *gorm.DB, team *model.ActivityTeam, me *model.ActivityMember, st hellboard.TeamGameState, outcome *hellboard.RollOutcome, isUniversal bool) error {
	if err := s.applyStateTx(tx, team, st); err != nil {
		return err
	}

	rollType := model.EventTypeRoll
	rollDesc := fmt.Sprintf("掷骰：%d 点，%d → %d 格", outcome.DiceValue, outcome.From, outcome.To)
	if isUniversal {
		rollType = model.EventTypeDice
		rollDesc = fmt.Sprintf("万能骰子：%d 点，%d → %d 格（无视格子效果）", outcome.DiceValue, outcome.From, outcome.To)
	}
	_ = s.addEvent(tx, team.ID, rollType, rollDesc)
	for _, r := range outcome.Results {
		if r == "" {
			continue
		}
		_ = s.addEvent(tx, team.ID, model.EventTypeTile, r)
	}
	if outcome.Points != 0 {
		_ = s.addEvent(tx, team.ID, model.EventTypeRoll, fmt.Sprintf("团队积分 +%d（当前 %d）", outcome.Points, st.Points))
	}
	if outcome.DiceExchanged > 0 {
		_ = s.addEvent(tx, team.ID, model.EventTypeDice, fmt.Sprintf("积分满额自动兑换万能骰子 +%d（持有 %d）", outcome.DiceExchanged, st.UniversalDice))
	}

	// 骰子记录留痕；同时保存真实落点和权威结算结果，供全局大事件准确播报。
	landedTile := 0
	if outcome.Landed != nil {
		landedTile = outcome.Landed.Index
	}
	if err := tx.Create(&model.ActivityDiceRoll{
		TeamID:        team.ID,
		RollerID:      me.ID,
		Value:         outcome.DiceValue,
		FromTile:      outcome.From,
		ToTile:        outcome.To,
		LandedTile:    landedTile,
		ResultSummary: strings.Join(outcome.Results, "；"),
		Lap:           1,
	}).Error; err != nil {
		return err
	}

	// 冲线：首位到达 100 格成为冠军
	if outcome.Won && team.ChampionAt == nil {
		now := time.Now()
		team.Status = model.TeamStatusCompleted
		team.ChampionAt = &now
		if err := tx.Model(team).Updates(map[string]any{"status": model.TeamStatusCompleted, "champion_at": now}).Error; err != nil {
			return err
		}
		_ = s.addEvent(tx, team.ID, model.EventTypeWin, "🎉 冲线获胜：率先走完 100 格，成为《九月彩虹桥》总冠军！")
	}
	return nil
}

// rollResultDTO 结算结果转 DTO
func (s *ActivityService) rollResultDTO(ctx context.Context, team *model.ActivityTeam, me *model.ActivityMember, outcome *hellboard.RollOutcome) (*types.ActivityRollResultDTO, error) {
	members, err := s.loadTeamMembers(ctx, team.ID)
	if err != nil {
		return nil, err
	}
	team.Members = members
	teamDTO := s.teamToDTO(team)
	return &types.ActivityRollResultDTO{
		Value:         outcome.DiceValue,
		FromTile:      outcome.From,
		ToTile:        outcome.To,
		Moved:         outcome.Moved,
		Points:        outcome.Points,
		DiceExchanged: outcome.DiceExchanged,
		Results:       outcome.Results,
		Effects:       outcome.Effects,
		Won:           outcome.Won,
		Team:          teamDTO,
	}, nil
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
