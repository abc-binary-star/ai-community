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

// --- 报名与队长管理 ---
// 报名是入队的前提：登录用户先报名，队长从报名名单中把人拉进队伍。
// 队伍名随时可改；队伍形象一次性选择，确定后不可更换。

// requireCaptain 要求当前用户是某队的队长
func (s *ActivityService) requireCaptain(ctx context.Context, userID string) (*model.ActivityMember, error) {
	m, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !m.IsCaptain {
		return nil, ErrActivityNotCaptain
	}
	return m, nil
}

// enrolledOf 查报名记录；未报名返回 nil
func (s *ActivityService) enrolledOf(ctx context.Context, userID string) (*model.ActivityEnrollment, error) {
	if userID == "" {
		return nil, nil
	}
	var e model.ActivityEnrollment
	err := dal.DB.WithContext(ctx).First(&e, "user_id = ?", userID).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// Enroll 报名活动。报名幂等：重复报名返回已有记录。
// 归档后禁止报名；活动未开始允许报名（预热名单）。
func (s *ActivityService) Enroll(ctx context.Context, userID, nickname string) (*types.EnrollmentDTO, error) {
	if hellboard.IsArchived(time.Now()) {
		return nil, ErrActivityArchived
	}
	nickname = strings.TrimSpace(nickname)
	// 已入队说明已报名，直接返回当前状态
	if m, err := s.memberOf(ctx, userID); err != nil {
		return nil, err
	} else if m != nil {
		team, err := s.getTeam(ctx, m.TeamID)
		if err != nil {
			return nil, err
		}
		return s.enrollmentDTO(ctx, userID, team.ID, team.Name)
	}

	e, err := s.enrolledOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	if e != nil {
		// 已报名但未入队：更新昵称（允许报名后修改，入队后以入队时为准）
		if nickname != "" && e.Nickname != nickname {
			if err := dal.DB.WithContext(ctx).Model(e).
				Where("id = ?", e.ID).Update("nickname", nickname).Error; err != nil {
				return nil, err
			}
		}
		return s.enrollmentDTO(ctx, userID, "", "")
	}
	e = &model.ActivityEnrollment{UserID: userID, Nickname: nickname}
	if err := dal.DB.WithContext(ctx).Create(e).Error; err != nil {
		return nil, err
	}
	return s.enrollmentDTO(ctx, userID, "", "")
}

// getTeam 按 id 读队伍
func (s *ActivityService) getTeam(ctx context.Context, teamID string) (*model.ActivityTeam, error) {
	var t model.ActivityTeam
	if err := dal.DB.WithContext(ctx).First(&t, "id = ?", teamID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityTeamNotFound
		}
		return nil, err
	}
	return &t, nil
}

// enrollmentDTO 组装报名条目（含用户展示名）
func (s *ActivityService) enrollmentDTO(ctx context.Context, userID, teamID, teamName string) (*types.EnrollmentDTO, error) {
	var u model.User
	if err := dal.DB.WithContext(ctx).First(&u, "id = ?", userID).Error; err != nil {
		return nil, err
	}
	return &types.EnrollmentDTO{
		ID:        userID,
		UserID:    userID,
		Name:      displayNameOf(&u),
		AvatarURL: avatarOf(&u),
		TeamID:    teamID,
		TeamName:  teamName,
		Joined:    teamID != "",
	}, nil
}

// enrollmentNickname 报名记录中的活动昵称；未报名返回空串
func (s *ActivityService) enrollmentNickname(ctx context.Context, userID string) string {
	e, err := s.enrolledOf(ctx, userID)
	if err != nil || e == nil {
		return ""
	}
	return e.Nickname
}

// Enrollments 报名名单（仅队长可见）：所有报名者及入队状态
func (s *ActivityService) Enrollments(ctx context.Context, captainUserID string) ([]types.EnrollmentDTO, error) {
	if _, err := s.requireCaptain(ctx, captainUserID); err != nil {
		return nil, err
	}

	var enrolls []model.ActivityEnrollment
	// 必须 Preload User，否则报名者姓名与头像恒为空串
	if err := dal.DB.WithContext(ctx).Preload("User").Order("created_at asc").Find(&enrolls).Error; err != nil {
		return nil, err
	}
	var members []model.ActivityMember
	if err := dal.DB.WithContext(ctx).Find(&members).Error; err != nil {
		return nil, err
	}
	teamOfUser := make(map[string]string, len(members)) // userId -> teamId
	for _, m := range members {
		teamOfUser[m.UserID] = m.TeamID
	}
	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).Find(&teams).Error; err != nil {
		return nil, err
	}
	teamName := make(map[string]string, len(teams))
	for _, t := range teams {
		teamName[t.ID] = t.Name
	}

	out := make([]types.EnrollmentDTO, 0, len(enrolls))
	for i := range enrolls {
		e := &enrolls[i]
		teamID := teamOfUser[e.UserID]
		out = append(out, types.EnrollmentDTO{
			ID:        e.ID,
			UserID:    e.UserID,
			Name:      displayNameOf(&e.User),
			Nickname:  e.Nickname,
			AvatarURL: avatarOf(&e.User),
			TeamID:    teamID,
			TeamName:  teamName[teamID],
			Joined:    teamID != "",
		})
	}
	return out, nil
}

