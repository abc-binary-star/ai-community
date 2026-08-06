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

// DuplicateBookError 查重拦截错误，携带命中书名与所在格子，
// 便于前端提示「这本书已在第 N 格打卡」（P1-8 / 验收标准 10）。
type DuplicateBookError struct {
	Titles []string
	Detail map[string]int
}

func (e *DuplicateBookError) Error() string {
	return "书目已在本活动期内打卡过：" + strings.Join(e.Titles, "、")
}

// SubmitCheckIn 提交打卡。
//
// 提交前校验：活动周期内、成员身份、队伍可提交（非计时中/已完成）、书目查重。
// 提交后书目进入待初审，不直接改动任务进度——进度仅由人工终审累加（验收标准 2）。
func (s *ActivityService) SubmitCheckIn(ctx context.Context, userID string, req types.ActivityCheckInReq) (*types.ActivityCheckInDTO, error) {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return nil, err
	}
	if len(req.Books) == 0 {
		return nil, ErrActivityInvalidInput
	}

	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}

	var team model.ActivityTeam
	if err := dal.DB.WithContext(ctx).First(&team, "id = ?", me.TeamID).Error; err != nil {
		return nil, err
	}
	if team.Status == model.TeamStatusTimerRunning {
		return nil, ErrActivityTimerRunning
	}
	if team.Status == model.TeamStatusCompleted {
		return nil, ErrActivityCompleted
	}
	// 打卡格子必须是队伍当前所在格，避免绕过流程给未到达的格子刷进度
	if req.TileIndex != team.Position {
		return nil, ErrActivityInvalidInput
	}
	tile, err := s.getTile(ctx, req.TileIndex)
	if err != nil {
		return nil, err
	}
	// 计时惩罚格没有阅读任务，不接受打卡
	if tile.TaskType == model.TaskTypeTimedPenalty {
		return nil, ErrActivityTimerRunning
	}

	// 必填三要素校验 + 组内自查重
	seen := make(map[string]bool, len(req.Books))
	keys := make([]string, 0, len(req.Books))
	for i := range req.Books {
		b := &req.Books[i]
		b.Title = strings.TrimSpace(b.Title)
		b.Author = strings.TrimSpace(b.Author)
		if b.Title == "" || b.Author == "" || b.WordCount <= 0 {
			return nil, ErrActivityInvalidInput
		}
		key := hellboard.DedupKey(me.ID, b.Title, b.Author)
		if seen[key] {
			return nil, &DuplicateBookError{Titles: []string{b.Title}}
		}
		seen[key] = true
		keys = append(keys, key)
	}

	// 提交时查重：按「成员 + 书名 + 作者」比对全期已提交书目（P1-8）。
	// 已驳回 / 已撤销的书目不占名额，允许修正后重新提交。
	if dup, err := s.findDuplicates(ctx, me.ID, req.Books); err != nil {
		return nil, err
	} else if dup != nil {
		return nil, dup
	}

	// 审核路由（三档，按格子规则分派）：
	// 情况三封面类无法自动判定 → 直接进队长投票池；其余先走 AI 初审。
	initialStatus := model.ReviewStatusPendingAI
	if tile.TaskType == model.TaskTypeCoverColor {
		initialStatus = model.ReviewStatusInVoting
	}

	checkIn := model.ActivityCheckIn{
		TeamID:      team.ID,
		MemberID:    me.ID,
		TileIndex:   req.TileIndex,
		Lap:         team.Lap,
		EvidenceURL: strings.TrimSpace(req.EvidenceURL),
	}
	books := make([]model.ActivityCheckInBook, 0, len(req.Books))
	for _, b := range req.Books {
		books = append(books, model.ActivityCheckInBook{
			TeamID:          team.ID,
			MemberID:        me.ID,
			TileIndex:       req.TileIndex,
			Lap:             team.Lap,
			Title:           b.Title,
			Author:          b.Author,
			WordCount:       b.WordCount,
			DedupKey:        hellboard.DedupKey(me.ID, b.Title, b.Author),
			DurationMinutes: b.DurationMinutes,
			CoverURL:        strings.TrimSpace(b.CoverURL),
			Genre:           strings.TrimSpace(b.Genre),
			Note:            strings.TrimSpace(b.Note),
			ReviewStatus:    initialStatus,
			CountsForTask:   true,
		})
	}

	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 驳回重提修复：已驳回/已撤销的同名书仍占着 DedupKey 唯一索引，
		// 查重虽已放行，落库仍会撞唯一约束。在事务内先清掉旧占位行。
		if err := tx.Where("member_id = ? AND dedup_key IN ? AND review_status IN ?",
			me.ID, keys,
			[]string{model.ReviewStatusRejected, model.ReviewStatusRevoked}).
			Delete(&model.ActivityCheckInBook{}).Error; err != nil {
			return err
		}
		if err := tx.Create(&checkIn).Error; err != nil {
			return err
		}
		for i := range books {
			books[i].CheckInID = checkIn.ID
		}
		// 唯一索引兜住并发重复提交：两个请求同时过了查重也只有一个能落库
		if err := tx.Create(&books).Error; err != nil {
			if isUniqueViolation(err) {
				return ErrActivityDuplicateBook
			}
			return err
		}
		return s.addEvent(tx, team.ID, model.EventTypeCheckIn,
			fmt.Sprintf("%s 在第 %d 格提交 %d 本书目，等待审核", s.memberName(ctx, me), req.TileIndex, len(books)))
	})
	if err != nil {
		return nil, err
	}

	// AI 初审异步触发，失败不阻断提交（PRD 9.4）。封面类已直进投票池，不再跑 AI。
	if initialStatus == model.ReviewStatusPendingAI {
		go runAIPreReview(books)
	}

	checkIn.Books = books
	dto := s.checkInToDTO(ctx, &checkIn, me)
	return &dto, nil
}

