package digest

import "testing"

func TestNormHash_排版改动不击穿缓存(t *testing.T) {
	base := "今天聊聊缓存一致性。主要有三种方案。"

	cases := []struct {
		name    string
		variant string
	}{
		{"加粗某个词", "今天聊聊**缓存一致性**。主要有三种方案。"},
		{"全角改半角标点", "今天聊聊缓存一致性.主要有三种方案."},
		{"行尾多余空格", "今天聊聊缓存一致性。 \n主要有三种方案。  "},
		{"多余空行", "今天聊聊缓存一致性。\n\n\n\n主要有三种方案。"},
		{"首行全角缩进", "　　今天聊聊缓存一致性。主要有三种方案。"},
		{"斜体标记", "今天聊聊*缓存一致性*。主要有三种方案。"},
	}

	want := NormHash(base)
	for _, tc := range cases {
		if got := NormHash(tc.variant); got != want {
			t.Errorf("%s: 归一化后哈希应与基准一致，却不同", tc.name)
		}
	}
}

func TestNormHash_内容变化会失效(t *testing.T) {
	base := NormHash("今天聊聊缓存一致性。主要有三种方案。")

	cases := []struct {
		name    string
		variant string
	}{
		{"改数字", "今天聊聊缓存一致性。主要有四种方案。"},
		{"加句子", "今天聊聊缓存一致性。主要有三种方案。第一种是加随机过期。"},
		{"换主题", "今天聊聊消息队列。主要有三种方案。"},
	}

	for _, tc := range cases {
		if got := NormHash(tc.variant); got == base {
			t.Errorf("%s: 实质内容变化应产生不同哈希，却相同", tc.name)
		}
	}
}

func TestNormHash_多段拼接有分隔(t *testing.T) {
	// 防止 ("ab","c") 与 ("a","bc") 撞哈希
	if NormHash("ab", "c") == NormHash("a", "bc") {
		t.Error("不同的分段方式不应产生相同哈希")
	}
}

func TestNormalize_空输入(t *testing.T) {
	for _, raw := range []string{"", "  ", "\n\t"} {
		if got := Normalize(raw); got != "" {
			t.Errorf("Normalize(%q) 应为空，实际 %q", raw, got)
		}
	}
}
