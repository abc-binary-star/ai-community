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

// requiresAuthor 该任务类型是否必填作者：
// 作者国籍 / 同一作者 / 群内交叉需要作者信息参与判定，其余格子作者选填。
func requiresAuthor(taskType string) bool {
	switch taskType {
	case model.TaskTypeAuthorNationality, model.TaskTypeSameAuthor, model.TaskTypeGroupCross:
		return true
	}
	return false
}

// requiresWordCount 该任务类型是否必填字数：仅累计字数格需要。
func requiresWordCount(taskType string) bool {
	return taskType == model.TaskTypeTotalWords
}

// SubmitCheckIn 提交打卡。
//
// 提交前校验：活动周期内、成员身份、队伍可提交（非计时中/已完成）、书目查重。
// 提交后书目进入待初审，不直接改动任务进度——进度仅由人工终审累加（验收标准 2）。
func (s *ActivityService) SubmitCheckIn(ctx context.Context, userID string, req types.ActivityCheckInReq) (*types.ActivityCheckInDTO, error) {
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.submitCheckInFor(ctx, me, req)
}

// AdminSubmitCheckIn 管理员代成员补打卡（审批台「补卡」入口）。
// 打卡归属目标成员（me），其余提交校验与正常打卡完全一致；
// 权限由路由层 RequireRole("admin","moderator") 兜底。
func (s *ActivityService) AdminSubmitCheckIn(ctx context.Context, memberID string, req types.ActivityCheckInReq) (*types.ActivityCheckInDTO, error) {
	var me model.ActivityMember
	if err := dal.DB.WithContext(ctx).First(&me, "id = ?", memberID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityMemberNotFound
		}
		return nil, err
	}
	return s.submitCheckInFor(ctx, &me, req)
}

