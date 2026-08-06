// Package hellboard 活动「无限循环读书地狱」的棋盘规则引擎。
//
// 这里是纯函数层，不依赖数据库与 HTTP，便于单测覆盖 PRD 第 7 节的状态机边界。
// 服务端权威要求（PRD 第 12 节）：掷骰点数、进度累加、点亮判定、保底触发、
// 计时到期全部由本包计算，前端不持有可影响结果的逻辑。
package hellboard

import "github.com/abc-binary-star/ai-community/server-go/internal/model"

// TileCount 环形棋盘固定 20 格
const TileCount = 20

// MaxTeamSize 队伍容量上限：满员后自助入队/队长拉人均拒绝
const MaxTeamSize = 5

// FallbackThreshold 格子内保底阈值：本格累计通过审核 40 本即保底点亮（P1-5）
const FallbackThreshold = 40

// 计时惩罚格编号与时长（P1-6）
const (
	PenaltyTileIndex = 8
	PenaltyHours     = 72
)

// DiceFaces 六面骰
const DiceFaces = 6

// TileDef 格子静态定义，来自 PRD 第 6 节「棋盘格子清单」
type TileDef struct {
	Index       int
	Title       string
	TaskType    string
	Target      int64
	Unit        string
	SpecialRule string
}

// Tiles 20 格清单，作为首次启动的种子数据；运营后续可改文案（PRD 第 13 节）
var Tiles = []TileDef{
	{1, "看十本标题为四个字的书", model.TaskTypeTitleLength, 10, "本", ""},
	{2, "看八本标题为三个字的书", model.TaskTypeTitleLength, 8, "本", ""},
	{3, "看十二本封面为红色的书", model.TaskTypeCoverColor, 12, "本", ""},
	{4, "看六本封面为绿色的书", model.TaskTypeCoverColor, 6, "本", model.RuleAllOdd},
	{5, "看十本推理小说", model.TaskTypeGenre, 10, "本", ""},
	{6, "看十三本作者为中国人的书", model.TaskTypeAuthorNationality, 13, "本", ""},
	{7, "看十本同一个作者的书", model.TaskTypeSameAuthor, 10, "本", ""},
	{8, "三天不打卡", model.TaskTypeTimedPenalty, PenaltyHours, "小时", ""},
	{9, "累计看 100w 字", model.TaskTypeTotalWords, 1000000, "字", model.RuleAllBelow4},
	{10, "看十三本书", model.TaskTypePlainCount, 13, "本", ""},
	{11, "看八本标题为两个字的书", model.TaskTypeTitleLength, 8, "本", ""},
	{12, "看十二本封面为紫色的书", model.TaskTypeCoverColor, 12, "本", ""},
	{13, "看七本亚洲文学", model.TaskTypeGenre, 7, "本", model.RuleAllEven},
	{14, "看三本历史类书籍", model.TaskTypeGenre, 3, "本", ""},
	{15, "看九本封面为蓝色的书", model.TaskTypeCoverColor, 9, "本", ""},
	{16, "看十四本标题为五个字的书", model.TaskTypeTitleLength, 14, "本", ""},
	{17, "看七本书", model.TaskTypePlainCount, 7, "本", model.RuleAllAbove3},
	{18, "看五本封面主色调有两种颜色的书", model.TaskTypeCoverColor, 5, "本", ""},
	// 目标以分钟存储（20 小时 = 1200 分钟），避免零散分钟在累加时被丢弃；展示层换算回小时
	{19, "持续看书累计 20 小时", model.TaskTypeTotalDuration, 1200, "分钟", ""},
	{20, "看十二本群友本月打卡过的书", model.TaskTypeGroupCross, 12, "本", ""},
}

// RuleLabels 判定规则的面向用户文案
var RuleLabels = map[string]string{
	model.RuleAllOdd:    "全员都投出奇数时可以前进",
	model.RuleAllEven:   "全员都投出偶数时可以前进",
	model.RuleAllBelow4: "全员点数低于 4 点（每人 ≤ 3）时可以前进",
	model.RuleAllAbove3: "全员点数超过 3 点（每人 ≥ 4）时可以前进",
}

// Advance 环形前进：从 from 走 steps 步后的落点（1-based，跨过 20 回到 1）
func Advance(from, steps int) int {
	return (from-1+steps)%TileCount + 1
}

// CrossesStart 前进是否跨过第 20 格回到第 1 格，用于轮次累加
func CrossesStart(from, steps int) bool {
	return from-1+steps >= TileCount
}

// MatchesRule 判定单个点数是否满足规则。
// 点数口径见 P0-2：低于 4 点为每人 ≤ 3，超过 3 点为每人 ≥ 4。
func MatchesRule(kind string, value int) bool {
	switch kind {
	case model.RuleAllOdd:
		return value%2 == 1
	case model.RuleAllEven:
		return value%2 == 0
	case model.RuleAllBelow4:
		return value <= 3
	case model.RuleAllAbove3:
		return value >= 4
	default:
		return false
	}
}
