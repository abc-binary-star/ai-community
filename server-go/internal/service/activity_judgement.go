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

// 特殊判定会话不单独建表：以「当前格 + 当前判定轮次」下的判定掷骰记录为状态载体。
// 轮次 = 该队在该格已完成的判定次数 + 1，判定失败后轮次递增，重新全员掷骰（P0-3）。

// judgementRound 计算当前判定轮次。
// 取该队在该格已有判定掷骰的最大轮次；若该轮已全员掷完则进入下一轮。
func (s *ActivityService) judgementRound(tx *gorm.DB, teamID string, tileIndex, lap, memberCount int) (int, error) {
	var rolls []model.ActivityDiceRoll
	if err := tx.Where("team_id = ? AND is_judgement = ? AND from_tile = ?", teamID, true, tileIndex).
		Order("judgement_round asc").Find(&rolls).Error; err != nil {
		return 0, err
	}
	if len(rolls) == 0 {
		return 1, nil
	}
	maxRound := 1
	countInMax := 0
	for _, r := range rolls {
		if r.JudgementRound > maxRound {
			maxRound = r.JudgementRound
			countInMax = 0
		}
		if r.JudgementRound == maxRound {
			countInMax++
		}
	}
	if countInMax >= memberCount {
		return maxRound + 1, nil
	}
	return maxRound, nil
}

// GetJudgement 读取当前判定会话状态，供页面展示各成员掷骰进度（PRD 10.3）
func (s *ActivityService) GetJudgement(ctx context.Context, userID string) (*types.ActivityJudgementDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	var team model.ActivityTeam
	if err := dal.DB.WithContext(ctx).First(&team, "id = ?", me.TeamID).Error; err != nil {
		return nil, err
	}
	tile, err := s.getTile(ctx, team.Position)
	if err != nil {
		return nil, err
	}
	if tile.SpecialRule == "" {
		return nil, nil
	}

	members, err := s.teamMembersTx(dal.DB.WithContext(ctx), team.ID)
	if err != nil {
		return nil, err
	}
	round, err := s.judgementRound(dal.DB.WithContext(ctx), team.ID, team.Position, team.Lap, len(members))
	if err != nil {
		return nil, err
	}

	var rolls []model.ActivityDiceRoll
	if err := dal.DB.WithContext(ctx).
		Where("team_id = ? AND is_judgement = ? AND from_tile = ? AND judgement_round = ?",
			team.ID, true, team.Position, round).
		Find(&rolls).Error; err != nil {
		return nil, err
	}

	out := &types.ActivityJudgementDTO{
		TileIndex: tile.Index,
		Rule:      tile.SpecialRule,
		RuleLabel: hellboard.RuleLabels[tile.SpecialRule],
		Round:     round,
		Rolls:     make(map[string]int, len(rolls)),
	}
	values := make([]int, 0, len(rolls))
	for _, r := range rolls {
		out.Rolls[r.RollerID] = r.Value
		values = append(values, r.Value)
	}
	if passed, complete := hellboard.EvaluateJudgement(tile.SpecialRule, values, len(members)); complete {
		if passed {
			out.Result = "passed"
		} else {
			out.Result = "failed"
		}
	}
	return out, nil
}

// RollJudgement 成员参与特殊判定掷骰。
//
// 全部在册成员各掷一次，全部满足条件才通过（P0-2）。
// 最后一名成员掷完时立即结算，避免额外的确认步骤被漏掉导致状态卡死。
func (s *ActivityService) RollJudgement(ctx context.Context, userID string) (*types.ActivityJudgementDTO, error) {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return nil, err
	}
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}

	var out *types.ActivityJudgementDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var team model.ActivityTeam
		if err := tx.Clauses(lockForUpdate()).First(&team, "id = ?", me.TeamID).Error; err != nil {
			return err
		}
		if team.Status != model.TeamStatusAwaitingJudgement {
			return ErrActivityNoJudgement
		}
		tile, err := s.getTileTx(tx, team.Position)
		if err != nil {
			return err
		}
		if tile.SpecialRule == "" {
			return ErrActivityNoJudgement
		}

		members, err := s.teamMembersTx(tx, team.ID)
		if err != nil {
			return err
		}
		round, err := s.judgementRound(tx, team.ID, team.Position, team.Lap, len(members))
		if err != nil {
			return err
		}

		// 同一轮内每人只能掷一次
		var existing int64
		if err := tx.Model(&model.ActivityDiceRoll{}).
			Where("team_id = ? AND is_judgement = ? AND from_tile = ? AND judgement_round = ? AND roller_id = ?",
				team.ID, true, team.Position, round, me.ID).
			Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrActivityAlreadyRolled
		}

		value := hellboard.RollDice()
		if err := tx.Create(&model.ActivityDiceRoll{
			TeamID:         team.ID,
			RollerID:       me.ID,
			Value:          value,
			FromTile:       team.Position,
			ToTile:         team.Position,
			IsJudgement:    true,
			JudgementRound: round,
		}).Error; err != nil {
			return err
		}

		var rolls []model.ActivityDiceRoll
		if err := tx.Where("team_id = ? AND is_judgement = ? AND from_tile = ? AND judgement_round = ?",
			team.ID, true, team.Position, round).Find(&rolls).Error; err != nil {
			return err
		}
		values := make([]int, 0, len(rolls))
		session := &types.ActivityJudgementDTO{
			TileIndex: tile.Index,
			Rule:      tile.SpecialRule,
			RuleLabel: hellboard.RuleLabels[tile.SpecialRule],
			Round:     round,
			Rolls:     make(map[string]int, len(rolls)),
		}
		for _, r := range rolls {
			session.Rolls[r.RollerID] = r.Value
			values = append(values, r.Value)
		}

		passed, complete := hellboard.EvaluateJudgement(tile.SpecialRule, values, len(members))
		if complete {
			if passed {
				session.Result = "passed"
				// 判定通过后再由队长掷骰前进
				if err := tx.Model(&model.ActivityTeam{}).Where("id = ?", team.ID).
					Update("status", model.TeamStatusAwaitingRoll).Error; err != nil {
					return err
				}
				if err := s.addEvent(tx, team.ID, model.EventTypeJudgement,
					fmt.Sprintf("第 %d 格特殊判定通过：%s", tile.Index, hellboard.RuleLabels[tile.SpecialRule])); err != nil {
					return err
				}
			} else {
				session.Result = "failed"
				// 判定失败：任务进度清零重做，保底计数不清零（P0-3 / PRD 7.3）
				if err := tx.Model(&model.ActivityTeam{}).Where("id = ?", team.ID).
					Updates(map[string]any{
						"status":        model.TeamStatusInProgress,
						"tile_progress": 0,
					}).Error; err != nil {
					return err
				}
				if err := s.addEvent(tx, team.ID, model.EventTypeJudgement,
					fmt.Sprintf("第 %d 格特殊判定失败，任务进度清零重做（保底计数保留）", tile.Index)); err != nil {
					return err
				}
			}
		}
		out = session
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
