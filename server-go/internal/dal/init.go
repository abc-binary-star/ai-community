package dal

import (
	"log"
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
		&model.Announcement{},
		&model.AnnouncementRead{},
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
	); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}

	// AutoMigrate 对 SetupJoinTable 配置的关联表不会自动添加新列，
	// 需手动确保 post_tags 表有 created_at 列
	if err := DB.Exec("ALTER TABLE post_tags ADD COLUMN IF NOT EXISTS created_at TIMESTAMP").Error; err != nil {
		log.Printf("Warning: 补全 post_tags.created_at 列失败: %v", err)
	}

	// 初始化默认频道数据
	seedDefaultChannels()

	// 初始化活动棋盘 20 格定义
	seedActivityTiles()

	// 队伍表为空时创建默认队伍（生产初始化，幂等）
	seedActivityTeams()

	// 幂等地确保超级管理员账号存在且角色为 admin（读书地狱审核需要管理员身份）
	seedSuperAdmin()

	log.Println("数据库连接和迁移成功")

	// 搜索增强：pg_trgm 扩展 + GIN 三元组索引，加速 ILIKE 模糊搜索与相关度排序
	initSearchIndexes()
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

// seedSuperAdmin 幂等地确保超级管理员账号角色为 admin。
// 按用户名或显示名匹配：账号可能直接以中文名注册，也可能仅把中文名设为显示名。
// 账号未注册时仅记录提示（避免在代码里伪造密码建号），注册后重启服务即自动提升；
// 已为 admin 或账号不存在时无任何副作用，可安全重复执行。
func seedSuperAdmin() {
	const superAdminName = "栗悟饭与龟波功"

	var users []model.User
	if err := DB.Where("username = ? OR display_name = ?", superAdminName, superAdminName).Find(&users).Error; err != nil {
		log.Printf("Warning: 检查超级管理员账号失败: %v", err)
		return
	}
	if len(users) == 0 {
		log.Printf("超级管理员账号「%s」尚未注册，注册后重启服务将自动提升为管理员", superAdminName)
		return
	}
	for i := range users {
		if users[i].Role == "admin" {
			continue
		}
		if err := DB.Model(&model.User{}).Where("id = ?", users[i].ID).Update("role", "admin").Error; err != nil {
			log.Printf("Warning: 提升「%s」为管理员失败: %v", users[i].Username, err)
			continue
		}
		log.Printf("已将「%s」(id=%s) 设为超级管理员", users[i].Username, users[i].ID)
	}
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
