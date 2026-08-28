package service

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// ListTimeline 本队时间线：掷骰 / 格子效果 / 彩虹 / 道具等事件，倒序。
func (s *ActivityService) ListTimeline(ctx context.Context, userID string) ([]types.ActivityEventDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	var rows []model.ActivityEvent
	if err := dal.DB.WithContext(ctx).
		Where("team_id = ?", me.TeamID).
		Order("created_at desc").Limit(200).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]types.ActivityEventDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, types.ActivityEventDTO{
			ID:        r.ID,
			Type:      r.Type,
			Text:      r.Text,
			CreatedAt: r.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	return out, nil
}
