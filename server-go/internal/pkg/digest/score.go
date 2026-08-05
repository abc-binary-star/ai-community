package digest

import (
	"math"
	"sort"
	"strings"
)

// stopBigrams 高频虚词二字组，不参与重要度计算。
// 命中这些组合说明是连接成分而非主题词。
var stopBigrams = map[string]bool{
	"的话": true, "我们": true, "你们": true, "他们": true, "自己": true,
	"这个": true, "那个": true, "这样": true, "那样": true, "什么": true,
	"就是": true, "不是": true, "可以": true, "但是": true, "然后": true,
	"因为": true, "所以": true, "如果": true, "虽然": true, "而且": true,
	"一个": true, "一些": true, "很多": true, "非常": true, "真的": true,
	"感觉": true, "觉得": true, "其实": true, "现在": true, "已经": true,
	"还是": true, "或者": true, "以及": true, "对于": true, "关于": true,
}

// isMeaningful 判断一个 rune 是否可能承载主题信息。
// 汉字、字母、数字保留；标点、空白、emoji 排除。
func isMeaningful(r rune) bool {
	switch {
	case r >= 0x4E00 && r <= 0x9FFF: // CJK 基本区
		return true
	case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
		return true
	case r >= '0' && r <= '9':
		return true
	}
	return false
}

// bigrams 提取一段文本的二字组。
// 用二字组而非分词，是为了避免引入分词依赖：中文双字词占比高，
// 二字组的统计效果对「找主题句」这个粒度足够。
func bigrams(s string) []string {
	var rs []rune
	for _, r := range s {
		if isMeaningful(r) {
			rs = append(rs, r)
		}
	}
	if len(rs) < 2 {
		return nil
	}
	out := make([]string, 0, len(rs)-1)
	for i := 0; i+1 < len(rs); i++ {
		bg := string(rs[i : i+2])
		if !stopBigrams[bg] {
			out = append(out, bg)
		}
	}
	return out
}

// scoreSentences 按二字组词频给每个句子打分（就地修改 score 字段）。
func scoreSentences(sentences []sentence) {
	freq := make(map[string]int)
	for _, s := range sentences {
		for _, bg := range bigrams(s.text) {
			freq[bg]++
		}
	}

	total := len(sentences)
	for i := range sentences {
		bgs := bigrams(sentences[i].text)
		if len(bgs) == 0 {
			sentences[i].score = 0
			continue
		}
		var sum float64
		for _, bg := range bgs {
			sum += float64(freq[bg])
		}
		// 除以长度的 0.8 次方：抑制长句优势，但不完全抹平
		// （长句确实倾向于承载更多信息）
		norm := sum / math.Pow(float64(len(bgs)), 0.8)

		// 位置加权：开头点题、结尾收束，中间部分权重最低
		pos := float64(i) / float64(total)
		switch {
		case pos < 0.15:
			norm *= 1.30
		case pos > 0.85:
			norm *= 1.20
		}
		sentences[i].score = norm
	}
}

// selectKeySentences 选出总长不超过 maxRunes 的高分句，按原序拼回。
// 首句和末句强制入选：它们承载点题与结论，丢掉会明显影响下游任务判断。
func selectKeySentences(sentences []sentence, maxRunes int) string {
	scoreSentences(sentences)

	picked := make(map[int]bool)
	used := 0
	// 省略标记本身也占长度，预留出来，避免拼接后超预算
	const ellipsisCost = 2

	// 强制保留首末句
	for _, idx := range []int{0, len(sentences) - 1} {
		if picked[idx] {
			continue
		}
		if used+sentences[idx].runes+ellipsisCost > maxRunes {
			continue
		}
		picked[idx] = true
		used += sentences[idx].runes + ellipsisCost
	}

	// 其余按分数从高到低填充
	ranked := make([]sentence, len(sentences))
	copy(ranked, sentences)
	sort.SliceStable(ranked, func(i, j int) bool {
		return ranked[i].score > ranked[j].score
	})

	for _, s := range ranked {
		if picked[s.index] {
			continue
		}
		if used+s.runes+ellipsisCost > maxRunes {
			continue
		}
		picked[s.index] = true
		used += s.runes + ellipsisCost
	}

	var parts []string
	prev := -1
	for i, s := range sentences {
		if !picked[i] {
			continue
		}
		// 中间跳过了内容就插入省略标记，避免模型把不相邻的句子读成连贯上下文
		if prev >= 0 && i > prev+1 {
			parts = append(parts, "……")
		}
		parts = append(parts, s.text)
		prev = i
	}
	return strings.Join(parts, "")
}

// positionSample 位置采样兜底：整篇无标点无换行时按「头部多、中尾少」切片。
func positionSample(content string, maxRunes int) string {
	rs := []rune(content)
	if len(rs) <= maxRunes {
		return content
	}

	// 头 50%、中 25%、尾 25%
	head := maxRunes / 2
	mid := maxRunes / 4
	tail := maxRunes - head - mid

	midStart := (len(rs) - mid) / 2

	var b strings.Builder
	b.WriteString(string(rs[:head]))
	b.WriteString("……")
	b.WriteString(string(rs[midStart : midStart+mid]))
	b.WriteString("……")
	b.WriteString(string(rs[len(rs)-tail:]))
	return b.String()
}
