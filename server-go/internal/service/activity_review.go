package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// pendingReviewStatuses 终审台默认展示的状态集合。
//
// 审核权已完全交给队长投票：AI 初审通过直接生效，未过则进投票池由队长过半通过，
// 管理员不再参与「决定能不能通过」。因此终审台默认只列已通过（approved）的书目，
// 定位为事后监督——发现刷量或不符合任务要求时驳回（reject）或撤销（revoke）。
// 仍可通过 status 参数显式查看投票池等其他状态。
var pendingReviewStatuses = []string{
	model.ReviewStatusApproved,
}

// ListReviewQueue 人工终审队列，支持按小组、格子、状态筛选（PRD 9.3）
func (s *ActivityService) ListReviewQueue(
	ctx context.Context,
	teamID string, tileIndex int, status string,
	page, pageSize int,
) (map[string]any, error) {
	q := dal.DB.WithContext(ctx).Model(&model.ActivityCheckInBook{})
	if status != "" {
		q = q.Where("review_status = ?", status)
	} else {
		q = q.Where("review_status IN ?", pendingReviewStatuses)
	}
	if teamID != "" {
		q = q.Where("team_id = ?", teamID)
	}
	if tileIndex > 0 {
		q = q.Where("tile_index = ?", tileIndex)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}

	var books []model.ActivityCheckInBook
	// 终审台是事后监督：最新通过的排在最前，便于及时发现异常提交
	if err := q.
		Order("created_at desc").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&books).Error; err != nil {
		return nil, err
	}

	names, err := s.memberNames(ctx, "")
	if err != nil {
		return nil, err
	}
	teamNames, err := s.teamNames(ctx)
	if err != nil {
		return nil, err
	}
	tiles, err := s.tileMap(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]types.ActivityReviewQueueDTO, 0, len(books))
	for i := range books {
		b := &books[i]
		rate, err := s.memberPassRate(ctx, b.MemberID)
		if err != nil {
			return nil, err
		}
		dupInTeam, err := s.duplicateInTeam(ctx, b)
		if err != nil {
			return nil, err
		}
		item := types.ActivityReviewQueueDTO{
			Book:            bookToDTO(b, names[b.MemberID], teamNames[b.TeamID]),
			MemberPassRate:  rate,
			DuplicateInTeam: dupInTeam,
		}
		if t, ok := tiles[b.TileIndex]; ok {
			item.Tile = tileToDTO(t)
		}
		items = append(items, item)
	}

	return map[string]any{
		"items":      items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": pagination.TotalPages(int(total), pageSize),
	}, nil
}

