package service

import (
	"context"
	"log"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
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
// 其余状态流转、人工队列、进度累加逻辑均无需改动。

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
		Reason:     "AI 初审跳过，直接进入人工审核队列",
	}
}

// evaluateBook 对单条书目做初审。占位实现直接返回跳过结论。
func evaluateBook(book *model.ActivityCheckInBook) aiVerdict {
	if !aiReviewEnabled {
		return aiSkippedVerdict()
	}
	// 接入真实模型后在此按 book.TileIndex 对应的任务类型分派校验
	return aiSkippedVerdict()
}

// runAIPreReview 异步初审。提交事务已提交后触发，失败只记日志不影响活动。
//
// 结论写回后书目落到对应的 ai-* 状态，三条 AI 结论都会进入人工队列，
// 差别仅在队列排序与默认操作（PRD 9.1）。
func runAIPreReview(books []model.ActivityCheckInBook) {
	if len(books) == 0 {
		return
	}
	// 独立超时上下文：调用方的请求上下文此时已结束
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for i := range books {
		b := &books[i]
		verdict := evaluateBook(b)

		status := statusFromVerdict(verdict.Status)
		if err := dal.DB.WithContext(ctx).Model(&model.ActivityCheckInBook{}).
			Where("id = ? AND review_status = ?", b.ID, model.ReviewStatusPendingAI).
			Updates(map[string]any{
				"review_status": status,
				"ai_status":     verdict.Status,
				"ai_confidence": verdict.Confidence,
				"ai_reason":     verdict.Reason,
			}).Error; err != nil {
			log.Printf("[Activity] AI 初审结论写回失败 book=%s: %v", b.ID, err)
			continue
		}

		// 审计日志：ReviewerID 为空表示 AI 写入
		if err := dal.DB.WithContext(ctx).Create(&model.ActivityReview{
			BookID:     b.ID,
			FromStatus: model.ReviewStatusPendingAI,
			ToStatus:   status,
			Reason:     verdict.Reason,
		}).Error; err != nil {
			log.Printf("[Activity] AI 初审审计写入失败 book=%s: %v", b.ID, err)
		}
	}
}

// statusFromVerdict AI 结论映射到审核状态。
// 跳过时按「AI 存疑」入队，让管理员看到证据详情而非默认放行。
func statusFromVerdict(verdict string) string {
	switch verdict {
	case "passed":
		return model.ReviewStatusAIPassed
	case "rejected":
		return model.ReviewStatusAIRejected
	default:
		return model.ReviewStatusAIUnsure
	}
}
