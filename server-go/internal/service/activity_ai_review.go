package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/ai"
	"gorm.io/gorm"
)

// AI 初审接入点（PRD 9.2）。
//
// 审核路由（PRD 9.1 三档 + 现有实现）：
//   - AI 判定通过（passed）→ 直接终审通过并累加进度；
//   - 存疑（unsure）/ 驳回（rejected）/ 跳过（skipped）→ 进入队长投票池，
//     由队长投票过半通过后终审；管理员可从人工终审台兜底。
//
// 按任务类型分派校验：
//   - 书名字数类：本地规则（去书名号/空格噪声后按字计数），不调模型
//   - 字数 / 时长类：本地合理性区间校验，识别明显异常值
//   - 群内交叉类（第 20 格）：本地比对「活动内已通过审核的书目库」
//   - 题材 / 作者国籍类：调用大模型判定
//   - 同一作者类：单本书无法比对队伍内多本书的作者一致性，跳过交人工
//   - 封面颜色类：主观性强，不走 AI 初审，提交时直接进入队长投票池由人工判断
//
// AI 服务不可用时（未配置 DEEPSEEK_API_KEY 或调用失败）按 PRD 9.4 兜底：
// 提交直接进入队长投票池并标注「AI 初审跳过」，不阻断活动进行。

// activityReviewFeature 用量记录用的功能标识（system 配额模式只计全局 token 池）。
const activityReviewFeature = "activity_review"

// aiVerdict AI 初审结论
type aiVerdict struct {
	Status     string
	Confidence float64
	Reason     string
}

func aiPassed(conf float64, reason string) aiVerdict {
	return aiVerdict{Status: "passed", Confidence: clampConf(conf), Reason: reason}
}

func aiUnsure(conf float64, reason string) aiVerdict {
	return aiVerdict{Status: "unsure", Confidence: clampConf(conf), Reason: reason}
}

func aiRejected(conf float64, reason string) aiVerdict {
	return aiVerdict{Status: "rejected", Confidence: clampConf(conf), Reason: reason}
}

// aiSkippedVerdict AI 不可用或无需自动判定时的兜底结论（PRD 9.4）
func aiSkippedVerdict() aiVerdict {
	return aiVerdict{
		Status:     "skipped",
		Confidence: 0,
		Reason:     "AI 初审跳过，进入队长投票池由队长裁决",
	}
}

// clampConf 置信度收敛到 [0,1]
func clampConf(c float64) float64 {
	if c < 0 {
		return 0
	}
	if c > 1 {
		return 1
	}
	return c
}

// evaluateBook 对单条书目做初审，按格子任务类型分派校验方式。
// 本地规则（书名/字数/时长/群内交叉）不依赖模型，AI 网关不可用时仍可判定；
// 需要语义判断的题材 / 作者国籍走大模型，模型不可用时回退 skipped。
// 封面颜色类不在初审范围：提交时已直接进入队长投票池（见 SubmitCheckIn）。
func (s *ActivityService) evaluateBook(ctx context.Context, book *model.ActivityCheckInBook, tile *model.ActivityTile) aiVerdict {
	switch tile.TaskType {
	case model.TaskTypeTitleLength:
		return evaluateTitleLength(book, tile)
	case model.TaskTypeTotalWords:
		return evaluateWordCount(book)
	case model.TaskTypeTotalDuration:
		return evaluateDuration(book)
	case model.TaskTypePlainCount:
		return evaluatePlainCount(book)
	case model.TaskTypeGroupCross:
		return s.evaluateGroupCross(ctx, book)
	case model.TaskTypeGenre:
		return s.evaluateByModel(ctx, book, tile)
	case model.TaskTypeAuthorNationality:
		return s.evaluateByModel(ctx, book, tile)
	case model.TaskTypeSameAuthor:
		// 同一作者需要队伍在本格内多本书的作者比对，单本初审无法判定
		return aiVerdict{Status: "skipped", Confidence: 0,
			Reason: "同一作者需本格多本书横向比对，初审跳过，交由队长/人工确认"}
	case model.TaskTypeCoverColor, model.TaskTypeTimedPenalty:
		// 封面类直接进投票池不初审；惩罚格不接受打卡，理论均不可达
		return aiSkippedVerdict()
	default:
		return aiSkippedVerdict()
	}
}

