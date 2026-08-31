package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 活动「九月彩虹桥 · 读书大富翁」数据模型。
// 表统一加 activity_ 前缀，与社区业务表解耦（隔离要求同旧玩法）。

// 彩虹七色：成员认领色，与书籍封面主色调匹配即为有效色块
const (
	RainbowColorRed    = "red"
	RainbowColorOrange = "orange"
	RainbowColorYellow = "yellow"
	RainbowColorGreen  = "green"
	RainbowColorCyan   = "cyan"
	RainbowColorBlue   = "blue"
	RainbowColorPurple = "purple"
)

// 格子类型：100 格均分五类，每类 20 格
const (
	TileKindForward  = "forward"  // 前进格
	TileKindBackward = "backward" // 后退格
	TileKindSpecial  = "special"  // 特殊功能格
	TileKindSwap     = "swap"     // 位置互换格
	TileKindBlank    = "blank"    // 空白格
)

// 队伍状态机（新玩法）
const (
	TeamStatusCollecting = "collecting" // 集齐彩虹进行中
	TeamStatusReady      = "ready"      // 已有掷骰机会，可前进
	TeamStatusCompleted  = "completed"  // 走完 100 格冲线获胜
)

// 审核状态流（沿用旧玩法，书目级审核）
const (
	ReviewStatusPendingAI  = "pending-ai"
	ReviewStatusAIPassed   = "ai-passed"
	ReviewStatusAIUnsure   = "ai-unsure"
	ReviewStatusAIRejected = "ai-rejected"
	// ReviewStatusInVoting 已进入队长投票池，等待过半赞成
	ReviewStatusInVoting = "in-voting"
	ReviewStatusApproved = "approved"
	ReviewStatusRejected = "rejected"
	ReviewStatusRevoked  = "revoked"
)

// 时间线事件类型（新玩法）
const (
	EventTypeCheckIn = "checkin"
	EventTypeReview  = "review"
	EventTypeRoll    = "roll"
	EventTypeDice    = "dice"   // 万能骰子
	EventTypeCycle   = "cycle"  // 彩虹集齐
	EventTypeColor   = "color"  // 颜色认领
	EventTypeTile    = "tile"   // 格子效果
	EventTypeWin     = "win"    // 冲线获胜
	EventTypeManual  = "manual" // 运营修正
)

// ActivityTile 格子静态定义，100 格均分五类；运营可调整文案与效果参数
type ActivityTile struct {
	// Index 即格子编号 1–100，直接做主键。
	Index int `gorm:"column:tile_index;primaryKey;autoIncrement:false" json:"index"`
	// Kind 格子类型：forward / backward / special / swap / blank
	Kind string `gorm:"size:16;not null" json:"kind"`
	// Title 面向用户的格子名（如「额外前进2格」「终点格」），可留空按类型兜底
	Title string `gorm:"size:100" json:"title,omitempty"`
	// Effect 特殊功能格的效果标识（special 类型必填）
	Effect string `gorm:"size:32" json:"effect,omitempty"`
	// Param 效果参数：前进/后退格数（0 表示随机 1–3）
	Param int `gorm:"default:0" json:"param,omitempty"`
	// Twin 双子格编号（swap 类型必填）
	Twin      int       `gorm:"default:0" json:"twin,omitempty"`
	UpdatedAt time.Time `json:"updatedAt,omitempty"`
}

func (ActivityTile) TableName() string { return "activity_tiles" }

