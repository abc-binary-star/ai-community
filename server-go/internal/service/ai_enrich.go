package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/digest"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// enrichCache 合并产物缓存，存序列化后的 EnrichResult
var enrichCache = digest.NewCache(digest.DefaultTTL, 0)

// enrichSystemPrompt 合并生成的系统提示词。
// 三产物共用一份正文摘录，一次调用出齐，省掉两份重复输入和两次往返。
const enrichSystemPrompt = `你是一个社区内容助手。根据帖子内容，一次性生成标题、摘要和分类标签。

严格按以下 JSON 格式输出，不要加代码块标记，不要加任何前言后语：
{"titles":["标题1","标题2","标题3"],"summary":"摘要文本","tags":["标签1","标签2","标签3"]}

各字段要求：
titles：3 个标题，每个 8-30 字，风格各异（一个直白概括、一个引发好奇、一个口语化），不加引号或序号
summary：一句话摘要，30-80 字，概括核心主题，客观陈述不加评价
tags：2-5 个分类标签，每个 2-6 字，是分类名称而非内容关键词，不加 # 号

标签分类参考：技术（前端、后端、AI、移动端、数据库、运维）、游戏（手游、端游、主机、攻略、赛事）、设计（UI、UX、平面、插画）、生活（美食、旅行、健身、宠物）、文化（文学、历史、电影、音乐、读书）、职场（求职、面试、副业、管理）、学术（数学、物理、论文）、其他`

// Enrich 一次调用生成标题、摘要、标签三个产物。
//
// only 非空时只生成指定的一项（title / summary / tags），用于单项重生成。
// 解析失败时逐级降级，最终仍失败则退回单项调用，保证不因 JSON 格式问题整体失败。
func (s *AIService) Enrich(ctx context.Context, userID, title, content, only string) (*types.EnrichResult, error) {
	cacheKind := "enrich"
	if only != "" {
		cacheKind = "enrich:" + only
	}
	cacheKey := digest.NormHash(cacheKind, title, content)
	if cached, ok := aiCacheGet(ctx, enrichCache, cacheKind, cacheKey); ok && cached != "" {
		var r types.EnrichResult
		if err := json.Unmarshal([]byte(cached), &r); err == nil {
			return &r, nil
		}
	}

	// 三产物共用一份摘录，预算取三者最大值，保证摘要不因合并而降质
	d := digest.For(content, digest.BudgetSummarize)

	systemPrompt := enrichSystemPrompt
	if only != "" {
		systemPrompt = enrichPromptFor(only)
	}

	userMsg := d.Text
	if strings.TrimSpace(title) != "" {
		truncatedTitle := title
		if runes := []rune(truncatedTitle); len(runes) > 200 {
			truncatedTitle = string(runes[:200])
		}
		userMsg = fmt.Sprintf("标题：%s\n内容：%s", truncatedTitle, d.Text)
	}

	text, err := ai.Chat(ctx, ai.ChatRequest{
		System:      systemPrompt,
		User:        userMsg,
		MaxTokens:   1200,
		Temperature: 0.6,
		UserID:      userID,
		Feature:     "enrich",
	})
	if err != nil {
		log.Printf("[AI/Enrich] failed to call AI, err=%v", err)
		return nil, err
	}

	result := parseEnrichResult(text, only)
	if result == nil {
		log.Printf("[AI/Enrich] 解析失败，降级为单项调用，only=%q", only)
		return s.enrichFallback(ctx, userID, title, content, only)
	}

	log.Printf("[AI/Enrich] digest strategy=%s in=%d out=%d only=%q",
		d.Strategy, len([]rune(content)), len([]rune(d.Text)), only)

	if b, err := json.Marshal(result); err == nil {
		aiCacheSet(ctx, enrichCache, cacheKind, cacheKey, string(b))
	}
	return result, nil
}

// enrichPromptFor 返回单项重生成的系统提示词
func enrichPromptFor(only string) string {
	switch only {
	case "title":
		return `你是一个社区内容助手。根据帖子内容生成 3 个标题。

严格按以下 JSON 格式输出，不要加代码块标记或任何前言后语：
{"titles":["标题1","标题2","标题3"]}

每个标题 8-30 字，风格各异（一个直白概括、一个引发好奇、一个口语化），不加引号或序号`
	case "summary":
		return `你是一个社区内容助手。根据帖子内容生成一句话摘要。

严格按以下 JSON 格式输出，不要加代码块标记或任何前言后语：
{"summary":"摘要文本"}

摘要 30-80 字，概括核心主题，客观陈述不加评价`
	case "tags":
		return `你是一个社区内容助手。根据帖子内容生成分类标签。

严格按以下 JSON 格式输出，不要加代码块标记或任何前言后语：
{"tags":["标签1","标签2","标签3"]}

2-5 个标签，每个 2-6 字，是分类名称而非内容关键词，不加 # 号

分类参考：技术（前端、后端、AI、移动端、数据库、运维）、游戏（手游、端游、主机、攻略、赛事）、设计（UI、UX、平面、插画）、生活（美食、旅行、健身、宠物）、文化（文学、历史、电影、音乐、读书）、职场（求职、面试、副业、管理）、学术（数学、物理、论文）、其他`
	}
	return enrichSystemPrompt
}

// enrichFallback 三级降级的最后一级：退回已有的单项实现。
// 这几个方法各自带缓存和容错，可靠性已经验证过。
func (s *AIService) enrichFallback(ctx context.Context, userID, title, content, only string) (*types.EnrichResult, error) {
	out := &types.EnrichResult{}

	if only == "" || only == "title" {
		titles, err := s.SuggestTitle(ctx, userID, content)
		if err != nil && only == "title" {
			return nil, err
		}
		out.Titles = titles
	}
	if only == "" || only == "summary" {
		summary, err := s.Summarize(ctx, userID, content)
		if err != nil && only == "summary" {
			return nil, err
		}
		out.Summary = summary
	}
	if only == "" || only == "tags" {
		// 标签走 PostService，其失败已降级为空数组，不阻塞流程
		tags, _ := postServiceForEnrich.SuggestTags(ctx, userID, title, content)
		out.Tags = tags
	}

	if len(out.Titles) == 0 && out.Summary == "" && len(out.Tags) == 0 {
		return nil, fmt.Errorf("AI 生成失败，请重试")
	}
	return out, nil
}

// postServiceForEnrich 标签生成复用 PostService 的实现（含缓存与降级）
var postServiceForEnrich = &PostService{}
