package types

// 活动「无限循环读书地狱」DTO。字段名与前端 lib/types.ts 保持一致，
// 前端可直接消费无需转换。

// --- 响应 DTO ---

// ActivityTileDTO 格子定义，含面向用户的判定文案
type ActivityTileDTO struct {
	Index    int    `json:"index"`
	Title    string `json:"title"`
	TaskType string `json:"taskType"`
	Target   int64  `json:"target"`
	Unit     string `json:"unit"`
	// SpecialRule 为空表示该格无特殊判定
	SpecialRule      string `json:"specialRule,omitempty"`
	SpecialRuleLabel string `json:"specialRuleLabel,omitempty"`
}

// ActivityMemberDTO 成员及其累计成绩（仅统计终审通过）
type ActivityMemberDTO struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	IsCaptain bool   `json:"isCaptain"`
	BookCount int    `json:"bookCount"`
	WordCount int64  `json:"wordCount"`
}

// ActivityTeamDTO 队伍快照。litTiles 为「格子编号 → 点亮方式」
type ActivityTeamDTO struct {
	ID            string              `json:"id"`
	Name          string              `json:"name"`
	Color         string              `json:"color"`
	Emblem        string              `json:"emblem"`
	Members       []ActivityMemberDTO `json:"members"`
	Position      int                 `json:"position"`
	LitTiles      map[int]string      `json:"litTiles"`
	Status        string              `json:"status"`
	TileProgress  int64               `json:"tileProgress"`
	FallbackCount int                 `json:"fallbackCount"`
	TimerEndsAt   string              `json:"timerEndsAt,omitempty"`
	Lap           int                 `json:"lap"`
}

// ActivityBoardDTO 棋盘全局快照，前端轮询该接口刷新（PRD 第 12 节实时性）
type ActivityBoardDTO struct {
	Tiles []ActivityTileDTO `json:"tiles"`
	Teams []ActivityTeamDTO `json:"teams"`
	// MyTeamID / MyMemberID 为空表示当前用户不在任何小组，只能观战
	MyTeamID   string `json:"myTeamId,omitempty"`
	MyMemberID string `json:"myMemberId,omitempty"`
	IsCaptain  bool   `json:"isCaptain"`
	// Enrolled 当前用户是否已报名（报名是入队的前提）
	Enrolled bool `json:"enrolled"`
	// Archived 为 true 时页面转只读归档态（P1-7 / 验收标准 12）
	Archived     bool   `json:"archived"`
	CycleStarted bool   `json:"cycleStarted"`
	CycleStart   string `json:"cycleStart"`
	CycleEnd     string `json:"cycleEnd"`
	// FallbackThreshold 保底阈值下发，避免前端硬编码
	FallbackThreshold int `json:"fallbackThreshold"`
}

// EnrollmentDTO 报名名单条目，队长据此把人拉进队伍
type EnrollmentDTO struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	// 已入队时的队伍信息；空表示待入队
	TeamID   string `json:"teamId,omitempty"`
	TeamName string `json:"teamName,omitempty"`
	Joined   bool   `json:"joined"`
}

// ActivityTeamAddMemberReq 队长从报名名单拉人入队
type ActivityTeamAddMemberReq struct {
	UserID string `json:"userId" vd:"len($)>=1"`
}

// ActivityBookDTO 单条书目
type ActivityBookDTO struct {
	ID              string  `json:"id"`
	CheckInID       string  `json:"checkInId"`
	MemberID        string  `json:"memberId"`
	MemberName      string  `json:"memberName"`
	TeamID          string  `json:"teamId"`
	TeamName        string  `json:"teamName,omitempty"`
	TileIndex       int     `json:"tileIndex"`
	Lap             int     `json:"lap"`
	Title           string  `json:"title"`
	Author          string  `json:"author"`
	WordCount       int64   `json:"wordCount"`
	DurationMinutes int     `json:"durationMinutes,omitempty"`
	CoverURL        string  `json:"coverUrl,omitempty"`
	Genre           string  `json:"genre,omitempty"`
	Note            string  `json:"note,omitempty"`
	ReviewStatus    string  `json:"reviewStatus"`
	CountsForTask   bool    `json:"countsForTask"`
	AIStatus        string  `json:"aiStatus,omitempty"`
	AIConfidence    float64 `json:"aiConfidence,omitempty"`
	AIReason        string  `json:"aiReason,omitempty"`
	EvidenceURL     string  `json:"evidenceUrl,omitempty"`
	CreatedAt       string  `json:"createdAt"`
}

// ActivityCheckInDTO 一次打卡提交
type ActivityCheckInDTO struct {
	ID          string            `json:"id"`
	TileIndex   int               `json:"tileIndex"`
	TeamID      string            `json:"teamId"`
	MemberID    string            `json:"memberId"`
	MemberName  string            `json:"memberName"`
	Lap         int               `json:"lap"`
	Books       []ActivityBookDTO `json:"books"`
	EvidenceURL string            `json:"evidenceUrl,omitempty"`
	CreatedAt   string            `json:"createdAt"`
}

// ActivityEventDTO 时间线事件
type ActivityEventDTO struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

// ActivityRollResultDTO 掷骰结果。点数由服务端生成，前端仅做动画表现
type ActivityRollResultDTO struct {
	Value    int `json:"value"`
	FromTile int `json:"fromTile"`
	ToTile   int `json:"toTile"`
	// LitTile 本次掷骰点亮的格子编号，0 表示未点亮
	LitTile   int    `json:"litTile,omitempty"`
	LitReason string `json:"litReason,omitempty"`
	// TimerStarted 落入第 8 格启动计时（P1-6）
	TimerStarted bool            `json:"timerStarted"`
	Team         ActivityTeamDTO `json:"team"`
}

