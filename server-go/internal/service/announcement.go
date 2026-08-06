package service

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// AnnouncementService 官方公告服务
type AnnouncementService struct{}

// AnnouncementError 公告业务错误
type AnnouncementError struct {
	Msg  string
	Code int
}

func (e *AnnouncementError) Error() string { return e.Msg }

var (
	ErrAnnouncementNotFound     = &AnnouncementError{Msg: "公告不存在或已下线", Code: 404}
	ErrAnnouncementInvalidInput = &AnnouncementError{Msg: "输入不合法", Code: 400}
	ErrAnnouncementUrgentExists = &AnnouncementError{Msg: "已有紧急公告生效中，请先下线或降级旧公告", Code: 409}
	ErrAnnouncementPublishedDel = &AnnouncementError{Msg: "已发布公告不能删除，请先下线", Code: 400}
	ErrAnnouncementCategoryLock = &AnnouncementError{Msg: "公告分类不允许修改，请下线后重新发布", Code: 400}
)

var validAnnouncementCategories = map[string]bool{
	model.AnnouncementCategoryModeration:  true,
	model.AnnouncementCategoryRule:        true,
	model.AnnouncementCategoryFeature:     true,
	model.AnnouncementCategoryMaintenance: true,
	model.AnnouncementCategoryActivity:    true,
}

var validAnnouncementLevels = map[string]bool{
	model.AnnouncementLevelUrgent:    true,
	model.AnnouncementLevelImportant: true,
	model.AnnouncementLevelNormal:    true,
}

var validAnnouncementStatuses = map[string]bool{
	model.AnnouncementStatusDraft:     true,
	model.AnnouncementStatusPublished: true,
	model.AnnouncementStatusOffline:   true,
}

// Create 创建公告；status 为空时按草稿保存。
func (s *AnnouncementService) Create(ctx context.Context, authorID string, req types.CreateAnnouncementReq) (*types.Announcement, error) {
	title := strings.TrimSpace(req.Title)
	content := strings.TrimSpace(req.Content)
	category := req.Category
	level := req.Level
	status := req.Status
	if status == "" {
		status = model.AnnouncementStatusDraft
	}
	if len([]rune(title)) < 1 || len([]rune(title)) > 100 {
		return nil, ErrAnnouncementInvalidInput
	}
	if len([]rune(content)) < 1 || len([]rune(content)) > 20000 {
		return nil, ErrAnnouncementInvalidInput
	}
	if !validAnnouncementCategories[category] || !validAnnouncementLevels[level] || !validAnnouncementStatuses[status] {
		return nil, ErrAnnouncementInvalidInput
	}
	if len(req.PenaltyList) > 0 && category != model.AnnouncementCategoryModeration {
		return nil, ErrAnnouncementInvalidInput
	}

	publishAt, err := parseAnnouncementTime(req.PublishAt, time.Now())
	if err != nil {
		return nil, ErrAnnouncementInvalidInput
	}
	if req.PublishAt != nil && strings.TrimSpace(*req.PublishAt) != "" && publishAt.Before(time.Now().Add(-time.Minute)) {
		return nil, ErrAnnouncementInvalidInput
	}
	expireAt, err := parseOptionalAnnouncementTime(req.ExpireAt)
	if err != nil || (expireAt != nil && !expireAt.After(publishAt)) {
		return nil, ErrAnnouncementInvalidInput
	}

	penaltyRaw, err := marshalPenaltyList(req.PenaltyList)
	if err != nil {
		return nil, ErrAnnouncementInvalidInput
	}

	if status == model.AnnouncementStatusPublished && level == model.AnnouncementLevelUrgent {
		if err := ensureUrgentUnique(ctx, ""); err != nil {
			return nil, err
		}
	}

	a := &model.Announcement{
		Title:       title,
		Content:     content,
		Category:    category,
		Level:       level,
		Status:      status,
		IsPinned:    req.IsPinned,
		PublishAt:   publishAt,
		ExpireAt:    expireAt,
		PenaltyList: penaltyRaw,
		AuthorID:    authorID,
	}
	if err := dal.DB.WithContext(ctx).Create(a).Error; err != nil {
		log.Printf("[Announcement/Create] 创建失败, authorID=%s, err=%v", authorID, err)
		return nil, err
	}
	if err := dal.DB.WithContext(ctx).Preload("Author").First(a, "id = ?", a.ID).Error; err != nil {
		return nil, err
	}
	dto := announcementToDTO(a, false)
	return &dto, nil
}

