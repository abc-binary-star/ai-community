package service

import (
	"context"
	"time"
	"unicode/utf8"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 报名 / 入队 / 彩虹色认领。队伍固定 7 人，一人一色不重复。

// validNickname 昵称是否合规：按字符数限 50，与库列 varchar(50) 同口径。
// 请求层的 vd 只能按字节粗筛，中文字符需在此按 rune 判定。
func validNickname(nickname string) bool {
	return utf8.RuneCountInString(nickname) <= 50
}

// Enroll 报名活动（幂等）：报名是入队的前提。
func (s *ActivityService) Enroll(ctx context.Context, userID string, req types.ActivityEnrollReq) (*types.EnrollmentDTO, error) {
	if !validNickname(req.Nickname) {
		return nil, ErrActivityInvalidInput
	}
	var existing model.ActivityEnrollment
	err := dal.DB.WithContext(ctx).Where("user_id = ?", userID).First(&existing).Error
	if err == nil {
		// 幂等：已报名则更新昵称
		if req.Nickname != "" && req.Nickname != existing.Nickname {
			existing.Nickname = req.Nickname
			if err := dal.DB.WithContext(ctx).Save(&existing).Error; err != nil {
				return nil, err
			}
		}
		return enrollmentToDTO(existing), nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	en := model.ActivityEnrollment{UserID: userID, Nickname: req.Nickname}
	if err := dal.DB.WithContext(ctx).Create(&en).Error; err != nil {
		return nil, err
	}
	return enrollmentToDTO(en), nil
}

// enrollmentToDTO 报名记录转 DTO（未预加载 User 时 Name 回落为空串）
func enrollmentToDTO(e model.ActivityEnrollment) *types.EnrollmentDTO {
	name := ""
	if e.User.ID != "" {
		name = displayNameOf(&e.User)
	}
	return &types.EnrollmentDTO{
		ID:        e.ID,
		UserID:    e.UserID,
		Name:      name,
		AvatarURL: avatarOf(&e.User),
		Nickname:  e.Nickname,
	}
}

// Enrollments 报名名单（队长入口）：已报名人员及其入队状态
func (s *ActivityService) Enrollments(ctx context.Context, captainUserID string) ([]types.EnrollmentDTO, error) {
	me, err := s.requireMember(ctx, captainUserID)
	if err != nil {
		return nil, err
	}
	if !me.IsCaptain {
		return nil, ErrActivityNotCaptain
	}
	var list []model.ActivityEnrollment
	if err := dal.DB.WithContext(ctx).Preload("User").Order("created_at asc").Find(&list).Error; err != nil {
		return nil, err
	}
	// 已入队成员 map：user_id → team
	var members []model.ActivityMember
	if err := dal.DB.WithContext(ctx).Find(&members).Error; err != nil {
		return nil, err
	}
	teamOf := map[string]string{}
	teamNameOf := map[string]string{}
	for _, m := range members {
		teamOf[m.UserID] = m.TeamID
	}
	var teams []model.ActivityTeam
	_ = dal.DB.WithContext(ctx).Find(&teams).Error
	for _, t := range teams {
		teamNameOf[t.ID] = t.Name
	}
	out := make([]types.EnrollmentDTO, 0, len(list))
	for _, e := range list {
		dto := enrollmentToDTO(e)
		if tid, ok := teamOf[e.UserID]; ok {
			dto.TeamID = tid
			dto.TeamName = teamNameOf[tid]
			dto.Joined = true
		}
		out = append(out, *dto)
	}
	return out, nil
}

// JoinTeam 自助选组入队：7 人满编、队长位、彩虹色一人一色。
func (s *ActivityService) JoinTeam(ctx context.Context, userID string, req types.ActivityJoinTeamReq) (*types.ActivityMemberDTO, error) {
	var enrollCount int64
	if err := dal.DB.WithContext(ctx).Model(&model.ActivityEnrollment{}).Where("user_id = ?", userID).Count(&enrollCount).Error; err != nil {
		return nil, err
	}
	if enrollCount == 0 {
		return nil, ErrActivityNotEnrolled
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return nil, err
	}

	var member *model.ActivityMember
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 一人只能在一队
		var dup model.ActivityMember
		err := tx.Where("user_id = ?", userID).First(&dup).Error
		if err == nil {
			return ErrActivityAlreadyInTeam
		}
		if err != gorm.ErrRecordNotFound {
			return err
		}

		team, err := s.getTeamTxLocked(tx, req.TeamID)
		if err != nil {
			return err
		}
		var memberCount int64
		if err := tx.Model(&model.ActivityMember{}).Where("team_id = ?", team.ID).Count(&memberCount).Error; err != nil {
			return err
		}
		if memberCount >= hellboard.MaxTeamSize {
			return ErrActivityTeamFull
		}
		// 队长位
		var captainCount int64
		if err := tx.Model(&model.ActivityMember{}).Where("team_id = ? AND is_captain = ?", team.ID, true).Count(&captainCount).Error; err != nil {
			return err
		}
		if req.IsCaptain && captainCount > 0 {
			return ErrActivityCaptainTaken
		}

		// 颜色校验：合法 + 队内未被认领
		color := req.Color
		if color == "" {
			return ErrActivityColorInvalid
		}
		if !hellboard.ValidRainbowColor(color) {
			return ErrActivityColorInvalid
		}
		var used int64
		if err := tx.Model(&model.ActivityMember{}).Where("team_id = ? AND color = ?", team.ID, color).Count(&used).Error; err != nil {
			return err
		}
		if used > 0 {
			return ErrActivityColorTaken
		}

		var en model.ActivityEnrollment
		if err := tx.Where("user_id = ?", userID).First(&en).Error; err != nil {
			return err
		}

		m := &model.ActivityMember{
			TeamID:    team.ID,
			UserID:    userID,
			IsCaptain: req.IsCaptain,
			Nickname:  en.Nickname,
			Color:     color,
		}
		if err := tx.Create(m).Error; err != nil {
			return err
		}
		member = m
		_ = s.addEvent(tx, team.ID, model.EventTypeColor, "成员入队并认领"+colorLabel(color)+"色")
		return nil
	})
	if err != nil {
		return nil, err
	}

	var full model.ActivityMember
	if err := dal.DB.WithContext(ctx).Preload("User").First(&full, "id = ?", member.ID).Error; err != nil {
		return nil, err
	}
	dto := memberToDTO(full)
	return &dto, nil
}