// findDuplicates 查重：命中则返回携带书名与格子编号的错误
func (s *ActivityService) findDuplicates(ctx context.Context, memberID string, books []types.ActivityBookReq) (*DuplicateBookError, error) {
	keys := make([]string, 0, len(books))
	keyToTitle := make(map[string]string, len(books))
	for _, b := range books {
		k := hellboard.DedupKey(memberID, b.Title, b.Author)
		keys = append(keys, k)
		keyToTitle[k] = b.Title
	}

	var rows []model.ActivityCheckInBook
	if err := dal.DB.WithContext(ctx).
		Select("dedup_key", "tile_index").
		Where("dedup_key IN ?", keys).
		// 已驳回或已撤销的书目不占用查重名额，允许修正后重新提交
		Where("review_status NOT IN ?", []string{model.ReviewStatusRejected, model.ReviewStatusRevoked}).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	out := &DuplicateBookError{Detail: map[string]int{}}
	for _, r := range rows {
		title := keyToTitle[r.DedupKey]
		out.Titles = append(out.Titles, title)
		out.Detail[title] = r.TileIndex
	}
	return out, nil
}

// isUniqueViolation 判断是否唯一索引冲突。
// 不引入 pq 依赖，按错误文本匹配，覆盖 PostgreSQL 的 23505。
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "23505")
}

// bookToDTO 书目转 DTO
func bookToDTO(b *model.ActivityCheckInBook, memberName, teamName string) types.ActivityBookDTO {
	return types.ActivityBookDTO{
		ID:              b.ID,
		CheckInID:       b.CheckInID,
		MemberID:        b.MemberID,
		MemberName:      memberName,
		TeamID:          b.TeamID,
		TeamName:        teamName,
		TileIndex:       b.TileIndex,
		Lap:             b.Lap,
		Title:           b.Title,
		Author:          b.Author,
		WordCount:       b.WordCount,
		DurationMinutes: b.DurationMinutes,
		CoverURL:        b.CoverURL,
		Genre:           b.Genre,
		Note:            b.Note,
		ReviewStatus:    b.ReviewStatus,
		CountsForTask:   b.CountsForTask,
		AIStatus:        b.AIStatus,
		AIConfidence:    b.AIConfidence,
		AIReason:        b.AIReason,
		CreatedAt:       b.CreatedAt.Format(time.RFC3339),
	}
}

// checkInToDTO 打卡转 DTO
func (s *ActivityService) checkInToDTO(ctx context.Context, c *model.ActivityCheckIn, me *model.ActivityMember) types.ActivityCheckInDTO {
	name := s.memberName(ctx, me)
	books := make([]types.ActivityBookDTO, 0, len(c.Books))
	for i := range c.Books {
		books = append(books, bookToDTO(&c.Books[i], name, ""))
	}
	return types.ActivityCheckInDTO{
		ID:          c.ID,
		TileIndex:   c.TileIndex,
		TeamID:      c.TeamID,
		MemberID:    c.MemberID,
		MemberName:  name,
		Lap:         c.Lap,
		Books:       books,
		EvidenceURL: c.EvidenceURL,
		CreatedAt:   c.CreatedAt.Format(time.RFC3339),
	}
}

// ListMyTeamCheckIns 本队打卡列表，供队伍面板与格子记录使用
func (s *ActivityService) ListMyTeamCheckIns(ctx context.Context, userID string) ([]types.ActivityCheckInDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}

	var checkIns []model.ActivityCheckIn
	if err := dal.DB.WithContext(ctx).
		Preload("Books").
		Where("team_id = ?", me.TeamID).
		Order("created_at desc").
		Limit(200).
		Find(&checkIns).Error; err != nil {
		return nil, err
	}

	names, err := s.memberNames(ctx, me.TeamID)
	if err != nil {
		return nil, err
	}

	out := make([]types.ActivityCheckInDTO, 0, len(checkIns))
	for i := range checkIns {
		c := &checkIns[i]
		name := names[c.MemberID]
		books := make([]types.ActivityBookDTO, 0, len(c.Books))
		for j := range c.Books {
			books = append(books, bookToDTO(&c.Books[j], name, ""))
		}
		out = append(out, types.ActivityCheckInDTO{
			ID:          c.ID,
			TileIndex:   c.TileIndex,
			TeamID:      c.TeamID,
			MemberID:    c.MemberID,
			MemberName:  name,
			Lap:         c.Lap,
			Books:       books,
			EvidenceURL: c.EvidenceURL,
			CreatedAt:   c.CreatedAt.Format(time.RFC3339),
		})
	}
	return out, nil
}