// List 公告列表；status 仅在 admin/moderator 调用时生效，否则只返回当前生效公告。
func (s *AnnouncementService) List(ctx context.Context, userID, category, status string, page, pageSize int) (*types.Paginated[types.AnnouncementSummary], error) {
	manager := isAnnouncementManager(ctx, userID)
	if category != "" && !validAnnouncementCategories[category] {
		return nil, ErrAnnouncementInvalidInput
	}

	countQuery := dal.DB.WithContext(ctx).Model(&model.Announcement{})
	listQuery := dal.DB.WithContext(ctx).Model(&model.Announcement{})
	if status != "" && manager {
		if !validAnnouncementStatuses[status] {
			return nil, ErrAnnouncementInvalidInput
		}
		countQuery = countQuery.Where("status = ?", status)
		listQuery = listQuery.Where("status = ?", status)
	} else {
		now := time.Now()
		countQuery = applyEffectiveFilter(countQuery, now)
		listQuery = applyEffectiveFilter(listQuery, now)
	}
	if category != "" {
		countQuery = countQuery.Where("category = ?", category)
		listQuery = listQuery.Where("category = ?", category)
	}

	var total int64
	if err := countQuery.Count(&total).Error; err != nil {
		log.Printf("[Announcement/List] 统计失败, err=%v", err)
		return nil, err
	}
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 50 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var rows []model.Announcement
	if err := listQuery.Preload("Author").
		Order("is_pinned DESC, publish_at DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		log.Printf("[Announcement/List] 查询失败, err=%v", err)
		return nil, err
	}

	ids := make([]string, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}
	readSet, userCreatedAt := loadAnnouncementReadState(ctx, userID, ids)
	items := make([]types.AnnouncementSummary, 0, len(rows))
	for i := range rows {
		items = append(items, *announcementSummaryToDTO(&rows[i], readSet, userCreatedAt))
	}
	return &types.Paginated[types.AnnouncementSummary]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// Get 公告详情；非 admin 只可读取当前生效公告。
func (s *AnnouncementService) Get(ctx context.Context, id, userID string) (*types.Announcement, error) {
	var a model.Announcement
	if err := dal.DB.WithContext(ctx).Preload("Author").First(&a, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrAnnouncementNotFound
		}
		return nil, err
	}
	if !isAnnouncementAdmin(ctx, userID) && !isEffectiveAnnouncement(&a, time.Now()) {
		return nil, ErrAnnouncementNotFound
	}
	readSet, userCreatedAt := loadAnnouncementReadState(ctx, userID, []string{a.ID})
	dto := announcementToDTO(&a, readSet[a.ID] || (userCreatedAt != nil && !a.PublishAt.After(*userCreatedAt)))
	return &dto, nil
}

// GetBanner 返回当前生效横幅，最多一条；紧急优先，同级取最新。
func (s *AnnouncementService) GetBanner(ctx context.Context) (*types.AnnouncementBanner, error) {
	now := time.Now()
	var a model.Announcement
	err := dal.DB.WithContext(ctx).
		Preload("Author").
		Where("status = ? AND publish_at <= ? AND (expire_at IS NULL OR expire_at > ?) AND level IN ?",
			model.AnnouncementStatusPublished, now, now, []string{model.AnnouncementLevelUrgent, model.AnnouncementLevelImportant}).
		Order("CASE level WHEN 'urgent' THEN 0 ELSE 1 END").
		Order("publish_at DESC").
		First(&a).Error
	if err == gorm.ErrRecordNotFound {
		return &types.AnnouncementBanner{}, nil
	}
	if err != nil {
		log.Printf("[Announcement/Banner] 查询失败, err=%v", err)
		return nil, err
	}
	dto := announcementSummaryToDTO(&a, nil, nil)
	return &types.AnnouncementBanner{Item: dto}, nil
}

// UnreadCount 未读数：生效公告且发布时间晚于注册时间，减去已读集合。
func (s *AnnouncementService) UnreadCount(ctx context.Context, userID string) (int64, error) {
	var user model.User
	if err := dal.DB.WithContext(ctx).Select("created_at").First(&user, "id = ?", userID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, nil
		}
		return 0, err
	}
	now := time.Now()
	var ids []string
	if err := dal.DB.WithContext(ctx).Model(&model.Announcement{}).
		Where("status = ? AND publish_at <= ? AND (expire_at IS NULL OR expire_at > ?) AND publish_at > ?",
			model.AnnouncementStatusPublished, now, now, user.CreatedAt).
		Pluck("id", &ids).Error; err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, nil
	}
	var readCount int64
	if err := dal.DB.WithContext(ctx).Model(&model.AnnouncementRead{}).
		Where("announcement_id IN ? AND user_id = ?", ids, userID).
		Count(&readCount).Error; err != nil {
		return 0, err
	}
	if int64(len(ids)) < readCount {
		return 0, nil
	}
	return int64(len(ids)) - readCount, nil
}

