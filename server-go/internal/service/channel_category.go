package service

import (
	"context"
	"log"
	"regexp"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// ChannelCategoryService 频道分组服务
type ChannelCategoryService struct{}

// ChannelCategoryError 频道分组业务错误
type ChannelCategoryError struct {
	Msg  string
	Code int
}

func (e *ChannelCategoryError) Error() string { return e.Msg }

var (
	ErrCategoryNotFound   = &ChannelCategoryError{Msg: "频道分组不存在", Code: 404}
	ErrCategoryNameExists = &ChannelCategoryError{Msg: "频道分组标识已存在", Code: 409}
	ErrCategoryInvalid    = &ChannelCategoryError{Msg: "频道分组标识只允许小写字母、数字和连字符", Code: 400}
	ErrCategoryHasChannels = &ChannelCategoryError{Msg: "该分组下还有频道，无法删除", Code: 400}
)

// categoryNameReg 分组标识格式：小写字母+数字+连字符，2-30 字符
var categoryNameReg = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,29}$`)

// ListCategories 获取所有分组（按 sortOrder 排序）
func (s *ChannelCategoryService) ListCategories(ctx context.Context) ([]types.ChannelCategory, error) {
	var categories []model.ChannelCategory
	if err := dal.DB.WithContext(ctx).Order("sort_order ASC, created_at ASC").Find(&categories).Error; err != nil {
		log.Printf("[Category/ListCategories] failed to list categories, err=%v", err)
		return nil, err
	}
	items := make([]types.ChannelCategory, 0, len(categories))
	for _, c := range categories {
		items = append(items, categoryToDTO(&c))
	}
	return items, nil
}

// CreateCategory 创建频道分组
func (s *ChannelCategoryService) CreateCategory(ctx context.Context, req types.CreateChannelCategoryReq) (*types.ChannelCategory, error) {
	if !categoryNameReg.MatchString(req.Name) {
		return nil, ErrCategoryInvalid
	}

	var existing model.ChannelCategory
	result := dal.DB.WithContext(ctx).Where("name = ?", req.Name).First(&existing)
	if result.Error == nil {
		return nil, ErrCategoryNameExists
	}
	if result.Error != gorm.ErrRecordNotFound {
		log.Printf("[Category/CreateCategory] failed to check name uniqueness, name=%s, err=%v", req.Name, result.Error)
		return nil, result.Error
	}

	category := &model.ChannelCategory{
		Name:  req.Name,
		Label: req.Label,
		Icon:  req.Icon,
	}
	if req.SortOrder != nil {
		category.SortOrder = *req.SortOrder
	}

	if err := dal.DB.WithContext(ctx).Create(category).Error; err != nil {
		log.Printf("[Category/CreateCategory] failed to create category, name=%s, err=%v", req.Name, err)
		return nil, err
	}

	dto := categoryToDTO(category)
	return &dto, nil
}

// UpdateCategory 更新频道分组
func (s *ChannelCategoryService) UpdateCategory(ctx context.Context, id string, req types.UpdateChannelCategoryReq) (*types.ChannelCategory, error) {
	var category model.ChannelCategory
	if err := dal.DB.WithContext(ctx).First(&category, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrCategoryNotFound
		}
		log.Printf("[Category/UpdateCategory] failed to get category, id=%s, err=%v", id, err)
		return nil, err
	}

	updates := map[string]interface{}{}
	if req.Label != nil {
		updates["label"] = *req.Label
	}
	if req.Icon != nil {
		updates["icon"] = *req.Icon
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}

	if len(updates) > 0 {
		if err := dal.DB.WithContext(ctx).Model(&category).Updates(updates).Error; err != nil {
			log.Printf("[Category/UpdateCategory] failed to update category, id=%s, err=%v", id, err)
			return nil, err
		}
	}

	if err := dal.DB.WithContext(ctx).First(&category, "id = ?", id).Error; err != nil {
		log.Printf("[Category/UpdateCategory] failed to reload category, id=%s, err=%v", id, err)
		return nil, err
	}

	dto := categoryToDTO(&category)
	return &dto, nil
}

// DeleteCategory 删除频道分组（不能删除有频道的分组）
func (s *ChannelCategoryService) DeleteCategory(ctx context.Context, id string) error {
	var category model.ChannelCategory
	if err := dal.DB.WithContext(ctx).First(&category, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrCategoryNotFound
		}
		log.Printf("[Category/DeleteCategory] failed to get category, id=%s, err=%v", id, err)
		return err
	}

	// 检查该分组下是否有频道
	var channelCount int64
	dal.DB.WithContext(ctx).Model(&model.Channel{}).Where("category_id = ?", id).Count(&channelCount)
	if channelCount > 0 {
		return ErrCategoryHasChannels
	}

	if err := dal.DB.WithContext(ctx).Delete(&model.ChannelCategory{}, "id = ?", id).Error; err != nil {
		log.Printf("[Category/DeleteCategory] failed to delete category, id=%s, err=%v", id, err)
		return err
	}
	return nil
}

// categoryToDTO 将 ChannelCategory model 转为 DTO
func categoryToDTO(c *model.ChannelCategory) types.ChannelCategory {
	return types.ChannelCategory{
		ID:        c.ID,
		Name:      c.Name,
		Label:     c.Label,
		Icon:      c.Icon,
		SortOrder: c.SortOrder,
		CreatedAt: c.CreatedAt.Format(time.RFC3339),
	}
}
