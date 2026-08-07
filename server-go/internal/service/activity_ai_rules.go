package service

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
)

// 本地规则判定：不依赖大模型，AI 网关不可用时也能正常出结论。
// 覆盖：书名字数、字数/时长合理性、群内交叉书库。
// 封面颜色类主观性强，不做 AI 初审，提交时直接进入队长投票池由人工判断。

// evaluateTitleLength 书名字数判定（PRD 9.2 书名字数类）。
// 先按查重同款口径归一化（去书名号、括号、空格，转小写），再按字符计数。
// 精确匹配通过；偏离 ≤2 存疑（副标题/系列名噪声可能干扰）；偏离较大驳回。
//
// 目标字数从格子文案解析（如「看八本标题为两个字的书」→ 2 字）：
// tile.Target 存的是本数（8 本），不能直接当标题字数用，
// 否则两字标题书会被误判成「字数与目标不符」而进人工审核。
func evaluateTitleLength(book *model.ActivityCheckInBook, tile *model.ActivityTile) aiVerdict {
	title := strings.TrimSpace(book.Title)
	if title == "" {
		return aiRejected(0.9, "书名为空")
	}
	target, ok := titleLengthTargetFromTile(tile)
	if !ok {
		return aiUnsure(0.5, "无法从格子文案解析标题字数要求，请人工复核")
	}
	count := len([]rune(hellboard.NormalizeBookField(title)))
	diff := count - target
	if diff < 0 {
		diff = -diff
	}
	switch {
	case count == target:
		return aiPassed(0.95, fmt.Sprintf("书名字数 %d 字，与目标 %d 字一致", count, target))
	case diff <= 2:
		return aiUnsure(0.6, fmt.Sprintf("书名字数 %d 字，与目标 %d 字接近，可能存在副标题/系列名干扰，请人工复核", count, target))
	default:
		return aiRejected(0.9, fmt.Sprintf("书名字数 %d 字，与目标 %d 字不符", count, target))
	}
}

// titleLengthTargetRe 从格子文案里抠出标题字数，如「看十本标题为四个字的书」→「四」。
// 数字用中文（一~十 / 两），兼容阿拉伯数字以防运营改文案。
var titleLengthTargetRe = regexp.MustCompile(`标题为([0-9一二三四五六七八九十两]+)个字`)

// chineseNum 中文数字 → 阿拉伯数字
var chineseNum = map[string]int{
	"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
	"六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}

// titleLengthTargetFromTile 从格子文案解析标题字数目标；解析失败返回 ok=false
func titleLengthTargetFromTile(tile *model.ActivityTile) (int, bool) {
	m := titleLengthTargetRe.FindStringSubmatch(tile.Title)
	if len(m) < 2 {
		return 0, false
	}
	if n, ok := chineseNum[m[1]]; ok {
		return n, true
	}
	n, err := strconv.Atoi(m[1])
	if err != nil {
		return 0, false
	}
	return n, true
}

// evaluatePlainCount 纯数量格：任何书都计数，仅做单本字数异常识别（防虚报）。
// 字数在本格为选填（未填时为 0），直接通过，不误判。
func evaluatePlainCount(book *model.ActivityCheckInBook) aiVerdict {
	wc := book.WordCount
	if wc == 0 {
		return aiPassed(0.85, "字数未填写（本格选填），直接按纯数量格通过")
	}
	if wc > 5_000_000 {
		return aiUnsure(0.7, fmt.Sprintf("单本字数 %d 异常，请人工复核", wc))
	}
	return aiPassed(0.8, "字数在常见区间内")
}

// evaluateWordCount 累计字数格：单本字数合理性区间校验（PRD P2-11）。
// 明显偏低/偏高标存疑，由人工复核，避免虚报。
func evaluateWordCount(book *model.ActivityCheckInBook) aiVerdict {
	wc := book.WordCount
	switch {
	case wc <= 0:
		return aiRejected(0.95, "字数必须大于 0")
	case wc < 30_000:
		return aiUnsure(0.6, fmt.Sprintf("单本字数 %d 偏少，请人工复核", wc))
	case wc > 3_000_000:
		return aiUnsure(0.7, fmt.Sprintf("单本字数 %d 明显偏高，请人工复核", wc))
	default:
		return aiPassed(0.8, "字数在合理区间内")
	}
}

// evaluateDuration 累计时长格：阅读时长合理性校验（PRD P2-11）。
// 本格必须有阅读时长（0 分钟对进度无贡献）；单次过长标存疑。
func evaluateDuration(book *model.ActivityCheckInBook) aiVerdict {
	d := book.DurationMinutes
	switch {
	case d <= 0:
		return aiRejected(0.95, "本格为累计时长任务，阅读时长不能为 0")
	case d > 480:
		return aiUnsure(0.7, fmt.Sprintf("单次阅读时长 %d 分钟超过 8 小时，请人工复核", d))
	default:
		return aiPassed(0.8, "阅读时长合理")
	}
}

// evaluateGroupCross 第 20 格「看群友本月打卡过的书」。
// 本地比对活动内已通过审核的书目库：存在其他成员提交过的同名同作者且已通过的书则通过。
func (s *ActivityService) evaluateGroupCross(ctx context.Context, book *model.ActivityCheckInBook) aiVerdict {
	normTitle := hellboard.NormalizeBookField(book.Title)
	normAuthor := hellboard.NormalizeBookField(book.Author)
	if normTitle == "" || normAuthor == "" {
		return aiRejected(0.9, "书名或作者为空")
	}

	var rows []model.ActivityCheckInBook
	if err := dal.DB.WithContext(ctx).
		Select("id", "title", "author", "member_id").
		Where("review_status = ?", model.ReviewStatusApproved).
		Find(&rows).Error; err != nil {
		return aiSkippedVerdict()
	}
	for i := range rows {
		r := &rows[i]
		if r.ID == book.ID || r.MemberID == book.MemberID {
			continue // 排除自身：本格要求「群友」打卡过的书
		}
		if hellboard.NormalizeBookField(r.Title) == normTitle &&
			hellboard.NormalizeBookField(r.Author) == normAuthor {
			return aiPassed(0.95, "该书已在群友打卡通过的书库中")
		}
	}
	return aiRejected(0.9, "该书不在群友已打卡通过的书库中")
}
