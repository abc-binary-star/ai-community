package types

import "encoding/json"

// --- 请求 DTO ---

type RegisterReq struct {
	Username string `json:"username" vd:"len($)>=2 && len($)<=60"` // 20中文字符=60字节
	Email    string `json:"email" vd:"email($)"`
	Password string `json:"password" vd:"len($)>=6 && len($)<=64"`
}

type LoginReq struct {
	Email    string `json:"email" vd:"email($)"`
	Password string `json:"password" vd:"len($)>=1"`
}

type RefreshReq struct {
	RefreshToken string `json:"refreshToken" vd:"len($)>=1"`
}

type CreatePostReq struct {
	Title      string          `json:"title" vd:"len($)<=300"`      // 100中文字符=300字节
	Content    string          `json:"content" vd:"len($)<=120000"` // 40000中文字符=120000字节
	ContentDoc json.RawMessage `json:"contentDoc"`
	Channel    *string         `json:"channel"`
	Tags       []string        `json:"tags"`
	Status     string          `json:"status" vd:"in($, '', 'published', 'draft')"` // 空或 published=发布，draft=草稿
	AiSummary  *string         `json:"aiSummary"`                                   // AI 生成的帖子摘要，可选
	Font       string          `json:"font"`                                        // 全文字体 key，默认 default
	CoverURL   *string         `json:"coverUrl"`
	// ContentDocEnabled 富文本 contentDoc 是否同步到后端，false 时后端只保存 content（markdown）
	ContentDocEnabled *bool `json:"contentDocEnabled"`
	// EditorDowngraded 用户是否从富文本编辑器回退到 Markdown 编辑器（富文本开启但用户降级使用）
	EditorDowngraded *bool `json:"editorDowngraded"`
}

type UpdatePostReq struct {
	Title      *string          `json:"title"`
	Content    *string          `json:"content"`
	ContentDoc *json.RawMessage `json:"contentDoc"`
	Status     *string          `json:"status"`
	Tags       *[]string        `json:"tags"`
	AiSummary  *string          `json:"aiSummary"`
	Font       *string          `json:"font"`
	CoverURL   *string          `json:"coverUrl"`
	// ContentDocEnabled 富文本 contentDoc 是否同步到后端，false 时后端只保存 content（markdown）
	ContentDocEnabled *bool `json:"contentDocEnabled"`
	// EditorDowngraded 用户是否从富文本编辑器回退到 Markdown 编辑器
	EditorDowngraded *bool `json:"editorDowngraded"`
	// ExpectedUpdatedAt 乐观锁：客户端期望的服务端更新时间，不一致时返回 409
	ExpectedUpdatedAt *string `json:"expectedUpdatedAt"`
}

type CreateCommentReq struct {
	Content  string  `json:"content" vd:"len($)>=1 && len($)<=15000"` // 5000中文字符=15000字节
	ParentID *string `json:"parentId"`
}

type UpdateUserReq struct {
	DisplayName *string `json:"displayName"`
	Bio         *string `json:"bio"`
	Avatar      *string `json:"avatar"`
}

type UpdateUserRoleReq struct {
	Role string `json:"role"`
}

// ResetPasswordReq 管理员重置用户密码请求
type ResetPasswordReq struct {
	Password string `json:"password" vd:"len($)>=6 && len($)<=64"`
}

// ChangePasswordReq 用户自助修改密码请求
type ChangePasswordReq struct {
	OldPassword string `json:"oldPassword" vd:"len($)>=1"`
	NewPassword string `json:"newPassword" vd:"len($)>=6 && len($)<=64"`
}

// BanUserReq 封禁/解禁用户请求
type BanUserReq struct {
	Action string `json:"action" vd:"in($, 'ban', 'unban')"`
}

type SuggestTagsReq struct {
	Title   string `json:"title" vd:"len($)>=1"`
	Content string `json:"content" vd:"len($)>=1"`
}

type SuggestTitleReq struct {
	Content string `json:"content" vd:"len($)>=1"`
}

type RewriteReq struct {
	Content   string `json:"content" vd:"len($)>=1"`
	Selection string `json:"selection"`
	Style     string `json:"style" vd:"in($, '', 'formal', 'casual', 'friendly')"`
}

