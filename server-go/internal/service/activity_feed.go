package service

import (
	"context"
	"sort"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// feedQueryLimit 单表拉取上限，两路合并后再裁剪到 feedLimit
const (
	feedQueryLimit = 150
	feedLimit      = 120
)

// ListGlobalFeed 活动大事件流：全员打卡 + 全部队伍时间线事件，按时间倒序合并。
//
// 与 ListTimeline（仅本队）的区别是覆盖全场，未入组的观战用户也可查看。
// 打卡条目直接取打卡记录（含书目明细），因此事件表里由「提交打卡」写入的
// checkin 事件要排除，避免同一次提交在流里出现两条；成员加入、撤回打卡等
// 同为 checkin 类型的事件仍会保留。
func (s *ActivityService) ListGlobalFeed(ctx context.Context, userID string) ([]types.ActivityFeedItemDTO, error) {
	me, err := s.memberOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	myTeamID := ""
	if me != nil {
		myTeamID = me.TeamID
	}

	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).Select("id", "name", "color", "emblem").Find(&teams).Error; err != nil {
		return nil, err
	}
	teamByID := make(map[string]*model.ActivityTeam, len(teams))
	for i := range teams {
		teamByID[teams[i].ID] = &teams[i]
	}

	// 全场成员展示名一次查出（teamID 传空即全部），避免逐条回查
	names, err := s.memberNames(ctx, "")
	if err != nil {
		return nil, err
	}

	// 排序按真实时间戳，不用格式化后的字符串（避免时区偏移导致比较失真）
	type feedRow struct {
		item types.ActivityFeedItemDTO
		at   time.Time
	}
	rows := make([]feedRow, 0, feedQueryLimit*2)

	// 1) 全员打卡记录
	var checkIns []model.ActivityCheckIn
	if err := dal.DB.WithContext(ctx).
		Preload("Books").
		Order("created_at desc").
		Limit(feedQueryLimit).
		Find(&checkIns).Error; err != nil {
		return nil, err
	}
	for i := range checkIns {
		c := &checkIns[i]
		team := teamByID[c.TeamID]
		if team == nil {
			continue // 队伍已被删除，跳过悬挂记录
		}
		own := myTeamID != "" && c.TeamID == myTeamID
		var words int64
		titles := make([]string, 0, len(c.Books))
		for j := range c.Books {
			words += c.Books[j].WordCount
			if own {
				titles = append(titles, c.Books[j].Title)
			}
		}
		rows = append(rows, feedRow{
			at: c.CreatedAt,
			item: types.ActivityFeedItemDTO{
				ID:         "checkin-" + c.ID,
				Kind:       "checkin",
				Type:       model.EventTypeCheckIn,
				TeamID:     c.TeamID,
				TeamName:   team.Name,
				TeamColor:  team.Color,
				TeamEmblem: team.Emblem,
				MemberName: names[c.MemberID],
				TileIndex:  c.TileIndex,
				Lap:        c.Lap,
				BookCount:  len(c.Books),
				WordCount:  words,
				BookTitles: titles,
				OwnTeam:    own,
				CreatedAt:  c.CreatedAt.Format(time.RFC3339),
			},
		})
	}

	// 2) 全部队伍时间线事件（排除「提交打卡」事件，避免与上面的打卡条目重复）
	var events []model.ActivityEvent
	if err := dal.DB.WithContext(ctx).
		Where("NOT (type = ? AND text LIKE ?)", model.EventTypeCheckIn, "%等待审核").
		Order("created_at desc").
		Limit(feedQueryLimit).
		Find(&events).Error; err != nil {
		return nil, err
	}
	for i := range events {
		e := &events[i]
		team := teamByID[e.TeamID]
		if team == nil {
			continue
		}
		rows = append(rows, feedRow{
			at: e.CreatedAt,
			item: types.ActivityFeedItemDTO{
				ID:         "event-" + e.ID,
				Kind:       "event",
				Type:       e.Type,
				TeamID:     e.TeamID,
				TeamName:   team.Name,
				TeamColor:  team.Color,
				TeamEmblem: team.Emblem,
				Text:       e.Text,
				OwnTeam:    myTeamID != "" && e.TeamID == myTeamID,
				CreatedAt:  e.CreatedAt.Format(time.RFC3339),
			},
		})
	}

	// 两路合并后统一按时间倒序，再裁剪到展示上限
	sort.SliceStable(rows, func(a, b int) bool {
		return rows[a].at.After(rows[b].at)
	})
	if len(rows) > feedLimit {
		rows = rows[:feedLimit]
	}
	out := make([]types.ActivityFeedItemDTO, 0, len(rows))
	for i := range rows {
		out = append(out, rows[i].item)
	}
	return out, nil
}
