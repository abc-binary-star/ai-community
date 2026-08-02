package dal

import (
	"log"

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
	&model.Block{},
	&model.NotificationPreference{},
	); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}

	// 初始化默认频道数据
	seedDefaultChannels()

	log.Println("数据库连接和迁移成功")
}

// defaultChannels 默认频道列表
var defaultChannels = []model.Channel{
	{Name: "general", Label: "综合讨论", Icon: "💬", SortOrder: 1},
	{Name: "tech", Label: "技术前沿", Icon: "🔧", SortOrder: 2},
	{Name: "design", Label: "设计美学", Icon: "🎨", SortOrder: 3},
	{Name: "gaming", Label: "游戏天地", Icon: "🎮", SortOrder: 4},
	{Name: "life", Label: "生活方式", Icon: "🌿", SortOrder: 5},
}

// seedDefaultChannels 频道表为空时插入默认频道
func seedDefaultChannels() {
	var count int64
	DB.Model(&model.Channel{}).Count(&count)
	if count > 0 {
		return
	}
	if err := DB.Create(&defaultChannels).Error; err != nil {
		log.Printf("默认频道初始化失败: %v", err)
		return
	}
	log.Println("默认频道初始化成功")
}
