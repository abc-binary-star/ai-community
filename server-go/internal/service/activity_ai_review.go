package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/gorm"
)

// AI 初审接入点（PRD 9.2）。
//
// 本版按「留接口不接模型」实施：提交后书目直接进入人工队列并标注「AI 初审跳过」，
// 与 PRD 9.4 定义的 AI 不可用兜底路径完全一致，不阻断活动进行。
//
// 后续接入真实模型时只需替换 evaluateBook 的实现：
//   - 书名字数类：校验书名字符数（需处理书名号、副标题噪声）
//   - 封面颜色类：本地主色提取，判断是否落在目标色域
//   - 题材 / 作者国籍类：走大模型
//   - 字数与时长类：合理性区间校验
//   - 通用反作弊：重复提交、同图多次使用、截图与书目不符
// 其余状态流转、投票池、进度累加逻辑均无需改动。

// aiReviewEnabled 是否启用 AI 初审。当前为占位实现，恒为 false。
const aiReviewEnabled = false

// aiVerdict AI 初审结论
type aiVerdict struct {
	Status     string
	Confidence float64
	Reason     string
}

// aiSkippedVerdict AI 不可用或未启用时的兜底结论（PRD 9.4）
func aiSkippedVerdict() aiVerdict {
	return aiVerdict{
		Status:     "skipped",
		Confidence: 0,
		Reason:     "AI 初审跳过，进入队长投票池由队长裁决",
	}
}

// evaluateBook 对单条书目做初审。占位实现直接返回跳过结论。
func evaluateBook(book *model.ActivityCheckInBook) aiVerdict {
	if !aiReviewEnabled {
		return aiSkippedVerdict()
	}
	// 接入真实模型后在此按 book.TileIndex 对应的任务类型分派校验：
	// 情况一（无特殊要求）只看字数/时长/书名/作者是否离谱；
	// 情况二（题材/作者/标题字数等）核验是否满足格子规则。
	return aiSkippedVerdict()
}

// runAIPreReview 异步初审。提交事务已提交后触发，失败只记日志不影响活动。
//
// 三档路由：AI 判定通过 → 直接终审通过并累加进度；存疑/驳回/跳过 →
// 进入队长投票池（审核池全员可见，仅队长可投，过半赞成通过）。
// 封面类（情况三）不走 AI，提交时已直接置为 in-voting。
func runAIPreReview(books []model.ActivityCheckInBook) {
	if len(books) == 0 {
		return
	}
	// 独立超时上下文：调用方的请求上下文此时已结束
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	s := &ActivityService{}
	for i := range books {
		b := &books[i]
		verdict := evaluateBook(b)

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

// autoApprove AI 判定通过后直接终审通过（情况一/二）。
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
