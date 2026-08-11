// Package model: AssetRun 资产运行快照（B4）
//
// 每次资产试玩落一条快照，记录输入、输出、模型、用量与耗时：
//   - 用户可回看自己的运行历史（GET /api/assets/runs/me）
//   - 资产页可展示「最近运行」聚合（GET /api/assets/:id/runs）
//   - B5 的「结果分享 / 一键复现」以单条快照为载体：发布快照即可分享，
//     复现时按快照记录的 inputs + params 重新调用 LLM
//
// 失败的运行也落快照（status=failed + error_message），便于排查限流/模型故障。
package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 运行状态
const (
	AssetRunStatusSuccess = "success"
	AssetRunStatusFailed  = "failed"
)

// 快照可见范围（默认 private，作者可改成 public 分享）
const (
	AssetRunVisibilityPrivate = "private"
	AssetRunVisibilityPublic  = "public"
)

// AssetRun 资产运行快照
type AssetRun struct {
	ID            string          `gorm:"primaryKey" json:"id"`
	AssetID       string          `gorm:"index:idx_asset_run_asset;not null" json:"assetId"`
	Asset         Asset           `gorm:"foreignKey:AssetID;constraint:OnDelete:CASCADE" json:"-"`
	UserID        string          `gorm:"index:idx_asset_run_user;not null" json:"userId"`
	User          User            `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	// Inputs 用户填写的变量值，与资产 InputVariables 声明一一对应
	Inputs        json.RawMessage `gorm:"type:jsonb" json:"inputs"`
	// Params 实际生效的运行参数（合并资产默认值与用户覆盖后）
	Params        json.RawMessage `gorm:"type:jsonb" json:"params"`
	// Output 模型生成内容；failed 时为空
	Output        string          `gorm:"type:text" json:"output"`
	Model         string          `gorm:"size:60" json:"model"`
	// 用量
	PromptTokens     int          `gorm:"default:0" json:"promptTokens"`
	CompletionTokens int          `gorm:"default:0" json:"completionTokens"`
	TotalTokens      int          `gorm:"default:0" json:"totalTokens"`
	DurationMs       int          `gorm:"default:0" json:"durationMs"`
	// 状态与错误信息
	Status        string          `gorm:"size:20;not null;index;default:success" json:"status"`
	ErrorMessage  string          `gorm:"size:1000" json:"errorMessage"`
	// 可见范围：private 仅作者可见；public 可被分享/被列表展示
	Visibility    string          `gorm:"size:20;not null;default:private;index" json:"visibility"`
	// PostID 运行入口来自哪个帖子（可选，便于按帖子聚合「本帖试玩记录」）
	PostID        *string         `gorm:"index" json:"postId,omitempty"`
	CreatedAt     time.Time       `gorm:"index" json:"createdAt"`
}

// BeforeCreate 自动生成 UUID 主键
func (r *AssetRun) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	if r.Status == "" {
		r.Status = AssetRunStatusSuccess
	}
	if r.Visibility == "" {
		r.Visibility = AssetRunVisibilityPrivate
	}
	return nil
}
