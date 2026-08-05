package digest

// 各功能的摘录预算（字符数）。
//
// 摘要预算给到 4000（正文上限为 40000）：社区帖子绝大多数在 4000 字以内，
// 因此常规内容全文直通、零质量损失，只有极长文才触发压缩。
// 标题和标签的任务粒度粗，2000 字足以判断主题，
// 且摘录覆盖全篇，比现状「截取前 2000 字」看得更全。
const (
	BudgetSummarize = 4000
	BudgetTitle     = 2000
	BudgetTags      = 2000
)

// For 按预算提取摘录，是调用方最常用的入口。
func For(content string, maxRunes int) Result {
	return Extract(content, Options{MaxRunes: maxRunes})
}