// UpdateNickname 修改活动内昵称（榜单、成员名单、时间线的展示名）。
//
// 同时更新报名记录与成员记录：报名记录是「下次入队时带入的值」，
// 成员记录是「当前队伍里实际展示的值」，只改一处会导致退队重进后昵称回退。
// 未入队时只有报名记录，改它即可。
// 昵称留空表示回退到账号昵称，不是错误。
func (s *ActivityService) UpdateNickname(ctx context.Context, userID, nickname string) (*types.EnrollmentDTO, error) {
	if hellboard.IsArchived(time.Now()) {
		return nil, ErrActivityArchived
	}
	nickname = strings.TrimSpace(nickname)
	if len([]rune(nickname)) > 50 {
		return nil, ErrActivityInvalidInput
	}

	e, err := s.enrolledOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	if e == nil {
		return nil, ErrActivityNotEnrolled
	}

	if err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.ActivityEnrollment{}).
			Where("user_id = ?", userID).
			Update("nickname", nickname).Error; err != nil {
			return err
		}
		// 已入队则同步当前成员记录，让榜单与名单立即生效
		return tx.Model(&model.ActivityMember{}).
			Where("user_id = ?", userID).
			Update("nickname", nickname).Error
	}); err != nil {
		return nil, err
	}

	m, err := s.memberOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return s.enrollmentDTO(ctx, userID, "", "")
	}
	team, err := s.getTeam(ctx, m.TeamID)
	if err != nil {
		return nil, err
	}
	return s.enrollmentDTO(ctx, userID, team.ID, team.Name)
}

// LeaveTeam 退出当前队伍，退出后可重新选队（解决选错队伍的场景）。
//
// 只允许「干净退出」：该成员必须还没有产生任何活动痕迹。
// 一旦有打卡、掷骰或投票，退出就会破坏数据一致性——
// 打卡书目会成为无主记录且已计入队伍进度与榜单，掷骰已推进过棋盘，
// 投票已计入过半判定。这几类记录都无法在退出时安全回滚，
// 因此有痕迹时拒绝退出，改由管理员处理。
//
// 队长退出后队长位直接空置，其他成员可用 ClaimCaptain 补选，
// 不自动指定继任者（避免把队长身份塞给没准备的人）。
// 报名记录保留，所以退出后不用重新报名，直接选队即可。
func (s *ActivityService) LeaveTeam(ctx context.Context, userID string) error {
	if hellboard.IsArchived(time.Now()) {
		return ErrActivityArchived
	}
	me, err := s.memberOf(ctx, userID)
	if err != nil {
		return err
	}
	if me == nil {
		return ErrActivityNotMember
	}

	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 锁队伍行：与入队 / 补选队长共用同一把锁，避免并发下人数或队长位错乱
		var t model.ActivityTeam
		if err := tx.Clauses(lockForUpdate()).First(&t, "id = ?", me.TeamID).Error; err != nil {
			return err
		}

		// 逐项检查活动痕迹，任一存在即拒绝退出
		for _, c := range []struct {
			table string
			where string
			err   error
		}{
			{"activity_checkins", "member_id = ?", ErrActivityLeaveHasCheckIn},
			// 掷骰表的成员列是 roller_id，不是 member_id
			{"activity_dice_rolls", "roller_id = ?", ErrActivityLeaveHasDiceRoll},
			{"activity_book_votes", "voter_member_id = ?", ErrActivityLeaveHasVote},
		} {
			var n int64
			if err := tx.Table(c.table).Where(c.where, me.ID).Count(&n).Error; err != nil {
				return err
			}
			if n > 0 {
				return c.err
			}
		}

		if err := tx.Delete(&model.ActivityMember{}, "id = ?", me.ID).Error; err != nil {
			return err
		}
		// 队长退出：队长位空置，由剩余成员自助补选
		suffix := ""
		if me.IsCaptain {
			suffix = "，队长位空置"
		}
		return s.addEvent(tx, me.TeamID, model.EventTypeManual,
			fmt.Sprintf("成员「%s」退出队伍%s", memberNameOf(me), suffix))
	})
}

