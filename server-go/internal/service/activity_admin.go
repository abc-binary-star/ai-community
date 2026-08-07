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
)

// 运营后台能力（PRD 第 13 节）：小组与成员名单维护、格子任务文案调整、
// 手工修正队伍位置与点亮状态（带理由留痕）、结果与抽奖名单导出。

// CreateTeam 新建小组
func (s *ActivityService) CreateTeam(ctx context.Context, req types.ActivityTeamUpsertReq) (*types.ActivityTeamDTO, error) {
	team := model.ActivityTeam{
		Name:     strings.TrimSpace(req.Name),
		Color:    strings.TrimSpace(req.Color),
		Emblem:   strings.TrimSpace(req.Emblem),
		Position: 1,
		Status:   model.TeamStatusInProgress,
		Lap:      1,
	}
	if team.Name == "" || team.Color == "" {
		return nil, ErrActivityInvalidInput
	}
	if err := dal.DB.WithContext(ctx).Create(&team).Error; err != nil {
		return nil, err
	}
	dto := teamToDTO(&team, nil, nil)
	return &dto, nil
}

// UpdateTeam 修改小组名称与配色（管理员/版主）。emblem 非空时同样受全局唯一约束
func (s *ActivityService) UpdateTeam(ctx context.Context, teamID string, req types.ActivityTeamUpsertReq) error {
	name := strings.TrimSpace(req.Name)
	color := strings.TrimSpace(req.Color)
	if name == "" || color == "" {
		return ErrActivityInvalidInput
	}
	emblem := strings.TrimSpace(req.Emblem)
	if emblem != "" {
		var used int64
		if err := dal.DB.WithContext(ctx).Model(&model.ActivityTeam{}).
			Where("emblem = ? AND id <> ?", emblem, teamID).Count(&used).Error; err != nil {
			return err
		}
		if used > 0 {
			return ErrActivityEmblemTaken
		}
	}
	res := dal.DB.WithContext(ctx).Model(&model.ActivityTeam{}).Where("id = ?", teamID).
		Updates(map[string]any{"name": name, "color": color, "emblem": emblem})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrActivityTeamNotFound
	}
	return nil
}

// DeleteTeam 删除小组及其成员与记录
func (s *ActivityService) DeleteTeam(ctx context.Context, teamID string) error {
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&model.ActivityMember{}, "team_id = ?", teamID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.ActivityTeamProgress{}, "team_id = ?", teamID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.ActivityEvent{}, "team_id = ?", teamID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.ActivityDiceRoll{}, "team_id = ?", teamID).Error; err != nil {
			return err
		}
		// 审核日志按书目关联、点赞按打卡关联，先清关联表再删书目/打卡，避免悬挂数据
		if err := tx.Delete(&model.ActivityReview{},
			"book_id IN (SELECT id FROM activity_checkin_books WHERE team_id = ?)", teamID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.ActivityBookVote{}, "team_id = ?", teamID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.ActivityCheckInLike{},
			"check_in_id IN (SELECT id FROM activity_checkins WHERE team_id = ?)", teamID).Error; err != nil {
			return err
		}
		// 打卡与书目一并清理，避免残留数据污染榜单与书库
		if err := tx.Delete(&model.ActivityCheckInBook{}, "team_id = ?", teamID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.ActivityCheckIn{}, "team_id = ?", teamID).Error; err != nil {
			return err
		}
		return tx.Delete(&model.ActivityTeam{}, "id = ?", teamID).Error
	})
}