// submitCheckInFor 打卡核心逻辑，调用方负责定位打卡成员 me。
func (s *ActivityService) submitCheckInFor(ctx context.Context, me *model.ActivityMember, req types.ActivityCheckInReq) (*types.ActivityCheckInDTO, error) {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return nil, err
	}
	if len(req.Books) == 0 {
		return nil, ErrActivityInvalidInput
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
	// 打卡目标格：队伍当前格（正常打卡）或本队已点亮的历史格（补卡，
	// 用于活动已开始后补录线下完成的格子）。其余格子不允许刷进度。
	litTiles, err := s.litTilesOf(ctx, team.ID)
	if err != nil {
		return nil, err
	}
	if req.TileIndex != team.Position {
		if _, lit := litTiles[req.TileIndex]; !lit {
			return nil, ErrActivityInvalidInput
		}
	}
	tile, err := s.getTile(ctx, req.TileIndex)
	if err != nil {
		return nil, err
	}
	// 计时惩罚格没有阅读任务，不接受打卡
	if tile.TaskType == model.TaskTypeTimedPenalty {
		return nil, ErrActivityTimerRunning
	}

	// 补卡到已点亮的历史格时，记录到该格点亮的那一轮（lap），
	// 保底计数才能分轮记账；当前格打卡用队伍当前 lap
	lap := team.Lap
	if req.TileIndex != team.Position {
		if l, err := s.litLapOf(ctx, team.ID, req.TileIndex); err != nil {
			return nil, err
		} else if l > 0 {
			lap = l
		}
	}

	// 按格子任务类型校验必填项：书名必填；作者仅作者相关格必填，
	// 字数仅累计字数格必填；其余格子只需书名即可（PRD 8.1 调整）。
	// 组内自查重
	seen := make(map[string]bool, len(req.Books))
	keys := make([]string, 0, len(req.Books))
	for i := range req.Books {
		b := &req.Books[i]
		b.Title = strings.TrimSpace(b.Title)
		b.Author = strings.TrimSpace(b.Author)
		if b.Title == "" {
			return nil, ErrActivityInvalidInput
		}
		if requiresAuthor(tile.TaskType) && b.Author == "" {
			return nil, ErrActivityInvalidInput
		}
		// 非作者相关格作者选填：未填时用「未知」占位，保证展示与查重键稳定
		if b.Author == "" {
			b.Author = "未知"
		}
		// 字数未填时为 0；仅累计字数格强制要求
		if requiresWordCount(tile.TaskType) && b.WordCount <= 0 {
			return nil, ErrActivityInvalidInput
		}
		// 累计时长格必填阅读时长，避免 0 分钟提交进审核流
		if tile.TaskType == model.TaskTypeTotalDuration && b.DurationMinutes <= 0 {
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
	// 封面颜色类主观性强，不做 AI 初审，直接进队长投票池由人工判断；
	// 其余任务类型先走 AI 初审（本地规则 + 大模型，见 activity_ai_review.go）。
	initialStatus := model.ReviewStatusPendingAI
	if tile.TaskType == model.TaskTypeCoverColor {
		initialStatus = model.ReviewStatusInVoting
	}

	checkIn := model.ActivityCheckIn{
		TeamID:      team.ID,
		MemberID:    me.ID,
		TileIndex:   req.TileIndex,
		Lap:         lap,
		EvidenceURL: strings.TrimSpace(req.EvidenceURL),
	}
	books := make([]model.ActivityCheckInBook, 0, len(req.Books))
	for _, b := range req.Books {
		books = append(books, model.ActivityCheckInBook{
			TeamID:          team.ID,
			MemberID:        me.ID,
			TileIndex:       req.TileIndex,
			Lap:             lap,
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

// UpdateCheckIn 成员修改自己历史打卡的内容（心得/字数/时长/书名/作者）。
//
// 修改按书目 dedup_key（成员+书名+作者归一化）匹配：
//   - 同名书：更新字段；若该书已通过审核（approved）且字数/时长变化，
//     先回滚旧贡献再按新值重新累加（进度 / 榜单 / 保底随之重算）；
//   - 新增书：走与首次提交一致的审核路由（查重 + 待初审），
//     封面类直进投票池，其余触发异步 AI 初审；
//   - 移除书：已通过的回滚贡献后删除，未审核的直接删除。
//
// 打卡格子（tileIndex / lap）不允许修改：改动内容不改变归属格。
func (s *ActivityService) UpdateCheckIn(ctx context.Context, userID, checkInID string, req types.ActivityCheckInReq) (*types.ActivityCheckInDTO, error) {
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

	var out *types.ActivityCheckInDTO
	// 新增书目收集在事务外，事务提交后异步触发 AI 初审
	var aiBooks []model.ActivityCheckInBook
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 锁行并预加载书目，避免与审核并发读到旧内容
		var checkIn model.ActivityCheckIn
		if err := tx.Clauses(lockForUpdate()).Preload("Books").First(&checkIn, "id = ?", checkInID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return ErrActivityBookNotFound
			}
			return err
		}
		if checkIn.MemberID != me.ID {
			return ErrActivityNotMember
		}

		var team model.ActivityTeam
		if err := tx.First(&team, "id = ?", checkIn.TeamID).Error; err != nil {
			return err
		}
		if team.Status == model.TeamStatusTimerRunning {
			return ErrActivityTimerRunning
		}
		if team.Status == model.TeamStatusCompleted {
			return ErrActivityCompleted
		}
		tile, err := s.getTileTx(tx, checkIn.TileIndex)
		if err != nil {
			return err
		}
		if tile.TaskType == model.TaskTypeTimedPenalty {
			return ErrActivityTimerRunning
		}

		// 新书目校验（口径与首次提交一致）：书名必填、作者/字数按格子要求、组内查重
		seen := make(map[string]bool, len(req.Books))
		keys := make([]string, 0, len(req.Books))
		for i := range req.Books {
			b := &req.Books[i]
			b.Title = strings.TrimSpace(b.Title)
			b.Author = strings.TrimSpace(b.Author)
			if b.Title == "" {
				return ErrActivityInvalidInput
			}
			if requiresAuthor(tile.TaskType) && b.Author == "" {
				return ErrActivityInvalidInput
			}
			if b.Author == "" {
				b.Author = "未知"
			}
			if requiresWordCount(tile.TaskType) && b.WordCount <= 0 {
				return ErrActivityInvalidInput
			}
			if tile.TaskType == model.TaskTypeTotalDuration && b.DurationMinutes <= 0 {
				return ErrActivityInvalidInput
			}
			key := hellboard.DedupKey(me.ID, b.Title, b.Author)
			if seen[key] {
				return &DuplicateBookError{Titles: []string{b.Title}}
			}
			seen[key] = true
			keys = append(keys, key)
		}

		// 新书查重（排除自身）：命中其他未驳回记录则拦截。
		// 自身 checkIn 内同名书在上一步组内查重已拦截，不会走到新增分支。
		var newBooks []types.ActivityBookReq
		for i := range req.Books {
			b := req.Books[i]
			key := hellboard.DedupKey(me.ID, b.Title, b.Author)
			isUpdate := false
			for j := range checkIn.Books {
				if checkIn.Books[j].DedupKey == key {
					isUpdate = true
					break
				}
			}
			if !isUpdate {
				newBooks = append(newBooks, b)
			}
		}
		if len(newBooks) > 0 {
			if dup, err := s.findDuplicates(ctx, me.ID, newBooks); err != nil {
				return err
			} else if dup != nil {
				return dup
			}
		}

		// 审核路由：封面类直进投票池，其余待初审
		initialStatus := model.ReviewStatusPendingAI
		if tile.TaskType == model.TaskTypeCoverColor {
			initialStatus = model.ReviewStatusInVoting
		}

		oldByKey := make(map[string]*model.ActivityCheckInBook, len(checkIn.Books))
		for i := range checkIn.Books {
			oldByKey[checkIn.Books[i].DedupKey] = &checkIn.Books[i]
		}

		// 1) 移除的旧书：已通过的回滚贡献，再删除
		for i := range checkIn.Books {
			old := &checkIn.Books[i]
			if seen[old.DedupKey] {
				continue
			}
			if old.ReviewStatus == model.ReviewStatusApproved {
				if err := s.rollbackApproval(tx, old); err != nil {
					return err
				}
			}
			if err := tx.Delete(&model.ActivityCheckInBook{}, "id = ?", old.ID).Error; err != nil {
				return err
			}
		}

		// 2) 更新同名书 / 新增书
		for i := range req.Books {
			b := req.Books[i]
			key := hellboard.DedupKey(me.ID, b.Title, b.Author)
			book := model.ActivityCheckInBook{
				CheckInID:       checkIn.ID,
				TeamID:          checkIn.TeamID,
				MemberID:        checkIn.MemberID,
				TileIndex:       checkIn.TileIndex,
				Lap:             checkIn.Lap,
				Title:           b.Title,
				Author:          b.Author,
				WordCount:       b.WordCount,
				DedupKey:        key,
				DurationMinutes: b.DurationMinutes,
				CoverURL:        strings.TrimSpace(b.CoverURL),
				Genre:           strings.TrimSpace(b.Genre),
				Note:            strings.TrimSpace(b.Note),
				ReviewStatus:    initialStatus,
				CountsForTask:   true,
			}

			if old, ok := oldByKey[key]; ok {
				// 已通过的书修改字数/时长：先回滚旧贡献，再按新值重新累加
				if old.ReviewStatus == model.ReviewStatusApproved &&
					(old.WordCount != b.WordCount || old.DurationMinutes != b.DurationMinutes) {
					if err := s.rollbackApproval(tx, old); err != nil {
						return err
					}
				}
				book.ID = old.ID
				// 保持原有审核状态；已通过的保持通过（内容修正不重审），
				// 未通过 / 被驳回的保持原状态，仅更新内容字段
				book.ReviewStatus = old.ReviewStatus
				book.AIStatus = old.AIStatus
				book.AIConfidence = old.AIConfidence
				book.AIReason = old.AIReason
				if err := tx.Model(&model.ActivityCheckInBook{}).Where("id = ?", old.ID).Updates(map[string]any{
					"title":            book.Title,
					"author":           book.Author,
					"word_count":       book.WordCount,
					"dedup_key":        book.DedupKey,
					"duration_minutes": book.DurationMinutes,
					"cover_url":        book.CoverURL,
					"genre":            book.Genre,
					"note":             book.Note,
				}).Error; err != nil {
					return err
				}
				// 已通过且内容修正：用新值重新累加进度 / 榜单 / 保底
				if book.ReviewStatus == model.ReviewStatusApproved {
					if err := s.applyApproval(tx, &book, true); err != nil {
						return err
					}
				}
			} else {
				// 新增书目：落库后待初审 / 投票池
				if err := tx.Create(&book).Error; err != nil {
					if isUniqueViolation(err) {
						return ErrActivityDuplicateBook
					}
					return err
				}
				// 封面类已直进投票池，不触发 AI 初审
				if book.ReviewStatus == model.ReviewStatusPendingAI {
					aiBooks = append(aiBooks, book)
				}
			}
		}

		if err := tx.Model(&model.ActivityCheckIn{}).Where("id = ?", checkIn.ID).
			Update("evidence_url", strings.TrimSpace(req.EvidenceURL)).Error; err != nil {
			return err
		}

		// 时间线事件（PRD 10.3）
		if err := s.addEvent(tx, checkIn.TeamID, model.EventTypeCheckIn,
			fmt.Sprintf("%s 修改了第 %d 格的打卡内容（%d 本书目）", s.memberName(ctx, me), checkIn.TileIndex, len(req.Books))); err != nil {
			return err
		}

		// 重新加载最新书目，用于构造 DTO
		var books []model.ActivityCheckInBook
		if err := tx.Where("check_in_id = ?", checkIn.ID).Find(&books).Error; err != nil {
			return err
		}
		checkIn.Books = books
		checkIn.EvidenceURL = strings.TrimSpace(req.EvidenceURL)
		dto := s.checkInToDTO(ctx, &checkIn, me)
		out = &dto
		return nil
	})
	if err != nil {
		return nil, err
	}

	// 新增书目异步触发 AI 初审，失败不阻断修改
	if len(aiBooks) > 0 {
		go runAIPreReview(aiBooks)
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

	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 事务内加锁重新加载并复检，避免与审核并发时出现「读旧状态 → 删除」的 TOCTOU 竞态：
		// 若事务外读取时不加锁，审核恰好在此间通过，删除仍会执行并造成进度已累加但书目被删
		var checkIn model.ActivityCheckIn
		if err := tx.Clauses(lockForUpdate()).Preload("Books").First(&checkIn, "id = ?", checkInID).Error; err != nil {
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
