package service

import (
	"context"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// AppealService 账号申诉服务
type AppealService struct{}

// AppealError 申诉业务错误
type AppealError struct {
	Msg  string
	Code int
}

func (e *AppealError) Error() string { return e.Msg }

var (
	ErrAppealNotFound = &AppealError{Msg: "申诉不存在", Code: 404}
)

// CreateAppeal 提交账号申诉
func (s *AppealService) CreateAppeal(ctx context.Context, userID string, req types.CreateAppealReq) (*types.Appeal, error) {
	appeal := &model.Appeal{
		UserID:  userID,
		Content: req.Content,
		Status:  "pending",
	}
	if err := dal.DB.WithContext(ctx).Create(appeal).Error; err != nil {
		return nil, err
	}

	// 加载用户信息用于 DTO
	dal.DB.WithContext(ctx).Preload("User").First(appeal, "id = ?", appeal.ID)
	return s.mapAppealToDTO(appeal), nil
}

// ListAppeals 管理员查看申诉列表（支持状态过滤 + 分页）
func (s *AppealService) ListAppeals(ctx context.Context, status string, page, pageSize int) (*types.Paginated[types.Appeal], error) {
	query := dal.DB.WithContext(ctx).Model(&model.Appeal{}).Preload("User").Preload("Handler")

	if status != "" && status != "all" {
		query = query.Where("status = ?", status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	var appeals []model.Appeal
	if err := query.
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&appeals).Error; err != nil {
		return nil, err
	}

	items := make([]types.Appeal, 0, len(appeals))
	for i := range appeals {
		items = append(items, *s.mapAppealToDTO(&appeals[i]))
	}

	return &types.Paginated[types.Appeal]{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		TotalPages: pagination.TotalPages(int(total), pageSize),
	}, nil
}

// HandleAppeal 处理申诉：resolved=接受申诉 / rejected=驳回
func (s *AppealService) HandleAppeal(ctx context.Context, appealID, handlerID string, req types.HandleAppealReq) (*types.Appeal, error) {
	var appeal model.Appeal
	if err := dal.DB.WithContext(ctx).First(&appeal, "id = ?", appealID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrAppealNotFound
		}
		return nil, err
	}

	if err := dal.DB.WithContext(ctx).Model(&model.Appeal{}).
		Where("id = ?", appealID).
		Updates(map[string]interface{}{
			"status":     req.Status,
			"handled_by": handlerID,
			"note":       req.Note,
		}).Error; err != nil {
		return nil, err
	}

	// 若接受申诉且该用户处于封禁状态，则自动解封
	if req.Status == "resolved" {
		dal.DB.WithContext(ctx).Model(&model.User{}).
			Where("id = ? AND status = 'banned'", appeal.UserID).
			Update("status", "active")
	}

	dal.DB.WithContext(ctx).Preload("User").Preload("Handler").First(&appeal, "id = ?", appealID)
	return s.mapAppealToDTO(&appeal), nil
}

// mapAppealToDTO 将 Appeal model 转为 DTO
func (s *AppealService) mapAppealToDTO(a *model.Appeal) *types.Appeal {
	var handler *types.PublicUser
	if a.Handler != nil {
		h := mapper.AuthorToDTO(a.Handler)
		handler = &h
	}
	return &types.Appeal{
		ID:        a.ID,
		UserID:    a.UserID,
		User:      mapper.AuthorToDTO(&a.User),
		Content:   a.Content,
		Status:    a.Status,
		HandledBy: a.HandledBy,
		Handler:   handler,
		Note:      a.Note,
		CreatedAt: a.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: a.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