// MarkRead 标记单条公告已读，唯一索引冲突时按成功处理。
func (s *AnnouncementService) MarkRead(ctx context.Context, id, userID string) error {
	now := time.Now()
	var count int64
	if err := dal.DB.WithContext(ctx).Model(&model.Announcement{}).
		Where("id = ? AND status = ? AND publish_at <= ? AND (expire_at IS NULL OR expire_at > ?)",
			id, model.AnnouncementStatusPublished, now, now).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return ErrAnnouncementNotFound
	}
	read := model.AnnouncementRead{AnnouncementID: id, UserID: userID}
	err := dal.DB.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "announcement_id"}, {Name: "user_id"}},
		DoNothing: true,
	}).Create(&read).Error
	return err
}

// ReadAll 将当前全部生效公告标记为已读。
func (s *AnnouncementService) ReadAll(ctx context.Context, userID string) error {
	now := time.Now()
	var ids []string
	if err := dal.DB.WithContext(ctx).Model(&model.Announcement{}).
		Where("status = ? AND publish_at <= ? AND (expire_at IS NULL OR expire_at > ?)",
			model.AnnouncementStatusPublished, now, now).
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	reads := make([]model.AnnouncementRead, 0, len(ids))
	for _, id := range ids {
		reads = append(reads, model.AnnouncementRead{AnnouncementID: id, UserID: userID})
	}
	return dal.DB.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "announcement_id"}, {Name: "user_id"}},
		DoNothing: true,
	}).CreateInBatches(reads, 200).Error
}

// Update 编辑公告；分类不可修改，已发布公告编辑正文/标题后标记已编辑。
func (s *AnnouncementService) Update(ctx context.Context, id, userID string, req types.UpdateAnnouncementReq) (*types.Announcement, error) {
	if req.Category != nil {
		return nil, ErrAnnouncementCategoryLock
	}
	var a model.Announcement
	if err := dal.DB.WithContext(ctx).First(&a, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrAnnouncementNotFound
		}
		return nil, err
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if len([]rune(title)) < 1 || len([]rune(title)) > 100 {
			return nil, ErrAnnouncementInvalidInput
		}
		if title != a.Title {
			updates["title"] = title
			if a.Status == model.AnnouncementStatusPublished || a.Status == model.AnnouncementStatusOffline {
				updates["edited"] = true
			}
		}
	}
	if req.Content != nil {
		content := strings.TrimSpace(*req.Content)
		if len([]rune(content)) < 1 || len([]rune(content)) > 20000 {
			return nil, ErrAnnouncementInvalidInput
		}
		if content != a.Content {
			updates["content"] = content
			if a.Status == model.AnnouncementStatusPublished || a.Status == model.AnnouncementStatusOffline {
				updates["edited"] = true
			}
		}
	}
	if req.Level != nil {
		if !validAnnouncementLevels[*req.Level] {
			return nil, ErrAnnouncementInvalidInput
		}
		if *req.Level != a.Level {
			updates["level"] = *req.Level
			if a.Status == model.AnnouncementStatusPublished && *req.Level == model.AnnouncementLevelUrgent {
				if err := ensureUrgentUnique(ctx, id); err != nil {
					return nil, err
				}
			}
		}
	}
	if req.IsPinned != nil {
		updates["is_pinned"] = *req.IsPinned
	}
	if req.PublishAt != nil {
		publishAt, err := parseAnnouncementTime(req.PublishAt, time.Now())
		if err != nil {
			return nil, ErrAnnouncementInvalidInput
		}
		updates["publish_at"] = publishAt
	}
	if req.ExpireAt != nil {
		expireAt, err := parseOptionalAnnouncementTime(req.ExpireAt)
		if err != nil {
			return nil, ErrAnnouncementInvalidInput
		}
		updates["expire_at"] = expireAt
	}
	if expireAt, ok := updates["expire_at"].(*time.Time); ok && expireAt != nil {
		effectivePublishAt := a.PublishAt
		if v, ok := updates["publish_at"].(time.Time); ok {
			effectivePublishAt = v
		}
		if !expireAt.After(effectivePublishAt) {
			return nil, ErrAnnouncementInvalidInput
		}
	}
	if req.PenaltyList != nil {
		if len(*req.PenaltyList) > 0 && a.Category != model.AnnouncementCategoryModeration {
			return nil, ErrAnnouncementInvalidInput
		}
		raw, err := marshalPenaltyList(*req.PenaltyList)
		if err != nil {
			return nil, ErrAnnouncementInvalidInput
		}
		updates["penalty_list"] = raw
	}
	if len(updates) == 0 {
		if err := dal.DB.WithContext(ctx).Preload("Author").First(&a, "id = ?", id).Error; err != nil {
			return nil, err
		}
		dto := announcementToDTO(&a, false)
		return &dto, nil
	}
	if err := dal.DB.WithContext(ctx).Model(&a).Updates(updates).Error; err != nil {
		log.Printf("[Announcement/Update] 更新失败, id=%s, err=%v", id, err)
		return nil, err
	}
	if err := dal.DB.WithContext(ctx).Preload("Author").First(&a, "id = ?", id).Error; err != nil {
		return nil, err
	}
	dto := announcementToDTO(&a, false)
	return &dto, nil
}