// ActivityTeam 小组。位置、积分、万能骰子、Buff、彩虹进度全部由服务端维护（服务端权威）
type ActivityTeam struct {
	ID    string `gorm:"primaryKey" json:"id"`
	Name  string `gorm:"size:50;not null" json:"name"`
	Color string `gorm:"size:20;not null" json:"color"`
	// Emblem 队伍彩虹徽章 key，前端据此渲染徽章盘面
	Emblem string `gorm:"size:24" json:"emblem,omitempty"`
	// Members 队伍成员（关联关系，不落库）
	Members []ActivityMember `gorm:"foreignKey:TeamID" json:"members"`
	// Position 当前所在格编号 0–100：0 起点未出发，100 终点冲线
	Position int    `gorm:"default:0;not null" json:"position"`
	Status   string `gorm:"size:24;default:collecting;not null;index" json:"status"`
	// Points 团队积累积分（每满 10 自动兑换后保留余数）
	Points int `gorm:"default:0;not null" json:"points"`
	// UniversalDice 万能骰子持有数
	UniversalDice int `gorm:"default:0;not null" json:"universalDice"`
	// RollChances 掷骰前进机会：每集齐一次完整彩虹 +1
	RollChances int `gorm:"default:0;not null" json:"rollChances"`
	// RainbowCount 已完成的彩虹周期总数
	RainbowCount int `gorm:"default:0;not null" json:"rainbowCount"`
	// WeekMinDelta 本周彩虹保底条数修正（保底扩容 -1）
	WeekMinDelta int `gorm:"default:0;not null" json:"weekMinDelta"`
	// ColorBlocks 当前彩虹周期内各颜色色块数（JSON：{"red":2,...}）
	ColorBlocks string `gorm:"type:text" json:"colorBlocks,omitempty"`
	// Buffs 生效中的持久效果（JSON 数组 [{kind,uses}]）
	Buffs string `gorm:"type:text" json:"buffs,omitempty"`
	// ChampionAt 冲线时间，非空表示队伍获胜
	ChampionAt *time.Time `json:"championAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

func (ActivityTeam) TableName() string { return "activity_teams" }

func (t *ActivityTeam) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

// ActivityMember 小组成员。小组固定 7 人，每人认领一种彩虹色（一人一色不重复）。
// 颜色在一轮彩虹周期内不可换，集齐后可重新分配。
type ActivityMember struct {
	ID     string `gorm:"primaryKey" json:"id"`
	TeamID string `gorm:"index;not null" json:"teamId"`
	// UserID 关联社区账号，活动仅复用账号体系识别身份
	UserID    string `gorm:"index;not null" json:"userId"`
	User      User   `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user"`
	IsCaptain bool   `gorm:"default:false" json:"isCaptain"`
	// Nickname 活动内昵称：入队时从报名记录带入，为空时回退到社区账号昵称
	Nickname string `gorm:"size:50" json:"nickname,omitempty"`
	// Color 认领的彩虹色（red/orange/yellow/green/cyan/blue/purple），空表示未认领
	Color string `gorm:"size:16;index" json:"color,omitempty"`
	// BookCount / WordCount 为终审通过的累计值，榜单直接取用
	BookCount int       `gorm:"default:0;not null" json:"bookCount"`
	WordCount int64     `gorm:"default:0;not null" json:"wordCount"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (ActivityMember) TableName() string { return "activity_members" }

func (m *ActivityMember) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.New().String()
	}
	return nil
}

// ActivityEnrollment 活动报名。报名是入队的前提：登录用户先报名，
// 队长从报名名单中把人拉进队伍。报名不代表入队，入队后才参与任务。
type ActivityEnrollment struct {
	ID     string `gorm:"primaryKey" json:"id"`
	UserID string `gorm:"uniqueIndex;not null" json:"userId"`
	User   User   `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user"`
	// Nickname 报名时填写的活动内昵称，仅活动内展示（榜单/成员列表），
	// 为空时回退到社区账号昵称
	Nickname  string    `gorm:"size:50" json:"nickname,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

func (ActivityEnrollment) TableName() string { return "activity_enrollments" }

func (e *ActivityEnrollment) BeforeCreate(tx *gorm.DB) error {
	if e.ID == "" {
		e.ID = uuid.New().String()
	}
	return nil
}

// ActivityTeamProgress 队伍在某格某轮次的点亮记录。
// 跨轮次落入同一格时按轮次分组展示（PRD 8.2），点亮数按 TileIndex 去重统计。
type ActivityTeamProgress struct {
	ID        string `gorm:"primaryKey" json:"id"`
	TeamID    string `gorm:"index:idx_activity_progress_team_tile;not null" json:"teamId"`
	TileIndex int    `gorm:"index:idx_activity_progress_team_tile;not null" json:"tileIndex"`
	Lap       int    `gorm:"not null" json:"lap"`
	// Lit 是否已点亮；LitReason 记录点亮方式
	Lit       bool       `gorm:"default:false;index" json:"lit"`
	LitReason string     `gorm:"size:16" json:"litReason,omitempty"`
	LitAt     *time.Time `json:"litAt,omitempty"`
	// BookCount 该格该轮累计通过审核的书目数，即保底计数来源
	BookCount int       `gorm:"default:0;not null" json:"bookCount"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (ActivityTeamProgress) TableName() string { return "activity_team_progress" }

func (p *ActivityTeamProgress) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}

// ActivityCheckIn 成员针对某格提交的一次打卡，含多条书目
type ActivityCheckIn struct {
	ID        string `gorm:"primaryKey" json:"id"`
	TeamID    string `gorm:"index;not null" json:"teamId"`
	MemberID  string `gorm:"index;not null" json:"memberId"`
	TileIndex int    `gorm:"index;not null" json:"tileIndex"`
	Lap       int    `gorm:"not null" json:"lap"`
	// EvidenceURL 阅读记录、书页或读书软件截图
	EvidenceURL string                `gorm:"size:500" json:"evidenceUrl,omitempty"`
	Books       []ActivityCheckInBook `gorm:"foreignKey:CheckInID;constraint:OnDelete:CASCADE" json:"books"`
	CreatedAt   time.Time             `gorm:"index" json:"createdAt"`
	UpdatedAt   time.Time             `json:"updatedAt"`
}