// ActivityJudgementDTO 特殊判定会话
type ActivityJudgementDTO struct {
	TileIndex int    `json:"tileIndex"`
	Rule      string `json:"rule"`
	RuleLabel string `json:"ruleLabel"`
	Round     int    `json:"round"`
	// Rolls 为成员 id → 点数，缺席表示未掷
	Rolls map[string]int `json:"rolls"`
	// Result 为空表示未全员掷完；passed / failed
	Result string `json:"result,omitempty"`
}

// ActivityTileRecordDTO 格子打卡记录（PRD 8.2）。
// 非本组只下发汇总数量，books 为空，避免互相抄书单。
type ActivityTileRecordDTO struct {
	TeamID    string `json:"teamId"`
	TeamName  string `json:"teamName"`
	TeamColor string `json:"teamColor"`
	Lap       int    `json:"lap"`
	BookCount int    `json:"bookCount"`
	Lit       bool   `json:"lit"`
	LitReason string `json:"litReason,omitempty"`
	IsMyTeam  bool   `json:"isMyTeam"`
	// Books 仅本组可见完整清单
	Books []ActivityBookDTO `json:"books,omitempty"`
}

// ActivityTileDetailDTO 格子详情
type ActivityTileDetailDTO struct {
	Tile    ActivityTileDTO         `json:"tile"`
	Records []ActivityTileRecordDTO `json:"records"`
}

// ActivityRankingRowDTO 榜单行
type ActivityRankingRowDTO struct {
	ID        string `json:"id"`
	Rank      int    `json:"rank"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	BookCount int    `json:"bookCount"`
	WordCount int64  `json:"wordCount"`
	LitCount  int    `json:"litCount"`
	TeamName  string `json:"teamName,omitempty"`
	IsSelf    bool   `json:"isSelf"`
}

// ActivityReviewQueueDTO 人工终审队列项（PRD 9.3）
type ActivityReviewQueueDTO struct {
	Book ActivityBookDTO `json:"book"`
	// MemberPassRate 该成员历史通过率，供管理员参考
	MemberPassRate float64 `json:"memberPassRate"`
	// DuplicateInTeam 该书目是否被本队重复提交
	DuplicateInTeam bool            `json:"duplicateInTeam"`
	Tile            ActivityTileDTO `json:"tile"`
}

// --- 请求 DTO ---

// ActivityBookReq 提交打卡中的单条书目。
// 书名、作者、字数为必填三要素，缺一不可提交（PRD 8.1）。
type ActivityBookReq struct {
	Title           string `json:"title" vd:"len($)>=1 && len($)<=200"`
	Author          string `json:"author" vd:"len($)>=1 && len($)<=100"`
	WordCount       int64  `json:"wordCount" vd:"$>0 && $<=50000000"`
	DurationMinutes int    `json:"durationMinutes"`
	CoverURL        string `json:"coverUrl" vd:"len($)<=500"`
	Genre           string `json:"genre" vd:"len($)<=50"`
	Note            string `json:"note" vd:"len($)<=500"`
}

// ActivityCheckInReq 一次打卡可包含多条书目
type ActivityCheckInReq struct {
	TileIndex   int               `json:"tileIndex" vd:"$>=1 && $<=20"`
	Books       []ActivityBookReq `json:"books"`
	EvidenceURL string            `json:"evidenceUrl" vd:"len($)<=500"`
}

// ActivityReviewReq 人工终审操作（PRD 9.3）
type ActivityReviewReq struct {
	// Action: approve / reject / revoke
	Action string `json:"action" vd:"in($,'approve','reject','revoke')"`
	// Reason 驳回与撤销时必填
	Reason string `json:"reason" vd:"len($)<=500"`
	// CountsForTask 通过时是否计入当前格任务进度，默认 true
	CountsForTask *bool `json:"countsForTask"`
	Violation     bool  `json:"violation"`
}

// ActivityBatchReviewReq 批量确认 AI 通过项（PRD 9.3）
type ActivityBatchReviewReq struct {
	BookIDs []string `json:"bookIds"`
}

// ActivityTeamUpsertReq 运营维护小组名单（PRD 第 13 节）
type ActivityTeamUpsertReq struct {
	Name   string `json:"name" vd:"len($)>=1 && len($)<=50"`
	Color  string `json:"color" vd:"len($)>=1 && len($)<=20"`
	Emblem string `json:"emblem" vd:"len($)<=24"`
}

// ActivityMemberUpsertReq 运营维护成员名单
type ActivityMemberUpsertReq struct {
	// Username 社区用户名，服务端解析为 userId
	Username  string `json:"username" vd:"len($)>=1"`
	IsCaptain bool   `json:"isCaptain"`
}

// ActivityManualFixReq 手工修正队伍位置与点亮状态，必须带理由留痕（PRD 第 13 节）
type ActivityManualFixReq struct {
	Position *int `json:"position"`
	// LitTiles 需要标记点亮的格子编号
	LitTiles []int `json:"litTiles"`
	// UnlitTiles 需要取消点亮的格子编号
	UnlitTiles []int  `json:"unlitTiles"`
	Reason     string `json:"reason" vd:"len($)>=1 && len($)<=500"`
}

// ActivityTileUpdateReq 运营调整格子任务文案
type ActivityTileUpdateReq struct {
	Title  string `json:"title" vd:"len($)>=1 && len($)<=100"`
	Target int64  `json:"target" vd:"$>0"`
}