// UpdateStatus 发布或下线公告。
func (s *AnnouncementService) UpdateStatus(ctx context.Context, id, userID, status string) (*types.Announcement, error) {
	if !validAnnouncementStatuses[status] {
		return nil, ErrAnnouncementInvalidInput
	}
	var a model.Announcement
	if err := dal.DB.WithContext(ctx).First(&a, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrAnnouncementNotFound
		}
		return nil, err
	}
	switch a.Status {
	case model.AnnouncementStatusDraft:
		if status != model.AnnouncementStatusPublished {
			return nil, ErrAnnouncementInvalidInput
		}
	case model.AnnouncementStatusPublished:
		if status != model.AnnouncementStatusOffline {
			return nil, ErrAnnouncementInvalidInput
		}
	case model.AnnouncementStatusOffline:
		if status != model.AnnouncementStatusPublished {
			return nil, ErrAnnouncementInvalidInput
		}
	default:
		return nil, ErrAnnouncementInvalidInput
	}
	if status == model.AnnouncementStatusPublished {
		if len([]rune(strings.TrimSpace(a.Title))) < 1 || len([]rune(strings.TrimSpace(a.Content))) < 1 {
			return nil, ErrAnnouncementInvalidInput
		}
		if a.Level == model.AnnouncementLevelUrgent {
			if err := ensureUrgentUnique(ctx, id); err != nil {
				return nil, err
			}
		}
	}
	if err := dal.DB.WithContext(ctx).Model(&a).Update("status", status).Error; err != nil {
		log.Printf("[Announcement/Status] 更新失败, id=%s, err=%v", id, err)
		return nil, err
	}
	if err := dal.DB.WithContext(ctx).Preload("Author").First(&a, "id = ?", id).Error; err != nil {
		return nil, err
	}
	dto := announcementToDTO(&a, false)
	return &dto, nil
}

// Delete 删除草稿或已下线公告；已发布公告必须先下线。
func (s *AnnouncementService) Delete(ctx context.Context, id string) error {
	var a model.Announcement
	if err := dal.DB.WithContext(ctx).Select("id", "status").First(&a, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrAnnouncementNotFound
		}
		return err
	}
	if a.Status == model.AnnouncementStatusPublished {
		return ErrAnnouncementPublishedDel
	}
	return dal.DB.WithContext(ctx).Delete(&model.Announcement{}, "id = ?", id).Error
}

// --- helpers ---

func applyEffectiveFilter(q *gorm.DB, now time.Time) *gorm.DB {
	return q.Where("status = ? AND publish_at <= ? AND (expire_at IS NULL OR expire_at > ?)",
		model.AnnouncementStatusPublished, now, now)
}

func isEffectiveAnnouncement(a *model.Announcement, now time.Time) bool {
	if a.Status != model.AnnouncementStatusPublished || a.PublishAt.After(now) {
		return false
	}
	return a.ExpireAt == nil || a.ExpireAt.After(now)
}

func isAnnouncementManager(ctx context.Context, userID string) bool {
	role := announcementUserRole(ctx, userID)
	return role == "admin" || role == "moderator"
}

