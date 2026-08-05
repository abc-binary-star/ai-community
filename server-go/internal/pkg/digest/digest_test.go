package digest

import (
	"strings"
	"testing"
)

// buildPlainText 生成一段无排版的长文本：只有句号，没有标题、列表、空行。
// 这是社区里最主力的写作形态，也是摘录必须扛住的场景。
func buildPlainText(n int) string {
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteString("这是关于分布式缓存一致性问题的第")
		b.WriteString(strings.Repeat("零", 1))
		b.WriteString("段讨论，主要讲缓存穿透和雪崩的处理办法。")
	}
	return b.String()
}

func TestExtract_短文全文直通(t *testing.T) {
	content := "今天调了一天的缓存问题，最后发现是 TTL 设置得太短了。"
	got := For(content, BudgetTitle)

	if got.Truncated {
		t.Errorf("短文不应被压缩，Truncated=%v", got.Truncated)
	}
	if got.Strategy != StrategyFull {
		t.Errorf("短文应走 %s 策略，实际为 %s", StrategyFull, got.Strategy)
	}
	if got.Text != content {
		t.Errorf("短文应原样返回\n期望: %q\n实际: %q", content, got.Text)
	}
}

func TestExtract_无排版长文走关键句抽取(t *testing.T) {
	content := buildPlainText(200)
	if len([]rune(content)) <= BudgetTitle {
		t.Fatalf("测试数据构造失败，长度 %d 未超预算", len([]rune(content)))
	}

	got := For(content, BudgetTitle)

	if got.Strategy != StrategyKeySent {
		t.Errorf("无排版长文应走 %s 策略，实际为 %s", StrategyKeySent, got.Strategy)
	}
	if !got.Truncated {
		t.Error("超预算的长文应标记为已压缩")
	}
	if n := len([]rune(got.Text)); n > BudgetTitle {
		t.Errorf("摘录长度 %d 超出预算 %d", n, BudgetTitle)
	}
	if strings.TrimSpace(got.Text) == "" {
		t.Error("摘录不应为空")
	}
}

func TestExtract_无标点意识流走位置采样(t *testing.T) {
	// 整篇没有任何标点和换行，分句会失败，必须由位置采样兜底
	content := strings.Repeat("缓存一致性真的很难搞我试了好几种方案都不行", 300)

	got := For(content, BudgetTitle)

	if got.Strategy != StrategyPosition {
		t.Errorf("无标点长文应走 %s 策略，实际为 %s", StrategyPosition, got.Strategy)
	}
	if n := len([]rune(got.Text)); n > BudgetTitle+8 {
		t.Errorf("采样结果长度 %d 明显超出预算 %d（含省略号余量）", n, BudgetTitle)
	}
}

func TestExtract_保留首末句(t *testing.T) {
	first := "开篇先说结论：缓存雪崩最有效的办法是加随机过期时间。"
	last := "最后补一句，上线前一定要压测验证。"
	content := first + buildPlainText(200) + last

	got := For(content, BudgetTitle)

	if !strings.Contains(got.Text, "开篇先说结论") {
		t.Error("摘录应保留首句（承载点题信息）")
	}
	if !strings.Contains(got.Text, "上线前一定要压测验证") {
		t.Error("摘录应保留末句（承载结论信息）")
	}
}

func TestExtract_空输入(t *testing.T) {
	for _, raw := range []string{"", "   ", "\n\n\t"} {
		got := For(raw, BudgetTitle)
		if got.Text != "" {
			t.Errorf("空输入应返回空摘录，输入 %q 得到 %q", raw, got.Text)
		}
	}
}

func TestExtract_代码块不占预算(t *testing.T) {
	code := "```go\n" + strings.Repeat("fmt.Println(\"hello world\")\n", 200) + "```"
	content := "先看这段代码。" + code + "问题出在循环里重复建立连接。"

	got := For(content, BudgetTitle)

	if strings.Contains(got.Text, "fmt.Println") {
		t.Error("代码块正文不应进入摘录")
	}
	if !strings.Contains(got.Text, "问题出在循环里") {
		t.Error("代码块后的正文应被保留")
	}
}

func TestExtract_摘要预算下常规帖子全文直通(t *testing.T) {
	// 3000 字左右的帖子，在 4000 预算下应完全不压缩
	content := buildPlainText(80)
	n := len([]rune(content))
	if n > BudgetSummarize {
		t.Fatalf("测试数据 %d 字超出摘要预算，需调整构造", n)
	}

	got := For(content, BudgetSummarize)
	if got.Truncated {
		t.Errorf("%d 字的帖子在 %d 预算下不应压缩", n, BudgetSummarize)
	}
}
