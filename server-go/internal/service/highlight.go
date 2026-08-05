package service

import (
	"context"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// HighlightService 帖子划线高亮服务
type HighlightService struct{}

var validHighlightColors = map[string]bool{"yellow": true, "green": true, "blue": true}

// CreateHighlight 创建划线记录
func (s *HighlightService) CreateHighlight(ctx context.Context, postID, userID string, req types.CreateHighlightReq) (*types.Highlight, error) {
	if req.EndOffset <= req.StartOffset {
		return nil, ErrPostInvalidInput
	}
	color := req.Color
	if !validHighlightColors[color] {
		color = "yellow"
	}

	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrPostNotFound_Post
		}
		return nil, err
	}

	h := &model.Highlight{
		PostID:       postID,
		UserID:       userID,
		Anchor:       req.Anchor,
		StartOffset:  req.StartOffset,
		EndOffset:    req.EndOffset,
		SelectedText: req.SelectedText,
		Color:        color,
	}
	if err := dal.DB.WithContext(ctx).Create(h).Error; err != nil {
		// 唯一索引冲突：同一区间已划线，返回已有记录
		var existing model.Highlight
		if findErr := dal.DB.WithContext(ctx).
			Where("post_id = ? AND user_id = ? AND anchor = ? AND start_offset = ? AND end_offset = ?",
				postID, userID, req.Anchor, req.StartOffset, req.EndOffset).
			First(&existing).Error; findErr == nil {
			return highlightToDTO(&existing), nil
		}
		log.Printf("[Highlight/Create] 创建失败, postID=%s, userID=%s, err=%v", postID, userID, err)
		return nil, err
	}
	return highlightToDTO(h), nil
}

// ListHighlights 获取当前用户在某帖子的全部划线
func (s *HighlightService) ListHighlights(ctx context.Context, postID, userID string) ([]types.Highlight, error) {
	if userID == "" {
		return []types.Highlight{}, nil
	}
	var highlights []model.Highlight
	if err := dal.DB.WithContext(ctx).
		Where("post_id = ? AND user_id = ?", postID, userID).
		Order("created_at ASC").
		Find(&highlights).Error; err != nil {
		log.Printf("[Highlight/List] 查询失败, postID=%s, err=%v", postID, err)
		return nil, err
	}
	items := make([]types.Highlight, 0, len(highlights))
	for i := range highlights {
		items = append(items, *highlightToDTO(&highlights[i]))
	}
	return items, nil
}

// DeleteHighlight 删除自己的划线
func (s *HighlightService) DeleteHighlight(ctx context.Context, highlightID, userID string) error {
	result := dal.DB.WithContext(ctx).
		Where("id = ? AND user_id = ?", highlightID, userID).
		Delete(&model.Highlight{})
	if result.Error != nil {
		log.Printf("[Highlight/Delete] 删除失败, id=%s, err=%v", highlightID, result.Error)
		return result.Error
	}
	if result.RowsAffected == 0 {
		return &PostError{Msg: "划线不存在或无权删除", Code: 404}
	}
	return nil
}

func highlightToDTO(h *model.Highlight) *types.Highlight {
	return &types.Highlight{
		ID:           h.ID,
		Anchor:       h.Anchor,
		StartOffset:  h.StartOffset,
		EndOffset:    h.EndOffset,
		SelectedText: h.SelectedText,
		Color:        h.Color,
		CreatedAt:    h.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// UpdateHighlightColor 更新划线颜色（仅本人）
func (s *HighlightService) UpdateHighlightColor(ctx context.Context, highlightID, userID, color string) (*types.Highlight, error) {
	if !validHighlightColors[color] {
		return nil, ErrPostInvalidInput
	}
	var h model.Highlight
	if err := dal.DB.WithContext(ctx).Where("id = ? AND user_id = ?", highlightID, userID).First(&h).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &PostError{Msg: "划线不存在或无权操作", Code: 404}
		}
		return nil, err
	}
	if err := dal.DB.WithContext(ctx).Model(&h).Update("color", color).Error; err != nil {
		log.Printf("[Highlight/Update] 更新失败, id=%s, err=%v", highlightID, err)
		return nil, err
	}
	h.Color = color
	return highlightToDTO(&h), nil
}
