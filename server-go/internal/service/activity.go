package service

import (
	"context"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ActivityService 活动「九月彩虹桥 · 读书大富翁」服务。
//
// 玩法约定：读书、打卡、投骰都在群内完成；本服务负责棋盘可视化与程序化结算——
// 录入群里掷出的骰子点数后，按 100 格地图规则移动队伍并结算格子效果
// （前进/后退/互换/特殊功能/buff/积分/万能骰子），全部计算在服务端完成。
type ActivityService struct{}

// ActivityError 活动业务错误
type ActivityError struct {
	Msg  string
	Code int
}

func (e *ActivityError) Error() string { return e.Msg }

var (
	ErrActivityNotMember        = &ActivityError{Msg: "你不在本次活动的任何小组中", Code: 403}
	ErrActivityNotCaptain       = &ActivityError{Msg: "仅队长可执行该操作", Code: 403}
	ErrActivityTeamNotFound     = &ActivityError{Msg: "小组不存在", Code: 404}
	ErrActivityMemberNotFound   = &ActivityError{Msg: "成员不存在", Code: 404}
	ErrActivityTileNotFound     = &ActivityError{Msg: "格子不存在", Code: 404}
	ErrActivityInvalidInput     = &ActivityError{Msg: "输入不合法", Code: 400}
	ErrActivityArchived         = &ActivityError{Msg: "活动周期已结束，页面为只读归档态", Code: 403}
	ErrActivityCompleted        = &ActivityError{Msg: "本队已冲线获胜，活动结束", Code: 409}
	ErrActivityNotRollable      = &ActivityError{Msg: "当前掷骰机会不足：完成一轮彩虹后获得 1 次掷骰机会", Code: 409}
	ErrActivityNoDice           = &ActivityError{Msg: "万能骰子数量不足", Code: 409}
	ErrActivityDiceSealed       = &ActivityError{Msg: "道具封印中：本次不可使用万能骰子", Code: 409}
	ErrActivityAlreadyInTeam    = &ActivityError{Msg: "该用户已在某个小组中", Code: 409}
	ErrActivityNotEnrolled      = &ActivityError{Msg: "该用户尚未报名活动", Code: 409}
	ErrActivityTeamFull         = &ActivityError{Msg: "该队伍已满 7 人", Code: 409}
	ErrActivityCaptainTaken     = &ActivityError{Msg: "该队伍已有队长，队长位不可重复选择", Code: 409}
	ErrActivityColorTaken       = &ActivityError{Msg: "该彩虹色已被队内其他成员认领，一人一色不重复", Code: 409}
	ErrActivityColorInvalid     = &ActivityError{Msg: "请认领七彩虹色之一（红/橙/黄/绿/青/蓝/紫）", Code: 400}
	ErrActivityColorLocked      = &ActivityError{Msg: "本轮彩虹周期内不可中途换色，集齐后可重新分配", Code: 409}
	ErrActivityWinLocked        = &ActivityError{Msg: "已有队伍冲线获胜，活动进入冠军锁定", Code: 409}
	ErrActivityFeedbackNotFound = &ActivityError{Msg: "反馈记录不存在", Code: 404}
)

// --- 内部查询辅助 ---

// memberOf 查当前用户在活动中的成员记录；不在任何小组返回 nil
func (s *ActivityService) memberOf(ctx context.Context, userID string) (*model.ActivityMember, error) {
	if userID == "" {
		return nil, nil
	}
	var m model.ActivityMember
	err := dal.DB.WithContext(ctx).First(&m, "user_id = ?", userID).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// requireMember 要求当前用户是活动成员
func (s *ActivityService) requireMember(ctx context.Context, userID string) (*model.ActivityMember, error) {
	m, err := s.memberOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, ErrActivityNotMember
	}
	return m, nil
}

// requireWritable 校验活动周期：已归档则只读，不允许写操作。
// 已移除「活动尚未开始」的时间限制：活动随时可操作（测试与长期可用）。
func (s *ActivityService) requireWritable(now time.Time) error {
	if hellboard.IsArchived(now) {
		return ErrActivityArchived
	}
	return nil
}

// getTeam 读取队伍（含成员与其用户关联）
func (s *ActivityService) getTeam(ctx context.Context, teamID string) (*model.ActivityTeam, error) {
	var t model.ActivityTeam
	err := dal.DB.WithContext(ctx).
		Preload("Members", func(db *gorm.DB) *gorm.DB {
			return db.Preload("User").Order("created_at asc")
		}).
		First(&t, "id = ?", teamID).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityTeamNotFound
		}
		return nil, err
	}
	// 模块级别对 Members 无关联定义，直接按外键查询补充
	return &t, nil
}

// loadTeamMembers 事务或普通查询下加载队伍成员
func (s *ActivityService) loadTeamMembers(ctx context.Context, teamID string) ([]model.ActivityMember, error) {
	var members []model.ActivityMember
	err := dal.DB.WithContext(ctx).
		Preload("User").
		Where("team_id = ?", teamID).
		Order("created_at asc").Find(&members).Error
	return members, err
}

