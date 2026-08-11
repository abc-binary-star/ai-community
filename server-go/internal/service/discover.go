package service

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// DiscoverService 发现页聚合服务
type DiscoverService struct{}

// HotPostLimit 发现页热门帖子条数
const hotPostLimit = 10

// RecommendedUserLimit 推荐用户条数
const recommendedUserLimit = 8

// hotAssetLimit 发现页热门资产推荐位条数
const hotAssetLimit = 3

// hotAssetsCacheTTL 热门资产推荐位缓存有效期。
// 资产运行次数变化频率极低，24h 内复用同一结果可显著降低 discover 查询成本。
const hotAssetsCacheTTL = 24 * time.Hour

// hotAssetsCache 热门资产推荐位的进程内缓存（mutex + 过期时间）。
// 设计上仅存小数组（≤3 条 AssetSummary），直接缓存结构体而非 JSON 字符串。
var hotAssetsCache = struct {
	mu      sync.Mutex
	value   []types.AssetSummary
	expires time.Time
}{}

// Discover 聚合发现页数据：跨频道热门帖子 + 趋势话题 + 推荐用户 + 热门 AI 资产
func (s *DiscoverService) Discover(ctx context.Context, currentUserID string) (*types.DiscoverResponse, error) {
	// 跨频道热门帖子（复用 ListPosts 的 hot 排序）
	hotPosts, err := (&PostService{}).ListPosts(ctx, "all", "hot", "", "", "", "", currentUserID, 1, hotPostLimit)
	if err != nil {
		log.Printf("[Discover/Discover] failed to get hot posts, currentUserID=%s, err=%v", currentUserID, err)
		return nil, err
	}

	// 趋势话题
	tags, err := (&PostService{}).PopularTags(ctx)
	if err != nil {
		log.Printf("[Discover/Discover] failed to get popular tags, err=%v", err)
		return nil, err
	}

	// 推荐用户
	users, err := s.RecommendedUsers(ctx, currentUserID, recommendedUserLimit)
	if err != nil {
		log.Printf("[Discover/Discover] failed to get recommended users, currentUserID=%s, err=%v", currentUserID, err)
		return nil, err
	}

	// 热门 AI 资产（C1 新增）
	hotAssets, err := s.HotAssets(ctx, hotAssetLimit)
	if err != nil {
		log.Printf("[Discover/Discover] failed to get hot assets, currentUserID=%s, err=%v", currentUserID, err)
		return nil, err
	}

	return &types.DiscoverResponse{
		HotPosts:         hotPosts.Items,
		TrendingTags:     tags,
		RecommendedUsers: users,
		HotAssets:        hotAssets,
	}, nil
}

// HotAssets 取运行次数最高的已发布资产（C1）。
// 仅统计 published + public；先查 24h 缓存，未命中时回源查询并写入缓存。
func (s *DiscoverService) HotAssets(ctx context.Context, limit int) ([]types.AssetSummary, error) {
	if items, ok := getHotAssetsCache(); ok {
		return items, nil
	}

	var rows []model.Asset
	if err := dal.DB.WithContext(ctx).
		Select("id", "name", "type", "version", "run_count", "fork_count").
		Where("status = ? AND visibility = ?",
			model.AssetStatusPublished, model.AssetVisibilityPublic).
		Order("run_count DESC, created_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		log.Printf("[Discover/HotAssets] 查询热门资产失败, err=%v", err)
		return nil, err
	}

	items := make([]types.AssetSummary, 0, len(rows))
	for _, r := range rows {
		items = append(items, types.AssetSummary{
			ID:        r.ID,
			Name:      r.Name,
			Type:      r.Type,
			Version:   r.Version,
			RunCount:  r.RunCount,
			ForkCount: r.ForkCount,
		})
	}
	setHotAssetsCache(items)
	return items, nil
}

// getHotAssetsCache 读取缓存；命中且未过期返回 true
func getHotAssetsCache() ([]types.AssetSummary, bool) {
	hotAssetsCache.mu.Lock()
	defer hotAssetsCache.mu.Unlock()
	if hotAssetsCache.value != nil && time.Now().Before(hotAssetsCache.expires) {
		return hotAssetsCache.value, true
	}
	return nil, false
}

// setHotAssetsCache 写入缓存并刷新过期时间
func setHotAssetsCache(items []types.AssetSummary) {
	hotAssetsCache.mu.Lock()
	defer hotAssetsCache.mu.Unlock()
	hotAssetsCache.value = items
	hotAssetsCache.expires = time.Now().Add(hotAssetsCacheTTL)
}

// RecommendedUsers 推荐用户：优先按粉丝数排序，无关注数据时按发帖量兜底
// 排除自己 + 已关注的用户，保证推荐列表始终是未关注的人
func (s *DiscoverService) RecommendedUsers(ctx context.Context, currentUserID string, limit int) ([]types.PublicUser, error) {
	type idRow struct {
		ID string
	}

	rows := s.topUsersByFollowers(ctx, currentUserID, limit)
	if len(rows) == 0 {
		rows = s.topUsersByPosts(ctx, currentUserID, limit)
	}

	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	if len(ids) == 0 {
		return []types.PublicUser{}, nil
	}

	var users []model.User
	if err := dal.DB.WithContext(ctx).Where("id IN ?", ids).Find(&users).Error; err != nil {
		log.Printf("[Discover/RecommendedUsers] failed to get users by IDs, ids=%v, err=%v", ids, err)
		return nil, err
	}

	us := &UserService{}
	return us.mapUsersToPublic(ctx, users, currentUserID), nil
}

// topUsersByFollowers 按粉丝数取 Top 用户（排除自己和已关注的用户）
func (s *DiscoverService) topUsersByFollowers(ctx context.Context, currentUserID string, limit int) []struct{ ID string } {
	query := dal.DB.WithContext(ctx).Model(&model.Follow{}).
		Select("following_id as id").
		Group("following_id").
		Order("count(*) DESC, max(created_at) DESC").
		Limit(limit)
	if currentUserID != "" {
		query = query.Where("following_id <> ? AND following_id NOT IN (?)",
			currentUserID,
			dal.DB.Model(&model.Follow{}).Select("following_id").Where("follower_id = ?", currentUserID),
		)
	}
	var rows []struct{ ID string }
	query.Scan(&rows)
	return rows
}

// topUsersByPosts 按发帖量取 Top 用户（兜底策略，排除自己和已关注的用户）
func (s *DiscoverService) topUsersByPosts(ctx context.Context, currentUserID string, limit int) []struct{ ID string } {
	query := dal.DB.WithContext(ctx).Model(&model.Post{}).
		Select("author_id as id").
		Group("author_id").
		Order("count(*) DESC, max(created_at) DESC").
		Limit(limit)
	if currentUserID != "" {
		query = query.Where("author_id <> ? AND author_id NOT IN (?)",
			currentUserID,
			dal.DB.Model(&model.Follow{}).Select("following_id").Where("follower_id = ?", currentUserID),
		)
	}
	var rows []struct{ ID string }
	query.Scan(&rows)
	return rows
}
