package service

import (
	"context"
	"fmt"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/hellboard"
	"gorm.io/gorm"
)

// taskDelta 该书目对任务进度的贡献量。
// 字数类按字数累加，时长类按分钟累加，其余按本数计 1（PRD 第 6 节任务类型）。
func taskDelta(book *model.ActivityCheckInBook, tile *model.ActivityTile) int64 {
	switch tile.TaskType {
	case model.TaskTypeTotalWords:
		return book.WordCount
	case model.TaskTypeTotalDuration:
		// 按分钟原样累加：早期实现做 分钟/60 整除，导致零散分钟被丢弃
		// （每次提交 50 分钟则进度恒为 0）。目标值同步以分钟存储。
		return int64(book.DurationMinutes)
	default:
		return 1
	}
}

// applyApproval 终审通过：累加格子进度、保底计数与成员榜单数据，并推导队伍状态。
//
// 任务进度仅由人工终审通过的打卡累加，AI 结论不直接改变进度（验收标准 2）。
func (s *ActivityService) applyApproval(tx *gorm.DB, book *model.ActivityCheckInBook, countsForTask bool) error {
	now := time.Now()

	var team model.ActivityTeam
	if err := tx.Clauses(lockForUpdate()).First(&team, "id = ?", book.TeamID).Error; err != nil {
		return err
	}
	tile, err := s.getTileTx(tx, book.TileIndex)
	if err != nil {
		return err
	}

	// 榜单数据：只要终审通过就计入，与是否符合格子条件无关（P0-4 末句）
	if err := tx.Model(&model.ActivityMember{}).Where("id = ?", book.MemberID).
		Updates(map[string]any{
			"book_count": gorm.Expr("book_count + 1"),
			"word_count": gorm.Expr("word_count + ?", book.WordCount),
		}).Error; err != nil {
		return err
	}

	// 保底计数为全队全局累计：任何通过审核的书目都计入（不论格子与轮次），
	// 满阈值即点亮当前格并消耗阈值本数，其余计数顺延到下一格（P1-5 全局保底）。
	// 任务进度只对「队伍当前所在格 + 当前轮次」的提交累加；补卡到已点亮历史格的
	// 书目仍进榜单，并累加该格对应轮次的保底展示计数，但不影响当前格进度。
	isCurrent := book.TileIndex == team.Position && book.Lap == team.Lap
	if !isCurrent {
		if err := s.boostTileBookCountTx(tx, book); err != nil {
			return err
		}
	} else {
		// 保底展示计数统计本格内通过审核的全部书目，不论是否符合格子条件（PRD 7.3）
		progressRow, err := s.progressRowTx(tx, team.ID, book.TileIndex, book.Lap)
		if err != nil {
			return err
		}
		if err := tx.Model(progressRow).
			Update("book_count", gorm.Expr("book_count + 1")).Error; err != nil {
			return err
		}
		if countsForTask {
			team.TileProgress += taskDelta(book, tile)
		}
	}
	team.FallbackCount++

	// 保底点亮的是队伍当前所在格：取当前格定义做判定（书的格子可能已离开）
	curTile, err := s.getTileTx(tx, team.Position)
	if err != nil {
		return err
	}

	litTiles, err := s.litTilesTx(tx, team.ID)
	if err != nil {
		return err
	}

	// 全局保底达成时立即点亮当前格（P1-5 / 验收标准 5），并消耗阈值本数。
	// 当前格已点亮（如绕圈回到已点亮格）时不重复点亮、不消耗计数。
	fallbackJustHit := false
	if _, already := litTiles[team.Position]; !already && hellboard.IsFallbackDone(team.FallbackCount, curTile) {
		fallbackJustHit = true
		if err := s.markLitTx(tx, &team, team.Position, model.LitReasonFallback, now); err != nil {
			return err
		}
		if err := s.addEvent(tx, team.ID, model.EventTypeFallback,
			fmt.Sprintf("全队累计通过审核达到 %d 本保底，本格点亮并解锁前进", hellboard.FallbackThreshold)); err != nil {
			return err
		}
		team.FallbackCount -= hellboard.FallbackThreshold
		if team.FallbackCount < 0 {
			team.FallbackCount = 0
		}
		litTiles, err = s.litTilesTx(tx, team.ID)
		if err != nil {
			return err
		}
	}

	prevStatus := team.Status
	if fallbackJustHit {
		// 保底点亮后直接进入待前进，无需依赖任务进度（判定格同样视为判定通过）
		if len(litTiles) >= hellboard.TileCount {
			team.Status = model.TeamStatusCompleted
		} else {
			team.Status = model.TeamStatusAwaitingRoll
		}
	} else {
		team.Status = hellboard.DeriveStatus(&team, curTile, len(litTiles))
	}

	if err := tx.Model(&model.ActivityTeam{}).Where("id = ?", team.ID).
		Updates(map[string]any{
			"tile_progress":  team.TileProgress,
			"fallback_count": team.FallbackCount,
			"status":         team.Status,
			"last_lit_at":    team.LastLitAt,
		}).Error; err != nil {
		return err
	}

	// 进度达标时提示队伍可掷骰（PRD 9.3 末段）
	if prevStatus == model.TeamStatusInProgress {
		switch team.Status {
		case model.TeamStatusAwaitingRoll:
			if err := s.addEvent(tx, team.ID, model.EventTypeReview,
				"本格任务已达成，可掷骰前进"); err != nil {
				return err
			}
		case model.TeamStatusAwaitingJudgement:
			if err := s.addEvent(tx, team.ID, model.EventTypeReview,
				"本格任务已达成，等待队长发起特殊判定"); err != nil {
				return err
			}
		}
	}
	return nil
}