// ListMyBooks 我的打卡，按状态分组（「我的打卡」标签页三栏）：
// pending = 未审核（AI 待审 / 队长投票中）；approved = 已通过；rejected = 已驳回 / 已撤销。
func (s *ActivityService) ListMyBooks(ctx context.Context, userID, status string) ([]types.ActivityBookDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}

	q := dal.DB.WithContext(ctx).Model(&model.ActivityCheckInBook{}).Where("member_id = ?", me.ID)
	switch status {
	case "approved":
		q = q.Where("review_status = ?", model.ReviewStatusApproved)
	case "rejected":
		q = q.Where("review_status IN ?", []string{model.ReviewStatusRejected, model.ReviewStatusRevoked})
	default:
		q = q.Where("review_status IN ?", []string{
			model.ReviewStatusPendingAI,
			model.ReviewStatusAIPassed,
			model.ReviewStatusAIUnsure,
			model.ReviewStatusAIRejected,
			model.ReviewStatusInVoting,
		})
	}
	var books []model.ActivityCheckInBook
	if err := q.Order("created_at desc").Limit(200).Find(&books).Error; err != nil {
		return nil, err
	}
	if len(books) == 0 {
		return []types.ActivityBookDTO{}, nil
	}

	names, err := s.memberNames(ctx, "")
	if err != nil {
		return nil, err
	}
	teamNames, err := s.teamNames(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.ActivityBookDTO, 0, len(books))
	for i := range books {
		b := &books[i]
		out = append(out, bookToDTO(b, names[b.MemberID], teamNames[b.TeamID]))
	}
	return out, nil
}

// memberNames 队伍成员 id → 展示名
func (s *ActivityService) memberNames(ctx context.Context, teamID string) (map[string]string, error) {
	var members []model.ActivityMember
	q := dal.DB.WithContext(ctx).Preload("User")
	if teamID != "" {
		q = q.Where("team_id = ?", teamID)
	}
	if err := q.Find(&members).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(members))
	for i := range members {
		m := &members[i]
		out[m.ID] = displayNameOf(&m.User)
	}
	return out, nil
}

// DeleteCheckIn 成员自行删除未进入终审的打卡；队长可撤回本队任意未审打卡（PRD 8.4）
func (s *ActivityService) DeleteCheckIn(ctx context.Context, userID, checkInID string) error {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return err
	}
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return err
	}

	var checkIn model.ActivityCheckIn
	if err := dal.DB.WithContext(ctx).Preload("Books").First(&checkIn, "id = ?", checkInID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrActivityBookNotFound
		}
		return err
	}
	// 本人可删自己的，队长可撤回本队任意未审打卡
	if checkIn.MemberID != me.ID && !(me.IsCaptain && checkIn.TeamID == me.TeamID) {
		return ErrActivityNotMember
	}
	// 已通过审核的打卡仅管理员可撤销（PRD 8.4）
	for _, b := range checkIn.Books {
		if b.ReviewStatus == model.ReviewStatusApproved {
			return ErrActivityNotEditable
		}
	}

	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&model.ActivityCheckIn{}, "id = ?", checkInID).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.ActivityCheckInBook{}, "check_in_id = ?", checkInID).Error; err != nil {
			return err
		}
		return s.addEvent(tx, checkIn.TeamID, model.EventTypeCheckIn,
			fmt.Sprintf("撤回了第 %d 格的一次打卡（%d 本书目）", checkIn.TileIndex, len(checkIn.Books)))
	})
}

// ListTimeline 队伍时间线（PRD 10.3）
func (s *ActivityService) ListTimeline(ctx context.Context, userID string) ([]types.ActivityEventDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	var events []model.ActivityEvent
	if err := dal.DB.WithContext(ctx).
		Where("team_id = ?", me.TeamID).
		Order("created_at desc").
		Limit(100).
		Find(&events).Error; err != nil {
		return nil, err
	}
	out := make([]types.ActivityEventDTO, 0, len(events))
	for _, e := range events {
		out = append(out, types.ActivityEventDTO{
			ID:        e.ID,
			Type:      e.Type,
			Text:      e.Text,
			CreatedAt: e.CreatedAt.Format(time.RFC3339),
		})
	}
	return out, nil
}

// memberName 成员展示名。未预加载 User 时回查一次数据库
func (s *ActivityService) memberName(ctx context.Context, m *model.ActivityMember) string {
	if m.User.Username != "" {
		return displayNameOf(&m.User)
	}
	var u model.User
	if err := dal.DB.WithContext(ctx).Select("username", "display_name").First(&u, "id = ?", m.UserID).Error; err != nil {
		return "成员"
	}
	return displayNameOf(&u)
}
