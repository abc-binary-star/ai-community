package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// 评论数达到该阈值才生成讨论摘要
const summaryMinComments = 20

// 参与摘要的评论上限（取最早的 N 条，避免超长）
const summaryMaxComments = 100

// PostSummaryService 帖子讨论摘要服务
type PostSummaryService struct{}

// PostSummaryError 摘要业务错误
type PostSummaryError struct {
	Msg  string
	Code int
}

func (e *PostSummaryError) Error() string { return e.Msg }

// GetSummary 获取帖子讨论摘要
// - 已有缓存直接返回
// - 评论数未达阈值返回 eligible=false（不生成）
// - 评论数达标则调用 AI 生成并缓存
func (s *PostSummaryService) GetSummary(ctx context.Context, postID string) (*types.PostSummary, error) {
	// 帖子必须存在
	var post model.Post
	if err := dal.DB.WithContext(ctx).Select("id", "title", "content", "channel").First(&post, "id = ?", postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, &PostSummaryError{Msg: "帖子不存在", Code: 404}
		}
		return nil, err
	}

	// 命中缓存直接返回
	var cached model.PostSummary
	if err := dal.DB.WithContext(ctx).First(&cached, "post_id = ?", postID).Error; err == nil {
		return summaryToDTO(&cached), nil
	} else if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	// 评论数阈值检查，未达标不生成
	var commentCount int64
	dal.DB.WithContext(ctx).Model(&model.Comment{}).Where("post_id = ?", postID).Count(&commentCount)
	if commentCount < summaryMinComments {
		return &types.PostSummary{Eligible: false}, nil
	}

	// 拉取评论（最早的 N 条）
	var comments []model.Comment
	if err := dal.DB.WithContext(ctx).
		Where("post_id = ?", postID).
		Order("created_at ASC").
		Limit(summaryMaxComments).
		Find(&comments).Error; err != nil {
		return nil, err
	}

	summaryText, err := generateDiscussionSummary(ctx, &post, comments)
	if err != nil {
		return nil, err
	}

	rec := model.PostSummary{
		PostID:       postID,
		Summary:      summaryText,
		CommentCount: int(commentCount),
		Model:        conf.Global.DeepSeekModel,
	}
	if err := dal.DB.WithContext(ctx).Create(&rec).Error; err != nil {
		return nil, err
	}
	return summaryToDTO(&rec), nil
}

func summaryToDTO(s *model.PostSummary) *types.PostSummary {
	return &types.PostSummary{
		Summary:      s.Summary,
		CommentCount: s.CommentCount,
		GeneratedAt:  s.CreatedAt.Format(time.RFC3339),
		Eligible:     true,
	}
}

// generateDiscussionSummary 调用 DeepSeek 生成讨论要点摘要
func generateDiscussionSummary(ctx context.Context, post *model.Post, comments []model.Comment) (string, error) {
	apiKey := conf.Global.DeepSeekKey
	if apiKey == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY 未配置")
	}
	baseURL := conf.Global.DeepSeekURL
	if baseURL == "" {
		baseURL = "https://api.deepseek.com"
	}
	model := conf.Global.DeepSeekModel
	if model == "" {
		model = "deepseek-chat"
	}

	// 截断帖子内容
	postContent := post.Content
	if runes := []rune(postContent); len(runes) > 2000 {
		postContent = string(runes[:2000])
	}

	// 合并评论：每条截断 300 字，整体上限 6000 字
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

	systemPrompt := `你是一个社区讨论分析助手。用户会给你一篇帖子和若干条评论，请提炼出讨论的核心要点。
要求：
1. 提炼 3-6 个讨论要点，覆盖讨论的主要观点、结论、共识与分歧
2. 每个要点一句话，简洁准确，保留关键细节（如技术方案名、具体结论）
3. 不要逐条复述评论，要归纳总结
4. 使用 Markdown 无序列表输出（每行以 "- " 开头）
5. 只输出要点列表，不要任何前言或后语`

	userPrompt := fmt.Sprintf("帖子标题：%s\n帖子内容：%s\n\n讨论评论：\n%s", post.Title, postContent, commentsText)

	reqBody, _ := json.Marshal(map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"max_tokens":  1000,
		"temperature": 0.3,
	})

	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/v1/chat/completions", bytes.NewReader(reqBody))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("AI 服务请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("AI 服务请求失败 (%d): %s", resp.StatusCode, string(body))
	}

	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}

	choices, ok := data["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return "", fmt.Errorf("AI 返回内容为空")
	}
	choice := choices[0].(map[string]interface{})
	message := choice["message"].(map[string]interface{})
	text, _ := message["content"].(string)
	return strings.TrimSpace(text), nil
}
