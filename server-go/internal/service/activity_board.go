package service

import (
	"context"
	"log"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// tileToDTO 格子定义转 DTO，附带面向用户的判定文案
func tileToDTO(t *model.ActivityTile) types.ActivityTileDTO {
	return types.ActivityTileDTO{
		Index:            t.Index,
		Title:            t.Title,
		TaskType:         t.TaskType,
		Target:           t.Target,
		Unit:             t.Unit,
		SpecialRule:      t.SpecialRule,
		SpecialRuleLabel: hellboard.RuleLabels[t.SpecialRule],
	}
}

// teamToDTO 队伍快照转 DTO
func teamToDTO(t *model.ActivityTeam, members []model.ActivityMember, litTiles map[int]string) types.ActivityTeamDTO {
	dto := types.ActivityTeamDTO{
		ID:            t.ID,
		Name:          t.Name,
		Color:         t.Color,
		Emblem:        t.Emblem,
		Members:       make([]types.ActivityMemberDTO, 0, len(members)),
		Position:      t.Position,
		LitTiles:      litTiles,
		Status:        t.Status,
		TileProgress:  t.TileProgress,
		FallbackCount: t.FallbackCount,
		Lap:           t.Lap,
	}
	if dto.LitTiles == nil {
		dto.LitTiles = map[int]string{}
	}
	if t.TimerEndsAt != nil {
		dto.TimerEndsAt = t.TimerEndsAt.Format(time.RFC3339)
	}
	for i := range members {
		m := &members[i]
		dto.Members = append(dto.Members, types.ActivityMemberDTO{
			ID:        m.ID,
			UserID:    m.UserID,
			Name:      memberNameOf(m),
			AvatarURL: avatarOf(&m.User),
			IsCaptain: m.IsCaptain,
			BookCount: m.BookCount,
			WordCount: m.WordCount,
		})
	}
	return dto
}

// GetBoard 棋盘全局快照。前端轮询该接口刷新（PRD 第 12 节实时性：棋盘 10s）。
//
// 读取时顺带结算到期的惩罚计时，避免依赖额外的定时任务：
// 任何一次访问都会把已到期的队伍推进到待掷骰（P1-6 / 验收标准 6）。
func (s *ActivityService) GetBoard(ctx context.Context, userID string) (*types.ActivityBoardDTO, error) {
	now := time.Now()

	if err := s.settleExpiredTimers(ctx, now); err != nil {
		return nil, err
	}

	var tiles []model.ActivityTile
	if err := dal.DB.WithContext(ctx).Order("tile_index asc").Find(&tiles).Error; err != nil {
		return nil, err
	}

	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).Order("created_at asc").Find(&teams).Error; err != nil {
		return nil, err
	}

	var members []model.ActivityMember
	if err := dal.DB.WithContext(ctx).Preload("User").Order("created_at asc").Find(&members).Error; err != nil {
		return nil, err
	}
	membersByTeam := make(map[string][]model.ActivityMember, len(teams))
	for _, m := range members {
		membersByTeam[m.TeamID] = append(membersByTeam[m.TeamID], m)
	}

	// 一次查出全部点亮记录，避免按队伍逐个查询造成 N+1
	var progress []model.ActivityTeamProgress
	if err := dal.DB.WithContext(ctx).Where("lit = ?", true).Find(&progress).Error; err != nil {
		return nil, err
	}
	litByTeam := make(map[string]map[int]string, len(teams))
	for _, p := range progress {
		if litByTeam[p.TeamID] == nil {
			litByTeam[p.TeamID] = map[int]string{}
		}
		if _, exists := litByTeam[p.TeamID][p.TileIndex]; !exists {
			litByTeam[p.TeamID][p.TileIndex] = p.LitReason
		}
	}

	cycleStart, cycleEnd := hellboard.CycleRange(hellboard.CycleYear(now))
	out := &types.ActivityBoardDTO{
		Tiles:             make([]types.ActivityTileDTO, 0, len(tiles)),
		Teams:             make([]types.ActivityTeamDTO, 0, len(teams)),
		Archived:          hellboard.IsArchived(now),
		CycleStarted:      hellboard.IsCycleStarted(now),
		CycleStart:        cycleStart.Format(time.RFC3339),
		CycleEnd:          cycleEnd.Format(time.RFC3339),
		FallbackThreshold: hellboard.FallbackThreshold,
	}
	for i := range tiles {
		out.Tiles = append(out.Tiles, tileToDTO(&tiles[i]))
	}
	for i := range teams {
		t := &teams[i]
		out.Teams = append(out.Teams, teamToDTO(t, membersByTeam[t.ID], litByTeam[t.ID]))
	}

	// 标记当前用户身份，未入组用户只能观战
	me, err := s.memberOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	if me != nil {
		out.MyTeamID = me.TeamID
		out.MyMemberID = me.ID
		out.IsCaptain = me.IsCaptain
	}
	// 报名状态：报名是入队的前提，未入组时前端据此展示报名入口
	en, err := s.enrolledOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	out.Enrolled = en != nil
	// 活动昵称回填「我的」弹窗：已入队以成员记录为准，否则用报名记录
	if me != nil {
		out.MyNickname = me.Nickname
	} else if en != nil {
		out.MyNickname = en.Nickname
	}
	return out, nil
}

