package service

import (
	"testing"

	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// TestRenderTemplate 校验模板占位替换规则：
// 字符串原样替换；数字整数去掉小数点；布尔转 true/false；
// 未提供的占位保留原文，便于用户定位漏填。
func TestRenderTemplate(t *testing.T) {
	cases := []struct {
		name     string
		tpl      string
		inputs   map[string]any
		expected string
	}{
		{
			name:     "无占位",
			tpl:      "hello world",
			inputs:   map[string]any{},
			expected: "hello world",
		},
		{
			name:     "字符串替换",
			tpl:      "请为 {{topic}} 写一段简介",
			inputs:   map[string]any{"topic": "量子计算"},
			expected: "请为 量子计算 写一段简介",
		},
		{
			name:     "占位带空格",
			tpl:      "风格：{{ style }}",
			inputs:   map[string]any{"style": "口语"},
			expected: "风格：口语",
		},
		{
			name:     "整数（JSON 解析为 float64）替换为整数串",
			tpl:      "写 {{count}} 条",
			inputs:   map[string]any{"count": float64(5)},
			expected: "写 5 条",
		},
		{
			name:     "浮点数保留小数",
			tpl:      "温度 {{temp}}",
			inputs:   map[string]any{"temp": 0.7},
			expected: "温度 0.7",
		},
		{
			name:     "布尔转 true/false",
			tpl:      "启用 Markdown：{{md}}",
			inputs:   map[string]any{"md": true},
			expected: "启用 Markdown：true",
		},
		{
			name:     "未提供的占位保留原文",
			tpl:      "主题：{{topic}}，风格：{{style}}",
			inputs:   map[string]any{"topic": "AI"},
			expected: "主题：AI，风格：{{style}}",
		},
		{
			name:     "多变量混合",
			tpl:      "{{name}} 今年 {{age}} 岁，擅长 {{skill}}",
			inputs:   map[string]any{"name": "小明", "age": float64(28), "skill": "Go"},
			expected: "小明 今年 28 岁，擅长 Go",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := renderTemplate(tc.tpl, tc.inputs)
			if got != tc.expected {
				t.Errorf("期望 %q, 实际 %q", tc.expected, got)
			}
		})
	}
}

// TestValidateInputs 校验输入变量校验规则：
// 必填项缺失拒绝；类型不匹配拒绝；select 必须命中 options；多余键拒绝。
func TestValidateInputs(t *testing.T) {
	declared := []types.AssetInputVariable{
		{Name: "topic", Type: "string", Required: true},
		{Name: "tone", Type: "select", Options: []any{"正式", "口语"}, Required: true},
		{Name: "count", Type: "number"},
		{Name: "verbose", Type: "boolean"},
	}
	cases := []struct {
		name    string
		inputs  map[string]any
		wantErr bool
	}{
		{name: "全部合法", inputs: map[string]any{"topic": "AI", "tone": "口语", "count": float64(3), "verbose": true}, wantErr: false},
		{name: "必填缺失", inputs: map[string]any{"topic": "AI"}, wantErr: true},
		{name: "string 类型不匹配", inputs: map[string]any{"topic": 123, "tone": "口语"}, wantErr: true},
		{name: "select 不在 options", inputs: map[string]any{"topic": "AI", "tone": "古风"}, wantErr: true},
		{name: "select 类型错（非字符串）", inputs: map[string]any{"topic": "AI", "tone": 1}, wantErr: true},
		{name: "number 类型不匹配", inputs: map[string]any{"topic": "AI", "tone": "口语", "count": "三"}, wantErr: true},
		{name: "boolean 类型不匹配", inputs: map[string]any{"topic": "AI", "tone": "口语", "verbose": "yes"}, wantErr: true},
		{name: "多余键拒绝", inputs: map[string]any{"topic": "AI", "tone": "口语", "extra": "x"}, wantErr: true},
		{name: "仅必填合法（可选省略）", inputs: map[string]any{"topic": "AI", "tone": "正式"}, wantErr: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateInputs(declared, tc.inputs)
			if tc.wantErr && err == nil {
				t.Errorf("期望返回错误，实际为 nil")
			}
			if !tc.wantErr && err != nil {
				t.Errorf("期望无错误，实际: %v", err)
			}
		})
	}
}

// TestValidateInputsEmptyDeclared 无变量声明时只允许空输入
func TestValidateInputsEmptyDeclared(t *testing.T) {
	if err := validateInputs(nil, map[string]any{}); err != nil {
		t.Errorf("空声明+空输入应通过，实际: %v", err)
	}
	if err := validateInputs(nil, map[string]any{"x": 1}); err == nil {
		t.Errorf("空声明+非空输入应拒绝")
	}
}