// loadTeamMembersTx 事务内加载队伍成员
func (s *ActivityService) loadTeamMembersTx(tx *gorm.DB, teamID string) ([]model.ActivityMember, error) {
	var members []model.ActivityMember
	err := tx.Preload("User").
		Where("team_id = ?", teamID).
		Order("created_at asc").Find(&members).Error
	return members, err
}

// getTeamLockedForUpdate 读取队伍并加行级排他锁（并发写保护）
func (s *ActivityService) getTeamLockedForUpdate(ctx context.Context, teamID string) (*model.ActivityTeam, error) {
	var t model.ActivityTeam
	err := dal.DB.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&t, "id = ?", teamID).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityTeamNotFound
		}
		return nil, err
	}
	return &t, nil
}

// addEvent 写入队伍时间线
func (s *ActivityService) addEvent(tx *gorm.DB, teamID, eventType, text string) error {
	return tx.Create(&model.ActivityEvent{TeamID: teamID, Type: eventType, Text: text}).Error
}

// displayNameOf 用户展示名：优先 DisplayName，回落 Username
func displayNameOf(u *model.User) string {
	if u.DisplayName != nil && *u.DisplayName != "" {
		return *u.DisplayName
	}
	return u.Username
}

// memberNameOf 成员在活动内的展示名：优先报名昵称，回落账号昵称
func memberNameOf(m *model.ActivityMember) string {
	if m.Nickname != "" {
		return m.Nickname
	}
	return displayNameOf(&m.User)
}

// avatarOf 头像 URL，空值返回空串
func avatarOf(u *model.User) string {
	if u.Avatar != nil {
		return *u.Avatar
	}
	return ""
}

// tileTitle 格子展示名：运营定的标题优先，空则按类型兜底
func tileTitle(t *model.ActivityTile) string {
	if t.Title != "" {
		return t.Title
	}
	switch t.Kind {
	case model.TileKindForward:
		if t.Param > 0 {
			return "前进" + cnNum(t.Param) + "格"
		}
		return "前进 1–3 格"
	case model.TileKindBackward:
		if t.Param > 0 {
			return "后退" + cnNum(t.Param) + "格"
		}
		return "后退 1–3 格"
	case model.TileKindSwap:
		return "位置互换格"
	case model.TileKindSpecial:
		return "特殊功能"
	default:
		return "空白格"
	}
}

func cnNum(n int) string {
	digits := []string{"零", "一", "二", "三", "四", "五", "六", "七", "八", "九"}
	switch {
	case n < 10:
		return digits[n]
	case n < 20:
		if n%10 == 0 {
			return "十"
		}
		return "十" + digits[n%10]
	case n < 100:
		if n%10 == 0 {
			return digits[n/10] + "十"
		}
		return digits[n/10] + "十" + digits[n%10]
	default:
		return "一百"
	}
}

// tileToDTO 格子定义转 DTO
func tileToDTO(t *model.ActivityTile) types.ActivityTileDTO {
	return types.ActivityTileDTO{
		Index:  t.Index,
		Kind:   t.Kind,
		Title:  tileTitle(t),
		Effect: t.Effect,
		Param:  t.Param,
		Twin:   t.Twin,
	}
}

// memberToDTO 成员转 DTO
func memberToDTO(m model.ActivityMember) types.ActivityMemberDTO {
	return types.ActivityMemberDTO{
		ID:        m.ID,
		UserID:    m.UserID,
		Name:      memberNameOf(&m),
		AvatarURL: avatarOf(&m.User),
		IsCaptain: m.IsCaptain,
		Color:     m.Color,
		BookCount: m.BookCount,
		WordCount: m.WordCount,
	}
}

// teamToDTO 队伍模型转 DTO（内部解析色块与 buff，失败时以空态兜底）
func (s *ActivityService) teamToDTO(t *model.ActivityTeam) types.ActivityTeamDTO {
	st, err := hellboard.TeamStateFromModel(t)
	if err != nil {
		st = hellboard.TeamGameState{Position: t.Position}
	}
	buffs := make([]types.BuffDTO, 0, len(st.Buffs))
	for _, b := range st.Buffs {
		buffs = append(buffs, types.BuffDTO{Kind: string(b.Kind), Label: hellboard.BuffLabel(b), Uses: b.Uses})
	}
	if st.ColorBlocks == nil {
		st.ColorBlocks = map[string]int{}
	}
	// 成员列表：空时给空数组，避免前端拿到 null 报错
	members := make([]types.ActivityMemberDTO, 0, len(t.Members))
	for _, m := range t.Members {
		members = append(members, memberToDTO(m))
	}
	out := types.ActivityTeamDTO{
		ID:            t.ID,
		Name:          t.Name,
		Color:         t.Color,
		Emblem:        t.Emblem,
		Members:       members,
		Position:      st.Position,
		Points:        st.Points,
		UniversalDice: st.UniversalDice,
		RollChances:   st.RollChances,
		RainbowCount:  st.RainbowCount,
		WeekMinDelta:  st.WeekMinDelta,
		ColorBlocks:   st.ColorBlocks,
		Buffs:         buffs,
		Status:        hellboard.DerivedStatus(st),
	}
	if t.Status == model.TeamStatusCompleted {
		out.Status = model.TeamStatusCompleted
	}
	return out
}