// Review 人工终审单条书目（PRD 9.3）。
//
// 通过时累加格子进度、保底计数与成员榜单数据，并按新进度推导队伍状态；
// 撤销时同步回滚（验收标准 8）。全程在事务内且对队伍行加锁。
func (s *ActivityService) Review(ctx context.Context, reviewerID, bookID string, req types.ActivityReviewReq) (*types.ActivityBookDTO, error) {
	action := req.Action
	reason := strings.TrimSpace(req.Reason)
	if (action == "reject" || action == "revoke") && reason == "" {
		return nil, ErrActivityReasonMissing
	}

	var out *types.ActivityBookDTO
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var book model.ActivityCheckInBook
		if err := tx.Clauses(lockForUpdate()).First(&book, "id = ?", bookID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return ErrActivityBookNotFound
			}
			return err
		}

		from := book.ReviewStatus
		switch action {
		case "approve":
			if from == model.ReviewStatusApproved {
				return ErrActivityInvalidInput
			}
			counts := true
			if req.CountsForTask != nil {
				counts = *req.CountsForTask
			}
			if err := s.applyApproval(tx, &book, counts); err != nil {
				return err
			}
			book.ReviewStatus = model.ReviewStatusApproved
			book.CountsForTask = counts

		case "reject":
			// 已通过再驳回等价于撤销：需要回滚已累加的数据
			if from == model.ReviewStatusApproved {
				if err := s.rollbackApproval(tx, &book); err != nil {
					return err
				}
			}
			book.ReviewStatus = model.ReviewStatusRejected

		case "revoke":
			if from != model.ReviewStatusApproved {
				return ErrActivityInvalidInput
			}
			if err := s.rollbackApproval(tx, &book); err != nil {
				return err
			}
			book.ReviewStatus = model.ReviewStatusRevoked

		default:
			return ErrActivityInvalidInput
		}

		if err := tx.Model(&model.ActivityCheckInBook{}).Where("id = ?", book.ID).
			Updates(map[string]any{
				"review_status":   book.ReviewStatus,
				"counts_for_task": book.CountsForTask,
			}).Error; err != nil {
			return err
		}

		// 审计日志，含操作人、时间、前后状态（PRD 9.3）
		if err := tx.Create(&model.ActivityReview{
			BookID:     book.ID,
			ReviewerID: reviewerID,
			FromStatus: from,
			ToStatus:   book.ReviewStatus,
			Reason:     reason,
			Violation:  req.Violation,
		}).Error; err != nil {
			return err
		}

		text := fmt.Sprintf("《%s》审核%s", book.Title, reviewVerb(book.ReviewStatus))
		if reason != "" {
			text += "：" + reason
		}
		if err := s.addEvent(tx, book.TeamID, model.EventTypeReview, text); err != nil {
			return err
		}

		dto := bookToDTO(&book, "", "")
		out = &dto
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ForceApprove 管理员强制通过：越过队长投票，直接从审批池（投票池）通过书目。
//
// 与普通 approve 的区别在于语义明确为「管理员强制通过」：审计记录与队伍时间线
// 都会标注管理员操作，便于事后追溯。对任意未通过状态（含投票中/待初审/被驳回）生效，
// 已通过的返回无效输入。通过后按 countsForTask=true 累加进度、榜单与保底计数。
func (s *ActivityService) ForceApprove(ctx context.Context, adminID, bookID string) (*types.ActivityBookDTO, error) {
	var out *types.ActivityBookDTO
	err := dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var book model.ActivityCheckInBook
		if err := tx.Clauses(lockForUpdate()).First(&book, "id = ?", bookID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return ErrActivityBookNotFound
			}
			return err
		}
		if book.ReviewStatus == model.ReviewStatusApproved {
			return ErrActivityInvalidInput
		}
		from := book.ReviewStatus

		if err := s.applyApproval(tx, &book, true); err != nil {
			return err
		}
		book.ReviewStatus = model.ReviewStatusApproved
		book.CountsForTask = true
		if err := tx.Model(&model.ActivityCheckInBook{}).Where("id = ?", book.ID).
			Updates(map[string]any{
				"review_status":   book.ReviewStatus,
				"counts_for_task": book.CountsForTask,
			}).Error; err != nil {
			return err
		}

		// 审计日志，标注强制通过与操作人（PRD 9.3）
		if err := tx.Create(&model.ActivityReview{
			BookID:     book.ID,
			ReviewerID: adminID,
			FromStatus: from,
			ToStatus:   book.ReviewStatus,
			Reason:     "管理员强制通过（跳过队长投票）",
		}).Error; err != nil {
			return err
		}

		if err := s.addEvent(tx, book.TeamID, model.EventTypeReview,
			fmt.Sprintf("《%s》管理员强制通过", book.Title)); err != nil {
			return err
		}

		dto := bookToDTO(&book, "", "")
		out = &dto
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// reviewVerb 审核结果的中文动词
func reviewVerb(status string) string {
	switch status {
	case model.ReviewStatusApproved:
		return "通过"
	case model.ReviewStatusRejected:
		return "驳回"
	case model.ReviewStatusRevoked:
		return "已撤销"
	default:
		return "更新"
	}
}
