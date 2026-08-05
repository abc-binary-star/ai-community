package digest

import (
	"strings"
	"testing"
)

// TestExtract_长文保留后半段结论 验证摘录相对「截取前 2000 字」的质量优势。
// 现状实现只看前 2000 字，结论在后半段时模型完全看不到。
func TestExtract_长文保留后半段结论(t *testing.T) {
	filler := strings.Repeat("这里先铺垫一些背景信息，讲讲我最初是怎么排查的。", 200)
	conclusion := "最终结论是：问题根源在连接池配置，把最大连接数从十调到一百就恢复正常了。"
	content := filler + conclusion

	// 前缀截断拿不到结论
	prefix := string([]rune(content)[:BudgetTitle])
	if strings.Contains(prefix, "连接池配置") {
		t.Fatal("测试数据构造有误：结论不应落在前缀截断范围内")
	}

	got := For(content, BudgetTitle)
	if !strings.Contains(got.Text, "连接池配置") {
		t.Error("摘录应保留末段结论，这是相对前缀截断的核心优势")
	}
}

// TestExtract_预算内绝不丢字 摘要预算下的常规长度帖子必须零损失。
func TestExtract_预算内绝不丢字(t *testing.T) {
	sizes := []int{100, 1000, 3000, BudgetSummarize - 1, BudgetSummarize}
	for _, size := range sizes {
		content := strings.Repeat("测", size)
		got := For(content, BudgetSummarize)
		if got.Text != content {
			t.Errorf("%d 字正文在 %d 预算内应原样返回，实际长度 %d",
				size, BudgetSummarize, len([]rune(got.Text)))
		}
		if got.Truncated {
			t.Errorf("%d 字正文在 %d 预算内不应标记压缩", size, BudgetSummarize)
		}
	}
}

// TestExtract_各预算下都不超限 防止省略标记导致的超预算回归。
func TestExtract_各预算下都不超限(t *testing.T) {
	contents := map[string]string{
		"有句号的长文": strings.Repeat("这是一段正常写作的内容，有标点也有分句。", 500),
		"无标点意识流": strings.Repeat("完全不加标点就这么一直写下去", 500),
		"混合换行":   strings.Repeat("一行内容\n另一行内容。\n\n还有一段。\n", 300),
	}

	budgets := []int{BudgetTitle, BudgetTags, BudgetSummarize}

	for name, content := range contents {
		for _, budget := range budgets {
			got := For(content, budget)
			// 位置采样会插入两个省略标记，留少量余量
			limit := budget + 8
			if n := len([]rune(got.Text)); n > limit {
				t.Errorf("%s 在预算 %d 下产出 %d 字，超出上限（策略 %s）",
					name, budget, n, got.Strategy)
			}
		}
	}
}
