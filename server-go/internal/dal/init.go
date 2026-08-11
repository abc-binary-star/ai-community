package dal

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Init 初始化数据库连接并自动迁移
func Init(cfg *conf.Config) {
	var err error
	DB, err = gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}

	// 配置连接池
	sqlDB, err := DB.DB()
	if err != nil {
		log.Fatalf("获取底层 sql.DB 失败: %v", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(10 * time.Minute)

	// 告知 GORM many2many 连接表的真实结构
	if err := DB.SetupJoinTable(&model.Post{}, "Tags", &model.PostTag{}); err != nil {
		log.Printf("Warning: SetupJoinTable failed: %v", err)
	}

	// 自动迁移
	if err := DB.AutoMigrate(
		&model.User{},
		&model.Post{},
		&model.Comment{},
		&model.PostLike{},
		&model.CommentLike{},
		&model.Tag{},
		&model.PostTag{},
		&model.Bookmark{},
		&model.Follow{},
		&model.Notification{},
		&model.Report{},
		&model.Appeal{},
		&model.ModerationAction{},
		&model.Channel{},
		&model.ChannelCategory{},
		&model.Block{},
		&model.NotificationPreference{},
		&model.Conversation{},
		&model.Message{},
		&model.PostSummary{},
		&model.ThreadSummary{},
		&model.BookmarkFolder{},
		&model.FollowGroup{},
		&model.Subscription{},
		&model.AIUsageLog{},
		&model.AIUserQuota{},
		&model.AIGlobalQuota{},
		&model.AIContentDigest{},
		&model.Image{},
		&model.Highlight{},
		&model.Annotation{},
		&model.AnnotationReply{},
		&model.AnnotationLike{},
		&model.AnnotationEmbedding{},
		&model.Announcement{},
		&model.AnnouncementRead{},
		// AI 资产卡（B1-B5）：资产 + 帖子绑定 + 运行快照
		&model.Asset{},
		&model.PostAsset{},
		&model.AssetRun{},
		// 活动「无限循环读书地狱」，表统一带 activity_ 前缀与社区业务解耦
		&model.ActivityTile{},
		&model.ActivityTeam{},
		&model.ActivityMember{},
		&model.ActivityTeamProgress{},
		&model.ActivityCheckIn{},
		&model.ActivityCheckInBook{},
		&model.ActivityDiceRoll{},
		&model.ActivityReview{},
		&model.ActivityEvent{},
		&model.ActivityEnrollment{},
		&model.ActivityBookVote{},
		&model.ActivityCheckInLike{},
		&model.ActivityFeedback{},
		// 一次性数据迁移标记（幂等锁）
		&model.ActivityMigrationState{},
	); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}

	// AutoMigrate 对 SetupJoinTable 配置的关联表不会自动添加新列，
	// 需手动确保 post_tags 表有 created_at 列
	if err := DB.Exec("ALTER TABLE post_tags ADD COLUMN IF NOT EXISTS created_at TIMESTAMP").Error; err != nil {
		log.Printf("Warning: 补全 post_tags.created_at 列失败: %v", err)
	}

	// 编辑器升级迁移：为 post 补齐 content_format/content_doc_enabled/editor_downgraded/content_doc 列 + 索引 + 存量回填
	migratePostEditorFlags()

	// 初始化默认频道数据
	seedDefaultChannels()

	// 初始化活动棋盘 20 格定义
	seedActivityTiles()

	// 时长格单位迁移：第 19 格由小时改为分钟存储（幂等）
	migrateDurationTileToMinutes()

	// 活动表索引与存量数据迁移（幂等，失败仅告警不阻断启动）
	initActivityIndexes()

	// 队伍表为空时创建默认队伍（生产初始化，幂等）
	seedActivityTeams()

	// 一次性回填全局保底计数：上线前已终审通过的书目计入各队保底（迁移标记防重）
	migrateGlobalFallbackBackfill()

	// 幂等地确保超级管理员账号存在且角色为 admin（读书地狱审核需要管理员身份）
	seedSuperAdmin()

	log.Println("数据库连接和迁移成功")

	// 搜索增强：pg_trgm 扩展 + GIN 三元组索引，加速 ILIKE 模糊搜索与相关度排序
	initSearchIndexes()
}

