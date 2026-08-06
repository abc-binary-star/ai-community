package service

import (
	"context"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 成员阅读档案与打卡点赞（「全部队伍」标签页）：
// 点击队伍中的成员查看其已通过审核的累计数据（总本数 / 总字数 / 总时长），
// 每次打卡可点赞，点赞数实时展示。点赞对象是「一次打卡提交」，不限身份。

// GetMemberCheckIns 成员阅读档案：仅统计已通过审核的书目，
// 按打卡分组返回，附点赞数与当前用户是否已赞。
func (s *ActivityService) GetMemberCheckIns(ctx context.Context, userID, memberID string) (*types.ActivityMemberProfileDTO, error) {
	var member model.ActivityMember
	if err := dal.DB.WithContext(ctx).Preload("User").First(&member, "id = ?", memberID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrActivityMemberNotFound
		}
		return nil, err
	}

	var books []model.ActivityCheckInBook
	if err := dal.DB.WithContext(ctx).
		Where("member_id = ? AND review_status = ?", memberID, model.ReviewStatusApproved).
		Order("created_at asc").
		Find(&books).Error; err != nil {
		return nil, err
	}

	// 按打卡分组，保持提交先后顺序
	byCheckIn := make(map[string][]*model.ActivityCheckInBook)
	checkInOrder := make([]string, 0, len(books))
	for i := range books {
		b := &books[i]
		if _, ok := byCheckIn[b.CheckInID]; !ok {
			checkInOrder = append(checkInOrder, b.CheckInID)
		}
		byCheckIn[b.CheckInID] = append(byCheckIn[b.CheckInID], b)
	}

	// 汇总：总本数 / 总字数 / 总时长
	var wordCount, durationMinutes int64
	for i := range books {
		wordCount += books[i].WordCount
		durationMinutes += int64(books[i].DurationMinutes)
	}

	// 点赞数据
	likeCount := make(map[string]int, len(checkInOrder))
	likedByMe := make(map[string]bool, len(checkInOrder))
	if len(checkInOrder) > 0 {
		var likes []model.ActivityCheckInLike
		if err := dal.DB.WithContext(ctx).Where("check_in_id IN ?", checkInOrder).Find(&likes).Error; err != nil {
			return nil, err
		}
		for _, l := range likes {
			likeCount[l.CheckInID]++
			if l.UserID == userID {
				likedByMe[l.CheckInID] = true
			}
		}
	}

	// 打卡时间
	createdAt := make(map[string]time.Time, len(checkInOrder))
	if len(checkInOrder) > 0 {
		var checkIns []model.ActivityCheckIn
		if err := dal.DB.WithContext(ctx).Where("id IN ?", checkInOrder).Find(&checkIns).Error; err != nil {
			return nil, err
		}
		for _, c := range checkIns {
			createdAt[c.ID] = c.CreatedAt
		}
	}

	teamNames, err := s.teamNames(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]types.ActivityMemberCheckInDTO, 0, len(checkInOrder))
	for _, checkInID := range checkInOrder {
		bs := byCheckIn[checkInID]
		bookDTOs := make([]types.ActivityBookDTO, 0, len(bs))
		for _, b := range bs {
			bookDTOs = append(bookDTOs, bookToDTO(b, "", ""))
		}
		items = append(items, types.ActivityMemberCheckInDTO{
			CheckInID: checkInID,
			TileIndex: bs[0].TileIndex,
			Lap:       bs[0].Lap,
			CreatedAt: createdAt[checkInID].Format(time.RFC3339),
			Books:     bookDTOs,
			LikeCount: likeCount[checkInID],
			LikedByMe: likedByMe[checkInID],
		})
	}

	return &types.ActivityMemberProfileDTO{
		MemberID:        member.ID,
		MemberName:      memberNameOf(&member),
		TeamID:          member.TeamID,
		TeamName:        teamNames[member.TeamID],
		BookCount:       len(books),
		WordCount:       wordCount,
		DurationMinutes: int(durationMinutes),
		CheckIns:        items,
	}, nil
}

// LikeCheckIn 点赞某次打卡。幂等：已点过则不重复计数（唯一索引兜底）。
func (s *ActivityService) LikeCheckIn(ctx context.Context, userID, checkInID string) error {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return err
	}
	var checkIn model.ActivityCheckIn
	if err := dal.DB.WithContext(ctx).First(&checkIn, "id = ?", checkInID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return ErrActivityBookNotFound
		}
		return err
	}
	return dal.DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).
		Create(&model.ActivityCheckInLike{CheckInID: checkInID, UserID: userID}).Error
}

// UnlikeCheckIn 取消点赞。未点过则为无操作。
func (s *ActivityService) UnlikeCheckIn(ctx context.Context, userID, checkInID string) error {
	now := time.Now()
	if err := s.requireWritable(now); err != nil {
		return err
	}
	return dal.DB.WithContext(ctx).
		Where("check_in_id = ? AND user_id = ?", checkInID, userID).
		Delete(&model.ActivityCheckInLike{}).Error
}
