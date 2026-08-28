package service

import (
	"context"
	"sort"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// ctxTime 活动时间源（统一走北京时间），便于未来切换到请求携带时间
func ctxTime(ctx context.Context) time.Time {
	return time.Now()
}

// GetBoard 棋盘全局快照：百格地图 + 全部队伍状态 + 当前用户身份。
// 前端轮询该接口刷新（无独立定时任务）。
func (s *ActivityService) GetBoard(ctx context.Context, userID string) (*types.ActivityBoardDTO, error) {
	// 格子：从数据库读取（运营可调整文案/效果），代码内置表仅作 seed 兜底
	var tiles []model.ActivityTile
	if err := dal.DB.WithContext(ctx).Order("tile_index asc").Find(&tiles).Error; err != nil {
		return nil, err
	}
	// 表为空（首次启动 seed 前）时用内置表兜底
	if len(tiles) == 0 {
		for i := range hellboard.Tiles {
			t := hellboard.Tiles[i]
			tiles = append(tiles, model.ActivityTile{
				Index:  t.Index,
				Kind:   string(t.Kind),
				Title:  t.Title,
				Effect: string(t.Effect),
				Param:  t.Param,
				Twin:   t.Twin,
			})
		}
	}

	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).Order("created_at asc").Find(&teams).Error; err != nil {
		return nil, err
	}
	teamsDTO := make([]types.ActivityTeamDTO, 0, len(teams))
	teamIDToIndex := map[string]int{}
	for i := range teams {
		members, err := s.loadTeamMembers(ctx, teams[i].ID)
		if err != nil {
			return nil, err
		}
		teams[i].Members = members
		teamIDToIndex[teams[i].ID] = i
		teamsDTO = append(teamsDTO, s.teamToDTO(&teams[i]))
	}

	out := &types.ActivityBoardDTO{
		Tiles:    tilesDTO(tiles),
		Teams:    teamsDTO,
		Archived: hellboard.IsArchived(ctxTime(ctx)),
		// 已移除开始时间限制：活动始终处于已开始状态
		CycleStarted:     true,
		RainbowGuarantee: hellboard.WeeklyRainbowGuarantee,
	}
	start, end := hellboard.CycleRange(hellboard.CycleYear(ctxTime(ctx)))
	out.CycleStart = start.Format("2006-01-02 15:04:05")
	out.CycleEnd = end.Format("2006-01-02 15:04:05")

	if userID != "" {
		me, err := s.memberOf(ctx, userID)
		if err != nil {
			return nil, err
		}
		if me != nil {
			out.MyTeamID = me.TeamID
			out.MyMemberID = me.ID
			team := &teams[teamIDToIndex[me.TeamID]]
			out.IsCaptain = me.IsCaptain
			// 队长态以服务端成员标记为准
			for _, m := range team.Members {
				if m.ID == me.ID && m.IsCaptain {
					out.IsCaptain = true
				}
			}
		}
		// 报名状态
		var cnt int64
		if err := dal.DB.WithContext(ctx).Model(&model.ActivityEnrollment{}).Where("user_id = ?", userID).Count(&cnt).Error; err == nil {
			out.Enrolled = cnt > 0
		}
		// 活动内昵称
		var en model.ActivityEnrollment
		if err := dal.DB.WithContext(ctx).Where("user_id = ?", userID).First(&en).Error; err == nil && en.Nickname != "" {
			out.MyNickname = en.Nickname
		}
	}

	// 进度排序（并列按积分）
	sortTeamsByProgress(out.Teams)
	return out, nil
}

func sortTeamsByProgress(teams []types.ActivityTeamDTO) {
	sort.SliceStable(teams, func(i, j int) bool {
		if teams[i].Position != teams[j].Position {
			return teams[i].Position > teams[j].Position
		}
		return teams[i].Points > teams[j].Points
	})
}

func tilesDTO(tiles []model.ActivityTile) []types.ActivityTileDTO {
	out := make([]types.ActivityTileDTO, 0, len(tiles))
	for i := range tiles {
		out = append(out, tileToDTO(&tiles[i]))
	}
	return out
}

// ListBoardTeams 供各面板直接取队伍列表（含成员）
func (s *ActivityService) ListBoardTeams(ctx context.Context) ([]types.ActivityTeamDTO, error) {
	snapshot, err := s.GetBoard(ctx, "")
	if err != nil {
		return nil, err
	}
	return snapshot.Teams, nil
}
