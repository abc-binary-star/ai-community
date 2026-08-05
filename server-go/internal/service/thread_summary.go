package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
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

// PostSummaryError 摘要业务错误。
// 名字沿用 v1 时期的命名，是为了避免改动 handler 层的类型断言；
// 实际使用者只有 v2 的讨论摘要链路。
type PostSummaryError struct {
	Msg  string
	Code int
}

func (e *PostSummaryError) Error() string { return e.Msg }

// GetThreadSummary 获取讨论摘要（仅读取缓存，不自动触发生成）
// - 已有缓存且未过期 -> 直接返回
// - 已有缓存但过期 -> 返回旧数据(标记 stale)
// - 无缓存 -> 返回 none 状态
func (s *ThreadSummaryService) GetThreadSummary(ctx context.Context, postID string) (*types.ThreadSummaryDTO, error) {
	// 帖子必须存在
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "title", "content").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &PostSummaryError{Msg: "帖子不存在", Code: 404}
		}
		log.Printf("[ThreadSummary/GetThreadSummary] failed to get post, postID=%s, err=%v", postID, err)
		return nil, err
	}

	// 当前评论数
	var commentCount int64
	dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("post_id = ?", postID).Count(&commentCount)

	// 查已有摘要
	var cached model.ThreadSummary
	hasCached := dal.DB.WithContext(ctx).First(&cached, "post_id = ?", postID).Error == nil

	if hasCached && cached.Summary != "" {
		// 检查是否过期：当前评论数 - 生成时评论数 >= 阈值
		stale := commentCount-int64(cached.CommentCount) >= int64(threadSummaryStaleDelta)

		dto := threadSummaryToDTO(&cached, int(commentCount))
		dto.Stale = stale
		return dto, nil
	}

	// 无缓存
	return &types.ThreadSummaryDTO{
		Status:       "none",
		CommentCount: int(commentCount),
	}, nil
}

// GenerateThreadSummary 手动触发生成讨论摘要（跳过评论数阈值检查）
// - 已有缓存且未过期 -> 直接返回
// - 已有缓存但过期 -> 返回旧数据(标记 stale) + 后台异步更新
// - 无缓存 -> 返回 generating 状态 + 后台异步生成
func (s *ThreadSummaryService) GenerateThreadSummary(ctx context.Context, userID, postID string) (*types.ThreadSummaryDTO, error) {
	// 帖子必须存在
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "title", "content").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &PostSummaryError{Msg: "帖子不存在", Code: 404}
		}
		log.Printf("[ThreadSummary/GenerateThreadSummary] failed to get post, postID=%s, err=%v", postID, err)
		return nil, err
	}

	// 当前评论数
	var commentCount int64
	dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("post_id = ?", postID).Count(&commentCount)

	// 查已有摘要
	var cached model.ThreadSummary
	hasCached := dal.DB.WithContext(ctx).First(&cached, "post_id = ?", postID).Error == nil

	if hasCached && cached.Summary != "" {
		stale := commentCount-int64(cached.CommentCount) >= int64(threadSummaryStaleDelta)
		dto := threadSummaryToDTO(&cached, int(commentCount))
		dto.Stale = stale
		if stale {
			go s.asyncGenerate(postID, userID)
		}
		return dto, nil
	}

	// 无缓存或旧数据（summary 为空），异步生成
	// 但评论数未达阈值时不生成
	if commentCount < int64(threadSummaryMinComments) {
		return &types.ThreadSummaryDTO{
			Status:       "none",
			CommentCount: int(commentCount),
		}, nil
	}

	go s.asyncGenerate(postID, userID)

	return &types.ThreadSummaryDTO{
		Status:       "generating",
		CommentCount: int(commentCount),
	}, nil
}

// asyncGenerate 异步生成讨论摘要
func (s *ThreadSummaryService) asyncGenerate(postID, userID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	// 拉取帖子
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "title", "content").First(&post, "id = ?", postID).Error; err != nil {
		log.Printf("[ThreadSummary/asyncGenerate] failed to get post, postID=%s, err=%v", postID, err)
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
		log.Printf("[ThreadSummary/asyncGenerate] failed to get comments, postID=%s, err=%v", postID, err)
		return
	}

	summaryText, err := generateThreadSummaryText(ctx, userID, &post, comments)
	if err != nil {
		log.Printf("[ThreadSummary/asyncGenerate] failed to generate summary text, postID=%s, err=%v", postID, err)
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
			"summary":       summaryText,
			"stale":         false,
			"comment_count": commentCount,
		})
	} else {
		// 创建
		ts := model.ThreadSummary{
			PostID:       postID,
			Summary:      summaryText,
			CommentCount: int(commentCount),
			Stale:        false,
		}
		dal.DB.Create(&ts)
	}
}

// generateThreadSummaryText 调用 LLM 生成段落式讨论摘要
func generateThreadSummaryText(ctx context.Context, userID string, post *model.Post, comments []model.Comment) (string, error) {
	// 截断帖子内容
	postContent := post.Content
	if runes := []rune(postContent); len(runes) > 2000 {
		postContent = string(runes[:2000])
	}

	// 合并评论：每条截断 300 字
	var sb strings.Builder
	for i, c := range comments {
		content := c.Content
		if runes := []rune(content); len(runes) > 300 {
			content = string(runes[:300])
		}
		sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, content))
	}
	commentsText := sb.String()
	if runes := []rune(commentsText); len(runes) > 6000 {
		commentsText = string(runes[:6000])
	}

	systemPrompt := `你是一个社区讨论分析助手。用户会给你一篇帖子和若干条评论，请用一段连贯的段落总结讨论的核心内容。

要求：
1. 用 2-4 句话写成一段连贯的段落，总结讨论的主要观点、结论、共识与分歧
2. 不要逐条复述评论，要归纳总结
3. 保留关键细节（如技术方案名、具体结论）
4. 只输出摘要段落，不要任何前言、后语或标题`

	userMsg := fmt.Sprintf("帖子标题：%s\n帖子内容：%s\n\n讨论评论：\n%s", post.Title, postContent, commentsText)

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        userMsg,
		MaxTokens:   800,
		Temperature: 0.3,
		UserID:      userID,
		Feature:     "thread_summary",
	})
	if err != nil {
		log.Printf("[ThreadSummary/generateThreadSummaryText] failed to call AI, postID=%s, err=%v", post.ID, err)
		return "", err
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return "", fmt.Errorf("摘要内容为空")
	}
	return text, nil
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
		Summary:      ts.Summary,
		Points:       points,
		Status:       "done",
		Stale:        ts.Stale,
		CommentCount: commentCount,
		GeneratedAt:  ts.UpdatedAt.Format(time.RFC3339),
	}
}
