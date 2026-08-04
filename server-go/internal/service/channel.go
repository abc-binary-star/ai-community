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

// ChannelService 频道服务
type ChannelService struct{}

// ChannelError 频道业务错误
type ChannelError struct {
	Msg  string
	Code int
}

func (e *ChannelError) Error() string { return e.Msg }

var (
	ErrChannelNotFound   = &ChannelError{Msg: "频道不存在", Code: 404}
	ErrChannelNameExists = &ChannelError{Msg: "频道标识已存在", Code: 409}
	ErrChannelInvalid    = &ChannelError{Msg: "频道标识只允许小写字母、数字和连字符", Code: 400}
	ErrChannelHasPosts   = &ChannelError{Msg: "该频道下已有帖子，无法删除", Code: 400}
)

// channelNameReg 频道标识格式：小写字母+数字+连字符，2-30 字符
var channelNameReg = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,29}$`)

// ListChannels 获取所有频道（按 sortOrder 排序）
func (s *ChannelService) ListChannels(ctx context.Context) ([]types.Channel, error) {
	var channels []model.Channel
	if err := dal.DB.WithContext(ctx).Order("sort_order ASC, created_at ASC").Find(&channels).Error; err != nil {
		log.Printf("[Channel/ListChannels] failed to list channels, err=%v", err)
		return nil, err
	}
	items := make([]types.Channel, 0, len(channels))
	for _, c := range channels {
		items = append(items, channelToDTO(&c))
	}
	return items, nil
}

// CreateChannel 创建频道
func (s *ChannelService) CreateChannel(ctx context.Context, userID string, req types.CreateChannelReq) (*types.Channel, error) {
	// 校验 name 格式：只允许小写字母+数字+连字符
	if !channelNameReg.MatchString(req.Name) {
		return nil, ErrChannelInvalid
	}

	// 校验 name 唯一性
	var existing model.Channel
	result := dal.DB.WithContext(ctx).Where("name = ?", req.Name).First(&existing)
	if result.Error == nil {
		return nil, ErrChannelNameExists
	}
	if result.Error != gorm.ErrRecordNotFound {
		log.Printf("[Channel/CreateChannel] failed to check channel name uniqueness, name=%s, err=%v", req.Name, result.Error)
		return nil, result.Error
	}

	channel := &model.Channel{
		Name:        req.Name,
		Label:       req.Label,
		Description: req.Description,
		Icon:        req.Icon,
		CategoryID:  req.CategoryID,
		CreatedBy:   userID,
	}
	if err := dal.DB.WithContext(ctx).Create(channel).Error; err != nil {
		log.Printf("[Channel/CreateChannel] failed to create channel, name=%s, err=%v", req.Name, err)
		return nil, err
	}

	dto := channelToDTO(channel)
	return &dto, nil
}

// UpdateChannel 更新频道信息
func (s *ChannelService) UpdateChannel(ctx context.Context, id string, req types.UpdateChannelReq) (*types.Channel, error) {
	var channel model.Channel
	if err := dal.DB.WithContext(ctx).First(&channel, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrChannelNotFound
		}
		log.Printf("[Channel/UpdateChannel] failed to get channel, id=%s, err=%v", id, err)
		return nil, err
	}

	updates := map[string]interface{}{}
	if req.Label != nil {
		updates["label"] = *req.Label
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Icon != nil {
		updates["icon"] = *req.Icon
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}
	if req.CategoryID != nil {
		updates["category_id"] = *req.CategoryID
	}

	if len(updates) > 0 {
		if err := dal.DB.WithContext(ctx).Model(&channel).Updates(updates).Error; err != nil {
			log.Printf("[Channel/UpdateChannel] failed to update channel, id=%s, err=%v", id, err)
			return nil, err
		}
	}

	// 重新加载
	if err := dal.DB.WithContext(ctx).First(&channel, "id = ?", id).Error; err != nil {
		log.Printf("[Channel/UpdateChannel] failed to reload channel, id=%s, err=%v", id, err)
		return nil, err
	}

	dto := channelToDTO(&channel)
	return &dto, nil
}

// DeleteChannel 删除频道（不能删除有帖子的频道）
func (s *ChannelService) DeleteChannel(ctx context.Context, id string) error {
	var channel model.Channel
	if err := dal.DB.WithContext(ctx).First(&channel, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrChannelNotFound
		}
		log.Printf("[Channel/DeleteChannel] failed to get channel, id=%s, err=%v", id, err)
		return err
	}

	// 检查该频道下是否有帖子
	var postCount int64
	dal.DB.WithContext(ctx).Model(&model.Post{}).Where("channel = ?", channel.Name).Count(&postCount)
	if postCount > 0 {
		return ErrChannelHasPosts
	}

	if err := dal.DB.WithContext(ctx).Delete(&model.Channel{}, "id = ?", id).Error; err != nil {
		log.Printf("[Channel/DeleteChannel] failed to delete channel, id=%s, err=%v", id, err)
		return err
	}
	return nil
}

// channelToDTO 将 Channel model 转为 DTO
func channelToDTO(c *model.Channel) types.Channel {
	return types.Channel{
		ID:          c.ID,
		Name:        c.Name,
		Label:       c.Label,
		Description: c.Description,
		Icon:        c.Icon,
		CategoryID:  c.CategoryID,
		SortOrder:   c.SortOrder,
		CreatedBy:   c.CreatedBy,
		CreatedAt:   c.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   c.UpdatedAt.Format(time.RFC3339),
	}
}

// GetChannelTree 获取频道树（分组 + 频道）
func (s *ChannelService) GetChannelTree(ctx context.Context) (*types.ChannelTree, error) {
	// 查询所有分组
	var categories []model.ChannelCategory
	if err := dal.DB.WithContext(ctx).Order("sort_order ASC, created_at ASC").Find(&categories).Error; err != nil {
		log.Printf("[Channel/GetChannelTree] failed to list categories, err=%v", err)
		return nil, err
	}

	// 查询所有频道
	var channels []model.Channel
	if err := dal.DB.WithContext(ctx).Order("sort_order ASC, created_at ASC").Find(&channels).Error; err != nil {
		log.Printf("[Channel/GetChannelTree] failed to list channels, err=%v", err)
		return nil, err
	}

	// 按分组归类
	categoryMap := make(map[string]*types.ChannelCategoryWithChannels)
	for i := range categories {
		cat := &categories[i]
		categoryMap[cat.ID] = &types.ChannelCategoryWithChannels{
			ChannelCategory: types.ChannelCategory{
				ID:        cat.ID,
				Name:      cat.Name,
				Label:     cat.Label,
				Icon:      cat.Icon,
				SortOrder: cat.SortOrder,
			},
			Channels: []types.Channel{},
		}
	}

	var uncategorized []types.Channel
	for _, ch := range channels {
		dto := channelToDTO(&ch)
		if ch.CategoryID != nil {
			if cat, ok := categoryMap[*ch.CategoryID]; ok {
				cat.Channels = append(cat.Channels, dto)
				continue
			}
		}
		uncategorized = append(uncategorized, dto)
	}

	// 保持分组顺序
	result := &types.ChannelTree{
		Categories:    make([]types.ChannelCategoryWithChannels, 0, len(categories)),
		Uncategorized: uncategorized,
	}
	for _, cat := range categories {
		if entry, ok := categoryMap[cat.ID]; ok {
			result.Categories = append(result.Categories, *entry)
		}
	}

	return result, nil
}
