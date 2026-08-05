package service

import (
	"context"
	"log"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/digest"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// aiCacheGet 两级读取：先查进程内缓存，未命中再查 DB。
//
// DB 命中后回填进程内缓存，让同一副本的后续请求走一级。
// DB 不可用时静默降级为只用一级缓存——缓存不是正确性依赖，
// 读失败最坏结果只是多调一次模型，不应让请求失败。
func aiCacheGet(ctx context.Context, local *digest.Cache, kind, hash string) (string, bool) {
	if v, ok := local.Get(hash); ok {
		return v, true
	}
	if dal.DB == nil {
		return "", false
	}

	var row model.AIContentDigest
	err := dal.DB.WithContext(ctx).
		Where("norm_hash = ? AND kind = ? AND expires_at > ?", hash, kind, time.Now()).
		First(&row).Error
	if err != nil {
		if err != gorm.ErrRecordNotFound {
			log.Printf("[AICache] 读取二级缓存失败 kind=%s err=%v", kind, err)
		}
		return "", false
	}

	local.Set(hash, row.Payload)

	// 命中计数用于评估缓存收益，失败不影响主流程
	if err := dal.DB.WithContext(ctx).Model(&model.AIContentDigest{}).
		Where("id = ?", row.ID).
		UpdateColumn("hit_count", gorm.Expr("hit_count + 1")).Error; err != nil {
		log.Printf("[AICache] 更新命中计数失败 id=%s err=%v", row.ID, err)
	}

	return row.Payload, true
}

// aiCacheSet 两级写入。DB 写失败只记日志，不影响调用方。
func aiCacheSet(ctx context.Context, local *digest.Cache, kind, hash, payload string) {
	local.Set(hash, payload)

	if dal.DB == nil {
		return
	}

	row := model.AIContentDigest{
		NormHash:  hash,
		Kind:      kind,
		Payload:   payload,
		ExpiresAt: time.Now().Add(digest.DefaultTTL),
	}
	// 同一内容重复生成时覆盖并续期，而不是插入冲突后报错
	err := dal.DB.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "norm_hash"}, {Name: "kind"}},
		DoUpdates: clause.AssignmentColumns([]string{"payload", "expires_at", "updated_at"}),
	}).Create(&row).Error
	if err != nil {
		log.Printf("[AICache] 写入二级缓存失败 kind=%s err=%v", kind, err)
	}
}
