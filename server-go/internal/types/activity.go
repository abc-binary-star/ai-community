package types

// 活动「九月彩虹桥 · 读书大富翁」DTO。字段名与前 lib/types.ts 对应。
// 玩法说明：读书/打卡/投骰在群内完成，本应用只做棋盘可视化与程序化结算——
// 录入骰子点数后由服务端按 100 格地图规则移动队伍并结算格子效果。

// --- 响应 DTO ---

// BuffDTO 生效中的 buff/debuff
type BuffDTO struct {
	// Kind 效果标识（与 hellboard.EffectKey 一致）
	Kind string `json:"kind"`
	// Label 面向用户的效果文案
	Label string `json:"label"`
	// Uses 剩余生效次数；次数用尽后自动移除
	Uses int `json:"uses"`
}

// ActivityTileDTO 百格地图定义（仅可视化 + 引擎结算白名单）
type ActivityTileDTO struct {
	Index int `json:"index"`
	// Kind: forward / backward / special / swap / blank
	Kind string `json:"kind"`
	// Title 面向用户的格子名
	Title string `json:"title"`
	// Effect 特殊功能格效果标识
	Effect string `json:"effect,omitempty"`
	// Param 效果参数（前进/后退格数）
	Param int `json:"param,omitempty"`
	// Twin 双子格编号（位置互换格）
	Twin int `json:"twin,omitempty"`
}

// ActivityMemberDTO 成员及其认领的彩虹色
type ActivityMemberDTO struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	IsCaptain bool   `json:"isCaptain"`
	// Color 认领的彩虹色：red/orange/yellow/green/cyan/blue/purple
	Color string `json:"color,omitempty"`
	// BookCount / WordCount 累计（群内打卡产出，App 内仅展示）
	BookCount int   `json:"bookCount"`
	WordCount int64 `json:"wordCount"`
}

// ActivityTeamDTO 队伍全量状态快照
type ActivityTeamDTO struct {
	ID      string              `json:"id"`
	Name    string              `json:"name"`
	Color   string              `json:"color"`
	Emblem  string              `json:"emblem"`
	Members []ActivityMemberDTO `json:"members"`
	// Position 当前所在格 0–100；0 为起点，100 为终点
	Position      int `json:"position"`
	Points        int `json:"points"`
	UniversalDice int `json:"universalDice"`
	// RollChances 掷骰前进机会：完成一轮彩虹 +1
	RollChances int `json:"rollChances"`
	// RainbowCount 已完成的彩虹周期数
	RainbowCount int `json:"rainbowCount"`
	// WeekMinDelta 本周彩虹保底条数修正（保底扩容 -1）
	WeekMinDelta int `json:"weekMinDelta"`
	// ColorBlocks 当前彩虹周期内各色块数（红橙黄绿青蓝紫）
	ColorBlocks map[string]int `json:"colorBlocks"`
	// Buffs 生效中的 buff/debuff
	Buffs []BuffDTO `json:"buffs"`
	// Status: collecting / ready / completed
	Status string `json:"status"`
}

// ActivityBoardDTO 棋盘全局快照，前端轮询该接口刷新
type ActivityBoardDTO struct {
	Tiles []ActivityTileDTO `json:"tiles"`
	Teams []ActivityTeamDTO `json:"teams"`
	// MyTeamID / MyMemberID 为空表示当前用户不在任何小组，只能观战
	MyTeamID   string `json:"myTeamId,omitempty"`
	MyMemberID string `json:"myMemberId,omitempty"`
	IsCaptain  bool   `json:"isCaptain"`
	// Enrolled 当前用户是否已报名（报名是入队的前提）
	Enrolled bool `json:"enrolled"`
	// MyNickname 当前用户的活动内昵称
	MyNickname string `json:"myNickname,omitempty"`
	// Archived 为 true 时页面转只读归档态
	Archived     bool   `json:"archived"`
	CycleStarted bool   `json:"cycleStarted"`
	CycleStart   string `json:"cycleStart"`
	CycleEnd     string `json:"cycleEnd"`
	// RainbowGuarantee 每周每队保底彩虹条数
	RainbowGuarantee int `json:"rainbowGuarantee"`
}