// runAIPreReview 异步初审。提交事务已提交后触发，失败只记日志不影响活动。
//
// 三档路由：AI 判定通过 → 直接终审通过并累加进度；存疑/驳回/跳过 →
// 进入队长投票池（审核池全员可见，仅队长可投，过半赞成通过）。
// 封面颜色类在提交时已直接进入投票池，不经过本流程。
func runAIPreReview(books []model.ActivityCheckInBook) {
	if len(books) == 0 {
		return
	}
	// 独立超时上下文：调用方的请求上下文此时已结束；
	// 60s 覆盖封面图下载（20s）与模型判定（30s）的最坏情况
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	s := &ActivityService{}
	tiles, err := s.tileMap(ctx)
	if err != nil {
		log.Printf("[Activity] AI 初审加载格子定义失败: %v", err)
		return
	}

	for i := range books {
		b := &books[i]
		tile, ok := tiles[b.TileIndex]
		if !ok {
			continue
		}
		verdict := s.evaluateBook(ctx, b, tile)

		if verdict.Status == "passed" {
			if err := s.autoApprove(ctx, b, verdict); err != nil {
				log.Printf("[Activity] AI 通过回写失败 book=%s: %v", b.ID, err)
			}
			continue
		}

		// 存疑 / 驳回 / 跳过 → 进入投票池。乐观更新：仅当仍处于待审态才写入
		res := dal.DB.WithContext(ctx).Model(&model.ActivityCheckInBook{}).
			Where("id = ? AND review_status = ?", b.ID, model.ReviewStatusPendingAI).
			Updates(map[string]any{
				"review_status": model.ReviewStatusInVoting,
				"ai_status":     verdict.Status,
				"ai_confidence": verdict.Confidence,
				"ai_reason":     verdict.Reason,
			})
		if res.Error != nil {
			log.Printf("[Activity] AI 初审结论写回失败 book=%s: %v", b.ID, res.Error)
			continue
		}
		if res.RowsAffected == 0 {
			continue // 已被人工处理，跳过
		}

		// 审计日志：ReviewerID 为空表示 AI 写入
		if err := dal.DB.WithContext(ctx).Create(&model.ActivityReview{
			BookID:     b.ID,
			FromStatus: model.ReviewStatusPendingAI,
			ToStatus:   model.ReviewStatusInVoting,
			Reason:     verdict.Reason,
		}).Error; err != nil {
			log.Printf("[Activity] AI 初审审计写入失败 book=%s: %v", b.ID, err)
		}
	}
}

// autoApprove AI 判定通过后直接终审通过。
// 与人工 approve 走同一套 applyApproval，保证进度、榜单与队伍状态口径一致。
func (s *ActivityService) autoApprove(ctx context.Context, book *model.ActivityCheckInBook, verdict aiVerdict) error {
	return dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var locked model.ActivityCheckInBook
		if err := tx.Clauses(lockForUpdate()).First(&locked, "id = ?", book.ID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return nil
			}
			return err
		}
		if locked.ReviewStatus != model.ReviewStatusPendingAI {
			return nil // 已被人工或并发处理，跳过
		}

		if err := s.applyApproval(tx, &locked, true); err != nil {
			return err
		}
		if err := tx.Model(&model.ActivityCheckInBook{}).Where("id = ?", locked.ID).
			Updates(map[string]any{
				"review_status":   model.ReviewStatusApproved,
				"counts_for_task": true,
				"ai_status":       verdict.Status,
				"ai_confidence":   verdict.Confidence,
				"ai_reason":       verdict.Reason,
			}).Error; err != nil {
			return err
		}

		if err := tx.Create(&model.ActivityReview{
			BookID:     locked.ID,
			FromStatus: model.ReviewStatusPendingAI,
			ToStatus:   model.ReviewStatusApproved,
			Reason:     "AI 初审通过",
		}).Error; err != nil {
			return err
		}
		return s.addEvent(tx, locked.TeamID, model.EventTypeReview,
			fmt.Sprintf("《%s》AI 初审通过", locked.Title))
	})
}

