package service

import (
	"context"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ActivityService 活动「无限循环读书地狱」服务。
//
// 服务端权威（PRD 第 12 节）：掷骰点数、进度累加、点亮判定、保底触发、
// 计时到期全部在此计算并落库，前端不持有可影响结果的逻辑。
type ActivityService struct{}

// ActivityError 活动业务错误
type ActivityError struct {
	Msg  string
	Code int
}

func (e *ActivityError) Error() string { return e.Msg }

var (
	ErrActivityNotMember       = &ActivityError{Msg: "你不在本次活动的任何小组中", Code: 403}
	ErrActivityNotCaptain      = &ActivityError{Msg: "仅队长可执行该操作", Code: 403}
	ErrActivityTeamNotFound    = &ActivityError{Msg: "小组不存在", Code: 404}
	ErrActivityMemberNotFound  = &ActivityError{Msg: "成员不存在", Code: 404}
	ErrActivityTileNotFound    = &ActivityError{Msg: "格子不存在", Code: 404}
	ErrActivityBookNotFound    = &ActivityError{Msg: "书目记录不存在", Code: 404}
	ErrActivityInvalidInput    = &ActivityError{Msg: "输入不合法", Code: 400}
	ErrActivityArchived        = &ActivityError{Msg: "活动周期已结束，页面为只读归档态", Code: 403}
	ErrActivityNotStarted      = &ActivityError{Msg: "活动尚未开始", Code: 403}
	ErrActivityTimerRunning    = &ActivityError{Msg: "惩罚计时中，期间无法打卡与掷骰", Code: 409}
	ErrActivityCompleted       = &ActivityError{Msg: "本队已完成活动", Code: 409}
	ErrActivityNotRollable     = &ActivityError{Msg: "当前不可掷骰，请先完成本格任务", Code: 409}
	ErrActivityRollInFlight    = &ActivityError{Msg: "本队有掷骰正在进行中，请稍后再试", Code: 409}
	ErrActivityNoJudgement     = &ActivityError{Msg: "当前格无特殊判定或状态不符", Code: 409}
	ErrActivityAlreadyRolled   = &ActivityError{Msg: "你已在本轮判定中掷过骰", Code: 409}
	ErrActivityJudgeIncomplete = &ActivityError{Msg: "尚有成员未掷骰，无法结算判定", Code: 409}
	ErrActivityDuplicateBook   = &ActivityError{Msg: "书目重复提交", Code: 409}
	ErrActivityReasonMissing   = &ActivityError{Msg: "驳回与撤销必须填写理由", Code: 400}
	ErrActivityNotEditable     = &ActivityError{Msg: "该打卡已进入终审，不可自行删除", Code: 409}
	ErrActivityAlreadyInTeam   = &ActivityError{Msg: "该用户已在某个小组中", Code: 409}
	ErrActivityNotEnrolled     = &ActivityError{Msg: "该用户尚未报名活动", Code: 409}
	ErrActivityTeamFull        = &ActivityError{Msg: "该队伍已满员", Code: 409}
	ErrActivityCaptainTaken    = &ActivityError{Msg: "该队伍已有队长，队长位不可重复选择", Code: 409}
	ErrActivityEmblemLocked    = &ActivityError{Msg: "队伍形象已确定，一次性选择后不可更换", Code: 409}
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

// requireWritable 校验活动周期：未开始或已归档都不允许写操作（P1-7）
func (s *ActivityService) requireWritable(now time.Time) error {
	if !hellboard.IsCycleStarted(now) {
		return ErrActivityNotStarted
	}
	if hellboard.IsArchived(now) {
		return ErrActivityArchived
	}
	return nil
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

// litTilesOf 队伍已点亮格子：编号 → 点亮方式。
// 同一格跨轮次可能有多条进度记录，按编号去重（验收标准 4：不重复计入点亮数）。
func (s *ActivityService) litTilesOf(ctx context.Context, teamID string) (map[int]string, error) {
	var rows []model.ActivityTeamProgress
	if err := dal.DB.WithContext(ctx).
		Where("team_id = ? AND lit = ?", teamID, true).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[int]string, len(rows))
	for _, r := range rows {
		if _, exists := out[r.TileIndex]; !exists {
			out[r.TileIndex] = r.LitReason
		}
	}
	return out, nil
}

// addEvent 写入队伍时间线（PRD 10.3）
func (s *ActivityService) addEvent(tx *gorm.DB, teamID, eventType, text string) error {
	return tx.Create(&model.ActivityEvent{
		TeamID: teamID,
		Type:   eventType,
		Text:   text,
	}).Error
}

// displayNameOf 成员展示名：优先昵称，回落用户名。
// User.DisplayName / Avatar 为 *string，统一在此解引用避免各处判空。
func displayNameOf(u *model.User) string {
	if u.DisplayName != nil && *u.DisplayName != "" {
		return *u.DisplayName
	}
	return u.Username
}

// memberNameOf 成员在活动内的展示名：优先报名昵称（入队时带入），
// 为空时回退到账号昵称
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

// lockForUpdate 行级排他锁。掷骰与审核都会改队伍进度，
// 必须串行化同一队伍的写操作（PRD 第 12 节掷骰幂等与并发保护）。
func lockForUpdate() clause.Locking {
	return clause.Locking{Strength: "UPDATE"}
}

// litTilesTx 事务内读取已点亮格子集合
func (s *ActivityService) litTilesTx(tx *gorm.DB, teamID string) (map[int]string, error) {
	var rows []model.ActivityTeamProgress
	if err := tx.Where("team_id = ? AND lit = ?", teamID, true).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[int]string, len(rows))
	for _, r := range rows {
		if _, exists := out[r.TileIndex]; !exists {
			out[r.TileIndex] = r.LitReason
		}
	}
	return out, nil
}

// progressRowTx 取队伍在「某格 + 某轮」的进度记录，不存在则创建。
// 跨轮次落入同一格时分轮记账（PRD 8.2）。
func (s *ActivityService) progressRowTx(tx *gorm.DB, teamID string, tileIndex, lap int) (*model.ActivityTeamProgress, error) {
	var row model.ActivityTeamProgress
	err := tx.Where("team_id = ? AND tile_index = ? AND lap = ?", teamID, tileIndex, lap).
		First(&row).Error
	if err == nil {
		return &row, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	row = model.ActivityTeamProgress{TeamID: teamID, TileIndex: tileIndex, Lap: lap}
	if err := tx.Create(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// markLitTx 点亮队伍当前轮次的某个格子。
// 已点亮过的格子重复完成不重复计数（P0-4 / 验收标准 4），
// 但仍会更新本轮记录的点亮方式，便于格子记录展示。
func (s *ActivityService) markLitTx(tx *gorm.DB, team *model.ActivityTeam, tileIndex int, reason string, now time.Time) error {
	row, err := s.progressRowTx(tx, team.ID, tileIndex, team.Lap)
	if err != nil {
		return err
	}
	if !row.Lit {
		row.Lit = true
		row.LitReason = reason
		row.LitAt = &now
		if err := tx.Model(row).Updates(map[string]any{
			"lit":        true,
			"lit_reason": reason,
			"lit_at":     now,
		}).Error; err != nil {
			return err
		}
	}
	// LastLitAt 用于周期结束时的并列比较（P1-7）
	team.LastLitAt = &now
	return nil
}
