package service

import (
	"context"
	"sort"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// GetTileDetail 格子打卡记录（PRD 8.2 / 验收标准 11）。
//
// 可见性规则：本组成员可查看本组在该格的完整书目清单；
// 其他小组只显示汇总数量，不展示书目明细，避免互相抄书单。
func (s *ActivityService) GetTileDetail(ctx context.Context, userID string, tileIndex int) (*types.ActivityTileDetailDTO, error) {
	tile, err := s.getTile(ctx, tileIndex)
	if err != nil {
		return nil, err
	}

	me, err := s.memberOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	myTeamID := ""
	if me != nil {
		myTeamID = me.TeamID
	}

	// 该格所有轮次的进度记录，跨轮次落入同一格时按轮次分组展示
	var rows []model.ActivityTeamProgress
	if err := dal.DB.WithContext(ctx).
		Where("tile_index = ?", tileIndex).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	teamNames, err := s.teamNames(ctx)
	if err != nil {
		return nil, err
	}
	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).Select("id", "color").Find(&teams).Error; err != nil {
		return nil, err
	}
	colors := make(map[string]string, len(teams))
	for _, t := range teams {
		colors[t.ID] = t.Color
	}

	// 本组书目清单一次查出，其他组不查明细
	myBooks := map[int][]types.ActivityBookDTO{}
	if myTeamID != "" {
		var books []model.ActivityCheckInBook
		if err := dal.DB.WithContext(ctx).
			Where("team_id = ? AND tile_index = ?", myTeamID, tileIndex).
			Order("created_at asc").
			Find(&books).Error; err != nil {
			return nil, err
		}
		names, err := s.memberNames(ctx, myTeamID)
		if err != nil {
			return nil, err
		}
		for i := range books {
			b := &books[i]
			myBooks[b.Lap] = append(myBooks[b.Lap], bookToDTO(b, names[b.MemberID], teamNames[b.TeamID]))
		}
	}

	out := &types.ActivityTileDetailDTO{
		Tile:    tileToDTO(tile),
		Records: make([]types.ActivityTileRecordDTO, 0, len(rows)),
	}
	for i := range rows {
		r := &rows[i]
		// 没有任何提交也未点亮的空记录不展示
		if r.BookCount == 0 && !r.Lit {
			continue
		}
		rec := types.ActivityTileRecordDTO{
			TeamID:    r.TeamID,
			TeamName:  teamNames[r.TeamID],
			TeamColor: colors[r.TeamID],
			Lap:       r.Lap,
			BookCount: r.BookCount,
			Lit:       r.Lit,
			LitReason: r.LitReason,
			IsMyTeam:  r.TeamID == myTeamID,
		}
		if rec.IsMyTeam {
			// 本组可见完整清单（含待审与被驳回的），但 bookCount 统一表示
			// 「已通过审核的书目数」，与其他队伍口径一致，避免同一字段两种含义
			rec.Books = myBooks[r.Lap]
		}
		out.Records = append(out.Records, rec)
	}

	// 本组优先，其次按提交量降序，最后按轮次
	sort.SliceStable(out.Records, func(i, j int) bool {
		a, b := out.Records[i], out.Records[j]
		if a.IsMyTeam != b.IsMyTeam {
			return a.IsMyTeam
		}
		if a.BookCount != b.BookCount {
			return a.BookCount > b.BookCount
		}
		return a.Lap < b.Lap
	})
	return out, nil
}

// ListBookLibrary 第 20 格「看十二本群友本月打卡过的书」的候选书库（PRD 第 6 节末）。
//
// 以活动页内本月已通过审核的全部打卡书目作为书库，支持关键词搜索选书。
func (s *ActivityService) ListBookLibrary(ctx context.Context, userID, keyword string, limit int) ([]types.ActivityBookDTO, error) {
	if _, err := s.requireMember(ctx, userID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	q := dal.DB.WithContext(ctx).Model(&model.ActivityCheckInBook{}).
		Where("review_status = ?", model.ReviewStatusApproved)
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("title ILIKE ? OR author ILIKE ?", like, like)
	}

	var books []model.ActivityCheckInBook
	if err := q.Order("created_at desc").Limit(limit).Find(&books).Error; err != nil {
		return nil, err
	}

	names, err := s.memberNames(ctx, "")
	if err != nil {
		return nil, err
	}
	teamNames, err := s.teamNames(ctx)
	if err != nil {
		return nil, err
	}

	// 同一本书可能被多人打卡，书库按书名 + 作者去重
	seen := make(map[string]bool, len(books))
	out := make([]types.ActivityBookDTO, 0, len(books))
	for i := range books {
		b := &books[i]
		key := b.Title + "::" + b.Author
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, bookToDTO(b, names[b.MemberID], teamNames[b.TeamID]))
	}
	return out, nil
}
