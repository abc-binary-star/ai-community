package service

import (
	"context"
	"sort"

	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// GetRanking 团队排行榜：按棋盘进度（位置）降序，并列按已完成彩虹数、积分。
func (s *ActivityService) GetRanking(ctx context.Context, userID string) ([]types.ActivityRankingRowDTO, error) {
	snapshot, err := s.GetBoard(ctx, "")
	if err != nil {
		return nil, err
	}
	myTeamID := ""
	if userID != "" {
		me, err := s.memberOf(ctx, userID)
		if err != nil {
			return nil, err
		}
		if me != nil {
			myTeamID = me.TeamID
		}
	}

	teams := make([]types.ActivityRankingRowDTO, 0, len(snapshot.Teams))
	for _, t := range snapshot.Teams {
		teams = append(teams, types.ActivityRankingRowDTO{
			ID:            t.ID,
			Name:          t.Name,
			Color:         t.Color,
			Position:      t.Position,
			Points:        t.Points,
			UniversalDice: t.UniversalDice,
			RainbowCount:  t.RainbowCount,
			IsSelf:        t.ID == myTeamID,
		})
	}
	sort.SliceStable(teams, func(i, j int) bool {
		if teams[i].Position != teams[j].Position {
			return teams[i].Position > teams[j].Position
		}
		if teams[i].RainbowCount != teams[j].RainbowCount {
			return teams[i].RainbowCount > teams[j].RainbowCount
		}
		return teams[i].Points > teams[j].Points
	})
	for i := range teams {
		teams[i].Rank = i + 1
	}
	return teams, nil
}
