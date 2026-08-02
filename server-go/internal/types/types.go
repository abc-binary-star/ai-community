package types

// --- 请求 DTO ---

type RegisterReq struct {
	Username string `json:"username" vd:"len($)>=2 && len($)<=20"`
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
	Title   string   `json:"title" vd:"len($)>=1 && len($)<=100"`
	Content string   `json:"content" vd:"len($)>=1 && len($)<=20000"`
	Channel *string  `json:"channel"`
	Tags    []string `json:"tags"`
}

type UpdatePostReq struct {
	Title   *string `json:"title"`
	Content *string `json:"content"`
}

type CreateCommentReq struct {
	Content  string  `json:"content" vd:"len($)>=1 && len($)<=5000"`
	ParentID *string `json:"parentId"`
}

type UpdateCommentReq struct {
	Content string `json:"content" vd:"len($)>=1 && len($)<=5000"`
}

type UpdateUserReq struct {
	DisplayName *string `json:"displayName"`
	Bio         *string `json:"bio"`
	Avatar      *string `json:"avatar"`
}

type SuggestTagsReq struct {
	Title   string `json:"title" vd:"len($)>=1 && len($)<=200"`
	Content string `json:"content" vd:"len($)>=1 && len($)<=5000"`
}

// --- 响应 DTO ---

type User struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	Email       string  `json:"email"`
	Avatar      *string `json:"avatar"`
	Bio         *string `json:"bio"`
	DisplayName *string `json:"displayName"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type PublicUser struct {
	ID            string  `json:"id"`
	Username      string  `json:"username"`
	Avatar        *string `json:"avatar"`
	Bio           *string `json:"bio"`
	DisplayName   *string `json:"displayName"`
	PostCount     int     `json:"postCount"`
	FollowerCount int     `json:"followerCount"`
	FollowingCount int    `json:"followingCount"`
	IsFollowing   bool    `json:"isFollowing"`
	CreatedAt     string  `json:"createdAt"`
}

type Post struct {
	ID           string      `json:"id"`
	Title        string      `json:"title"`
	Content      string      `json:"content"`
	Channel      string      `json:"channel"`
	AuthorID     string      `json:"authorId"`
	Author       PublicUser  `json:"author"`
	CommentCount int         `json:"commentCount"`
	LikeCount    int         `json:"likeCount"`
	ViewCount    int         `json:"viewCount"`
	Liked        bool        `json:"liked"`
	Bookmarked   bool        `json:"bookmarked"`
	Edited       bool        `json:"edited"`
	Tags         []string    `json:"tags"`
	CreatedAt    string      `json:"createdAt"`
	UpdatedAt    string      `json:"updatedAt"`
}

type Comment struct {
	ID        string     `json:"id"`
	Content   string     `json:"content"`
	PostID    string     `json:"postId"`
	AuthorID  string     `json:"authorId"`
	Author    PublicUser `json:"author"`
	ParentID  *string    `json:"parentId"`
	Replies   []Comment  `json:"replies"`
	LikeCount int        `json:"likeCount"`
	Liked     bool       `json:"liked"`
	Edited    bool       `json:"edited"`
	CreatedAt string     `json:"createdAt"`
	UpdatedAt string     `json:"updatedAt"`
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

type Notification struct {
	ID         string  `json:"id"`
	Type       string  `json:"type"`
	ActorID    *string `json:"actorId"`
	ActorName  *string `json:"actorName"`
	PostID     *string `json:"postId"`
	CommentID  *string `json:"commentId"`
	Content    *string `json:"content"`
	Read       bool    `json:"read"`
	CreatedAt  string  `json:"createdAt"`
}

// SearchComment 搜索结果中的评论
type SearchComment struct {
	ID        string     `json:"id"`
	Content   string     `json:"content"`
	PostID    string     `json:"postId"`
	AuthorID  string     `json:"authorId"`
	Author    PublicUser `json:"author"`
	Post      struct {
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
