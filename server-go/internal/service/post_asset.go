// Package service: PostAssetService 帖子-资产绑定服务（B2）
//
// 把资产挂到帖子上，让帖子详情页能展示「本帖用到的 AI 资产」并提供试玩入口。
//
// 设计要点：
//   - 绑定/解绑仅帖子作者或管理员/版主可操作
//   - 同一 (postID, assetID) 唯一，重复绑定时幂等返回已有绑定
//   - 列表对非作者用户仅展示 published+public 状态的资产，避免草稿泄漏
//   - 解绑只删绑定记录，不删资产本身；资产被删时由外键 OnDelete:CASCADE 自动清理绑定
package service

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// PostAssetService 帖子-资产绑定服务
type PostAssetService struct{}

// BindPostAsset 把资产挂到帖子上。
// 操作者必须是帖子作者或管理员/版主；资产必须存在且（已发布 或 由操作者拥有）。
// 重复绑定时返回已有记录，不报错（幂等）。
func (s *PostAssetService) BindPostAsset(ctx context.Context, postID string, req types.BindPostAssetReq, operatorID string) (*types.PostAsset, error) {
	if postID == "" || req.AssetID == "" || operatorID == "" {
		return nil, ErrAssetInvalidInput
	}

	operatorRole, err := fetchUserRole(ctx, operatorID)
	if err != nil {
		return nil, err
	}

	// 校验帖子存在且操作者有权限
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "author_id", "status").First(&post, "id = ?", postID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &AssetError{Msg: "帖子不存在", Code: 404}
		}
		return nil, err
	}
	if !canManagePost(&post, operatorID, operatorRole) {
		return nil, ErrAssetForbidden
	}

	// 校验资产存在且对操作者可见（已发布或作者本人）
	var asset model.Asset
	if err := dal.DB.WithContext(ctx).Preload("Author").First(&asset, "id = ?", req.AssetID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, &AssetError{Msg: "资产不存在", Code: 404}
		}
		return nil, err
	}
	if !canViewAsset(&asset, operatorID) {
		return nil, ErrAssetNotFound
	}

	sortOrder := 0
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	}

	// 幂等：若已存在相同 (postID, assetID) 绑定，更新 sort_order 后返回
	var existing model.PostAsset
	err = dal.DB.WithContext(ctx).Where("post_id = ? AND asset_id = ?", postID, req.AssetID).First(&existing).Error
	if err == nil {
		if err := dal.DB.WithContext(ctx).Model(&existing).Update("sort_order", sortOrder).Error; err != nil {
			log.Printf("[PostAsset/Bind] 更新 sort_order 失败, postID=%s, assetID=%s, err=%v", postID, req.AssetID, err)
			return nil, err
		}
		existing.SortOrder = sortOrder
		dto := s.mapToDTO(&existing, &asset)
		return &dto, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	rec := &model.PostAsset{
		PostID:    postID,
		AssetID:   req.AssetID,
		SortOrder: sortOrder,
		CreatorID: operatorID,
	}
	if err := dal.DB.WithContext(ctx).Create(rec).Error; err != nil {
		log.Printf("[PostAsset/Bind] 绑定失败, postID=%s, assetID=%s, err=%v", postID, req.AssetID, err)
		return nil, err
	}
	dto := s.mapToDTO(rec, &asset)
	return &dto, nil
}

// UnbindPostAsset 解除帖子与资产的绑定。
// 操作者必须是帖子作者或管理员/版主。不存在时幂等返回成功。
func (s *PostAssetService) UnbindPostAsset(ctx context.Context, postID, assetID, operatorID string) error {
	if postID == "" || assetID == "" {
		return ErrAssetInvalidInput
	}
	operatorRole, err := fetchUserRole(ctx, operatorID)
	if err != nil {
		return err
	}
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "author_id").First(&post, "id = ?", postID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &AssetError{Msg: "帖子不存在", Code: 404}
		}
		return err
	}
	if !canManagePost(&post, operatorID, operatorRole) {
		return ErrAssetForbidden
	}
	result := dal.DB.WithContext(ctx).Where("post_id = ? AND asset_id = ?", postID, assetID).
		Delete(&model.PostAsset{})
	if result.Error != nil {
		log.Printf("[PostAsset/Unbind] 解绑失败, postID=%s, assetID=%s, err=%v", postID, assetID, result.Error)
		return result.Error
	}
	return nil
}

// fetchUserRole 查询用户角色；用户不存在时返回空串（按游客权限处理）。
func fetchUserRole(ctx context.Context, userID string) (string, error) {
	var user model.User
	if err := dal.DB.WithContext(ctx).Select("role").First(&user, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil
		}
		return "", err
	}
	return user.Role, nil
}

// ListPostAssets 列出帖子绑定的资产。
// 非帖子作者查看时仅展示 published+public 状态的资产，避免草稿泄漏。
// 按 sort_order, created_at 排序。
func (s *PostAssetService) ListPostAssets(ctx context.Context, postID, viewerID string, page, pageSize int) (*types.Paginated[types.PostAsset], error) {
	q := dal.DB.WithContext(ctx).Model(&model.PostAsset{}).
		Preload("Asset.Author").
		Joins("JOIN assets ON assets.id = post_assets.asset_id").
		Where("post_assets.post_id = ?", postID)

	// 判断查看者是否为帖子作者；非作者仅可见 published+public 的资产
	var post model.Post
	isAuthor := false
	if err := dal.DB.WithContext(ctx).Select("id", "author_id").First(&post, "id = ?", postID).Error; err == nil {
		isAuthor = post.AuthorID == viewerID
	}
	if !isAuthor {
		q = q.Where("assets.status = ? AND assets.visibility = ?",
			model.AssetStatusPublished, model.AssetVisibilityPublic)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}
	var rows []model.PostAsset
	if err := q.Order("post_assets.sort_order ASC, post_assets.created_at ASC").
		Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return nil, err
	}
	assetSvc := &AssetService{}
	items := make([]types.PostAsset, 0, len(rows))
	for i := range rows {
		assetDTO := assetSvc.mapToDTO(&rows[i].Asset, false)
		items = append(items, types.PostAsset{
			ID:        rows[i].ID,
			PostID:    rows[i].PostID,
			AssetID:   rows[i].AssetID,
			Asset:     assetDTO,
			SortOrder: rows[i].SortOrder,
			CreatorID: rows[i].CreatorID,
			CreatedAt: rows[i].CreatedAt.Format(time.RFC3339),
		})
	}
	return &types.Paginated[types.PostAsset]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// canManagePost 判断操作者是否能管理帖子（作者本人或管理员/版主）
func canManagePost(p *model.Post, operatorID, operatorRole string) bool {
	if p.AuthorID == operatorID {
		return true
	}
	return operatorRole == "admin" || operatorRole == "moderator"
}

// mapToDTO 把 model.PostAsset 映射为 types.PostAsset。
// asset 参数为已 Preload 好的关联资产 model，内部再转 Asset DTO。
func (s *PostAssetService) mapToDTO(pa *model.PostAsset, asset *model.Asset) types.PostAsset {
	assetDTO := (&AssetService{}).mapToDTO(asset, false)
	return types.PostAsset{
		ID:        pa.ID,
		PostID:    pa.PostID,
		AssetID:   pa.AssetID,
		Asset:     assetDTO,
		SortOrder: pa.SortOrder,
		CreatorID: pa.CreatorID,
		CreatedAt: pa.CreatedAt.Format(time.RFC3339),
	}
}