// ClaimColor 认领/更换彩虹色（队内协商；App 内不做周期锁定，颜色一人一个）。
func (s *ActivityService) ClaimColor(ctx context.Context, userID string, req types.ActivityClaimColorReq) (*types.ActivityMemberDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !hellboard.ValidRainbowColor(req.Color) {
		return nil, ErrActivityColorInvalid
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return nil, err
	}

	m := &model.ActivityMember{}
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(m, "id = ?", me.ID).Error; err != nil {
			return err
		}
		var used int64
		if err := tx.Model(&model.ActivityMember{}).
			Where("team_id = ? AND color = ? AND id <> ?", m.TeamID, req.Color, m.ID).
			Count(&used).Error; err != nil {
			return err
		}
		if used > 0 {
			return ErrActivityColorTaken
		}
		old := m.Color
		m.Color = req.Color
		if err := tx.Model(m).Update("color", req.Color).Error; err != nil {
			return err
		}
		if old != "" {
			_ = s.addEvent(tx, m.TeamID, model.EventTypeColor, "成员更换彩虹色为"+colorLabel(req.Color))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	var full model.ActivityMember
	if err := dal.DB.WithContext(ctx).Preload("User").First(&full, "id = ?", m.ID).Error; err != nil {
		return nil, err
	}
	dto := memberToDTO(full)
	return &dto, nil
}

// UpdateNickname 修改活动内昵称。
// 昵称同时存在于报名表与成员表：前者供 /board 展示名与入队复制，后者供队伍成员名单，
// 只写其一会出现「改完不生效」或「退队重加被旧名覆盖」。已报名但未入队者同样可改。
func (s *ActivityService) UpdateNickname(ctx context.Context, userID string, nickname string) error {
	if nickname == "" || !validNickname(nickname) {
		return ErrActivityInvalidInput
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return err
	}
	me, err := s.memberOf(ctx, userID)
	if err != nil {
		return err
	}
	var en model.ActivityEnrollment
	if err := dal.DB.WithContext(ctx).Where("user_id = ?", userID).First(&en).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrActivityNotEnrolled
		}
		return err
	}
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.ActivityEnrollment{}).
			Where("user_id = ?", userID).Update("nickname", nickname).Error; err != nil {
			return err
		}
		if me == nil {
			return nil
		}
		return tx.Model(&model.ActivityMember{}).
			Where("id = ?", me.ID).Update("nickname", nickname).Error
	})
}

