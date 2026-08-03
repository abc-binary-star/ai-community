package service

import (
	"context"
	"log"

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

// Discover 聚合发现页数据：跨频道热门帖子 + 趋势话题 + 推荐用户
func (s *DiscoverService) Discover(ctx context.Context, currentUserID string) (*types.DiscoverResponse, error) {
	// 跨频道热门帖子（复用 ListPosts 的 hot 排序）
	hotPosts, err := (&PostService{}).ListPosts(ctx, "all", "hot", "", "", "", currentUserID, 1, hotPostLimit)
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

	return &types.DiscoverResponse{
		HotPosts:         hotPosts.Items,
		TrendingTags:     tags,
		RecommendedUsers: users,
	}, nil
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