type SummarizeReq struct {
	Content string `json:"content" vd:"len($)>=10"`
}

// EnrichReq 三产物合并生成请求（标题 + 摘要 + 标签）
type EnrichReq struct {
	Title   string `json:"title"`
	Content string `json:"content" vd:"len($)>=10"`
	// Only 限定只生成某一项，取值 title / summary / tags；
	// 为空时三项全出。用于「标题不满意，换一批」这类单项重生成，
	// 避免为了换标题把摘要和标签一起重算。
	Only string `json:"only" vd:"in($, '', 'title', 'summary', 'tags')"`
}

// EnrichResult 三产物合并生成结果
type EnrichResult struct {
	Titles  []string `json:"titles"`
	Summary string   `json:"summary"`
	Tags    []string `json:"tags"`
}

type VoicePolishReq struct {
	Content string `json:"content" vd:"len($)>=1"`
	Style   string `json:"style" vd:"in($, '', 'formal', 'casual', 'friendly')"`
	Target  string `json:"target" vd:"in($, '', 'comment', 'paragraph')"`
}

type CreateReportReq struct {
	TargetType string `json:"targetType" vd:"in($, 'post', 'comment', 'annotation', 'annotation_reply')"`
	TargetID   string `json:"targetId" vd:"len($)>=1 && len($)<=64"`
	Reason     string `json:"reason" vd:"len($)>=2 && len($)<=1500"` // 500中文字符=1500字节
}

type HandleReportReq struct {
	Status string `json:"status" vd:"in($, 'approved', 'rejected')"`
	Note   string `json:"note" vd:"len($)<=500"`
}

type CreateChannelReq struct {
	Name        string  `json:"name" vd:"len($)>=2 && len($)<=90"`   // 30中文字符=90字节
	Label       string  `json:"label" vd:"len($)>=1 && len($)<=150"` // 50中文字符=150字节
	Description string  `json:"description"`
	Icon        string  `json:"icon"`
	CategoryID  *string `json:"categoryId"`
}

type UpdateChannelReq struct {
	Label       *string `json:"label"`
	Description *string `json:"description"`
	Icon        *string `json:"icon"`
	SortOrder   *int    `json:"sortOrder"`
	CategoryID  *string `json:"categoryId"`
}

// --- 频道分组 ---

type CreateChannelCategoryReq struct {
	Name      string `json:"name" vd:"len($)>=2 && len($)<=90"`
	Label     string `json:"label" vd:"len($)>=1 && len($)<=150"`
	Icon      string `json:"icon"`
	SortOrder *int   `json:"sortOrder"`
}

type UpdateChannelCategoryReq struct {
	Label     *string `json:"label"`
	Icon      *string `json:"icon"`
	SortOrder *int    `json:"sortOrder"`
}

type UpdatePostStatusReq struct {
	IsPinned   *bool `json:"isPinned"`
	IsFeatured *bool `json:"isFeatured"`
}

// 私信：创建会话
type CreateConversationReq struct {
	RecipientID string `json:"recipientId" vd:"len($)>=1"`
}

// 私信：发送消息
type SendMessageReq struct {
	Content string `json:"content" vd:"len($)>=1 && len($)<=15000"` // 5000中文字符=15000字节
}

// --- 收藏夹分组 ---
type CreateBookmarkFolderReq struct {
	Name string `json:"name" vd:"len($)>=1 && len($)<=50"`
}

type UpdateBookmarkFolderReq struct {
	Name string `json:"name" vd:"len($)>=1 && len($)<=50"`
}

type BookmarkFolder struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

// --- 关注分组 ---
type CreateFollowGroupReq struct {
	Name string `json:"name" vd:"len($)>=1 && len($)<=50"`
}

type UpdateFollowGroupReq struct {
	Name string `json:"name" vd:"len($)>=1 && len($)<=50"`
}

type FollowGroup struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

// PostSummary 帖子讨论摘要 DTO
type PostSummary struct {
	Summary      string `json:"summary"`
	CommentCount int    `json:"commentCount"`
	GeneratedAt  string `json:"generatedAt"`
	Eligible     bool   `json:"eligible"` // 是否达到生成条件（评论数阈值）
}

