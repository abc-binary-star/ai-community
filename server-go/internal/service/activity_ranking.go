package service

import (
	"context"
	"sort"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// rankInput 排序中间结构
type rankInput struct {
	id        string
	name      string
	color     string
	bookCount int
	wordCount int64
	litCount  int
	teamName  string
	// achievedAt 最后一次点亮时间，作最末一级并列规则（早者优先）
	achievedAt time.Time
	isSelf     bool
}

// GetRanking 榜单（PRD 第 11 节）。
//
// 四张榜由 metric（books / words）× subject（team / member）组合而来；
// 只有人工终审通过的打卡计入——成员的 BookCount / WordCount 仅在终审通过时累加。
func (s *ActivityService) GetRanking(
	ctx context.Context,
	userID, metric, subject string,
	limit int,
) ([]types.ActivityRankingRowDTO, error) {
	if metric != "words" {
		metric = "books"
	}
	if subject != "member" {
		subject = "team"
	}
	if limit <= 0 || limit > 100 {
		limit = 10
	}

	me, err := s.memberOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	myTeamID, myMemberID := "", ""
	if me != nil {
		myTeamID = me.TeamID
		myMemberID = me.ID
	}

	inputs, err := s.rankInputs(ctx, subject, myTeamID, myMemberID)
	if err != nil {
		return nil, err
	}

	sort.SliceStable(inputs, rankLess(inputs, metric, subject))

	out := make([]types.ActivityRankingRowDTO, 0, len(inputs))
	for i := range inputs {
		r := &inputs[i]
		out = append(out, types.ActivityRankingRowDTO{
			ID:        r.id,
			Rank:      i + 1,
			Name:      r.name,
			Color:     r.color,
			BookCount: r.bookCount,
			WordCount: r.wordCount,
			LitCount:  r.litCount,
			TeamName:  r.teamName,
			IsSelf:    r.isSelf,
		})
	}
	// 展示前 N 名，但当前用户及其队伍若在名次外也要能被前端定位，
	// 因此保留完整排名让前端自行截断与高亮。
	if len(out) > limit {
		kept := out[:limit]
		for _, row := range out[limit:] {
			if row.IsSelf {
				kept = append(kept, row)
			}
		}
		out = kept
	}
	return out, nil
}

// rankLess 排序规则（PRD 第 11 节并列规则）：
//   - 书目榜：书目数 → 字数 →（队伍榜）点亮格数 → 达成时间早者优先
//   - 字数榜：字数 → 书目数 →（队伍榜）点亮格数 → 达成时间早者优先
func rankLess(rows []rankInput, metric, subject string) func(i, j int) bool {
	return func(i, j int) bool {
		a, b := &rows[i], &rows[j]
		if metric == "books" {
			if a.bookCount != b.bookCount {
				return a.bookCount > b.bookCount
			}
			if a.wordCount != b.wordCount {
				return a.wordCount > b.wordCount
			}
		} else {
			if a.wordCount != b.wordCount {
				return a.wordCount > b.wordCount
			}
			if a.bookCount != b.bookCount {
				return a.bookCount > b.bookCount
			}
		}
		if subject == "team" && a.litCount != b.litCount {
			return a.litCount > b.litCount
		}
		return achievedEarlier(a, b)
	}
}

// achievedEarlier 达成时间早者优先；零值（从未点亮）排在后面
func achievedEarlier(a, b *rankInput) bool {
	if a.achievedAt.IsZero() && b.achievedAt.IsZero() {
		return false
	}
	if a.achievedAt.IsZero() {
		return false
	}
	if b.achievedAt.IsZero() {
		return true
	}
	return a.achievedAt.Before(b.achievedAt)
}

// rankInputs 构造排序输入
func (s *ActivityService) rankInputs(ctx context.Context, subject, myTeamID, myMemberID string) ([]rankInput, error) {
	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).Find(&teams).Error; err != nil {
		return nil, err
	}
	var members []model.ActivityMember
	if err := dal.DB.WithContext(ctx).Preload("User").Find(&members).Error; err != nil {
		return nil, err
	}

	litCounts, err := s.litCounts(ctx)
	if err != nil {
		return nil, err
	}

	teamByID := make(map[string]*model.ActivityTeam, len(teams))
	for i := range teams {
		teamByID[teams[i].ID] = &teams[i]
	}

	if subject == "team" {
		agg := make(map[string]struct {
			books int
			words int64
		}, len(teams))
		for i := range members {
			m := &members[i]
			v := agg[m.TeamID]
			v.books += m.BookCount
			v.words += m.WordCount
			agg[m.TeamID] = v
		}
		out := make([]rankInput, 0, len(teams))
		for i := range teams {
			t := &teams[i]
			row := rankInput{
				id:        t.ID,
				name:      t.Name,
				color:     t.Color,
				bookCount: agg[t.ID].books,
				wordCount: agg[t.ID].words,
				litCount:  litCounts[t.ID],
				isSelf:    t.ID == myTeamID,
			}
			if t.LastLitAt != nil {
				row.achievedAt = *t.LastLitAt
			}
			out = append(out, row)
		}
		return out, nil
	}

	out := make([]rankInput, 0, len(members))
	for i := range members {
		m := &members[i]
		team := teamByID[m.TeamID]
		row := rankInput{
			id:        m.ID,
			name:      displayNameOf(&m.User),
			bookCount: m.BookCount,
			wordCount: m.WordCount,
			litCount:  litCounts[m.TeamID],
			isSelf:    m.ID == myMemberID,
		}
		if team != nil {
			row.color = team.Color
			row.teamName = team.Name
			if team.LastLitAt != nil {
				row.achievedAt = *team.LastLitAt
			}
		}
		out = append(out, row)
	}
	return out, nil
}

