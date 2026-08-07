package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// 活动「无限循环读书地狱」数据模型。
// 表统一加 activity_ 前缀，与社区业务表解耦（PRD 第 12 节隔离要求）。

// 任务类型，驱动 AI 初审的校验字段（PRD 第 6 / 9 节）
const (
	TaskTypeTitleLength       = "title-length"
	TaskTypeCoverColor        = "cover-color"
	TaskTypeGenre             = "genre"
	TaskTypeAuthorNationality = "author-nationality"
	TaskTypeSameAuthor        = "same-author"
	TaskTypePlainCount        = "plain-count"
	TaskTypeTotalWords        = "total-words"
	TaskTypeTotalDuration     = "total-duration"
	TaskTypeGroupCross        = "group-cross"
	TaskTypeTimedPenalty      = "timed-penalty"
)

// 特殊判定规则：全员各掷一次骰，全部满足才通过（P0-2）
const (
	RuleAllOdd    = "all-odd"
	RuleAllEven   = "all-even"
	RuleAllBelow4 = "all-below-4"
	RuleAllAbove3 = "all-above-3"
)

// 队伍状态机（PRD 7.2）
const (
	TeamStatusInProgress        = "in-progress"
	TeamStatusAwaitingJudgement = "awaiting-judgement"
	TeamStatusAwaitingRoll      = "awaiting-roll"
	TeamStatusTimerRunning      = "timer-running"
	TeamStatusCompleted         = "completed"
)

// 点亮方式
const (
	LitReasonTask     = "task"
	LitReasonFallback = "fallback"
	LitReasonTimer    = "timer"
	LitReasonManual   = "manual"
	// LitReasonInitial 队长初始化时补录的已点亮格
	LitReasonInitial = "initial"
)

// 审核状态流（PRD 9.1）
const (
	ReviewStatusPendingAI  = "pending-ai"
	ReviewStatusAIPassed   = "ai-passed"
	ReviewStatusAIUnsure   = "ai-unsure"
	ReviewStatusAIRejected = "ai-rejected"
	// ReviewStatusInVoting 已进入队长投票池，等待过半赞成（情况一/二 AI 未过、情况三封面直接进入）
	ReviewStatusInVoting = "in-voting"
	ReviewStatusApproved = "approved"
	ReviewStatusRejected = "rejected"
	ReviewStatusRevoked  = "revoked"
)

// 时间线事件类型（PRD 10.3）
const (
	EventTypeCheckIn   = "checkin"
	EventTypeReview    = "review"
	EventTypeRoll      = "roll"
	EventTypeLit       = "lit"
	EventTypeJudgement = "judgement"
	EventTypeFallback  = "fallback"
	EventTypeTimer     = "timer"
	EventTypeManual    = "manual"
)

