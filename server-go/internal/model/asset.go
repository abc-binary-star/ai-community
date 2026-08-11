// Package model: Asset AI 资产卡
//
// 把 Prompt / Agent / Workflow 等可复用的 AI 能力抽象成「资产」：
// 作者发布一份带输入变量与默认参数的模板，其他用户可在帖子详情页一键试玩，
// 运行结果落快照（AssetRun，B4）并可派生出新资产（Remix，B5）。
//
// MVP 仅落地 prompt 类型，结构预留 agent / workflow 扩展位。
package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 资产类型
const (
	AssetTypePrompt   = "prompt"   // Prompt 模板
	AssetTypeAgent    = "agent"    // Agent 配置（预留）
	AssetTypeWorkflow = "workflow" // 多步工作流（预留）
)

// 资产状态
const (
	AssetStatusDraft    = "draft"    // 草稿：仅作者可见
	AssetStatusPublished = "published" // 已发布：可被列表/搜索/试玩
	AssetStatusArchived = "archived" // 已归档：仍可通过直链访问，但不进列表
)

// 资产可见范围（已发布后的访问控制）
const (
	AssetVisibilityPublic   = "public"   // 公开
	AssetVisibilityUnlisted = "unlisted" // 不进列表，但直链可访问
	AssetVisibilityPrivate  = "private"  // 仅作者
)

// AssetInputVariable 资产输入变量声明。
// 模板里以 {{name}} 引用，试玩时由调用方按声明填充。
type AssetInputVariable struct {
	Name        string `json:"name"`        // 变量名（^[a-zA-Z_][a-zA-Z0-9_]*$）
	Type        string `json:"type"`        // string | number | boolean | select
	Label       string `json:"label"`       // 展示名
	Description string `json:"description"` // 帮助文案
	Required    bool   `json:"required"`
	Default     any    `json:"default"`     // 默认值
	Options     []any  `json:"options"`     // type=select 时的可选值
}

// AssetDefaultParams 资产默认运行参数。
// 试玩页以此作为表单初值，用户可覆盖后运行。
type AssetDefaultParams struct {
	Model       string  `json:"model"`       // 偏好模型（空则用全局默认）
	MaxTokens   int     `json:"maxTokens"`   // 生成上限
	Temperature float64 `json:"temperature"` // 采样温度
}

// Asset AI 资产卡。
type Asset struct {
	ID            string          `gorm:"primaryKey" json:"id"`
	Type          string          `gorm:"size:20;not null;index;default:prompt" json:"type"` // prompt | agent | workflow
	Name          string          `gorm:"size:150;not null" json:"name"`
	Version       string          `gorm:"size:30;not null;default:1.0.0" json:"version"`
	Description   string          `gorm:"size:1000" json:"description"`
	PromptTemplate string         `gorm:"type:text;not null" json:"promptTemplate"` // 模板正文，含 {{var}} 占位
	InputVariables json.RawMessage `gorm:"type:jsonb" json:"inputVariables"`         // []AssetInputVariable
	DefaultParams  json.RawMessage `gorm:"type:jsonb" json:"defaultParams"`          // AssetDefaultParams
	// Tags 资产分类标签，1-5 个，用于列表筛选与发现页推荐。
	// serializer:json 让 GORM 自动把 []string 序列化为 jsonb 存储，
	// 便于 @> 包含查询；归并到预定义白名单避免同义词碎片化。
	Tags          []string        `gorm:"type:jsonb;serializer:json;index" json:"tags"`
	AuthorID      string          `gorm:"index;not null" json:"authorId"`
	Author        User            `gorm:"foreignKey:AuthorID;constraint:OnDelete:CASCADE" json:"-"`
	ParentID      *string         `gorm:"index" json:"parentId,omitempty"` // Remix 来源资产
	Parent        *Asset          `gorm:"foreignKey:ParentID;constraint:OnDelete:SET NULL" json:"-"`
	Status        string          `gorm:"size:20;not null;index;default:draft" json:"status"`
	Visibility    string          `gorm:"size:20;not null;default:public" json:"visibility"`
	RunCount      int64           `gorm:"default:0" json:"runCount"`
	ForkCount     int64           `gorm:"default:0" json:"forkCount"`
	LikeCount     int64           `gorm:"default:0" json:"likeCount"`
	CreatedAt     time.Time       `gorm:"index" json:"createdAt"`
	UpdatedAt     time.Time       `json:"updatedAt"`
}

// BeforeCreate 自动生成 UUID 主键
func (a *Asset) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	if a.Type == "" {
		a.Type = AssetTypePrompt
	}
	if a.Version == "" {
		a.Version = "1.0.0"
	}
	if a.Status == "" {
		a.Status = AssetStatusDraft
	}
	if a.Visibility == "" {
		a.Visibility = AssetVisibilityPublic
	}
	return nil
}

// PostAsset 帖子与资产的多对多绑定（B2）。
// 同一帖子可挂多个资产，同一资产也可被多个帖子引用；
// 顺序由 SortOrder 控制，前端按它顺序展示「本帖用到的资产」。
type PostAsset struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	PostID    string    `gorm:"index:idx_post_asset_post;uniqueIndex:idx_post_asset_unique" json:"postId"`
	Post      Post      `gorm:"foreignKey:PostID;constraint:OnDelete:CASCADE" json:"-"`
	AssetID   string    `gorm:"index:idx_post_asset_asset;uniqueIndex:idx_post_asset_unique" json:"assetId"`
	Asset     Asset     `gorm:"foreignKey:AssetID;constraint:OnDelete:CASCADE" json:"-"`
	SortOrder int       `gorm:"default:0" json:"sortOrder"`
	CreatorID string    `gorm:"index" json:"creatorId"` // 绑定操作者（帖子作者或协作者）
	CreatedAt time.Time `json:"createdAt"`
}

// BeforeCreate 自动生成 UUID 主键
func (pa *PostAsset) BeforeCreate(tx *gorm.DB) error {
	if pa.ID == "" {
		pa.ID = uuid.New().String()
	}
	return nil
}