func isAnnouncementAdmin(ctx context.Context, userID string) bool {
	return announcementUserRole(ctx, userID) == "admin"
}

func announcementUserRole(ctx context.Context, userID string) string {
	if userID == "" {
		return ""
	}
	var user model.User
	if err := dal.DB.WithContext(ctx).Select("role").First(&user, "id = ?", userID).Error; err != nil {
		return ""
	}
	return user.Role
}

func ensureUrgentUnique(ctx context.Context, excludeID string) error {
	var count int64
	query := dal.DB.WithContext(ctx).Model(&model.Announcement{}).
		Where("level = ? AND status = ?", model.AnnouncementLevelUrgent, model.AnnouncementStatusPublished)
	if excludeID != "" {
		query = query.Where("id <> ?", excludeID)
	}
	if err := query.Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrAnnouncementUrgentExists
	}
	return nil
}

func parseAnnouncementTime(raw *string, fallback time.Time) (time.Time, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return fallback, nil
	}
	value := strings.TrimSpace(*raw)
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02 15:04:05", value); err == nil {
		return t, nil
	}
	return time.Time{}, ErrAnnouncementInvalidInput
}

func parseOptionalAnnouncementTime(raw *string) (*time.Time, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	t, err := parseAnnouncementTime(raw, time.Time{})
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func marshalPenaltyList(items []types.PenaltyItem) (*string, error) {
	if len(items) == 0 {
		return nil, nil
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return nil, err
	}
	s := string(raw)
	return &s, nil
}

func penaltyListToDTO(raw *string) []types.PenaltyItem {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return []types.PenaltyItem{}
	}
	var items []types.PenaltyItem
	if err := json.Unmarshal([]byte(*raw), &items); err != nil {
		return []types.PenaltyItem{}
	}
	if items == nil {
		return []types.PenaltyItem{}
	}
	return items
}

func loadAnnouncementReadState(ctx context.Context, userID string, ids []string) (map[string]bool, *time.Time) {
	readSet := make(map[string]bool)
	if userID == "" || len(ids) == 0 {
		return readSet, nil
	}
	var user model.User
	if err := dal.DB.WithContext(ctx).Select("created_at").First(&user, "id = ?", userID).Error; err != nil {
		return readSet, nil
	}
	var reads []model.AnnouncementRead
	if err := dal.DB.WithContext(ctx).Select("announcement_id").
		Where("announcement_id IN ? AND user_id = ?", ids, userID).
		Find(&reads).Error; err != nil {
		return readSet, nil
	}
	for i := range reads {
		readSet[reads[i].AnnouncementID] = true
	}
	return readSet, &user.CreatedAt
}

func announcementSummaryToDTO(a *model.Announcement, readSet map[string]bool, userCreatedAt *time.Time) *types.AnnouncementSummary {
	isRead := readSet != nil && readSet[a.ID]
	if userCreatedAt != nil && !a.PublishAt.After(*userCreatedAt) {
		isRead = true
	}
	return &types.AnnouncementSummary{
		ID:        a.ID,
		Title:     a.Title,
		Category:  a.Category,
		Level:     a.Level,
		Status:    a.Status,
		IsPinned:  a.IsPinned,
		PublishAt: a.PublishAt.Format(time.RFC3339),
		ExpireAt:  formatOptionalTime(a.ExpireAt),
		Edited:    a.Edited,
		IsRead:    isRead,
		AuthorID:  a.AuthorID,
		Author:    mapper.AuthorToDTO(&a.Author),
		CreatedAt: a.CreatedAt.Format(time.RFC3339),
		UpdatedAt: a.UpdatedAt.Format(time.RFC3339),
	}
}

func announcementToDTO(a *model.Announcement, isRead bool) types.Announcement {
	return types.Announcement{
		ID:          a.ID,
		Title:       a.Title,
		Content:     a.Content,
		Category:    a.Category,
		Level:       a.Level,
		Status:      a.Status,
		IsPinned:    a.IsPinned,
		PublishAt:   a.PublishAt.Format(time.RFC3339),
		ExpireAt:    formatOptionalTime(a.ExpireAt),
		PenaltyList: penaltyListToDTO(a.PenaltyList),
		Edited:      a.Edited,
		IsRead:      isRead,
		AuthorID:    a.AuthorID,
		Author:      mapper.AuthorToDTO(&a.Author),
		CreatedAt:   a.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   a.UpdatedAt.Format(time.RFC3339),
	}
}

func formatOptionalTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}