// ClaimCaptain 已入队成员自助补选为本队队长。
//
// 解决的问题：入队时没勾「成为队长」，之后就再没有入口能当队长了
// （JoinTeam 只在入队那一刻能选，admin 接口前端没有入口）。
// 约束与 JoinTeam 一致：队长位必须空缺，一队只有一名队长；
// 加锁串行化，防并发下出现双队长。
func (s *ActivityService) ClaimCaptain(ctx context.Context, userID string) (*types.ActivityMemberDTO, error) {
	if hellboard.IsArchived(time.Now()) {
		return nil, ErrActivityArchived
	}
	me, err := s.memberOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	if me == nil {
		return nil, ErrActivityNotMember
	}
	if me.IsCaptain {
		// 已是队长，幂等返回当前状态
		return s.memberDTO(ctx, me)
	}

	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 锁队伍行：与 JoinTeam 抢队长位用同一把锁，避免并发双队长
		var t model.ActivityTeam
		if err := tx.Clauses(lockForUpdate()).First(&t, "id = ?", me.TeamID).Error; err != nil {
			return err
		}
		var captainCount int64
		if err := tx.Model(&model.ActivityMember{}).
			Where("team_id = ? AND is_captain = ?", me.TeamID, true).
			Count(&captainCount).Error; err != nil {
			return err
		}
		if captainCount > 0 {
			return ErrActivityCaptainTaken
		}
		if err := tx.Model(&model.ActivityMember{}).
			Where("id = ?", me.ID).
			Update("is_captain", true).Error; err != nil {
			return err
		}
		me.IsCaptain = true
		return s.addEvent(tx, me.TeamID, model.EventTypeManual,
			fmt.Sprintf("成员「%s」成为本队队长", memberNameOf(me)))
	})
	if err != nil {
		return nil, err
	}
	return s.memberDTO(ctx, me)
}

// memberDTO 组装成员 DTO，补齐用户头像等关联信息
func (s *ActivityService) memberDTO(ctx context.Context, m *model.ActivityMember) (*types.ActivityMemberDTO, error) {
	var user model.User
	if err := dal.DB.WithContext(ctx).First(&user, "id = ?", m.UserID).Error; err != nil {
		return nil, err
	}
	m.User = user
	return &types.ActivityMemberDTO{
		ID:        m.ID,
		UserID:    m.UserID,
		Name:      memberNameOf(m),
		AvatarURL: avatarOf(&m.User),
		IsCaptain: m.IsCaptain,
		BookCount: m.BookCount,
		WordCount: m.WordCount,
	}, nil
}

// JoinTeam 自助选组入队：报名用户可直接加入某队，并可选择成为队长。
// 每队至多 MaxTeamSize 人；队长位仅当空缺时可选，一支队伍只有一名队长。
func (s *ActivityService) JoinTeam(ctx context.Context, userID, teamID string, wantCaptain bool) (*types.ActivityMemberDTO, error) {
	if hellboard.IsArchived(time.Now()) {
		return nil, ErrActivityArchived
	}
	// 已入队则拒绝
	if m, err := s.memberOf(ctx, userID); err != nil {
		return nil, err
	} else if m != nil {
		return nil, ErrActivityAlreadyInTeam
	}
	// 必须已报名
	e, err := s.enrolledOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	if e == nil {
		return nil, ErrActivityNotEnrolled
	}

	var team model.ActivityTeam
	if err := dal.DB.WithContext(ctx).First(&team, "id = ?", teamID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityTeamNotFound
		}
		return nil, err
	}
	// 队伍容量与队长位校验需串行化，防止并发下超员/双队长
	var (
		member model.ActivityMember
		user   model.User
	)
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var t model.ActivityTeam
		if err := tx.Clauses(lockForUpdate()).First(&t, "id = ?", teamID).Error; err != nil {
			return err
		}
		var members []model.ActivityMember
		if err := tx.Where("team_id = ?", teamID).Find(&members).Error; err != nil {
			return err
		}
		if len(members) >= hellboard.MaxTeamSize {
			return ErrActivityTeamFull
		}
		if wantCaptain {
			for i := range members {
				if members[i].IsCaptain {
					return ErrActivityCaptainTaken
				}
			}
		}
		if err := tx.First(&user, "id = ?", userID).Error; err != nil {
			return err
		}
		member = model.ActivityMember{
			TeamID:    teamID,
			UserID:    userID,
			IsCaptain: wantCaptain,
			Nickname:  e.Nickname,
		}
		if err := tx.Create(&member).Error; err != nil {
			// 唯一索引兜底并发重复入队
			if isUniqueViolation(err) {
				return ErrActivityAlreadyInTeam
			}
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	member.User = user

	// 成为队长或首名成员时，队伍尚无形象，由队长后续在管理弹窗一次性选择
	if err := s.addEvent(dal.DB.WithContext(ctx), teamID, model.EventTypeCheckIn,
		fmt.Sprintf("成员「%s」加入本队", memberNameOf(&member))); err != nil {
		return nil, err
	}

	return &types.ActivityMemberDTO{
		ID:        member.ID,
		UserID:    member.UserID,
		Name:      memberNameOf(&member),
		AvatarURL: avatarOf(&member.User),
		IsCaptain: member.IsCaptain,
		BookCount: member.BookCount,
		WordCount: member.WordCount,
	}, nil
}

