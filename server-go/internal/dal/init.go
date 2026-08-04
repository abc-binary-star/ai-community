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
		&model.AIUsageLog{},
		&model.AIUserQuota{},
		&model.AIGlobalQuota{},
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