// litCounts 队伍 id → 点亮格数（按格子编号去重）
func (s *ActivityService) litCounts(ctx context.Context) (map[string]int, error) {
	var rows []model.ActivityTeamProgress
	if err := dal.DB.WithContext(ctx).
		Select("team_id", "tile_index").
		Where("lit = ?", true).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	seen := make(map[string]map[int]bool)
	for _, r := range rows {
		if seen[r.TeamID] == nil {
			seen[r.TeamID] = map[int]bool{}
		}
		seen[r.TeamID][r.TileIndex] = true
	}
	out := make(map[string]int, len(seen))
	for teamID, tiles := range seen {
		out[teamID] = len(tiles)
	}
	return out, nil
}

// GetLitRanking 点亮进度榜：活动主进度看板，口径独立（PRD 第 11 节末）。
// 用于活动结束时的胜负判定：点亮数 → 总字数 → 总书目 → 最后一次点亮时间（P1-7）。
func (s *ActivityService) GetLitRanking(ctx context.Context, userID string) ([]types.ActivityRankingRowDTO, error) {
	me, err := s.memberOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	myTeamID := ""
	if me != nil {
		myTeamID = me.TeamID
	}

	inputs, err := s.rankInputs(ctx, "team", myTeamID, "")
	if err != nil {
		return nil, err
	}
	sort.SliceStable(inputs, func(i, j int) bool {
		a, b := &inputs[i], &inputs[j]
		if a.litCount != b.litCount {
			return a.litCount > b.litCount
		}
		if a.wordCount != b.wordCount {
			return a.wordCount > b.wordCount
		}
		if a.bookCount != b.bookCount {
			return a.bookCount > b.bookCount
		}
		return achievedEarlier(a, b)
	})

	out := make([]types.ActivityRankingRowDTO, 0, len(inputs))
	for i := range inputs {
		r := &inputs[i]
		out = append(out, types.ActivityRankingRowDTO{
			ID:        r.id,
			Rank:      i + 1,
			Name:      r.name,
			Color:     r.color,
			BookCount: r.bookCount,
			WordCount: r.wordCount,
			LitCount:  r.litCount,
			IsSelf:    r.isSelf,
		})
	}
	return out, nil
}