// rollbackApproval 撤销终审通过：回滚榜单与进度数据（验收标准 8）。
//
// 点亮状态不自动取消：点亮是不可逆的活动进程节点，
// 误点亮需管理员走手工修正接口并留下理由，避免撤销单本书导致队伍位置错乱。
func (s *ActivityService) rollbackApproval(tx *gorm.DB, book *model.ActivityCheckInBook) error {
	var team model.ActivityTeam
	if err := tx.Clauses(lockForUpdate()).First(&team, "id = ?", book.TeamID).Error; err != nil {
		return err
	}
	tile, err := s.getTileTx(tx, book.TileIndex)
	if err != nil {
		return err
	}

	// 榜单扣减，用 GREATEST 兜住并发导致的负值
	if err := tx.Model(&model.ActivityMember{}).Where("id = ?", book.MemberID).
		Updates(map[string]any{
			"book_count": gorm.Expr("GREATEST(book_count - 1, 0)"),
			"word_count": gorm.Expr("GREATEST(word_count - ?, 0)", book.WordCount),
		}).Error; err != nil {
		return err
	}

	isCurrent := book.TileIndex == team.Position && book.Lap == team.Lap
	if !isCurrent {
		// 队伍已离开原格：当前格进度与保底计数不受影响，
		// 但原格该轮次的保底展示计数（book_count）仍应扣减，与实际审核通过量保持一致
		var row model.ActivityTeamProgress
		err := tx.Where("team_id = ? AND tile_index = ? AND lap = ?",
			team.ID, book.TileIndex, book.Lap).First(&row).Error
		if err == nil && row.BookCount > 0 {
			if err := tx.Model(&row).
				Update("book_count", gorm.Expr("GREATEST(book_count - 1, 0)")).Error; err != nil {
				return err
			}
		} else if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
	} else {
		progressRow, err := s.progressRowTx(tx, team.ID, book.TileIndex, book.Lap)
		if err != nil {
			return err
		}
		if err := tx.Model(progressRow).
			Update("book_count", gorm.Expr("GREATEST(book_count - 1, 0)")).Error; err != nil {
			return err
		}
		if book.CountsForTask {
			team.TileProgress -= taskDelta(book, tile)
			if team.TileProgress < 0 {
				team.TileProgress = 0
			}
		}
	}

	// 全局保底计数：通过审核时累计、撤销时同步回退（点亮状态不可逆，不在此撤销）
	if team.FallbackCount > 0 {
		team.FallbackCount--
	}

	litTiles, err := s.litTilesTx(tx, team.ID)
	if err != nil {
		return err
	}
	// 撤销书目用队伍当前格定义重新推导状态（书的格子可能已离开）
	curTile, err := s.getTileTx(tx, team.Position)
	if err != nil {
		return err
	}
	// 已点亮的格子不因撤销回退状态：队伍可能已经掷骰离开
	if _, lit := litTiles[team.Position]; !lit {
		team.Status = hellboard.DeriveStatus(&team, curTile, len(litTiles))
	}

	return tx.Model(&model.ActivityTeam{}).Where("id = ?", team.ID).
		Updates(map[string]any{
			"tile_progress":  team.TileProgress,
			"fallback_count": team.FallbackCount,
			"status":         team.Status,
		}).Error
}