// ActivityRollResultDTO 骰子 / 万能骰子的程序化结算结果
type ActivityRollResultDTO struct {
	// Value 骰子面值 1–6（群里掷出的点数，由队长录入）
	Value int `json:"value"`
	// FromTile / ToTile 结算后队伍所在格
	FromTile int `json:"fromTile"`
	ToTile   int `json:"toTile"`
	// Moved 净前进格数（含格子附加效果，可为负）
	Moved int `json:"moved"`
	// Points 本次净增团队积分（单数 +1，双数 +2，含效果修正）
	Points int `json:"points"`
	// DiceExchanged 本次自动兑换的万能骰子数
	DiceExchanged int `json:"diceExchanged"`
	// Results 逐条效果文案（格效 / buff 触发 / 积分修正）
	Results []string `json:"results"`
	// Effects 命中的格子类型清单
	Effects []string `json:"effects,omitempty"`
	// Won 是否冲线获胜
	Won  bool            `json:"won"`
	Team ActivityTeamDTO `json:"team"`
}

// EnrollmentDTO 报名名单条目，队长据此把人拉进队伍
type EnrollmentDTO struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	Nickname  string `json:"nickname,omitempty"`
	TeamID    string `json:"teamId,omitempty"`
	TeamName  string `json:"teamName,omitempty"`
	Joined    bool   `json:"joined"`
}

// ActivityRankingRowDTO 榜单行（进度榜 / 彩虹榜）
type ActivityRankingRowDTO struct {
	ID    string `json:"id"`
	Rank  int    `json:"rank"`
	Name  string `json:"name"`
	Color string `json:"color"`
	// Position 棋盘进度
	Position int `json:"position"`
	// Points 团队积累积分
	Points int `json:"points"`
	// UniversalDice 万能骰子持有数
	UniversalDice int `json:"universalDice"`
	// RainbowCount 已完成彩虹轮数
	RainbowCount int  `json:"rainbowCount"`
	IsSelf       bool `json:"isSelf"`
}

// ActivityEventDTO 时间线事件（掷骰/格效/彩虹/道具）
type ActivityEventDTO struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

// --- 请求 DTO ---

// ActivityEnrollReq 报名活动请求
type ActivityEnrollReq struct {
	Nickname string `json:"nickname" vd:"len($)<=50"`
}

// ActivityJoinTeamReq 自助选组入队请求
type ActivityJoinTeamReq struct {
	TeamID string `json:"teamId" vd:"len($)>=1"`
	// IsCaptain 是否成为队长；仅当该队队长位空缺时可选
	IsCaptain bool `json:"isCaptain"`
	// Color 认领的彩虹色（一人一色不重复）
	Color string `json:"color" vd:"len($)<=16"`
}

// ActivityClaimColorReq 认领/更换彩虹色（本轮周期内不可中途换色，集齐后可重新分配）
type ActivityClaimColorReq struct {
	Color string `json:"color" vd:"len($)>=1 && len($)<=16"`
}

// ActivityRollReq 录入群里掷出的骰子点数（1–6）
type ActivityRollReq struct {
	Value int `json:"value" vd:"$>=1 && $<=6"`
}

// ActivityManualFixReq 运营手工修正队伍状态，必须带理由留痕
type ActivityManualFixReq struct {
	Position      *int   `json:"position"`
	Points        *int   `json:"points"`
	UniversalDice *int   `json:"universalDice"`
	RollChances   *int   `json:"rollChances"`
	Reason        string `json:"reason" vd:"len($)>=1 && len($)<=500"`
}

// ActivityTeamUpsertReq 运营维护小组名单
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

// ActivityTileUpdateReq 运营调整格子定义（仅特殊/前进/后退/互换相关字段）
type ActivityTileUpdateReq struct {
	Kind   string `json:"kind" vd:"len($)<=16"`
	Title  string `json:"title" vd:"len($)<=100"`
	Effect string `json:"effect" vd:"len($)<=32"`
	Param  int    `json:"param"`
	Twin   int    `json:"twin"`
}

// --- 反馈（bug / 需求） ---

// ActivityFeedbackReq 提交反馈请求
type ActivityFeedbackReq struct {
	// Type: bug / feature / other
	Type    string `json:"type" vd:"in($,'bug','feature','other')"`
	Content string `json:"content" vd:"len($)>=1 && len($)<=2000"`
	Contact string `json:"contact" vd:"len($)<=100"`
}

// ActivityFeedbackResolveReq 管理员标记反馈已处理
type ActivityFeedbackResolveReq struct {
	Reply string `json:"reply" vd:"len($)<=1000"`
}

// ActivityFeedbackDTO 反馈条目（管理员监督台展示）
type ActivityFeedbackDTO struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	UserName  string `json:"userName"`
	Type      string `json:"type"`
	Content   string `json:"content"`
	Contact   string `json:"contact,omitempty"`
	Status    string `json:"status"`
	Reply     string `json:"reply,omitempty"`
	CreatedAt string `json:"createdAt"`
}
