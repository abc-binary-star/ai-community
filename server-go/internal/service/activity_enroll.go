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