// ThreadSummaryPoint 讨论摘要要点（含回链）
type ThreadSummaryPoint struct {
	Text      string `json:"text"`
	CommentID string `json:"commentId"`
}

// ThreadSummaryDTO 讨论摘要 v2 DTO
type ThreadSummaryDTO struct {
	Summary      string               `json:"summary"` // 段落式摘要正文
	Points       []ThreadSummaryPoint `json:"points"`  // 兼容旧数据
	Status       string               `json:"status"`  // done | generating | none
	Stale        bool                 `json:"stale"`
	CommentCount int                  `json:"commentCount"`
	GeneratedAt  string               `json:"generatedAt"`
}

// --- 响应 DTO ---

type User struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	Email       string  `json:"email"`
	Avatar      *string `json:"avatar"`
	Bio         *string `json:"bio"`
	DisplayName *string `json:"displayName"`
	Role        string  `json:"role"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type PublicUser struct {
	ID             string   `json:"id"`
	Username       string   `json:"username"`
	Avatar         *string  `json:"avatar"`
	Bio            *string  `json:"bio"`
	DisplayName    *string  `json:"displayName"`
	Role           string   `json:"role"`
	PostCount      int      `json:"postCount"`
	FollowerCount  int      `json:"followerCount"`
	FollowingCount int      `json:"followingCount"`
	LikeCount      int      `json:"likeCount"`
	Channels       []string `json:"channels"`
	IsFollowing    bool     `json:"isFollowing"`
	CreatedAt      string   `json:"createdAt"`
}

type Post struct {
	ID                string          `json:"id"`
	Title             string          `json:"title"`
	Content           string          `json:"content"`
	ContentDoc        json.RawMessage `json:"contentDoc,omitempty"`
	ContentFormat     string          `json:"contentFormat"`
	Channel           string          `json:"channel"`
	Status            string          `json:"status"`
	AuthorID          string          `json:"authorId"`
	Author            PublicUser      `json:"author"`
	CommentCount      int             `json:"commentCount"`
	LikeCount         int             `json:"likeCount"`
	ViewCount         int             `json:"viewCount"`
	Liked             bool            `json:"liked"`
	Bookmarked        bool            `json:"bookmarked"`
	Edited            bool            `json:"edited"`
	IsPinned          bool            `json:"isPinned"`
	IsFeatured        bool            `json:"isFeatured"`
	AiSummary         *string         `json:"aiSummary,omitempty"`
	Font              string          `json:"font,omitempty"`
	CoverURL          *string         `json:"coverUrl,omitempty"`
	ContentDocEnabled bool            `json:"contentDocEnabled"`
	EditorDowngraded  bool            `json:"editorDowngraded"`
	Tags              []string        `json:"tags"`
	CreatedAt         string          `json:"createdAt"`
	UpdatedAt         string          `json:"updatedAt"`
}

type Comment struct {
	ID         string     `json:"id"`
	Content    string     `json:"content"`
	PostID     string     `json:"postId"`
	AuthorID   string     `json:"authorId"`
	Author     PublicUser `json:"author"`
	ParentID   *string    `json:"parentId"`
	Replies    []Comment  `json:"replies"`
	ReplyCount int        `json:"replyCount"`
	LikeCount  int        `json:"likeCount"`
	Liked      bool       `json:"liked"`
	Edited     bool       `json:"edited"`
	CreatedAt  string     `json:"createdAt"`
	UpdatedAt  string     `json:"updatedAt"`
}

type AuthResponse struct {
	User         User   `json:"user"`
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken"`
}