// initActivityIndexes 活动表索引与存量数据迁移（幂等）。
// 全部语句失败仅告警不阻断启动：索引缺失不影响功能正确性，只影响性能与并发兜底。
func initActivityIndexes() {
	// 判定掷骰表新增 lap 列后的存量回填：此前记录未区分圈数，全部视为第 1 圈。
	// 判定记录按圈隔离后，第 1 圈的旧记录才能被正常读取。
	runActivityMigrate("UPDATE activity_dice_rolls SET lap = 1 WHERE lap = 0",
		"回填活动掷骰记录的圈数")

	// 一名用户只能属于一个小组：无重复数据时才建唯一索引，
	// 避免存量脏数据导致建索引失败（AddMember/JoinTeam 的应用层校验已有并发兜底）。
	var dupCount int64
	if err := DB.Raw("SELECT count(*) - count(DISTINCT user_id) FROM activity_members").Scan(&dupCount).Error; err != nil {
		log.Printf("Warning: 检查活动成员重复数据失败: %v", err)
	} else if dupCount > 0 {
		log.Printf("Warning: activity_members 存在 %d 条同用户多组数据，跳过唯一索引创建（请先人工清理）", dupCount)
	} else {
		runActivityMigrate("CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_members_user ON activity_members (user_id)",
			"为 activity_members.user_id 创建唯一索引")
	}

	// 队伍进度按 (队, 格, 轮) 唯一：防并发下插出重复进度行
	runActivityMigrate("CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_progress_team_tile_lap ON activity_team_progress (team_id, tile_index, lap)",
		"为 activity_team_progress 创建唯一复合索引")

	// 判定掷骰：同队同圈同轮同一人至多一次（防御纵深，应用层先查后插）
	runActivityMigrate("CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_dice_judgement_once ON activity_dice_rolls (team_id, lap, roller_id, from_tile, judgement_round) WHERE is_judgement = true",
		"为判定掷骰创建部分唯一索引")

	// 高频查询复合索引：本队打卡 / 时间线均按 team_id + created_at 倒序
	runActivityMigrate("CREATE INDEX IF NOT EXISTS idx_activity_checkins_team_created ON activity_checkins (team_id, created_at DESC)",
		"为 activity_checkins 创建复合索引")
	runActivityMigrate("CREATE INDEX IF NOT EXISTS idx_activity_events_team_created ON activity_events (team_id, created_at DESC)",
		"为 activity_events 创建复合索引")
	// 审核队列组合过滤（人工终审台最热分页查询）
	runActivityMigrate("CREATE INDEX IF NOT EXISTS idx_activity_books_review_queue ON activity_checkin_books (review_status, team_id, tile_index, created_at)",
		"为审核队列创建复合索引")

	log.Println("活动表索引初始化完成")
}

// runActivityMigrate 执行单条迁移语句，失败仅记录告警
func runActivityMigrate(stmt, desc string) {
	if err := DB.Exec(stmt).Error; err != nil {
		log.Printf("Warning: %s失败（可忽略，不影响功能）: %v", desc, err)
	}
}

// vectorReady 标记 pgvector 是否可用（扩展与向量列均就绪）。
// 想法近邻查询前必须检查它：pgvector 未安装或建列失败时应降级为「无近邻」，
// 而不是让查询报错。
var vectorReady bool

// VectorReady 返回 pgvector 向量检索是否可用。
func VectorReady() bool { return vectorReady }

// InitVectorSupport 尝试启用 pgvector：创建扩展、给 annotation_embeddings 补一列
// vector(dim) 向量列、建近邻索引。任一步失败都不阻断启动，只把 vectorReady 置为
// false——语义邻居是可选增量，缺它不影响想法本身。dim 为向量维度。
//
// 换模型导致维度变化时，旧列宽度与新维度不一致会让写入报错；这里检测到维度不符
// 会重建列（丢弃旧向量，需重新生成），保证列宽度与当前模型一致。
func InitVectorSupport(dim int) {
	if dim <= 0 {
		dim = 1536
	}
	if err := DB.Exec("CREATE EXTENSION IF NOT EXISTS vector").Error; err != nil {
		log.Printf("[vector] pgvector 扩展不可用，语义邻居功能关闭（可忽略）: %v", err)
		vectorReady = false
		return
	}

	// 若已存在 embedding 列但维度不符，先删列再重建，避免维度冲突写入失败。
	var curDim int
	DB.Raw(`
		SELECT COALESCE(atttypmod, 0)
		FROM pg_attribute
		WHERE attrelid = 'annotation_embeddings'::regclass
		  AND attname = 'embedding' AND NOT attisdropped
	`).Scan(&curDim)
	if curDim > 0 && curDim != dim {
		log.Printf("[vector] 向量维度由 %d 变为 %d，重建 embedding 列（旧向量将失效需重算）", curDim, dim)
		DB.Exec("ALTER TABLE annotation_embeddings DROP COLUMN IF EXISTS embedding")
	}

	stmts := []string{
		fmt.Sprintf("ALTER TABLE annotation_embeddings ADD COLUMN IF NOT EXISTS embedding vector(%d)", dim),
		// IVFFlat 需要数据量支撑，冷启动阶段用 HNSW 更稳；失败仅告警，顺序扫描也能工作。
		"CREATE INDEX IF NOT EXISTS idx_annotation_embeddings_vec ON annotation_embeddings USING hnsw (embedding vector_cosine_ops)",
	}
	for _, s := range stmts {
		if err := DB.Exec(s).Error; err != nil {
			// 建索引失败不致命：没有索引也能做精确顺序扫描，只是慢一些。
			log.Printf("[vector] 初始化向量列/索引失败（可忽略，降级顺序扫描）: %v", err)
		}
	}
	vectorReady = true
	log.Printf("[vector] pgvector 就绪，向量维度=%d", dim)
}

