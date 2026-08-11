package service

import (
	"context"
	"strings"
	"testing"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// newDryRunDB 构造不实际连接数据库的 GORM 实例（DryRun 只生成 SQL 不执行）。
// SkipInitializeWithVersion 跳过初始化时的 SELECT VERSION()，保证离线可用。
// 用于回归断言可见性作用域生成的 SQL 条件。
func newDryRunDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN: "postgres://unused:unused@127.0.0.1:1/unused?sslmode=disable",
	}), &gorm.Config{DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("failed to open dry-run db: %v", err)
	}
	return db.Session(&gorm.Session{DryRun: true})
}

// TestPostPublishedScopeSQL 回归 A1：公开帖子作用域必须带 published 过滤，
// 防止草稿/未发布内容泄漏进列表或搜索结果。
func TestPostPublishedScopeSQL(t *testing.T) {
	base := newDryRunDB(t)
	dal.DB = base

	sql := base.ToSQL(func(tx *gorm.DB) *gorm.DB {
		return postPublishedScope(context.Background(), tx, "user-1").Find(&[]model.Post{})
	})
	if !strings.Contains(sql, "status") || !strings.Contains(sql, "published") {
		t.Errorf("post scope 生成的 SQL 缺少 published 过滤: %s", sql)
	}
}

// TestCommentVisibleScopeSQL 回归 A1：评论作用域必须联表继承父帖子可见性，
// 防止父帖子未发布/已下架时评论仍出现在搜索结果中。
func TestCommentVisibleScopeSQL(t *testing.T) {
	base := newDryRunDB(t)
	dal.DB = base

	sql := base.ToSQL(func(tx *gorm.DB) *gorm.DB {
		return commentVisibleScope(context.Background(), tx, "user-1").Find(&[]model.Comment{})
	})
	if !strings.Contains(sql, "JOIN") || !strings.Contains(sql, "posts") || !strings.Contains(sql, "published") {
		t.Errorf("comment scope 生成的 SQL 缺少父帖子可见性 join: %s", sql)
	}
}
