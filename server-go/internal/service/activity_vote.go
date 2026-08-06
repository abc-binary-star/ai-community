package service

import (
	"context"
	"fmt"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// 队长投票池（三档审核的情况三 + 情况一/二 AI 未过）。
// 审核池对全员可见（只读），仅队长可投票；同一队长对同一本书只保留一票，
// 赞成票过半（队长数的一半以上，10 队时即 >5 票）打卡通过。
// 未过半的书留在池中等待更多队长投票，管理员可从人工终审台兜底处理。

// ListVotePool 投票池列表：全员可见（登录即可，不要求入组），
// 返回每本书的赞成/反对票数与当前用户是否已投。
func (s *ActivityService) ListVotePool(ctx context.Context, userID string) ([]types.ActivityVotePoolItemDTO, error) {
	// 当前用户的成员 id（未入组时无法投票，myVote 为空）
	var myMemberID string
	var me model.ActivityMember
	if err := dal.DB.WithContext(ctx).Where("user_id = ?", userID).First(&me).Error; err == nil {
		myMemberID = me.ID
	}

	var books []model.ActivityCheckInBook
	if err := dal.DB.WithContext(ctx).
		Where("review_status = ?", model.ReviewStatusInVoting).
		Order("created_at asc").
		Find(&books).Error; err != nil {
		return nil, err
	}
	if len(books) == 0 {
		return []types.ActivityVotePoolItemDTO{}, nil
	}

	bookIDs := make([]string, 0, len(books))
	for _, b := range books {
		bookIDs = append(bookIDs, b.ID)
	}
	var votes []model.ActivityBookVote
	if err := dal.DB.WithContext(ctx).Where("book_id IN ?", bookIDs).Find(&votes).Error; err != nil {
		return nil, err
	}
	byBook := make(map[string][]model.ActivityBookVote, len(bookIDs))
	for _, v := range votes {
		byBook[v.BookID] = append(byBook[v.BookID], v)
	}

	totalCaptains, err := s.captainCountTx(dal.DB.WithContext(ctx))
	if err != nil {
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

	items := make([]types.ActivityVotePoolItemDTO, 0, len(books))
	for i := range books {
		b := &books[i]
		vs := byBook[b.ID]
		var yes, no int
		myVote := ""
		for _, v := range vs {
			if v.Vote == "approve" {
				yes++
			} else {
				no++
			}
			if v.VoterMemberID == myMemberID {
				myVote = v.Vote
			}
		}
		item := types.ActivityVotePoolItemDTO{
			Book:          bookToDTO(b, names[b.MemberID], teamNames[b.TeamID]),
			YesCount:      yes,
			NoCount:       no,
			TotalCaptains: totalCaptains,
			MyVote:        myVote,
		}
		if t, ok := tiles[b.TileIndex]; ok {
			item.Tile = tileToDTO(t)
		}
		items = append(items, item)
	}
	return items, nil
}

// CastVote 队长投票。每人每书一票（唯一索引兜底），可改票。
// 赞成票过半时结算：打卡通过并累加进度/榜单（与人工 approve 同口径）。
func (s *ActivityService) CastVote(ctx context.Context, userID, bookID string, req types.ActivityVoteReq) (*types.ActivityVotePoolItemDTO, error) {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return nil, err
	}
	me, err := s.requireMember(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !me.IsCaptain {
		return nil, ErrActivityNotCaptain
	}

	var out *types.ActivityVotePoolItemDTO
	err = dal.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var book model.ActivityCheckInBook
		if err := tx.Clauses(lockForUpdate()).First(&book, "id = ?", bookID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return ErrActivityBookNotFound
			}
			return err
		}
		if book.ReviewStatus != model.ReviewStatusInVoting {
			return ErrActivityInvalidInput
		}
		// 不能给自己队伍的书目投票：队长数极少时（如仅 1 名队长）自投即可过半，利益冲突
		if book.TeamID == me.TeamID {
			return ErrActivityVoteOwnTeam
		}

		// 幂等写票：同人同书已有票则改票
		var existing model.ActivityBookVote
		err := tx.Where("book_id = ? AND voter_member_id = ?", book.ID, me.ID).First(&existing).Error
		switch err {
		case nil:
			existing.Vote = req.Vote
			if err := tx.Save(&existing).Error; err != nil {
				return err
			}
		case gorm.ErrRecordNotFound:
			if err := tx.Create(&model.ActivityBookVote{
				BookID:        book.ID,
				VoterMemberID: me.ID,
				TeamID:        me.TeamID,
				Vote:          req.Vote,
			}).Error; err != nil {
				if isUniqueViolation(err) {
					return ErrActivityInvalidInput
				}
				return err
			}
		default:
			return err
		}

		// 统计票数（事务内可见最新票）
		totalCaptains, err := s.captainCountTx(tx)
		if err != nil {
			return err
		}
		var yes, no int64
		if err := tx.Model(&model.ActivityBookVote{}).
			Where("book_id = ? AND vote = ?", book.ID, "approve").Count(&yes).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ActivityBookVote{}).
			Where("book_id = ? AND vote = ?", book.ID, "reject").Count(&no).Error; err != nil {
			return err
		}

		resolved := false
		if yes > int64(totalCaptains)/2 {
			// 过半赞成 → 打卡通过
			if err := s.applyApproval(tx, &book, true); err != nil {
				return err
			}
			if err := tx.Model(&model.ActivityCheckInBook{}).Where("id = ?", book.ID).
				Updates(map[string]any{"review_status": model.ReviewStatusApproved}).Error; err != nil {
				return err
			}
			if err := tx.Create(&model.ActivityReview{
				BookID:     book.ID,
				ReviewerID: me.ID,
				FromStatus: model.ReviewStatusInVoting,
				ToStatus:   model.ReviewStatusApproved,
				Reason:     "队长投票过半通过",
			}).Error; err != nil {
				return err
			}
			if err := s.addEvent(tx, book.TeamID, model.EventTypeReview,
				fmt.Sprintf("《%s》队长投票通过", book.Title)); err != nil {
				return err
			}
			resolved = true
		}

		item, err := s.voteItemTx(tx, &book, me.ID, int(yes), int(no), totalCaptains)
		if err != nil {
			return err
		}
		item.Resolved = resolved
		out = &item
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// captainCountTx 当前活动内队长总数（含尚未入队的在册队长）。
// 通过门槛 = 队长数的一半以上：10 队时 6 票（>5），4 队时 3 票。
func (s *ActivityService) captainCountTx(tx *gorm.DB) (int, error) {
	var n int64
	if err := tx.Model(&model.ActivityMember{}).Where("is_captain = ?", true).Count(&n).Error; err != nil {
		return 0, err
	}
	return int(n), nil
}

// voteItemTx 组装单条投票池条目（事务内复用）
func (s *ActivityService) voteItemTx(
	tx *gorm.DB,
	book *model.ActivityCheckInBook,
	myMemberID string,
	yes, no, totalCaptains int,
) (types.ActivityVotePoolItemDTO, error) {
	item := types.ActivityVotePoolItemDTO{
		Book:          bookToDTO(book, "", ""),
		YesCount:      yes,
		NoCount:       no,
		TotalCaptains: totalCaptains,
	}
	if myMemberID != "" {
		var vote model.ActivityBookVote
		if err := tx.Where("book_id = ? AND voter_member_id = ?", book.ID, myMemberID).
			First(&vote).Error; err == nil {
			item.MyVote = vote.Vote
		}
	}
	var tile model.ActivityTile
	if err := tx.First(&tile, "tile_index = ?", book.TileIndex).Error; err == nil {
		item.Tile = tileToDTO(&tile)
	}
	return item, nil
}