// settleExpiredTimers 结算所有到期的惩罚计时：自动点亮第 8 格并解锁掷骰。
// 由读接口顺带触发，无需引入独立定时任务（PRD 第 12 节首版不引入额外基础设施）。
func (s *ActivityService) settleExpiredTimers(ctx context.Context, now time.Time) error {
	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).
		Where("status = ? AND timer_ends_at IS NOT NULL AND timer_ends_at <= ?",
			model.TeamStatusTimerRunning, now).
		Find(&teams).Error; err != nil {
		return err
	}
	for i := range teams {
		team := &teams[i]
		// 单队结算失败仅记录告警并继续，避免一个异常队伍让整个棋盘读接口不可用
		if err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			return s.settleTimerTx(tx, team, now)
		}); err != nil {
			log.Printf("结算队伍 %s 的惩罚计时失败: %v", team.ID, err)
		}
	}
	return nil
}

// settleTimerTx 单个队伍的计时结算，需在事务内调用
func (s *ActivityService) settleTimerTx(tx *gorm.DB, team *model.ActivityTeam, now time.Time) error {
	// 二次确认状态，避免并发下重复结算
	var fresh model.ActivityTeam
	if err := tx.Clauses(lockForUpdate()).First(&fresh, "id = ?", team.ID).Error; err != nil {
		return err
	}
	if fresh.Status != model.TeamStatusTimerRunning || fresh.TimerEndsAt == nil || now.Before(*fresh.TimerEndsAt) {
		return nil
	}

	if err := s.markLitTx(tx, &fresh, hellboard.PenaltyTileIndex, model.LitReasonTimer, now); err != nil {
		return err
	}

	litTiles, err := s.litTilesTx(tx, fresh.ID)
	if err != nil {
		return err
	}
	fresh.Status = model.TeamStatusAwaitingRoll
	fresh.TimerEndsAt = nil
	if len(litTiles) >= hellboard.TileCount {
		fresh.Status = model.TeamStatusCompleted
	}
	if err := tx.Model(&fresh).
		Select("status", "timer_ends_at", "last_lit_at").
		Updates(map[string]any{
			"status":        fresh.Status,
			"timer_ends_at": nil,
			"last_lit_at":   fresh.LastLitAt,
		}).Error; err != nil {
		return err
	}
	return s.addEvent(tx, fresh.ID,
		model.EventTypeTimer,
		"惩罚计时结束，第 8 格自动点亮并解锁掷骰")
}