// --- 大模型判定（题材 / 作者国籍） ---

// reviewModelResult 模型输出结构
type reviewModelResult struct {
	Match      bool    `json:"match"`
	Confidence float64 `json:"confidence"`
	Reason     string  `json:"reason"`
}

// evaluateByModel 调用大模型做语义判定（题材分类 / 作者国籍）。
// 模型未配置或调用失败时按 PRD 9.4 回退 skipped，不阻断活动。
func (s *ActivityService) evaluateByModel(ctx context.Context, book *model.ActivityCheckInBook, tile *model.ActivityTile) aiVerdict {
	if !ai.Enabled() {
		return aiSkippedVerdict()
	}

	resp, err := ai.Chat(ai.WithSystemQuota(ctx), ai.ChatRequest{
		// UserID 传提交成员，便于用量追踪；system 配额模式不计用户配额与次数
		UserID:      book.MemberID,
		Feature:     activityReviewFeature,
		System:      "你是阅读活动打卡的审核助手。根据任务要求判断一本书是否符合条件。只输出一个 JSON 对象，不要输出任何其他内容。",
		User:        reviewPromptFor(tile, book),
		MaxTokens:   150,
		Temperature: 0,
		Timeout:     30 * time.Second,
	})
	if err != nil {
		return aiVerdict{Status: "skipped", Confidence: 0,
			Reason: "AI 初审不可用：" + err.Error()}
	}

	r := parseReviewResult(resp)
	if r == nil {
		return aiUnsure(0.5, "AI 初审结论无法解析，请人工复核")
	}
	switch {
	case r.Match && r.Confidence >= 0.65:
		return aiPassed(r.Confidence, "AI 判定符合条件："+r.Reason)
	case !r.Match && r.Confidence >= 0.65:
		return aiRejected(r.Confidence, "AI 判定不符合条件："+r.Reason)
	default:
		return aiUnsure(r.Confidence, "AI 判定不确定："+r.Reason)
	}
}

// reviewPromptFor 按任务类型构造判定提示词
func reviewPromptFor(tile *model.ActivityTile, book *model.ActivityCheckInBook) string {
	var desc string
	switch tile.TaskType {
	case model.TaskTypeGenre:
		switch {
		case strings.Contains(tile.Title, "推理"):
			desc = "推理小说（悬疑、侦探、推理类作品）"
		case strings.Contains(tile.Title, "亚洲"):
			desc = "亚洲文学（亚洲地区作者创作的文学作品）"
		case strings.Contains(tile.Title, "历史"):
			desc = "历史类书籍（历史题材或历史研究类作品）"
		default:
			desc = tile.Title
		}
	case model.TaskTypeAuthorNationality:
		desc = "作者为中国人（中国国籍或华人）"
	default:
		desc = tile.Title
	}
	note := strings.TrimSpace(book.Note)
	return fmt.Sprintf("任务要求：%s（第 %d 格）。\n书名：%s\n作者：%s\n备注：%s\n请判断该书是否符合任务要求，只输出 JSON：{\"match\": true 或 false, \"confidence\": 0到1的小数, \"reason\": \"一句话理由\"}",
		desc, tile.Index, book.Title, book.Author, note)
}

var (
	// reviewJSONRe 从夹带前言后语的输出里抠出 JSON 对象
	reviewJSONRe = regexp.MustCompile(`(?s)\{.*\}`)
	// reviewFenceRe 去掉 ```json 围栏
	reviewFenceRe = regexp.MustCompile("(?s)^\\s*```(?:json)?\\s*|\\s*```\\s*$")
)

// parseReviewResult 容错解析模型输出
func parseReviewResult(text string) *reviewModelResult {
	cleaned := reviewFenceRe.ReplaceAllString(strings.TrimSpace(text), "")
	var r reviewModelResult
	if err := json.Unmarshal([]byte(cleaned), &r); err == nil {
		return &r
	}
	if m := reviewJSONRe.FindString(cleaned); m != "" {
		if err := json.Unmarshal([]byte(m), &r); err == nil {
			return &r
		}
	}
	return nil
}
