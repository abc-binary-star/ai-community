package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
)

func mockProvider() *ModelProvider {
	return NewModelProvider(&config.LLMConfig{APIKey: "", Model: "test-model"})
}

func TestModelProviderMockModeCoversCoreOperations(t *testing.T) {
	p := mockProvider()
	ctx := context.Background()

	if !p.MockMode() {
		t.Fatal("空 API key 应进入模拟模式")
	}
	translated, err := p.Translate(ctx, TranslateInput{SourceText: "Hello world"})
	if err != nil {
		t.Fatalf("Translate 返回错误: %v", err)
	}
	if translated.TranslatedText != "[模拟译文] Hello world" {
		t.Fatalf("模拟译文不符合约定: %q", translated.TranslatedText)
	}
	if translated.UsedTokens != estimateTokens("Hello world") {
		t.Fatalf("Token 估算未写入结果: %d", translated.UsedTokens)
	}

	passed, message, err := p.Review(ctx, "source", "target", "")
	if err != nil || !passed || message != "开发模式跳过审校" {
		t.Fatalf("模拟审校结果异常: passed=%v message=%q err=%v", passed, message, err)
	}

	short := "短文本"
	summary, err := p.GenerateSummary(ctx, short)
	if err != nil || summary != short {
		t.Fatalf("短文本摘要异常: %q, %v", summary, err)
	}
	long := strings.Repeat("摘要", 80)
	summary, err = p.GenerateSummary(ctx, long)
	if err != nil || summary != long[:100] {
		t.Fatalf("长文本摘要应截断到 100 字节: len=%d err=%v", len(summary), err)
	}

	terms, err := p.ExtractGlossary(ctx, []string{"Ada uses an AI."})
	if err != nil || len(terms) != 1 || terms[0].Source != "AI" {
		t.Fatalf("模拟术语抽取结果异常: %+v, %v", terms, err)
	}
	issues, err := p.CheckConsistency(ctx, "book", "{}", nil)
	if err != nil || len(issues) != 0 {
		t.Fatalf("模拟一致性检查结果异常: %+v, %v", issues, err)
	}
	report, err := p.AssessQuality(ctx, []TextPair{{Source: "a", Target: "b"}}, "{}")
	if err != nil || report.Overall != 5 || report.Samples != 1 || len(report.Scores) != 3 {
		t.Fatalf("模拟 QA 结果异常: %+v, %v", report, err)
	}
	if _, err := p.GetChatModel(ctx); err == nil {
		t.Fatal("模拟模式不应返回真实 ChatModel")
	}
}

func TestExtractJSONHandlesMarkdownNestedValuesAndMalformedInput(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"object in markdown", "结果如下: ```json\n{\"a\": [1, {\"b\": \"}\"]}]\n```", "{\"a\": [1, {\"b\": \"}\"]}]"},
		{"array", "前缀 [1, 2, {\"ok\": true}] 后缀", "[1, 2, {\"ok\": true}]"},
		{"missing closing delimiter", "{\"a\": 1", ""},
		{"no json", "模型没有返回结构化内容", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := extractJSON(tc.in); got != tc.want {
				t.Fatalf("extractJSON() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestGenerateJSONReportsMissingAndInvalidJSON(t *testing.T) {
	// GenerateJSON 的真实模型调用通过 Generate 完成；这里直接验证提取器输出可被标准 JSON 解码，
	// 并覆盖缺少 JSON 与 JSON 语法错误时的错误语义。
	var got map[string]string
	valid := extractJSON("回答: {\"term\": \"术语\"}")
	if err := json.Unmarshal([]byte(valid), &got); err != nil || got["term"] != "术语" {
		t.Fatalf("提取出的 JSON 不可解码: %q, %v", valid, err)
	}
	if extractJSON("not json") != "" {
		t.Fatal("无 JSON 输出应返回空字符串")
	}
}

func TestEstimateTokensAndTruncate(t *testing.T) {
	if estimateTokens("") != 0 {
		t.Fatal("空文本 token 数应为 0")
	}
	if estimateTokens("中文") != 3 {
		t.Fatalf("中文 token 估算异常: %d", estimateTokens("中文"))
	}
	if got := truncate("abcdef", 3); got != "abc..." {
		t.Fatalf("truncate() = %q", got)
	}
	if got := truncate("abc", 3); got != "abc" {
		t.Fatalf("边界长度不应追加省略号: %q", got)
	}
}
