package service

import (
	"context"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// 运营后台：队伍/成员维护、格子调整、手工修正（带理由留痕）、结果导出。

// ListTeams 全部队伍（管理视角）
func (s *ActivityService) ListTeams(ctx context.Context) ([]types.ActivityTeamDTO, error) {
	return s.ListBoardTeams(ctx)
}

// CreateTeam 创建队伍
func (s *ActivityService) CreateTeam(ctx context.Context, req types.ActivityTeamUpsertReq) (*types.ActivityTeamDTO, error) {
	team := &model.ActivityTeam{Name: req.Name, Color: req.Color, Emblem: req.Emblem}
	if err := dal.DB.WithContext(ctx).Create(team).Error; err != nil {
		return nil, err
	}
	dto := s.teamToDTO(team)
	return &dto, nil
}

// UpdateTeam 更新队伍名称/配色/徽章
func (s *ActivityService) UpdateTeam(ctx context.Context, teamID string, req types.ActivityTeamUpsertReq) (*types.ActivityTeamDTO, error) {
	team, err := s.getTeam(ctx, teamID)
	if err != nil {
		return nil, err
	}
	if req.Name != "" {
		team.Name = req.Name
	}
	if req.Color != "" {
		team.Color = req.Color
	}
	if req.Emblem != "" {
		team.Emblem = req.Emblem
	}
	if err := dal.DB.WithContext(ctx).Model(team).Select("name", "color", "emblem").Updates(team).Error; err != nil {
		return nil, err
	}
	members, err := s.loadTeamMembers(ctx, team.ID)
	if err != nil {
		return nil, err
	}
	team.Members = members
	dto := s.teamToDTO(team)
	return &dto, nil
}

// DeleteTeam 删除队伍（有成员时拒绝）
func (s *ActivityService) DeleteTeam(ctx context.Context, teamID string) error {
	team, err := s.getTeam(ctx, teamID)
	if err != nil {
		return err
	}
	var count int64
	if err := dal.DB.WithContext(ctx).Model(&model.ActivityMember{}).Where("team_id = ?", teamID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return &ActivityError{Msg: "队伍中还有成员，请先移除全部成员", Code: 409}
	}
	return dal.DB.WithContext(ctx).Delete(team).Error
}

// AddMember 运营把报名用户加入队伍（自动分配第一个未认领彩虹色）
func (s *ActivityService) AddMember(ctx context.Context, teamID string, req types.ActivityMemberUpsertReq) (*types.ActivityMemberDTO, error) {
	var user model.User
	if err := dal.DB.WithContext(ctx).Where("username = ?", req.Username).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &ActivityError{Msg: "用户不存在", Code: 404}
		}
		return nil, err
	}

	var out *types.ActivityMemberDTO
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var dup model.ActivityMember
		e := tx.Where("user_id = ?", user.ID).First(&dup).Error
		if e == nil {
			return ErrActivityAlreadyInTeam
		}
		if e != gorm.ErrRecordNotFound {
			return e
		}
		team, err := s.getTeamTxLocked(tx, teamID)
		if err != nil {
			return err
		}
		var memberCount int64
		if err := tx.Model(&model.ActivityMember{}).Where("team_id = ?", teamID).Count(&memberCount).Error; err != nil {
			return err
		}
		if memberCount >= hellboard.MaxTeamSize {
			return ErrActivityTeamFull
		}
		claimed := map[string]bool{}
		var members []model.ActivityMember
		if err := tx.Where("team_id = ?", teamID).Find(&members).Error; err != nil {
			return err
		}
		for _, m := range members {
			claimed[m.Color] = true
		}
		color := hellboard.FirstUnclaimedColor(claimed)
		if color == "" {
			return &ActivityError{Msg: "七色已认领完，请先协商调色", Code: 409}
		}
		var en model.ActivityEnrollment
		nickname := ""
		if err := tx.Where("user_id = ?", user.ID).First(&en).Error; err == nil {
			nickname = en.Nickname
		}
		m := &model.ActivityMember{
			TeamID: team.ID, UserID: user.ID, Nickname: nickname, Color: color, IsCaptain: req.IsCaptain,
		}
		if err := tx.Create(m).Error; err != nil {
			return err
		}
		var full model.ActivityMember
		if err := tx.Preload("User").First(&full, "id = ?", m.ID).Error; err != nil {
			return err
		}
		d := memberToDTO(full)
		out = &d
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// RemoveMember 移除成员
func (s *ActivityService) RemoveMember(ctx context.Context, memberID string) error {
	var m model.ActivityMember
	if err := dal.DB.WithContext(ctx).First(&m, "id = ?", memberID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrActivityMemberNotFound
		}
		return err
	}
	return dal.DB.WithContext(ctx).Delete(&model.ActivityMember{}, "id = ?", memberID).Error
}

