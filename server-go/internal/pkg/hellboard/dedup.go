package hellboard

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// bookNoiseChars 书名号与括号类噪声字符，查重前统一剔除。
// 「《活着》」与「活着」应视为同一本书（PRD 8.1 归一化要求）。
var bookNoiseChars = []string{
	"《", "》", "〈", "〉", "「", "」", "『", "』",
	"【", "】", "（", "）", "(", ")", "[", "]",
	" ", "\t", "\u3000",
}

// NormalizeBookField 归一化书名或作者：去书名号、去空格、转小写
func NormalizeBookField(s string) string {
	out := strings.TrimSpace(s)
	for _, ch := range bookNoiseChars {
		out = strings.ReplaceAll(out, ch, "")
	}
	return strings.ToLower(out)
}

// DedupKey 生成「成员 + 书名 + 作者」查重键（P1-8）。
// 与 activity_checkin_books.dedup_key 唯一索引配套，兜住并发重复提交。
func DedupKey(memberID, title, author string) string {
	return memberID + "::" + NormalizeBookField(title) + "::" + NormalizeBookField(author)
}

// 活动周期为 9 月整月（九月彩虹桥），Asia/Shanghai
var cycleLocation = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		// 容器缺 tzdata 时退化为固定东八区偏移，避免周期判断整体失效
		return time.FixedZone("CST", 8*3600)
	}
	return loc
}()

// CycleRange 返回指定年份的活动周期区间 [start, end]。
// 结束时刻为 9 月 30 日 23:59:59，之后页面转为只读归档态。
// 支持通过环境变量 HELLBOARD_START_OFFSET_DAYS 提前开始（测试用），
// 数值为正表示开始日期提前 N 天，默认 0 即 9 月 1 日开始。
func CycleRange(year int) (start, end time.Time) {
	start = time.Date(year, time.September, 1, 0, 0, 0, 0, cycleLocation)
	offset := 0
	if v := os.Getenv("HELLBOARD_START_OFFSET_DAYS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			offset = n
		}
	}
	if offset > 0 {
		start = start.AddDate(0, 0, -offset)
	}
	end = time.Date(year, time.September, 30, 23, 59, 59, 0, cycleLocation)
	return start, end
}

// CycleYear 活动周期年份。取当前年份，使实现随年份自然滚动，
// 无需每年改代码；运营需要固定年份时可在此处收敛为配置项。
func CycleYear(now time.Time) int {
	return now.In(cycleLocation).Year()
}

// IsArchived 活动是否已结束进入只读归档态（P1-7 / 验收标准 12）
func IsArchived(now time.Time) bool {
	_, end := CycleRange(CycleYear(now))
	return now.After(end)
}

// IsCycleStarted 活动是否已开始。未开始时同样不允许提交与掷骰。
func IsCycleStarted(now time.Time) bool {
	start, _ := CycleRange(CycleYear(now))
	return !now.Before(start)
}
