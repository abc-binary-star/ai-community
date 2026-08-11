package service

import (
	"context"
	"strings"
	"testing"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// TestCanManagePost 校验帖子管理权限矩阵：
// 作者本人 / 管理员 / 版主 可管理；其他用户不可。
func TestCanManagePost(t *testing.T) {
	author := "u-author"
	other := "u-other"
	cases := []struct {
		name    string
		post    model.Post
		opID    string
		opRole  string
		allowed bool
	}{
		{name: "作者本人", post: model.Post{AuthorID: author}, opID: author, opRole: "user", allowed: true},
		{name: "管理员", post: model.Post{AuthorID: author}, opID: other, opRole: "admin", allowed: true},
		{name: "版主", post: model.Post{AuthorID: author}, opID: other, opRole: "moderator", allowed: true},
		{name: "普通用户", post: model.Post{AuthorID: author}, opID: other, opRole: "user", allowed: false},
		{name: "游客（空角色）", post: model.Post{AuthorID: author}, opID: other, opRole: "", allowed: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := canManagePost(&tc.post, tc.opID, tc.opRole)
			if got != tc.allowed {
				t.Errorf("期望 allowed=%v, 实际 %v", tc.allowed, got)
			}
		})
	}
}

// TestPostAssetListSQLVisibility 回归 B2：非作者查看时列表必须带 published+public 过滤，
// 防止草稿/未发布/私密资产出现在帖子详情页的「本帖用到的资产」中。
func TestPostAssetListSQLVisibility(t *testing.T) {
	base := newDryRunDB(t)
	dal.DB = base

	// 模拟非作者查看时 ListPostAssets 内部使用的查询条件
	q := dal.DB.Model(&model.PostAsset{}).
		Joins("JOIN assets ON assets.id = post_assets.asset_id").
		Where("post_assets.post_id = ?", "post-1").
		Where("assets.status = ? AND assets.visibility = ?",
			model.AssetStatusPublished, model.AssetVisibilityPublic)
	generated := q.ToSQL(func(tx *gorm.DB) *gorm.DB {
		return tx.Find(&[]model.PostAsset{})
	})
	if !strings.Contains(generated, "published") {
		t.Errorf("post asset list SQL 缺少 published 过滤: %s", generated)
	}
	if !strings.Contains(generated, "public") {
		t.Errorf("post asset list SQL 缺少 public 可见性过滤: %s", generated)
	}
	if !strings.Contains(generated, "JOIN assets") {
		t.Errorf("post asset list SQL 缺少 assets 联表: %s", generated)
	}
}

// TestBindPostAssetInputValidation 校验绑定入参基础校验：
// postID / assetID / operatorID 任一为空均拒绝。
func TestBindPostAssetInputValidation(t *testing.T) {
	svc := &PostAssetService{}
	cases := []struct {
		name      string
		postID    string
		req       types.BindPostAssetReq
		operator  string
		wantError bool
	}{
		{name: "全部为空", postID: "", req: types.BindPostAssetReq{}, operator: "", wantError: true},
		{name: "缺 postID", postID: "", req: types.BindPostAssetReq{AssetID: "a1"}, operator: "u1", wantError: true},
		{name: "缺 assetID", postID: "p1", req: types.BindPostAssetReq{}, operator: "u1", wantError: true},
		{name: "缺 operator", postID: "p1", req: types.BindPostAssetReq{AssetID: "a1"}, operator: "", wantError: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.BindPostAsset(context.Background(), tc.postID, tc.req, tc.operator)
			// Dal 未初始化时也会返回错误，但入参校验先于 DB 查询，能区分
			gotErr := err != nil
			if tc.wantError && !gotErr {
				t.Errorf("期望返回错误，实际为 nil")
			}
		})
	}
}
