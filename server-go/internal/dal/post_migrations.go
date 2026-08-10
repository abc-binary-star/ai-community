package dal

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
)

// migratePostEditorFlags 为 post 表补齐 editor v2 需要的 3 列 + 索引，并回填 content_format
// 用于已有生产库：GORM AutoMigrate 对新增列/索引会自动建，但“回填存量格式”必须手写；
// 对全新库，此迁移相当于双重校验，不重复执行实际列变更。
func migratePostEditorFlags() {
	if err := addPostColumnIfMissing("content_format", "VARCHAR(32) NOT NULL DEFAULT 'markdown'"); err != nil {
		log.Printf("Warning: 补齐 post.content_format 列失败: %v", err)
	}
	if err := addPostColumnIfMissing("content_doc_enabled", "BOOLEAN NOT NULL DEFAULT TRUE"); err != nil {
		log.Printf("Warning: 补齐 post.content_doc_enabled 列失败: %v", err)
	}
	if err := addPostColumnIfMissing("editor_downgraded", "BOOLEAN NOT NULL DEFAULT FALSE"); err != nil {
		log.Printf("Warning: 补齐 post.editor_downgraded 列失败: %v", err)
	}
	if err := addPostColumnIfMissing("content_doc", "JSONB"); err != nil {
		log.Printf("Warning: 补齐 post.content_doc 列失败: %v", err)
	}

	// 存量回填 content_format：此前富文本同步已开启的行，content_doc 非空则视为 richtext
	// 不覆盖已有非空 content_format，仅填空。
	result := DB.Model(&model.Post{}).
		Where("(content_format IS NULL OR content_format = '') AND content_doc IS NOT NULL").
		UpdateColumn("content_format", "richtext")
	if result.Error != nil {
		log.Printf("Warning: 回填 post.content_format=richtext 失败: %v", result.Error)
	}
	result = DB.Model(&model.Post{}).
		Where("content_format IS NULL OR content_format = ''").
		UpdateColumn("content_format", "markdown")
	if result.Error != nil {
		log.Printf("Warning: 回填 post.content_format=markdown 默认值失败: %v", result.Error)
	}

	runPostEditorIndex("CREATE INDEX IF NOT EXISTS idx_posts_content_format ON posts (content_format)",
		"为 posts.content_format 创建索引")
	runPostEditorIndex("CREATE INDEX IF NOT EXISTS idx_posts_content_doc_enabled ON posts (content_doc_enabled)",
		"为 posts.content_doc_enabled 创建索引")

	log.Printf("编辑器升级相关 post 字段迁移完成")
}

func runPostEditorIndex(stmt, desc string) {
	if err := DB.Exec(stmt).Error; err != nil {
		log.Printf("Warning: %s 失败（可忽略，不影响功能）: %v", desc, err)
	}
}

// addPostColumnIfMissing 用 information_schema 做幂等“加列”。
// 只用于 PostgreSQL；失败不会阻断服务启动（仅告警），因为 GORM AutoMigrate 多数情况下也能补回来。
func addPostColumnIfMissing(column, definition string) error {
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("获取底层 sql.DB 失败: %w", err)
	}
	var exists string
	row := sqlDB.QueryRow(`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = CURRENT_SCHEMA()
		  AND table_name = 'posts'
		  AND column_name = $1
	`, column)
	if err := row.Scan(&exists); err != nil {
		if err == sql.ErrNoRows {
			stmt := fmt.Sprintf(`ALTER TABLE posts ADD COLUMN %s %s`, column, definition)
			if execErr := DB.Exec(stmt).Error; execErr != nil {
				return fmt.Errorf("执行 %s 失败: %w", stmt, execErr)
			}
			return nil
		}
		return fmt.Errorf("查询列 %s 是否存在失败: %w", column, err)
	}
	// 已存在
	return nil
}