// AddMember 按用户名把社区用户加入小组。
// 一名用户只能属于一个小组，重复加入直接报错而非静默改组。
func (s *ActivityService) AddMember(ctx context.Context, teamID string, req types.ActivityMemberUpsertReq) (*types.ActivityMemberDTO, error) {
	var team model.ActivityTeam
	if err := dal.DB.WithContext(ctx).First(&team, "id = ?", teamID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityTeamNotFound
		}
		return nil, err
	}

	var user model.User
	if err := dal.DB.WithContext(ctx).First(&user, "username = ?", strings.TrimSpace(req.Username)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &ActivityError{Msg: "用户不存在", Code: 404}
		}
		return nil, err
	}

	member := model.ActivityMember{
		TeamID:    teamID,
		UserID:    user.ID,
		IsCaptain: req.IsCaptain,
	}
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 一用户一组的检查放事务内：并发请求同时通过事务外检查时，
		// 由唯一索引（idx_activity_members_user）兜底拦截第二条插入
		var existing int64
		if err := tx.Model(&model.ActivityMember{}).
			Where("user_id = ?", user.ID).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return &ActivityError{Msg: "该用户已在某个小组中", Code: 409}
		}
		// 每组仅一名队长：设新队长时清掉旧队长标记
		if req.IsCaptain {
			if err := tx.Model(&model.ActivityMember{}).Where("team_id = ?", teamID).
				Update("is_captain", false).Error; err != nil {
				return err
			}
		}
		if err := tx.Create(&member).Error; err != nil {
			if isUniqueViolation(err) {
				return &ActivityError{Msg: "该用户已在某个小组中", Code: 409}
			}
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	member.User = user
	return &types.ActivityMemberDTO{
		ID:        member.ID,
		UserID:    member.UserID,
		Name:      displayNameOf(&user),
		AvatarURL: avatarOf(&user),
		IsCaptain: member.IsCaptain,
	}, nil
}

// RemoveMember 移出成员
func (s *ActivityService) RemoveMember(ctx context.Context, memberID string) error {
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var member model.ActivityMember
		if err := tx.First(&member, "id = ?", memberID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return &ActivityError{Msg: "成员不存在", Code: 404}
			}
			return err
		}
		// 已离队成员的投票一并删除：残留票会被票数统计继续计入，推动书目通过
		if err := tx.Delete(&model.ActivityBookVote{}, "voter_member_id = ?", memberID).Error; err != nil {
			return err
		}
		return tx.Delete(&model.ActivityMember{}, "id = ?", memberID).Error
	})
}

// SetCaptain 指定队长
func (s *ActivityService) SetCaptain(ctx context.Context, memberID string) error {
	var member model.ActivityMember
	if err := dal.DB.WithContext(ctx).First(&member, "id = ?", memberID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return &ActivityError{Msg: "成员不存在", Code: 404}
		}
		return err
	}
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.ActivityMember{}).Where("team_id = ?", member.TeamID).
			Update("is_captain", false).Error; err != nil {
			return err
		}
		return tx.Model(&model.ActivityMember{}).Where("id = ?", memberID).
			Update("is_captain", true).Error
	})
}

// UpdateTile 调整格子任务文案与目标值
func (s *ActivityService) UpdateTile(ctx context.Context, index int, req types.ActivityTileUpdateReq) error {
	title := strings.TrimSpace(req.Title)
	if title == "" || req.Target <= 0 {
		return ErrActivityInvalidInput
	}
	res := dal.DB.WithContext(ctx).Model(&model.ActivityTile{}).Where("tile_index = ?", index).
		Updates(map[string]any{"title": title, "target": req.Target})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrActivityTileNotFound
	}
	return nil
}

