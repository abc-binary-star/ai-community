package service

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// enrichRaw 对应模型输出的 JSON 结构
type enrichRaw struct {
	Titles  []string `json:"titles"`
	Summary string   `json:"summary"`
	Tags    []string `json:"tags"`
}

var (
	// jsonObjectRe 从夹带前言后语的输出里抠出 JSON 对象
	jsonObjectRe = regexp.MustCompile(`(?s)\{.*\}`)
	// fenceRe 去掉 ```json 围栏
	fenceRe = regexp.MustCompile("(?s)^\\s*```(?:json)?\\s*|\\s*```\\s*$")
)

// parseEnrichResult 解析模型输出，返回 nil 表示三级降级都失败。
//
// 一级：直接按 JSON 解析（去围栏后）
// 二级：正则抠出 JSON 对象片段再解析
// 三级：按行提取字段
func parseEnrichResult(text, only string) *types.EnrichResult {
	cleaned := fenceRe.ReplaceAllString(strings.TrimSpace(text), "")

	// 一级
	if r := tryJSON(cleaned); r != nil && enrichSatisfies(r, only) {
		return r
	}
	// 二级
	if m := jsonObjectRe.FindString(cleaned); m != "" {
		if r := tryJSON(m); r != nil && enrichSatisfies(r, only) {
			return r
		}
	}
	// 三级
	if r := tryLineParse(cleaned); r != nil && enrichSatisfies(r, only) {
		return r
	}
	return nil
}

// tryJSON 尝试标准 JSON 解析并做字段清洗
func tryJSON(s string) *types.EnrichResult {
	var raw enrichRaw
	if err := json.Unmarshal([]byte(s), &raw); err != nil {
		return nil
	}
	return &types.EnrichResult{
		Titles:  cleanTitles(raw.Titles),
		Summary: cleanSummary(raw.Summary),
		Tags:    cleanTags(raw.Tags),
	}
}

var (
	titleLineRe   = regexp.MustCompile(`(?m)^\s*(?:标题|title)\s*[:：]\s*(.+)$`)
	summaryLineRe = regexp.MustCompile(`(?m)^\s*(?:摘要|summary)\s*[:：]\s*(.+)$`)
	tagsLineRe    = regexp.MustCompile(`(?m)^\s*(?:标签|tags)\s*[:：]\s*(.+)$`)
)

// tryLineParse 按「字段名: 值」逐行提取，兼容模型完全不按 JSON 输出的情况
func tryLineParse(s string) *types.EnrichResult {
	out := &types.EnrichResult{}

	for _, m := range titleLineRe.FindAllStringSubmatch(s, -1) {
		out.Titles = append(out.Titles, m[1])
	}
	out.Titles = cleanTitles(out.Titles)

	if m := summaryLineRe.FindStringSubmatch(s); m != nil {
		out.Summary = cleanSummary(m[1])
	}
	if m := tagsLineRe.FindStringSubmatch(s); m != nil {
		out.Tags = cleanTags(splitTagString(m[1]))
	}

	if len(out.Titles) == 0 && out.Summary == "" && len(out.Tags) == 0 {
		return nil
	}
	return out
}

// enrichSatisfies 判断解析结果是否满足本次请求的最低要求
func enrichSatisfies(r *types.EnrichResult, only string) bool {
	switch only {
	case "title":
		return len(r.Titles) > 0
	case "summary":
		return r.Summary != ""
	case "tags":
		return len(r.Tags) > 0
	}
	// 三项全出时，至少要拿到两项才算成功，否则走降级补齐
	var n int
	if len(r.Titles) > 0 {
		n++
	}
	if r.Summary != "" {
		n++
	}
	if len(r.Tags) > 0 {
		n++
	}
	return n >= 2
}

// numPrefixRe 匹配「1. 」「2、」等序号前缀
var numPrefixRe = regexp.MustCompile(`^\s*\d+\s*[.、)）]\s*`)

func cleanTitles(in []string) []string {
	var out []string
	for _, t := range in {
		t = numPrefixRe.ReplaceAllString(strings.TrimSpace(t), "")
		t = strings.Trim(t, "\"'“”‘’")
		t = strings.TrimSpace(t)
		if n := len([]rune(t)); n >= 2 && n <= 100 {
			out = append(out, t)
		}
		if len(out) >= 3 {
			break
		}
	}
	return out
}

func cleanSummary(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "\"'“”‘’")
	return strings.TrimSpace(s)
}

func cleanTags(in []string) []string {
	var out []string
	seen := make(map[string]bool)
	for _, t := range in {
		t = strings.TrimSpace(t)
		t = strings.TrimPrefix(t, "#")
		t = strings.Trim(t, "\"'“”‘’")
		t = strings.TrimSpace(t)
		if t == "" || len([]rune(t)) > 20 || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
		if len(out) >= 5 {
			break
		}
	}
	return out
}

// splitTagString 按多种分隔符拆分标签串，与原 SuggestTags 的容错口径保持一致
func splitTagString(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == '，' || r == '、' || r == ' ' || r == '\n' || r == '\t'
	})
}