func (ActivityCheckIn) TableName() string { return "activity_checkins" }

func (c *ActivityCheckIn) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}

// ActivityCheckInBook 单条书目，打卡以「书」为最小单位。
// 审核状态挂在书目级，管理员可逐条通过或驳回。
type ActivityCheckInBook struct {
	ID        string `gorm:"primaryKey" json:"id"`
	CheckInID string `gorm:"index;not null" json:"checkInId"`
	// 冗余 team/member 便于榜单直接聚合，避免多表 join
	TeamID   string `gorm:"index;not null" json:"teamId"`
	MemberID string `gorm:"index;not null" json:"memberId"`
	Lap      int    `gorm:"not null" json:"lap"`
	// 必填三要素
	Title     string `gorm:"size:200;not null" json:"title"`
	Author    string `gorm:"size:100;not null" json:"author"`
	WordCount int64  `gorm:"not null" json:"wordCount"`
	// DedupKey 归一化后的「成员 + 书名 + 作者」，唯一索引兜住并发重复提交
	DedupKey        string `gorm:"size:320;uniqueIndex;not null" json:"-"`
	DurationMinutes int    `gorm:"default:0" json:"durationMinutes,omitempty"`
	CoverURL        string `gorm:"size:500" json:"coverUrl,omitempty"`
	Genre           string `gorm:"size:50" json:"genre,omitempty"`
	Note            string `gorm:"size:500" json:"note,omitempty"`
	// CoverColor 封面主色调（七彩虹色之一或 other），由 AI / 人工审核标注；
	// 与成员认领色一致时，终审通过即点亮对应色块
	CoverColor   string `gorm:"size:16;index" json:"coverColor,omitempty"`
	ReviewStatus string `gorm:"size:24;default:pending-ai;not null;index" json:"reviewStatus"`
	// CountsForTask 是否计入当前彩虹（色块计数），由人工终审时判定
	CountsForTask bool `gorm:"default:true" json:"countsForTask"`
	// AI 初审结论，Skipped 表示 AI 不可用直接入人工队列
	AIStatus     string    `gorm:"size:16" json:"aiStatus,omitempty"`
	AIConfidence float64   `gorm:"default:0" json:"aiConfidence,omitempty"`
	AIReason     string    `gorm:"size:500" json:"aiReason,omitempty"`
	CreatedAt    time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (ActivityCheckInBook) TableName() string { return "activity_checkin_books" }

func (b *ActivityCheckInBook) BeforeCreate(tx *gorm.DB) error {
	if b.ID == "" {
		b.ID = uuid.New().String()
	}
	return nil
}

// ActivityDiceRoll 掷骰记录。点数由服务端生成，前端仅做表现（PRD 10.3 防篡改）
type ActivityDiceRoll struct {
	ID       string `gorm:"primaryKey" json:"id"`
	TeamID   string `gorm:"index;not null" json:"teamId"`
	RollerID string `gorm:"index;not null" json:"rollerId"`
	Value    int    `gorm:"not null" json:"value"`
	FromTile int    `gorm:"not null" json:"fromTile"`
	ToTile   int    `gorm:"not null" json:"toTile"`
	// LandedTile 骰子基础移动后实际踩中的格子；ToTile 是全部格子效果结算后的最终位置。
	LandedTile int `gorm:"default:0" json:"landedTile,omitempty"`
	// ResultSummary 保存本次权威结算结果，供全局大事件准确播报。
	ResultSummary string `gorm:"type:text" json:"resultSummary,omitempty"`
	// Lap 掷骰时队伍所在圈数。判定记录按圈隔离，避免跨圈回到同一判定格时状态被旧记录污染
	Lap int `gorm:"not null" json:"lap"`
	// IsJudgement 为 true 时是特殊判定掷骰，不产生移动
	IsJudgement bool `gorm:"default:false;index" json:"isJudgement"`
	// JudgementRound 判定轮次，同一轮内每人只能掷一次
	JudgementRound int       `gorm:"default:0" json:"judgementRound,omitempty"`
	CreatedAt      time.Time `gorm:"index" json:"createdAt"`
}

func (ActivityDiceRoll) TableName() string { return "activity_dice_rolls" }

func (r *ActivityDiceRoll) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}