type Paginated[T any] struct {
	Items      []T `json:"items"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	TotalPages int `json:"totalPages"`
}

// DiscoverResponse 发现页聚合数据
type DiscoverResponse struct {
	HotPosts         []Post                   `json:"hotPosts"`
	TrendingTags     []map[string]interface{} `json:"trendingTags"`
	RecommendedUsers []PublicUser             `json:"recommendedUsers"`
}

type Notification struct {
	ID           string  `json:"id"`
	Type         string  `json:"type"`
	ActorID      *string `json:"actorId"`
	ActorName    *string `json:"actorName"`
	PostID       *string `json:"postId"`
	CommentID    *string `json:"commentId"`
	AnnotationID *string `json:"annotationId"`
	Content      *string `json:"content"`
	Read         bool    `json:"read"`
	CreatedAt    string  `json:"createdAt"`
}

type Report struct {
	ID          string      `json:"id"`
	ReporterID  string      `json:"reporterId"`
	Reporter    PublicUser  `json:"reporter"`
	TargetType  string      `json:"targetType"`
	TargetID    string      `json:"targetId"`
	TargetTitle string      `json:"targetTitle"`
	TargetBody  string      `json:"targetBody"`
	Reason      string      `json:"reason"`
	Status      string      `json:"status"`
	HandledBy   *string     `json:"handledBy"`
	Handler     *PublicUser `json:"handler"`
	Note        string      `json:"note"`
	CreatedAt   string      `json:"createdAt"`
	UpdatedAt   string      `json:"updatedAt"`
}

type Channel struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Label       string  `json:"label"`
	Description string  `json:"description"`
	Icon        string  `json:"icon"`
	CategoryID  *string `json:"categoryId"`
	SortOrder   int     `json:"sortOrder"`
	CreatedBy   string  `json:"createdBy"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

// ChannelCategory 频道分组 DTO
type ChannelCategory struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Label     string `json:"label"`
	Icon      string `json:"icon"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
}

// ChannelCategoryWithChannels 含频道列表的分组 DTO（用于 tree 接口）
type ChannelCategoryWithChannels struct {
	ChannelCategory
	Channels []Channel `json:"channels"`
}

// ChannelTree 频道树结构
type ChannelTree struct {
	Categories    []ChannelCategoryWithChannels `json:"categories"`
	Uncategorized []Channel                     `json:"uncategorized"`
}

// NotificationPreference 通知偏好 DTO
type NotificationPreference struct {
	Comment        bool `json:"comment"`
	Reply          bool `json:"reply"`
	Like           bool `json:"like"`
	Follow         bool `json:"follow"`
	Mention        bool `json:"mention"`
	DoNotDisturb   bool `json:"doNotDisturb"`
	QuietStartHour int  `json:"quietStartHour"`
	QuietEndHour   int  `json:"quietEndHour"`
}

type UpdateNotificationPreferenceReq struct {
	Comment        *bool `json:"comment"`
	Reply          *bool `json:"reply"`
	Like           *bool `json:"like"`
	Follow         *bool `json:"follow"`
	Mention        *bool `json:"mention"`
	DoNotDisturb   *bool `json:"doNotDisturb"`
	QuietStartHour *int  `json:"quietStartHour"`
	QuietEndHour   *int  `json:"quietEndHour"`
}

// SearchComment 搜索结果中的评论
type SearchComment struct {
	ID       string     `json:"id"`
	Content  string     `json:"content"`
	PostID   string     `json:"postId"`
	AuthorID string     `json:"authorId"`
	Author   PublicUser `json:"author"`
	Post     struct {
		ID      string `json:"id"`
		Title   string `json:"title"`
		Channel string `json:"channel"`
	} `json:"post"`
	CreatedAt string `json:"createdAt"`
	LikeCount int    `json:"likeCount"`
}

type SearchUser struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	Avatar      *string `json:"avatar"`
	DisplayName *string `json:"displayName"`
	Bio         *string `json:"bio"`
	CreatedAt   string  `json:"createdAt"`
}

// 频道常量
var Channels = []string{"general", "tech", "design", "gaming", "life"}

var ChannelLabels = map[string]string{
	"general": "综合讨论",
	"tech":    "技术前沿",
	"design":  "设计美学",
	"gaming":  "游戏天地",
	"life":    "生活方式",
}

// Conversation 私信会话 DTO
type Conversation struct {
	ID            string     `json:"id"`
	OtherUser     PublicUser `json:"otherUser"` // 会话中的另一方
	LastMessage   string     `json:"lastMessage"`
	LastMessageAt string     `json:"lastMessageAt"`
	UnreadCount   int        `json:"unreadCount"`
}

// Message 私信消息 DTO
type Message struct {
	ID             string  `json:"id"`
	ConversationID string  `json:"conversationId"`
	SenderID       string  `json:"senderId"`
	SenderName     string  `json:"senderName"`
	SenderAvatar   *string `json:"senderAvatar"`
	Content        string  `json:"content"`
	ReadAt         *string `json:"readAt"`
	CreatedAt      string  `json:"createdAt"`
}

// --- 划线高亮 ---

// CreateHighlightReq 创建划线请求
type CreateHighlightReq struct {
	Anchor       string `json:"anchor" vd:"len($)>=1 && len($)<=200"`
	StartOffset  int    `json:"startOffset" vd:"$>=0"`
	EndOffset    int    `json:"endOffset" vd:"$>=0"`
	SelectedText string `json:"selectedText" vd:"len($)>=1 && len($)<=2000"`
	Color        string `json:"color"`
}

// Highlight 划线记录 DTO
type Highlight struct {
	ID           string `json:"id"`
	Anchor       string `json:"anchor"`
	StartOffset  int    `json:"startOffset"`
	EndOffset    int    `json:"endOffset"`
	SelectedText string `json:"selectedText"`
	Color        string `json:"color"`
	CreatedAt    string `json:"createdAt"`
}

type HighlightBookmark struct {
	ID           string `json:"id"`
	PostID       string `json:"postId"`
	PostTitle    string `json:"postTitle"`
	Anchor       string `json:"anchor"`
	SelectedText string `json:"selectedText"`
	Color        string `json:"color"`
	CreatedAt    string `json:"createdAt"`
}

// UpdateHighlightReq 更新划线颜色
type UpdateHighlightReq struct {
	Color string `json:"color"`
}

// --- 批注（段落想法） ---

// CreateAnnotationReq 创建段落想法
//
// SelectedText 对 selection/paragraph 是引用原文，必填；对 whole（整篇想法）
// 没有具体引用段落，允许为空，服务端会用帖子标题回填，保证卡片仍有来源可展示。
type CreateAnnotationReq struct {
	Scope             string `json:"scope" vd:"in($, 'selection', 'paragraph', 'whole')"`
	Anchor            string `json:"anchor" vd:"len($)>=1 && len($)<=200"`
	StartOffset       int    `json:"startOffset" vd:"$>=0"`
	EndOffset         int    `json:"endOffset" vd:"$>=0"`
	SelectedText      string `json:"selectedText" vd:"len($)<=2000"`
	Prefix            string `json:"prefix" vd:"len($)<=200"`
	Suffix            string `json:"suffix" vd:"len($)<=200"`
	ParagraphSnapshot string `json:"paragraphSnapshot" vd:"len($)<=2000"`
	Body              string `json:"body" vd:"len($)>=1 && len($)<=3000"` // 1000 中文字符
	Visibility        string `json:"visibility" vd:"in($, 'public', 'private')"`
	// ParentAnnotationID 引用边：本条想法回应的另一条想法（可选）。填写后想法链
	// 会把它挂在被引用想法之下，形成纵向路径。
	ParentAnnotationID *string `json:"parentAnnotationId"`
}

// UpdateAnnotationReq 编辑想法正文或可见范围
type UpdateAnnotationReq struct {
	Body       *string `json:"body"`
	Visibility *string `json:"visibility"`
}

// CreateAnnotationReplyReq 回复公开想法
type CreateAnnotationReplyReq struct {
	Body          string  `json:"body" vd:"len($)>=1 && len($)<=15000"`
	ReplyToUserID *string `json:"replyToUserId"`
}

// Annotation 段落想法 DTO
type Annotation struct {
	ID                 string            `json:"id"`
	PostID             string            `json:"postId"`
	AuthorID           string            `json:"authorId"`
	Author             PublicUser        `json:"author"`
	ParentAnnotationID *string           `json:"parentAnnotationId,omitempty"`
	Scope              string            `json:"scope"`
	Anchor             string            `json:"anchor"`
	AnchorFormat       string            `json:"anchorFormat,omitempty"`
	BlockID            string            `json:"blockId,omitempty"`
	StartOffset        int               `json:"startOffset"`
	EndOffset          int               `json:"endOffset"`
	SelectedText       string            `json:"selectedText"`
	Prefix             string            `json:"prefix"`
	Suffix             string            `json:"suffix"`
	ParagraphSnapshot  string            `json:"paragraphSnapshot"`
	Body               string            `json:"body"`
	Visibility         string            `json:"visibility"`
	AnchorStatus       string            `json:"anchorStatus"`
	Status             string            `json:"status"`
	Edited             bool              `json:"edited"`
	ReplyCount         int               `json:"replyCount"`
	LikeCount          int               `json:"likeCount"`
	Liked              bool              `json:"liked"`
	Folded             bool              `json:"folded"`
	Replies            []AnnotationReply `json:"replies"`
	CreatedAt          string            `json:"createdAt"`
	UpdatedAt          string            `json:"updatedAt"`
}

// AnnotationReply 想法回复 DTO
type AnnotationReply struct {
	ID            string     `json:"id"`
	AnnotationID  string     `json:"annotationId"`
	AuthorID      string     `json:"authorId"`
	Author        PublicUser `json:"author"`
	ReplyToUserID *string    `json:"replyToUserId,omitempty"`
	Body          string     `json:"body"`
	Status        string     `json:"status"`
	Edited        bool       `json:"edited"`
	Folded        bool       `json:"folded"`
	CreatedAt     string     `json:"createdAt"`
	UpdatedAt     string     `json:"updatedAt"`
}

// AnnotationAnchorCount 段落公开想法计数（正文数量入口）
type AnnotationAnchorCount struct {
	Anchor string `json:"anchor"`
	Count  int    `json:"count"`
}

// AnnotationList 想法列表响应（items + 各段落计数）
type AnnotationList struct {
	Items        []Annotation            `json:"items"`
	AnchorCounts []AnnotationAnchorCount `json:"anchorCounts"`
	Total        int                     `json:"total"`
}

// --- 想法流（跨帖分发）---

// IdeaCardPost 想法卡携带的来源帖子信息。
// 任何形态的卡都必须带上它：一条想法不允许脱离原文单独存在。
type IdeaCardPost struct {
	ID       string     `json:"id"`
	Title    string     `json:"title"`
	Author   PublicUser `json:"author"`
	Channel  string     `json:"channel"`
	CoverURL *string    `json:"coverUrl,omitempty"`
}

// IdeaCard 想法流中的一张卡。
//
// Type 为 idea 时是真实的公开段落想法，Body/Author/互动计数有效；
// 为 excerpt 时是系统从正文抽取的关键句，仅有 Excerpt，无人声、不可互动。
// 两者共用 Excerpt + Anchor + Post 三件套，保证点击后能落回原文段落。
type IdeaCard struct {
	Type       string       `json:"type"` // idea / excerpt
	ID         string       `json:"id"`   // idea 为想法 ID；excerpt 为 postID:anchor
	Excerpt    string       `json:"excerpt"`
	Anchor     string       `json:"anchor"`
	Post       IdeaCardPost `json:"post"`
	Body       string       `json:"body,omitempty"`
	Author     *PublicUser  `json:"author,omitempty"`
	Scope      string       `json:"scope,omitempty"`
	ReplyCount int          `json:"replyCount"`
	LikeCount  int          `json:"likeCount"`
	Liked      bool         `json:"liked"`
	CreatedAt  string       `json:"createdAt,omitempty"`
}

// IdeaFeed 想法流响应
type IdeaFeed struct {
	Items       []IdeaCard `json:"items"`
	Total       int        `json:"total"`
	Page        int        `json:"page"`
	PageSize    int        `json:"pageSize"`
	TotalPages  int        `json:"totalPages"`
	IdeaCount   int        `json:"ideaCount"`   // 本页想法卡数量
	FilledCount int        `json:"filledCount"` // 本页摘录卡数量，用于观察人声替换进度
}

// --- 想法链（纵向链视图）---

// IdeaChainNode 想法链上的一个节点。
// 比 IdeaCard 更轻：链视图一次只呈现一条纵向路径，节点只需要展示想法本身与
// 少量互动信号，不重复携带来源帖子（来源由链视图顶部统一展示）。
type IdeaChainNode struct {
	ID         string      `json:"id"`
	Excerpt    string      `json:"excerpt"`
	Anchor     string      `json:"anchor"`
	Body       string      `json:"body"`
	Author     *PublicUser `json:"author,omitempty"`
	Scope      string      `json:"scope"`
	ReplyCount int         `json:"replyCount"`
	LikeCount  int         `json:"likeCount"`
	CreatedAt  string      `json:"createdAt"`
}

// IdeaChain 想法链视图响应。
//
// 呈现形态是链而不是网：一次只看一条纵向路径——上方是它回应的想法（parent），
// 中间是它自己（current），下方是由它引出的想法（children）以及同段落的其他
// 声音（siblings）。一次只呈现一条路径，用户可以沿任意一条继续走下去。
type IdeaChain struct {
	Post      IdeaCardPost    `json:"post"`
	Parent    *IdeaChainNode  `json:"parent,omitempty"`
	Current   IdeaChainNode   `json:"current"`
	Children  []IdeaChainNode `json:"children"`  // 由 current 引出的想法（引用边）
	Siblings  []IdeaChainNode `json:"siblings"`  // 同段落的其他公开想法（共位边）
	Neighbors []IdeaChainNode `json:"neighbors"` // 语义相近的想法（近邻边，向量检索；未启用时为空）
}

// --- 官方公告 ---

// PenaltyItem 处置公示名单条目
type PenaltyItem struct {
	Username string `json:"username"`
	Reason   string `json:"reason"`
	Action   string `json:"action"`
	Date     string `json:"date,omitempty"`
}

// CreateAnnouncementReq 创建公告请求（draft 存草稿，published 直接发布）
type CreateAnnouncementReq struct {
	Title       string        `json:"title"`
	Content     string        `json:"content"`
	Category    string        `json:"category"`
	Level       string        `json:"level"`
	Status      string        `json:"status"`
	IsPinned    bool          `json:"isPinned"`
	PublishAt   *string       `json:"publishAt"`
	ExpireAt    *string       `json:"expireAt"`
	PenaltyList []PenaltyItem `json:"penaltyList"`
}

// UpdateAnnouncementReq 编辑公告请求；分类发布后不可修改，故不在编辑范围。
type UpdateAnnouncementReq struct {
	Title       *string        `json:"title"`
	Content     *string        `json:"content"`
	Category    *string        `json:"category"`
	Level       *string        `json:"level"`
	IsPinned    *bool          `json:"isPinned"`
	PublishAt   *string        `json:"publishAt"`
	ExpireAt    *string        `json:"expireAt"`
	PenaltyList *[]PenaltyItem `json:"penaltyList"`
}

// UpdateAnnouncementStatusReq 发布或下线公告
type UpdateAnnouncementStatusReq struct {
	Status string `json:"status"`
}

// AnnouncementSummary 公告列表/横幅使用的轻量 DTO
type AnnouncementSummary struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Category  string     `json:"category"`
	Level     string     `json:"level"`
	Status    string     `json:"status"`
	IsPinned  bool       `json:"isPinned"`
	PublishAt string     `json:"publishAt"`
	ExpireAt  *string    `json:"expireAt,omitempty"`
	Edited    bool       `json:"edited"`
	IsRead    bool       `json:"isRead"`
	AuthorID  string     `json:"authorId"`
	Author    PublicUser `json:"author"`
	CreatedAt string     `json:"createdAt"`
	UpdatedAt string     `json:"updatedAt"`
}

// Announcement 公告详情 DTO
type Announcement struct {
	ID          string        `json:"id"`
	Title       string        `json:"title"`
	Content     string        `json:"content"`
	Category    string        `json:"category"`
	Level       string        `json:"level"`
	Status      string        `json:"status"`
	IsPinned    bool          `json:"isPinned"`
	PublishAt   string        `json:"publishAt"`
	ExpireAt    *string       `json:"expireAt,omitempty"`
	PenaltyList []PenaltyItem `json:"penaltyList"`
	Edited      bool          `json:"edited"`
	IsRead      bool          `json:"isRead"`
	AuthorID    string        `json:"authorId"`
	Author      PublicUser    `json:"author"`
	CreatedAt   string        `json:"createdAt"`
	UpdatedAt   string        `json:"updatedAt"`
}

// AnnouncementBanner 横幅响应，无横幅时 item 为 null
type AnnouncementBanner struct {
	Item *AnnouncementSummary `json:"item"`
}