// initSearchIndexes 创建全文搜索相关扩展与索引
func initSearchIndexes() {
	statements := []string{
		"CREATE EXTENSION IF NOT EXISTS pg_trgm",
		`CREATE INDEX IF NOT EXISTS idx_posts_trgm ON posts USING gin (title gin_trgm_ops, content gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_comments_trgm ON comments USING gin (content gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_users_trgm ON users USING gin (username gin_trgm_ops, display_name gin_trgm_ops)`,
	}
	for _, stmt := range statements {
		if err := DB.Exec(stmt).Error; err != nil {
			log.Printf("创建搜索索引失败（可忽略，不影响功能）: %v", err)
		}
	}
	log.Println("搜索索引初始化完成")
}

// defaultChannelCategories 默认频道分组（Icon 存储 lucide 图标名称）
var defaultChannelCategories = []model.ChannelCategory{
	{Name: "explore", Label: "探索", Icon: "compass", SortOrder: 1},
	{Name: "creation", Label: "创作与兴趣", Icon: "sparkles", SortOrder: 2},
}

// defaultChannels 默认频道列表（CategoryID 在 seed 时动态填充）
var defaultChannels = []model.Channel{
	{Name: "general", Label: "综合讨论", Icon: "message-circle", SortOrder: 1},
	{Name: "tech", Label: "技术前沿", Icon: "code", SortOrder: 2},
	{Name: "design", Label: "设计美学", Icon: "palette", SortOrder: 3},
	{Name: "gaming", Label: "游戏天地", Icon: "gamepad-2", SortOrder: 4},
	{Name: "life", Label: "生活方式", Icon: "leaf", SortOrder: 5},
}

// defaultSuperAdminEmail 超级管理员账号邮箱。
// 邮箱是注册时写死且唯一的标识，用户名和显示名都可被用户改掉，
// 因此这里按邮箱匹配，避免改名后 seed 失效。可用 SUPER_ADMIN_EMAIL 覆盖。
const defaultSuperAdminEmail = "463556354@qq.com"

// seedSuperAdmin 幂等地确保超级管理员账号角色为 admin。
// 账号未注册时仅记录提示（避免在代码里伪造密码建号），注册后重启服务即自动提升；
// 已为 admin 或账号不存在时无任何副作用，可安全重复执行。
func seedSuperAdmin() {
	email := strings.TrimSpace(os.Getenv("SUPER_ADMIN_EMAIL"))
	if email == "" {
		email = defaultSuperAdminEmail
	}

	var user model.User
	// 邮箱大小写不敏感匹配，避免注册时大写导致查不到
	err := DB.Where("LOWER(email) = ?", strings.ToLower(email)).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		log.Printf("超级管理员账号「%s」尚未注册，注册后重启服务将自动提升为管理员", email)
		return
	}
	if err != nil {
		log.Printf("Warning: 检查超级管理员账号失败: %v", err)
		return
	}
	if user.Role == "admin" {
		log.Printf("超级管理员「%s」已是 admin，跳过", user.Username)
		return
	}
	if err := DB.Model(&model.User{}).Where("id = ?", user.ID).Update("role", "admin").Error; err != nil {
		log.Printf("Warning: 提升「%s」为管理员失败: %v", user.Username, err)
		return
	}
	log.Printf("已将「%s」(%s) 设为超级管理员", user.Username, email)
}

// seedDefaultChannels 频道表为空时插入默认分组和频道
func seedDefaultChannels() {
	var count int64
	DB.Model(&model.Channel{}).Count(&count)
	if count > 0 {
		return
	}

	// 先创建分组
	if err := DB.Create(&defaultChannelCategories).Error; err != nil {
		log.Printf("默认频道分组初始化失败: %v", err)
		return
	}

	// 为频道分配分组：general -> explore，其余 -> creation
	exploreID := defaultChannelCategories[0].ID
	creationID := defaultChannelCategories[1].ID
	defaultChannels[0].CategoryID = &exploreID // general -> 探索
	for i := 1; i < len(defaultChannels); i++ {
		defaultChannels[i].CategoryID = &creationID // tech/design/gaming/life -> 创作与兴趣
	}

	if err := DB.Create(&defaultChannels).Error; err != nil {
		log.Printf("默认频道初始化失败: %v", err)
		return
	}
	log.Println("默认频道和分组初始化成功")
}
