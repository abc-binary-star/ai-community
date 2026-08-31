package service

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// ListBigEvents 全局大事件：最近各队的掷骰动态（倒序），供独立「大事件」视图展示。
// 只看真实移动掷骰，排除特殊判定掷骰。
func (s *ActivityService) ListBigEvents(ctx context.Context) ([]types.ActivityBigEventDTO, error) {
	var rolls []model.ActivityDiceRoll
	if err := dal.DB.WithContext(ctx).
		Where("is_judgement = ?", false).
		Order("created_at desc").Limit(12).Find(&rolls).Error; err != nil {
		return nil, err
	}
	if len(rolls) == 0 {
		return []types.ActivityBigEventDTO{}, nil
	}

	teamIDs := make([]string, 0, len(rolls))
	seenTeamIDs := make(map[string]struct{}, len(rolls))
	for _, r := range rolls {
		if _, seen := seenTeamIDs[r.TeamID]; seen {
			continue
		}
		seenTeamIDs[r.TeamID] = struct{}{}
		teamIDs = append(teamIDs, r.TeamID)
	}

	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).
		Select("id", "name", "color", "emblem").
		Where("id IN ?", teamIDs).
		Find(&teams).Error; err != nil {
		return nil, err
	}
	teamByID := make(map[string]*model.ActivityTeam, len(teams))
	for i := range teams {
		teamByID[teams[i].ID] = &teams[i]
	}

	out := make([]types.ActivityBigEventDTO, 0, len(rolls))
	for _, r := range rolls {
		item := types.ActivityBigEventDTO{
			ID:            r.ID,
			TeamID:        r.TeamID,
			DiceValue:     r.Value,
			FromTile:      r.FromTile,
			ToTile:        r.ToTile,
			LandedTile:    r.LandedTile,
			ResultSummary: r.ResultSummary,
			CreatedAt:     r.CreatedAt.Format("2006-01-02 15:04:05"),
		}
		if t := teamByID[r.TeamID]; t != nil {
			item.TeamName = t.Name
			item.TeamColor = t.Color
			item.TeamEmblem = t.Emblem
		}
		out = append(out, item)
	}
	return out, nil
}