// ActivityReview 审核审计日志。每次人工操作写一条，含操作人、时间、前后状态（PRD 9.3）
type ActivityReview struct {
	ID     string `gorm:"primaryKey" json:"id"`
	BookID string `gorm:"index;not null" json:"bookId"`
	// ReviewerID 为空表示 AI 初审写入
	ReviewerID string `gorm:"index" json:"reviewerId,omitempty"`
	FromStatus string `gorm:"size:24;not null" json:"fromStatus"`
	ToStatus   string `gorm:"size:24;not null" json:"toStatus"`
	// Reason 驳回时必填（PRD 9.3）
	Reason string `gorm:"size:500" json:"reason,omitempty"`
	// Violation 标记违规，计入成员违规记录
	Violation bool      `gorm:"default:false" json:"violation"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (ActivityReview) TableName() string { return "activity_reviews" }

func (r *ActivityReview) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}

// ActivityBookVote 投票池票数。同一队长对同一本书只保留一票（唯一索引兜底），
// 赞成票过半（队长数的一半以上）即打卡通过。
type ActivityBookVote struct {
	ID string `gorm:"primaryKey" json:"id"`
	// BookID 被投票的书目
	BookID string `gorm:"uniqueIndex:idx_book_vote_member;not null" json:"bookId"`
	// VoterMemberID 投票队长（ActivityMember.ID）
	VoterMemberID string `gorm:"uniqueIndex:idx_book_vote_member;not null" json:"voterMemberId"`
	// TeamID 投票队长所属队伍，冗余便于展示与审计
	TeamID string `gorm:"index;not null" json:"teamId"`
	// Vote: approve / reject
	Vote      string    `gorm:"size:8;not null" json:"vote"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (ActivityBookVote) TableName() string { return "activity_book_votes" }

func (v *ActivityBookVote) BeforeCreate(tx *gorm.DB) error {
	if v.ID == "" {
		v.ID = uuid.New().String()
	}
	return nil
}

// ActivityCheckInLike 打卡点赞。同一用户对同一次打卡只保留一赞（唯一索引），再点取消。
// 点赞对象是「一次打卡提交」，不限点赞者身份；点赞数在成员档案中展示。
type ActivityCheckInLike struct {
	ID string `gorm:"primaryKey" json:"id"`
	// CheckInID 被点赞的打卡
	CheckInID string `gorm:"uniqueIndex:idx_checkin_like_user;not null" json:"checkInId"`
	// UserID 点赞的社区用户（不限是否入组）
	UserID    string    `gorm:"uniqueIndex:idx_checkin_like_user;not null" json:"userId"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (ActivityCheckInLike) TableName() string { return "activity_checkin_likes" }

func (l *ActivityCheckInLike) BeforeCreate(tx *gorm.DB) error {
	if l.ID == "" {
		l.ID = uuid.New().String()
	}
	return nil
}

// ActivityEvent 队伍时间线事件，活动过程的可追溯视图（PRD 10.3）
type ActivityEvent struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	TeamID    string    `gorm:"index;not null" json:"teamId"`
	Type      string    `gorm:"size:16;not null;index" json:"type"`
	Text      string    `gorm:"size:500;not null" json:"text"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
}

func (ActivityEvent) TableName() string { return "activity_events" }

func (e *ActivityEvent) BeforeCreate(tx *gorm.DB) error {
	if e.ID == "" {
		e.ID = uuid.New().String()
	}
	return nil
}

// 反馈类型
const (
	FeedbackTypeBug     = "bug"
	FeedbackTypeFeature = "feature"
	FeedbackTypeOther   = "other"
)

// 反馈状态
const (
	FeedbackStatusPending  = "pending"
	FeedbackStatusResolved = "resolved"
)

// ActivityFeedback 活动反馈：用户在「我的」页面提交 bug / 需求，
// 管理员在打卡监督台（审批台）查看并标记处理完成。
type ActivityFeedback struct {
	ID     string `gorm:"primaryKey" json:"id"`
	UserID string `gorm:"index;not null" json:"userId"`
	User   User   `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user"`
	// Type: bug / feature / other
	Type string `gorm:"size:16;not null" json:"type"`
	// Content 反馈内容（bug 描述 / 需求说明）
	Content string `gorm:"size:2000;not null" json:"content"`
	// Contact 联系方式（选填）
	Contact string `gorm:"size:100" json:"contact,omitempty"`
	// Status: pending / resolved
	Status string `gorm:"size:16;default:pending;not null;index" json:"status"`
	// Reply 管理员处理回复（选填）
	Reply     string    `gorm:"size:1000" json:"reply,omitempty"`
	CreatedAt time.Time `gorm:"index" json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (ActivityFeedback) TableName() string { return "activity_feedbacks" }

func (f *ActivityFeedback) BeforeCreate(tx *gorm.DB) error {
	if f.ID == "" {
		f.ID = uuid.New().String()
	}
	return nil
}

// ActivityMigrationState 一次性数据迁移标记（幂等锁）：
// 记录已执行过的迁移 key，避免回填类操作被重复执行（如保底计数历史回填）。
type ActivityMigrationState struct {
	MigrationKey string    `gorm:"primaryKey;size:64" json:"migrationKey"`
	AppliedAt    time.Time `json:"appliedAt"`
}

func (ActivityMigrationState) TableName() string { return "activity_migration_state" }