// ActivityTile 格子定义，活动期内不变；运营可调整任务文案（PRD 第 13 节）
type ActivityTile struct {
	// Index 即格子编号 1–20，直接做主键，天然保证唯一。
	// 列名用 tile_index：index 在 PostgreSQL 中是保留字，裸用会导致 SQL 语法错误。
	Index       int       `gorm:"column:tile_index;primaryKey;autoIncrement:false" json:"index"`
	Title       string    `gorm:"size:100;not null" json:"title"`
	TaskType    string    `gorm:"size:32;not null" json:"taskType"`
	Target      int64     `gorm:"not null" json:"target"`
	Unit        string    `gorm:"size:8;not null" json:"unit"`
	SpecialRule string    `gorm:"size:32" json:"specialRule,omitempty"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (ActivityTile) TableName() string { return "activity_tiles" }

// ActivityTeam 小组。位置、点亮状态、保底计数全部由服务端维护（PRD 第 12 节服务端权威）
type ActivityTeam struct {
	ID    string `gorm:"primaryKey" json:"id"`
	Name  string `gorm:"size:50;not null" json:"name"`
	Color string `gorm:"size:20;not null" json:"color"`
	// Emblem 队伍标志形象 key（werewolf / detective / witch …），前端据此渲染桌游角色徽章
	Emblem string `gorm:"size:24" json:"emblem,omitempty"`
	// Position 当前所在格编号 1–20
	Position int    `gorm:"default:1;not null" json:"position"`
	Status   string `gorm:"size:24;default:in-progress;not null;index" json:"status"`
	// TileProgress 当前格任务累计完成量，仅统计符合条件且终审通过的书
	TileProgress int64 `gorm:"default:0;not null" json:"tileProgress"`
	// FallbackCount 当前格保底计数，达 40 触发保底（P1-5）
	FallbackCount int `gorm:"default:0;not null" json:"fallbackCount"`
	// TimerEndsAt 计时惩罚格到期时间，仅 timer-running 时有值（P1-6）
	TimerEndsAt *time.Time `json:"timerEndsAt,omitempty"`
	// Lap 已绕圈轮次，跨过第 20 格时累加
	Lap int `gorm:"default:1;not null" json:"lap"`
	// LastLitAt 最后一次点亮时间，周期结束时作并列比较依据（P1-7）
	LastLitAt *time.Time `json:"lastLitAt,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

func (ActivityTeam) TableName() string { return "activity_teams" }

func (t *ActivityTeam) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

// ActivityMember 小组成员。小组与成员由运营后台预置，不做自由组队（PRD 第 2 节非目标）
type ActivityMember struct {
	ID     string `gorm:"primaryKey" json:"id"`
	TeamID string `gorm:"index;not null" json:"teamId"`
	// UserID 关联社区账号，活动仅复用账号体系识别身份
	UserID    string `gorm:"index;not null" json:"userId"`
	User      User   `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user"`
	IsCaptain bool   `gorm:"default:false" json:"isCaptain"`
	// Nickname 活动内昵称：入队时从报名记录带入，榜单/成员列表展示用，
	// 为空时回退到社区账号昵称
	Nickname string `gorm:"size:50" json:"nickname,omitempty"`
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

// ActivityCheckInBook 单条书目，打卡以「书」为最小单位（PRD 8.1）。
// 审核状态挂在书目级，管理员可逐条通过或驳回。
type ActivityCheckInBook struct {
	ID        string `gorm:"primaryKey" json:"id"`
	CheckInID string `gorm:"index;not null" json:"checkInId"`
	// 冗余 team/member/tile 便于榜单与格子记录直接聚合，避免多表 join
	TeamID    string `gorm:"index;not null" json:"teamId"`
	MemberID  string `gorm:"index;not null" json:"memberId"`
	TileIndex int    `gorm:"index;not null" json:"tileIndex"`
	Lap       int    `gorm:"not null" json:"lap"`
	// 必填三要素（PRD 8.1）
	Title     string `gorm:"size:200;not null" json:"title"`
	Author    string `gorm:"size:100;not null" json:"author"`
	WordCount int64  `gorm:"not null" json:"wordCount"`
	// DedupKey 归一化后的「成员 + 书名 + 作者」，唯一索引兜住并发重复提交（P1-8）
	DedupKey        string `gorm:"size:320;uniqueIndex;not null" json:"-"`
	DurationMinutes int    `gorm:"default:0" json:"durationMinutes,omitempty"`
	CoverURL        string `gorm:"size:500" json:"coverUrl,omitempty"`
	Genre           string `gorm:"size:50" json:"genre,omitempty"`
	Note            string `gorm:"size:500" json:"note,omitempty"`
	ReviewStatus    string `gorm:"size:24;default:pending-ai;not null;index" json:"reviewStatus"`
	// CountsForTask 是否计入当前格任务进度，由人工终审时判定
	CountsForTask bool `gorm:"default:true" json:"countsForTask"`
	// AI 初审结论，Skipped 表示 AI 不可用直接入人工队列（PRD 9.4）
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

// ActivitySeedState 活动重置 seed 的执行标记（只执行一次的幂等锁）。
// server 启动时若该表不存在对应 seed_key，则清空活动业务数据并重建 10 支空队伍，
// 随后写入标记；此后每次重启都会跳过，避免反复清空群员已产生的数据。
type ActivitySeedState struct {
	// SeedKey 种子唯一标识，如 hell-board-v1
	SeedKey string `gorm:"primaryKey;size:64" json:"seedKey"`
	// AppliedAt 本次 seed 实际执行时间
	AppliedAt time.Time `json:"appliedAt"`
}

func (ActivitySeedState) TableName() string { return "activity_seed_state" }