// SetCaptain 设置成员为队长（先清空同队其他队长标记）
func (s *ActivityService) SetCaptain(ctx context.Context, memberID string) error {
	var m model.ActivityMember
	if err := dal.DB.WithContext(ctx).First(&m, "id = ?", memberID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrActivityMemberNotFound
		}
		return err
	}
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.ActivityMember{}).
			Where("team_id = ? AND is_captain = ?", m.TeamID, true).
			Update("is_captain", false).Error; err != nil {
			return err
		}
		return tx.Model(&model.ActivityMember{}).Where("id = ?", memberID).Update("is_captain", true).Error
	})
}

// UpdateTile 调整格子定义（Kind 空表示不修改）
func (s *ActivityService) UpdateTile(ctx context.Context, index int, req types.ActivityTileUpdateReq) (*types.ActivityTileDTO, error) {
	tile, err := s.getTile(ctx, index)
	if err != nil {
		return nil, err
	}
	if req.Kind != "" {
		tile.Kind = req.Kind
	}
	if req.Title != "" {
		tile.Title = req.Title
	}
	if req.Effect != "" {
		tile.Effect = req.Effect
	}
	if req.Param != 0 {
		tile.Param = req.Param
	}
	if req.Twin != 0 {
		tile.Twin = req.Twin
	}
	if err := dal.DB.WithContext(ctx).Model(tile).Select("kind", "title", "effect", "param", "twin").Updates(tile).Error; err != nil {
		return nil, err
	}
	dto := tileToDTO(tile)
	return &dto, nil
}

// ManualFix 手工修正队伍状态（必须带理由，留痕到时间线）
func (s *ActivityService) ManualFix(ctx context.Context, teamID string, req types.ActivityManualFixReq) (*types.ActivityTeamDTO, error) {
	team, err := s.getTeamLockedForUpdate(ctx, teamID)
	if err != nil {
		return nil, err
	}
	st, err := hellboard.TeamStateFromModel(team)
	if err != nil {
		return nil, err
	}
	if req.Position != nil {
		st.Position = clampPos(*req.Position)
	}
	if req.Points != nil {
		st.Points = max(0, *req.Points)
		// 修正后把积分按规则兑换，保持资产口径一致
		st.ExchangePoints()
	}
	if req.UniversalDice != nil {
		st.UniversalDice = max(0, *req.UniversalDice)
	}
	if req.RollChances != nil {
		st.RollChances = max(0, *req.RollChances)
	}
	if err := hellboard.ApplyTeamState(team, st); err != nil {
		return nil, err
	}
	team.Status = hellboard.DerivedStatus(st)
	if err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(team).Select(
			"position", "points", "universal_dice", "roll_chances", "rainbow_count",
			"week_min_delta", "color_blocks", "buffs", "status",
		).Updates(team).Error; err != nil {
			return err
		}
		return s.addEvent(tx, team.ID, model.EventTypeManual, "运营修正："+req.Reason)
	}); err != nil {
		return nil, err
	}
	members, err := s.loadTeamMembers(ctx, team.ID)
	if err != nil {
		return nil, err
	}
	team.Members = members
	dto := s.teamToDTO(team)
	return &dto, nil
}

// ExportResults 导出当前战况（运营留档）
func (s *ActivityService) ExportResults(ctx context.Context) (map[string]any, error) {
	snapshot, err := s.GetBoard(ctx, "")
	if err != nil {
		return nil, err
	}
	rows := make([]map[string]any, 0, len(snapshot.Teams))
	for _, t := range snapshot.Teams {
		rows = append(rows, map[string]any{
			"name":          t.Name,
			"position":      t.Position,
			"points":        t.Points,
			"universalDice": t.UniversalDice,
			"rollChances":   t.RollChances,
			"rainbowCount":  t.RainbowCount,
			"buffs":         t.Buffs,
		})
	}
	return map[string]any{
		"exportedAt": time.Now().Format("2006-01-02 15:04:05"),
		"teams":      rows,
	}, nil
}

// getTile 读取格子定义
func (s *ActivityService) getTile(ctx context.Context, index int) (*model.ActivityTile, error) {
	var t model.ActivityTile
	if err := dal.DB.WithContext(ctx).First(&t, "tile_index = ?", index).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityTileNotFound
		}
		return nil, err
	}
	return &t, nil
}

func clampPos(p int) int {
	if p < 0 {
		return 0
	}
	if p > hellboard.WinTile {
		return hellboard.WinTile
	}
	return p
}