// --- 审核辅助查询 ---

// boostTileBookCountTx 补卡通过时：把书目累加到已点亮格对应轮次的保底展示计数。
// 该格（team + tile + lap）已点亮才累加；补卡不影响点亮状态与当前格进度。
func (s *ActivityService) boostTileBookCountTx(tx *gorm.DB, book *model.ActivityCheckInBook) error {
	var row model.ActivityTeamProgress
	err := tx.Where("team_id = ? AND tile_index = ? AND lap = ? AND lit = ?",
		book.TeamID, book.TileIndex, book.Lap, true).First(&row).Error
	if err == gorm.ErrRecordNotFound {
		return nil
	}
	if err != nil {
		return err
	}
	return tx.Model(&row).Update("book_count", gorm.Expr("book_count + 1")).Error
}

// teamNames 队伍 id → 名称
func (s *ActivityService) teamNames(ctx context.Context) (map[string]string, error) {
	var teams []model.ActivityTeam
	if err := dal.DB.WithContext(ctx).Select("id", "name").Find(&teams).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(teams))
	for _, t := range teams {
		out[t.ID] = t.Name
	}
	return out, nil
}

// tileMap 格子编号 → 定义
func (s *ActivityService) tileMap(ctx context.Context) (map[int]*model.ActivityTile, error) {
	var tiles []model.ActivityTile
	if err := dal.DB.WithContext(ctx).Find(&tiles).Error; err != nil {
		return nil, err
	}
	out := make(map[int]*model.ActivityTile, len(tiles))
	for i := range tiles {
		out[tiles[i].Index] = &tiles[i]
	}
	return out, nil
}

// memberPassRate 成员历史通过率，供管理员参考（PRD 9.3）
func (s *ActivityService) memberPassRate(ctx context.Context, memberID string) (float64, error) {
	var total, passed int64
	base := dal.DB.WithContext(ctx).Model(&model.ActivityCheckInBook{}).Where("member_id = ?", memberID)
	if err := base.Session(&gorm.Session{}).
		Where("review_status IN ?", []string{model.ReviewStatusApproved, model.ReviewStatusRejected}).
		Count(&total).Error; err != nil {
		return 0, err
	}
	if total == 0 {
		return 0, nil
	}
	if err := base.Session(&gorm.Session{}).
		Where("review_status = ?", model.ReviewStatusApproved).
		Count(&passed).Error; err != nil {
		return 0, err
	}
	return float64(passed) / float64(total), nil
}

// duplicateInTeam 该书目是否被本队其他成员也提交过（PRD 9.3 审核界面提示）
func (s *ActivityService) duplicateInTeam(ctx context.Context, book *model.ActivityCheckInBook) (bool, error) {
	var count int64
	if err := dal.DB.WithContext(ctx).Model(&model.ActivityCheckInBook{}).
		Where("team_id = ? AND id <> ?", book.TeamID, book.ID).
		Where("LOWER(title) = LOWER(?) AND LOWER(author) = LOWER(?)", book.Title, book.Author).
		Where("review_status NOT IN ?", []string{model.ReviewStatusRejected, model.ReviewStatusRevoked}).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}
