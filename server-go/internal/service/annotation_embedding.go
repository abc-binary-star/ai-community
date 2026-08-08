// Package service: 想法语义向量与近邻边。
//
// 语义邻居由向量相似度算出，用户不感知，属于后续增量。设计文档明确把它列为
// 「首版不做、依赖向量化底座就位后再启动」的能力，因此这里做成完全可选：
//   - 向量化客户端未配置（embedding.Enabled()==false）→ 不生成向量。
//   - pgvector 不可用（dal.VectorReady()==false）→ 不写向量、近邻查询返回空。
//
// 任何一环缺失都只是「没有近邻」，绝不影响想法本身的创建、展示与分发。
package service

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/embedding"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

// neighborMaxDistance 余弦距离上限：距离越小越相似（0 相同，2 相反）。
// 超过这个阈值视为「不够相近」，不作为近邻返回，避免硬凑出无关联的连接。
const neighborMaxDistance = 0.6

// embeddingText 拼接引用原文与想法正文作为向量化输入：
// 想法的语义既在它引用了什么，也在它对此说了什么，两者一起才完整。
func embeddingText(selectedText, body string) string {
	return strings.TrimSpace(selectedText + "\n" + body)
}

// GenerateAnnotationEmbeddingAsync 异步为一条想法生成并写入向量。
// 未启用向量化或 pgvector 不可用时直接返回。失败仅告警，不影响主流程。
func GenerateAnnotationEmbeddingAsync(annotationID, postID, selectedText, body string) {
	if !embedding.Enabled() || !dal.VectorReady() {
		return
	}
	text := embeddingText(selectedText, body)
	if text == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		vec, err := embedding.Embed(ctx, text)
		if err != nil {
			log.Printf("[Embedding] 生成向量失败, annotationID=%s, err=%v", annotationID, err)
			return
		}
		if err := upsertAnnotationEmbedding(ctx, annotationID, postID, vec); err != nil {
			log.Printf("[Embedding] 写入向量失败, annotationID=%s, err=%v", annotationID, err)
		}
	}()
}

// upsertAnnotationEmbedding 用原生 SQL 写入向量（vector 列不由 GORM 管理）。
func upsertAnnotationEmbedding(ctx context.Context, annotationID, postID string, vec []float32) error {
	lit := embedding.ToVectorLiteral(vec)
	now := time.Now()
	return dal.DB.WithContext(ctx).Exec(`
		INSERT INTO annotation_embeddings (annotation_id, post_id, model, dim, embedding, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?::vector, ?, ?)
		ON CONFLICT (annotation_id) DO UPDATE
		SET embedding = EXCLUDED.embedding, dim = EXCLUDED.dim, updated_at = EXCLUDED.updated_at
	`, annotationID, postID, "", len(vec), lit, now, now).Error
}

// FindNeighbors 返回与给定想法语义最相近的其他想法（近邻边）。
//
// 只连公开、活跃、锚点已附着、非整篇的想法，且排除自己与拉黑账号。
// 用余弦距离排序并卡阈值：宁可少给几条，也不硬凑出语义无关的连接——脱离上下文
// 是本方案的首要风险，近邻边尤其容易放大它。
func (s *IdeaFeedService) FindNeighbors(ctx context.Context, currentUserID, ideaID string, limit int) ([]types.IdeaChainNode, error) {
	out := []types.IdeaChainNode{}
	if !embedding.Enabled() || !dal.VectorReady() {
		return out, nil
	}
	if limit <= 0 || limit > 20 {
		limit = 10
	}

	// 目标想法必须自己有向量，否则无从比较。
	var self struct {
		AnnotationID string
	}
	if err := dal.DB.WithContext(ctx).Raw(
		`SELECT annotation_id FROM annotation_embeddings WHERE annotation_id = ? AND embedding IS NOT NULL`,
		ideaID,
	).Scan(&self).Error; err != nil || self.AnnotationID == "" {
		return out, nil
	}

	blocked := blockedIDList(ctx, currentUserID)

	// 余弦距离用 <=> 算子。JOIN 回想法与帖子，套用与流一致的可见性硬约束。
	sql := `
		SELECT a.id
		FROM annotation_embeddings e
		JOIN annotations a ON a.id = e.annotation_id
		JOIN posts p ON p.id = a.post_id
		WHERE e.annotation_id <> ?
		  AND e.embedding IS NOT NULL
		  AND a.status = ?
		  AND a.visibility = ?
		  AND a.anchor_status = ?
		  AND a.scope <> ?
		  AND p.status = 'published'
		  AND (e.embedding <=> (SELECT embedding FROM annotation_embeddings WHERE annotation_id = ?)) <= ?
	`
	args := []interface{}{
		ideaID,
		model.AnnotationStatusActive,
		model.AnnotationVisibilityPublic,
		model.AnnotationAnchorAttached,
		model.AnnotationScopeWhole,
		ideaID,
		neighborMaxDistance,
	}
	if len(blocked) > 0 {
		sql += " AND a.user_id NOT IN ?"
		args = append(args, blocked)
	}
	sql += `
		ORDER BY e.embedding <=> (SELECT embedding FROM annotation_embeddings WHERE annotation_id = ?)
		LIMIT ?
	`
	args = append(args, ideaID, limit)

	var ids []string
	if err := dal.DB.WithContext(ctx).Raw(sql, args...).Scan(&ids).Error; err != nil {
		log.Printf("[Embedding] 近邻查询失败, ideaID=%s, err=%v", ideaID, err)
		return out, nil
	}
	if len(ids) == 0 {
		return out, nil
	}

	// 保持相似度顺序加载想法详情。
	var rows []model.Annotation
	if err := dal.DB.WithContext(ctx).Preload("User").Where("id IN ?", ids).Find(&rows).Error; err != nil {
		return out, nil
	}
	byID := make(map[string]*model.Annotation, len(rows))
	for i := range rows {
		byID[rows[i].ID] = &rows[i]
	}
	for _, id := range ids {
		a, ok := byID[id]
		if !ok {
			continue
		}
		author := mapper.AuthorToDTO(&a.User)
		out = append(out, types.IdeaChainNode{
			ID:         a.ID,
			Excerpt:    a.SelectedText,
			Anchor:     a.Anchor,
			Body:       a.Body,
			Author:     &author,
			Scope:      a.Scope,
			ReplyCount: a.ReplyCount,
			LikeCount:  a.LikeCount,
			CreatedAt:  a.CreatedAt.Format(time.RFC3339),
		})
	}
	return out, nil
}