// LeaveTeam 退出队伍，供选错队伍时重选。
// 仅在全队开赛前允许干净退出：入队动作自身必写一条 color 事件，属成员记账而非对战进展，
// 若一并统计会导致「一入队就永远退不出」；掷骰、彩虹集齐、格子、运营修正才算真实进展。
func (s *ActivityService) LeaveTeam(ctx context.Context, userID string) error {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return err
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return err
	}
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 与掷骰链路同一把队行锁，串行化「边掷边退」
		team, err := s.getTeamTxLocked(tx, me.TeamID)
		if err != nil {
			return err
		}
		var rollCount, progressCount int64
		if err := tx.Model(&model.ActivityDiceRoll{}).
			Where("team_id = ?", team.ID).Count(&rollCount).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ActivityEvent{}).
			Where("team_id = ? AND type NOT IN ?", team.ID, hellboard.BookkeepingEventTypes()).
			Count(&progressCount).Error; err != nil {
			return err
		}
		if rollCount > 0 || progressCount > 0 || hellboard.TeamHasProgress(team) {
			return &ActivityError{Msg: "本队已开始对战（有掷骰 / 彩虹集齐 / 格子进展），无法退出队伍。如需调整请联系管理员", Code: 409}
		}
		return tx.Delete(&model.ActivityMember{}, "id = ?", me.ID).Error
	})
}

// ClaimCaptain 队长位空缺时补选队长
func (s *ActivityService) ClaimCaptain(ctx context.Context, userID string) error {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return err
	}
	var captainCount int64
	if err := dal.DB.WithContext(ctx).Model(&model.ActivityMember{}).
		Where("team_id = ? AND is_captain = ?", me.TeamID, true).Count(&captainCount).Error; err != nil {
		return err
	}
	if captainCount > 0 {
		return ErrActivityCaptainTaken
	}
	return dal.DB.WithContext(ctx).Model(&model.ActivityMember{}).
		Where("id = ?", me.ID).Update("is_captain", true).Error
}

// CaptainUpdateTeam 队长修改队伍名/徽章
func (s *ActivityService) CaptainUpdateTeam(ctx context.Context, userID string, req types.ActivityTeamUpsertReq) (*types.ActivityTeamDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !me.IsCaptain {
		return nil, ErrActivityNotCaptain
	}
	team, err := s.getTeam(ctx, me.TeamID)
	if err != nil {
		return nil, err
	}
	if req.Name != "" {
		team.Name = req.Name
	}
	if req.Emblem != "" {
		team.Emblem = req.Emblem
	}
	if err := dal.DB.WithContext(ctx).Model(team).Select("name", "emblem").Updates(team).Error; err != nil {
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

// CaptainAddMember 队长从报名名单拉人入队（自动分配第一个未认领的彩虹色）
func (s *ActivityService) CaptainAddMember(ctx context.Context, captainUserID string, targetUserID string) (*types.ActivityMemberDTO, error) {
	me, err := s.requireMember(ctx, captainUserID)
	if err != nil {
		return nil, err
	}
	if !me.IsCaptain {
		return nil, ErrActivityNotCaptain
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return nil, err
	}

	var out *types.ActivityMemberDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var dup model.ActivityMember
		e := tx.Where("user_id = ?", targetUserID).First(&dup).Error
		if e == nil {
			return ErrActivityAlreadyInTeam
		}
		if e != gorm.ErrRecordNotFound {
			return e
		}
		team, err := s.getTeamTxLocked(tx, me.TeamID)
		if err != nil {
			return err
		}
		var memberCount int64
		if err := tx.Model(&model.ActivityMember{}).Where("team_id = ?", team.ID).Count(&memberCount).Error; err != nil {
			return err
		}
		if memberCount >= hellboard.MaxTeamSize {
			return ErrActivityTeamFull
		}
		claimed := map[string]bool{}
		var members []model.ActivityMember
		if err := tx.Where("team_id = ?", team.ID).Find(&members).Error; err != nil {
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
		if err := tx.Where("user_id = ?", targetUserID).First(&en).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return ErrActivityNotEnrolled
			}
			return err
		}
		m := &model.ActivityMember{
			TeamID: team.ID, UserID: targetUserID, Nickname: en.Nickname, Color: color,
		}
		if err := tx.Create(m).Error; err != nil {
			return err
		}
		_ = s.addEvent(tx, team.ID, model.EventTypeColor, "成员加入并认领"+colorLabel(color)+"色")
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

// colorLabel 颜色中文名
func colorLabel(c string) string {
	switch c {
	case model.RainbowColorRed:
		return "红"
	case model.RainbowColorOrange:
		return "橙"
	case model.RainbowColorYellow:
		return "黄"
	case model.RainbowColorGreen:
		return "绿"
	case model.RainbowColorCyan:
		return "青"
	case model.RainbowColorBlue:
		return "蓝"
	case model.RainbowColorPurple:
		return "紫"
	}
	return c
}