// ManualFix 手工修正队伍位置与点亮状态，必须带理由并写入时间线（PRD 第 13 节）
func (s *ActivityService) ManualFix(ctx context.Context, adminID, teamID string, req types.ActivityManualFixReq) error {
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		return ErrActivityReasonMissing
	}
	now := time.Now()

	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var team model.ActivityTeam
		if err := tx.Clauses(lockForUpdate()).First(&team, "id = ?", teamID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return ErrActivityTeamNotFound
			}
			return err
		}

		changes := []string{}

		if req.Position != nil {
			p := *req.Position
			if p < 1 || p > hellboard.TileCount {
				return ErrActivityInvalidInput
			}
			if p != team.Position {
				changes = append(changes, fmt.Sprintf("位置 第 %d 格 → 第 %d 格", team.Position, p))
				team.Position = p
				// 换格后当前格进度与保底计数失效，一并清零
				team.TileProgress = 0
				team.FallbackCount = 0
				team.TimerEndsAt = nil
				team.Status = model.TeamStatusInProgress
			}
		}

		for _, idx := range req.LitTiles {
			if idx < 1 || idx > hellboard.TileCount {
				return ErrActivityInvalidInput
			}
			if err := s.markLitTx(tx, &team, idx, model.LitReasonManual, now); err != nil {
				return err
			}
			changes = append(changes, fmt.Sprintf("标记点亮第 %d 格", idx))
		}

		for _, idx := range req.UnlitTiles {
			if idx < 1 || idx > hellboard.TileCount {
				return ErrActivityInvalidInput
			}
			if err := tx.Model(&model.ActivityTeamProgress{}).
				Where("team_id = ? AND tile_index = ?", teamID, idx).
				Updates(map[string]any{"lit": false, "lit_reason": "", "lit_at": nil}).Error; err != nil {
				return err
			}
			changes = append(changes, fmt.Sprintf("取消点亮第 %d 格", idx))
		}

		if len(changes) == 0 {
			return ErrActivityInvalidInput
		}

		litTiles, err := s.litTilesTx(tx, teamID)
		if err != nil {
			return err
		}
		tile, err := s.getTileTx(tx, team.Position)
		if err != nil {
			return err
		}
		team.Status = hellboard.DeriveStatus(&team, tile, len(litTiles))

		if err := tx.Model(&model.ActivityTeam{}).Where("id = ?", teamID).
			Updates(map[string]any{
				"position":       team.Position,
				"tile_progress":  team.TileProgress,
				"fallback_count": team.FallbackCount,
				"status":         team.Status,
				"timer_ends_at":  team.TimerEndsAt,
				"last_lit_at":    team.LastLitAt,
			}).Error; err != nil {
			return err
		}

		return s.addEvent(tx, teamID, model.EventTypeManual,
			fmt.Sprintf("管理员手工修正：%s。理由：%s", strings.Join(changes, "；"), reason))
	})
}

// BatchApprove 批量确认 AI 通过项（PRD 9.3）。
// 逐条走完整审核流程而非批量 UPDATE，确保进度累加与审计日志不被绕过。
func (s *ActivityService) BatchApprove(ctx context.Context, reviewerID string, bookIDs []string) (int, error) {
	if len(bookIDs) == 0 {
		return 0, ErrActivityInvalidInput
	}
	approved := 0
	for _, id := range bookIDs {
		if _, err := s.Review(ctx, reviewerID, id, types.ActivityReviewReq{Action: "approve"}); err != nil {
			// 单条失败不中断批量，跳过继续
			continue
		}
		approved++
	}
	return approved, nil
}

// ExportResults 导出活动结果与抽奖名单（PRD 第 13 节）。
// 已完成 20 格点亮的队伍进入抽奖名单（验收标准 7）。
func (s *ActivityService) ExportResults(ctx context.Context) (map[string]any, error) {
	litRanking, err := s.GetLitRanking(ctx, "")
	if err != nil {
		return nil, err
	}
	litCounts, err := s.litCounts(ctx)
	if err != nil {
		return nil, err
	}

	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).Find(&teams).Error; err != nil {
		return nil, err
	}
	lottery := make([]map[string]any, 0)
	var members []model.ActivityMember
	if err := dal.DB.WithContext(ctx).Preload("User").Find(&members).Error; err != nil {
		return nil, err
	}
	membersByTeam := map[string][]model.ActivityMember{}
	for i := range members {
		membersByTeam[members[i].TeamID] = append(membersByTeam[members[i].TeamID], members[i])
	}
	for i := range teams {
		t := &teams[i]
		if litCounts[t.ID] < hellboard.TileCount {
			continue
		}
		names := make([]string, 0, len(membersByTeam[t.ID]))
		for j := range membersByTeam[t.ID] {
			names = append(names, memberNameOf(&membersByTeam[t.ID][j]))
		}
		lottery = append(lottery, map[string]any{
			"teamId":   t.ID,
			"teamName": t.Name,
			"members":  names,
		})
	}

	now := time.Now()
	return map[string]any{
		"exportedAt":   now.Format(time.RFC3339),
		"archived":     hellboard.IsArchived(now),
		"litRanking":   litRanking,
		"lotteryTeams": lottery,
	}, nil
}
