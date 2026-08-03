package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 讨论摘要 v2 参数
const (
	threadSummaryMinComments = 10 // 阈值从 v1 的 20 降至 10
	threadSummaryMaxComments = 100
	threadSummaryStaleDelta  = 10 // 每新增 10 条评论标记过期
)

// ThreadSummaryService 讨论摘要 v2 服务
type ThreadSummaryService struct{}

// GetThreadSummary 获取讨论摘要
// - 已有缓存且未过期 -> 直接返回
// - 已有缓存但过期 -> 返回旧数据(标记 stale) + 后台异步更新
// - 无缓存且评论达标 -> 返回 generating 状态 + 后台异步生成
// - 评论不达标 -> 返回 none 状态
func (s *ThreadSummaryService) GetThreadSummary(ctx context.Context, postID string) (*types.ThreadSummaryDTO, error) {
	// 帖子必须存在
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "title", "content").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &PostSummaryError{Msg: "帖子不存在", Code: 404}
		}
		return nil, err
	}

	// 当前评论数
	var commentCount int64
	dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("post_id = ?", postID).Count(&commentCount)

	// 查已有摘要
	var cached model.ThreadSummary
	hasCached := dal.DB.WithContext(ctx).First(&cached, "post_id = ?", postID).Error == nil

	if hasCached {
		// 检查是否过期：当前评论数 - 生成时评论数 >= 阈值
		stale := commentCount-int64(cached.CommentCount) >= int64(threadSummaryStaleDelta)

		dto := threadSummaryToDTO(&cached, int(commentCount))
		dto.Stale = stale

		// 过期则后台异步更新
		if stale {
			go s.asyncGenerate(postID)
		}

		return dto, nil
	}

	// 无缓存
	if commentCount < int64(threadSummaryMinComments) {
		return &types.ThreadSummaryDTO{
			Status:       "none",
			CommentCount: int(commentCount),
		}, nil
	}

	// 评论达标，异步生成
	go s.asyncGenerate(postID)

	return &types.ThreadSummaryDTO{
		Status:       "generating",
		CommentCount: int(commentCount),
	}, nil
}

// asyncGenerate 异步生成讨论摘要
func (s *ThreadSummaryService) asyncGenerate(postID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	// 拉取帖子
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "title", "content").First(&post, "id = ?", postID).Error; err != nil {
		return
	}

	// 拉取评论（最早的 N 条，需要 ID 用于回链）
	var comments []model.Comment
	if err := dal.DB.WithContext(ctx).
		Select("id", "content").
		Where("post_id = ?", postID).
		Order("created_at ASC").
		Limit(threadSummaryMaxComments).
		Find(&comments).Error; err != nil {
		return
	}

	points, err := generateThreadSummaryPoints(ctx, &post, comments)
	if err != nil {
		return
	}

	// 序列化为 JSON
	pointsJSON, err := json.Marshal(points)
	if err != nil {
		return
	}

	// 当前评论数
	var commentCount int64
	dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("post_id = ?", postID).Count(&commentCount)

	// upsert
	var existing model.ThreadSummary
	if dal.DB.First(&existing, "post_id = ?", postID).Error == nil {
		// 更新
		dal.DB.Model(&existing).Updates(map[string]interface{}{
			"points":        datatypes.JSON(pointsJSON),
			"stale":         false,
			"comment_count": commentCount,
		})
	} else {
		// 创建
		ts := model.ThreadSummary{
			PostID:       postID,
			Points:       datatypes.JSON(pointsJSON),
			CommentCount: int(commentCount),
			Stale:        false,
		}
		dal.DB.Create(&ts)
	}
}

// generateThreadSummaryPoints 调用 LLM 生成要点（含回链 commentId）
func generateThreadSummaryPoints(ctx context.Context, post *model.Post, comments []model.Comment) ([]types.ThreadSummaryPoint, error) {
	// 截断帖子内容
	postContent := post.Content
	if runes := []rune(postContent); len(runes) > 2000 {
		postContent = string(runes[:2000])
	}

	// 合并评论：每条截断 300 字，带编号和 ID
	var sb strings.Builder
	for i, c := range comments {
		content := c.Content
		if runes := []rune(content); len(runes) > 300 {
			content = string(runes[:300])
		}
		sb.WriteString(fmt.Sprintf("[%d] (commentId:%s) %s\n", i+1, c.ID, content))
	}
	commentsText := sb.String()
	if runes := []rune(commentsText); len(runes) > 6000 {
		commentsText = string(runes[:6000])
	}

	systemPrompt := `你是一个社区讨论分析助手。用户会给你一篇帖子和若干条评论（每条评论前有编号和 commentId），请提炼出讨论的核心要点。

要求：
1. 提炼 3-8 个讨论要点，覆盖讨论的主要观点、结论、共识与分歧
2. 每个要点一句话，不超过 40 字
3. 每个要点必须关联到最相关的评论编号，格式为 JSON 数组：[{"text":"要点内容","commentId":"对应的commentId"}]
4. 不要逐条复述评论，要归纳总结
5. 只输出 JSON 数组，不要任何前言或后语
6. commentId 必须从输入的评论中选取，不要编造`

	userMsg := fmt.Sprintf("帖子标题：%s\n帖子内容：%s\n\n讨论评论：\n%s", post.Title, postContent, commentsText)

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        userMsg,
		MaxTokens:   1500,
		Temperature: 0.3,
	})
	if err != nil {
		return nil, err
	}

	// 解析 JSON
	text = strings.TrimSpace(text)
	// 去除可能的 markdown 代码块包裹
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var points []types.ThreadSummaryPoint
	if err := json.Unmarshal([]byte(text), &points); err != nil {
		return nil, fmt.Errorf("解析摘要要点失败: %v", err)
	}
	if len(points) == 0 {
		return nil, fmt.Errorf("摘要要点为空")
	}
	return points, nil
}

// threadSummaryToDTO 将 model 转为 DTO
func threadSummaryToDTO(ts *model.ThreadSummary, commentCount int) *types.ThreadSummaryDTO {
	var points []types.ThreadSummaryPoint
	if ts.Points != nil {
		json.Unmarshal(ts.Points, &points)
	}
	if points == nil {
		points = []types.ThreadSummaryPoint{}
	}
	return &types.ThreadSummaryDTO{
		Points:       points,
		Status:       "done",
		Stale:        ts.Stale,
		CommentCount: commentCount,
		GeneratedAt:  ts.UpdatedAt.Format(time.RFC3339),
	}
}