// CaptainUpdateTeam 队长更新队名，并可一次性选择队伍形象。
// 形象一经确定不可更换（emblem 已非空且与本次不同时拒绝）。
func (s *ActivityService) CaptainUpdateTeam(ctx context.Context, captainUserID string, req types.ActivityTeamUpsertReq) error {
	cap, err := s.requireCaptain(ctx, captainUserID)
	if err != nil {
		return err
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return err
	}

	team, err := s.getTeam(ctx, cap.TeamID)
	if err != nil {
		return err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return ErrActivityInvalidInput
	}
	updates := map[string]any{"name": name}
	emblem := strings.TrimSpace(req.Emblem)
	if emblem != "" {
		if team.Emblem != "" && team.Emblem != emblem {
			return ErrActivityEmblemLocked
		}
		// 徽章全局唯一：其他队伍已选用则拒绝（素材只有 9 张，先到先得）
		var used int64
		if err := dal.DB.WithContext(ctx).Model(&model.ActivityTeam{}).
			Where("emblem = ? AND id <> ?", emblem, team.ID).Count(&used).Error; err != nil {
			return err
		}
		if used > 0 {
			return ErrActivityEmblemTaken
		}
		updates["emblem"] = emblem
	}
	if err := dal.DB.WithContext(ctx).Model(&model.ActivityTeam{}).
		Where("id = ?", team.ID).Updates(updates).Error; err != nil {
		return err
	}
	return nil
}

// CaptainAddMember 队长从报名名单拉人入队。
// 一名用户只能属于一个小组；未报名者不允许入队；队伍满员拒绝。
func (s *ActivityService) CaptainAddMember(ctx context.Context, captainUserID, userID string) (*types.ActivityMemberDTO, error) {
	cap, err := s.requireCaptain(ctx, captainUserID)
	if err != nil {
		return nil, err
	}
	if err := s.requireWritable(time.Now()); err != nil {
		return nil, err
	}

	e, err := s.enrolledOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	if e == nil {
		return nil, ErrActivityNotEnrolled
	}
	if m, err := s.memberOf(ctx, userID); err != nil {
		return nil, err
	} else if m != nil {
		return nil, ErrActivityAlreadyInTeam
	}

	// 满员校验与入队串行化，防止并发超员
	var (
		member model.ActivityMember
		user   model.User
	)
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&model.ActivityMember{}).
			Where("team_id = ?", cap.TeamID).Count(&count).Error; err != nil {
			return err
		}
		if count >= hellboard.MaxTeamSize {
			return ErrActivityTeamFull
		}
		if err := tx.First(&user, "id = ?", userID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return &ActivityError{Msg: "用户不存在", Code: 404}
			}
			return err
		}
		member = model.ActivityMember{TeamID: cap.TeamID, UserID: userID, IsCaptain: false, Nickname: e.Nickname}
		if err := tx.Create(&member).Error; err != nil {
			// 唯一索引兜底并发重复入队
			if isUniqueViolation(err) {
				return ErrActivityAlreadyInTeam
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
		Name:      memberNameOf(&member),
		AvatarURL: avatarOf(&member.User),
		IsCaptain: false,
		BookCount: 0,
		WordCount: 0,
	}, nil
}
