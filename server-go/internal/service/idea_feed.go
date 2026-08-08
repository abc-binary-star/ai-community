// Package service: IdeaFeedService 想法流（跨帖分发）
//
// 把已有的段落想法接进分发渠道：首页不再只按帖子列表浏览，而是以「想法」为
// 最小推荐单元。一条想法天然是原子的——有引用原文、有人的判断、有作者、可互动，
// 它本来就是信息流该有的形状；而长帖子被塞进信息流只能退化成标题加封面。
//
// 硬约束（对齐设计文档 9 节风险）：
//   - 只有 public + active + anchor 已附着的想法可以进流。锚点失效的想法连自己
//     讨论的对象都不确定，进入分发就是制造误解，因此一律排除。
//   - 任何形态的卡都必须携带来源帖子，不存在无来源的卡。
//   - 拉黑账号的想法在流里直接排除，而非折叠：折叠卡在信息流语境下没有意义。
//
// 冷启动：某篇帖子还没有任何公开想法时，用系统抽取的关键句生成「摘录卡」替补；
// 一旦这篇帖子有了第一条公开想法，摘录卡就退场。
package service

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/dal"
	"github.com/abc-binary-star/ai-community/server-go/internal/model"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/anchor"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/mapper"
	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/pagination"
	"github.com/abc-binary-star/ai-community/server-go/internal/types"
	"gorm.io/gorm"
)

// IdeaFeedService 想法流服务
type IdeaFeedService struct{}

// ideaFeedPageCap 单页上限，避免一次拉取过多
const ideaFeedPageCap = 50

// ideaExcerptMaxRunes 摘录卡正文上限，超出截断
const ideaExcerptMaxRunes = 200

// ideaAnchorRunes 锚点长度，必须与前端 highlight-dom.ts 的 ANCHOR_LEN 一致。
// 口径漂移会导致摘录卡点击后无法定位到段落。
const ideaAnchorRunes = 40

// truncateRunes 按字符（rune）截断，避免切坏多字节字符。
func truncateRunes(s string, n int) string {
	rs := []rune(s)
	if len(rs) <= n {
		return s
	}
	return string(rs[:n])
}

// ListFeed 返回跨帖想法流。
//
// sortParam 为 hot 时按互动与回复深度排序，latest 时按时间。首版不使用向量近邻：
// 向量化能力尚未落地，把首版押在不存在的能力上是最容易翻车的地方。
// 排序上刻意不把点赞权重放得过高——早期样本稀疏时点赞不具备区分能力，
// 一条引发了后续回应的想法比一条获得若干赞的想法更值得推荐。
func (s *IdeaFeedService) ListFeed(ctx context.Context, currentUserID, sortParam string, page, pageSize int) (*types.IdeaFeed, error) {
	if pageSize <= 0 || pageSize > ideaFeedPageCap {
		pageSize = ideaFeedPageCap
	}
	if page <= 0 {
		page = 1
	}

	blocked := blockedIDList(ctx, currentUserID)

	// 只取可进流的想法：公开、活跃、锚点已附着，且来源帖子已发布。
	// 整篇想法（scope=whole）承接的是帖子底部评论，没有具体段落摘录，点击也无法
	// 定位到某一段，因此不进流——流里要的是「别人读到某一段时说了什么」。
	base := dal.DB.WithContext(ctx).Model(&model.Annotation{}).
		Joins("JOIN posts ON posts.id = annotations.post_id").
		Where("annotations.status = ?", model.AnnotationStatusActive).
		Where("annotations.visibility = ?", model.AnnotationVisibilityPublic).
		Where("annotations.anchor_status = ?", model.AnnotationAnchorAttached).
		Where("annotations.scope <> ?", model.AnnotationScopeWhole).
		Where("posts.status = ?", "published")
	if len(blocked) > 0 {
		base = base.Where("annotations.user_id NOT IN ?", blocked)
	}

	var ideaTotal int64
	base.Count(&ideaTotal)

	orderClause := "annotations.reply_count DESC, annotations.like_count DESC, annotations.created_at DESC"
	if sortParam == "latest" {
		orderClause = "annotations.created_at DESC"
	}

	offset := (page - 1) * pageSize
	var rows []model.Annotation
	if offset < int(ideaTotal) {
		if err := base.
			Preload("User").
			Order(orderClause).
			Offset(offset).
			Limit(pageSize).
			Find(&rows).Error; err != nil {
			log.Printf("[IdeaFeed] 想法查询失败, err=%v", err)
			return nil, err
		}
	}

	items := make([]types.IdeaCard, 0, pageSize)
	if len(rows) > 0 {
		postIDs := make([]string, 0, len(rows))
		annIDs := make([]string, 0, len(rows))
		for i := range rows {
			postIDs = append(postIDs, rows[i].PostID)
			annIDs = append(annIDs, rows[i].ID)
		}

		postMap := loadIdeaCardPosts(ctx, postIDs)

		likedSet := make(map[string]bool)
		if currentUserID != "" {
			var likes []model.AnnotationLike
			dal.DB.WithContext(ctx).Select("annotation_id").
				Where("annotation_id IN ? AND user_id = ?", annIDs, currentUserID).
				Find(&likes)
			for _, l := range likes {
				likedSet[l.AnnotationID] = true
			}
		}

		for i := range rows {
			a := &rows[i]
			p, ok := postMap[a.PostID]
			// 来源帖子取不到就丢弃这张卡：无来源的卡不允许进流。
			if !ok {
				continue
			}
			author := mapper.AuthorToDTO(&a.User)
			items = append(items, types.IdeaCard{
				Type:       "idea",
				ID:         a.ID,
				Excerpt:    a.SelectedText,
				Anchor:     a.Anchor,
				Post:       p,
				Body:       a.Body,
				Author:     &author,
				Scope:      a.Scope,
				ReplyCount: a.ReplyCount,
				LikeCount:  a.LikeCount,
				Liked:      likedSet[a.ID],
				CreatedAt:  a.CreatedAt.Format(time.RFC3339),
			})
		}
	}

	ideaCount := len(items)

	// 本页没被想法填满时，用摘录卡补齐尾部。
	filled := 0
	if len(items) < pageSize {
		need := pageSize - len(items)
		excerptOffset := offset - int(ideaTotal)
		if excerptOffset < 0 {
			excerptOffset = 0
		}
		cards := s.buildExcerptCards(ctx, need, excerptOffset, blocked)
		items = append(items, cards...)
		filled = len(cards)
	}

	total := int(ideaTotal) + filled + offset
	if len(items) == pageSize {
		// 还可能有更多，保守多报一页，让前端能继续翻
		total = int(ideaTotal) + filled + offset + 1
	}

	return &types.IdeaFeed{
		Items:       items,
		Total:       total,
		Page:        page,
		PageSize:    pageSize,
		TotalPages:  pagination.TotalPages(total, pageSize),
		IdeaCount:   ideaCount,
		FilledCount: filled,
	}, nil
}

// GetIdea 取单条想法，供想法详情页与分享链接使用。
//
// 只返回可公开分发的想法：非公开、已删除或锚点失效的想法不给出详情页，
// 否则分享链接会把一条无法确认讨论对象的想法暴露出去。
func (s *IdeaFeedService) GetIdea(ctx context.Context, currentUserID, ideaID string) (*types.IdeaCard, error) {
	var a model.Annotation
	if err := dal.DB.WithContext(ctx).
		Preload("User").
		Where("id = ?", ideaID).
		Where("status = ?", model.AnnotationStatusActive).
		Where("visibility = ?", model.AnnotationVisibilityPublic).
		Where("anchor_status = ?", model.AnnotationAnchorAttached).
		First(&a).Error; err != nil {
		return nil, err
	}

	postMap := loadIdeaCardPosts(ctx, []string{a.PostID})
	p, ok := postMap[a.PostID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}

	liked := false
	if currentUserID != "" {
		var cnt int64
		dal.DB.WithContext(ctx).Model(&model.AnnotationLike{}).
			Where("annotation_id = ? AND user_id = ?", a.ID, currentUserID).
			Count(&cnt)
		liked = cnt > 0
	}

	author := mapper.AuthorToDTO(&a.User)
	return &types.IdeaCard{
		Type:       "idea",
		ID:         a.ID,
		Excerpt:    a.SelectedText,
		Anchor:     a.Anchor,
		Post:       p,
		Body:       a.Body,
		Author:     &author,
		Scope:      a.Scope,
		ReplyCount: a.ReplyCount,
		LikeCount:  a.LikeCount,
		Liked:      liked,
		CreatedAt:  a.CreatedAt.Format(time.RFC3339),
	}, nil
}

// chainSiblingCap 同段落其他声音的上限，避免热门段落把链视图撑爆。
const chainSiblingCap = 20

// GetChain 返回一条想法的纵向链视图。
//
// 一次只呈现一条路径：上方是它回应的想法（parent，引用边），中间是它自己，
// 下方是由它引出的想法（children，引用边）与同段落的其他公开想法（siblings，
// 共位边）。链只连公开、活跃、锚点已附着的想法——一条无法确认讨论对象的想法
// 不该出现在任何人的链上。整篇想法（whole）不参与链：它承接的是帖子底部评论，
// 没有段落语境，硬连进链只会制造噪音。
func (s *IdeaFeedService) GetChain(ctx context.Context, currentUserID, ideaID string) (*types.IdeaChain, error) {
	current, err := s.loadChainAnnotation(ctx, ideaID)
	if err != nil {
		return nil, err
	}
	if current.Scope == model.AnnotationScopeWhole {
		return nil, gorm.ErrRecordNotFound
	}

	postMap := loadIdeaCardPosts(ctx, []string{current.PostID})
	p, ok := postMap[current.PostID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}

	blocked := blockedIDList(ctx, currentUserID)

	chain := &types.IdeaChain{
		Post:      p,
		Current:   chainNode(current),
		Children:  []types.IdeaChainNode{},
		Siblings:  []types.IdeaChainNode{},
		Neighbors: []types.IdeaChainNode{},
	}

	// 上游：它回应的那条想法
	if current.ParentAnnotationID != nil && *current.ParentAnnotationID != "" {
		if parent, err := s.loadChainAnnotation(ctx, *current.ParentAnnotationID); err == nil {
			if !containsID(blocked, parent.UserID) {
				node := chainNode(parent)
				chain.Parent = &node
			}
		}
	}

	// 下游：由它引出的想法（引用边）
	children := s.loadChainChildren(ctx, ideaID, blocked)
	chain.Children = children

	// 同段落的其他声音（共位边），排除自己与已作为 children 出现的
	seen := map[string]bool{current.ID: true}
	if chain.Parent != nil {
		seen[chain.Parent.ID] = true
	}
	for i := range children {
		seen[children[i].ID] = true
	}
	chain.Siblings = s.loadChainSiblings(ctx, current, seen, blocked)
	for i := range chain.Siblings {
		seen[chain.Siblings[i].ID] = true
	}

	// 近邻边（语义相近），排除已在链上出现过的，避免重复展示同一条想法。
	// 未启用向量化或 pgvector 不可用时返回空，链视图照常工作。
	neighbors, _ := s.FindNeighbors(ctx, currentUserID, ideaID, 8)
	for i := range neighbors {
		if seen[neighbors[i].ID] {
			continue
		}
		chain.Neighbors = append(chain.Neighbors, neighbors[i])
	}

	return chain, nil
}

// loadChainAnnotation 加载一条可进链的想法（公开、活跃、锚点已附着）。
func (s *IdeaFeedService) loadChainAnnotation(ctx context.Context, id string) (*model.Annotation, error) {
	var a model.Annotation
	if err := dal.DB.WithContext(ctx).
		Preload("User").
		Where("id = ?", id).
		Where("status = ?", model.AnnotationStatusActive).
		Where("visibility = ?", model.AnnotationVisibilityPublic).
		Where("anchor_status = ?", model.AnnotationAnchorAttached).
		First(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

// loadChainChildren 加载引用了 parentID 的想法（引用边下游）。
func (s *IdeaFeedService) loadChainChildren(ctx context.Context, parentID string, blocked []string) []types.IdeaChainNode {
	q := dal.DB.WithContext(ctx).
		Preload("User").
		Where("parent_annotation_id = ?", parentID).
		Where("status = ?", model.AnnotationStatusActive).
		Where("visibility = ?", model.AnnotationVisibilityPublic).
		Where("anchor_status = ?", model.AnnotationAnchorAttached)
	if len(blocked) > 0 {
		q = q.Where("user_id NOT IN ?", blocked)
	}
	var rows []model.Annotation
	q.Order("reply_count DESC, like_count DESC, created_at ASC").Limit(chainSiblingCap).Find(&rows)
	out := make([]types.IdeaChainNode, 0, len(rows))
	for i := range rows {
		out = append(out, chainNode(&rows[i]))
	}
	return out
}

// loadChainSiblings 加载同段落（同帖同锚点）的其他公开想法（共位边）。
func (s *IdeaFeedService) loadChainSiblings(ctx context.Context, current *model.Annotation, seen map[string]bool, blocked []string) []types.IdeaChainNode {
	q := dal.DB.WithContext(ctx).
		Preload("User").
		Where("post_id = ? AND anchor = ?", current.PostID, current.Anchor).
		Where("status = ?", model.AnnotationStatusActive).
		Where("visibility = ?", model.AnnotationVisibilityPublic).
		Where("anchor_status = ?", model.AnnotationAnchorAttached)
	if len(blocked) > 0 {
		q = q.Where("user_id NOT IN ?", blocked)
	}
	var rows []model.Annotation
	q.Order("reply_count DESC, like_count DESC, created_at DESC").Limit(chainSiblingCap * 2).Find(&rows)
	out := make([]types.IdeaChainNode, 0)
	for i := range rows {
		if seen[rows[i].ID] {
			continue
		}
		out = append(out, chainNode(&rows[i]))
		if len(out) >= chainSiblingCap {
			break
		}
	}
	return out
}

// chainNode 把想法 model 转为链节点 DTO。
func chainNode(a *model.Annotation) types.IdeaChainNode {
	author := mapper.AuthorToDTO(&a.User)
	return types.IdeaChainNode{
		ID:         a.ID,
		Excerpt:    a.SelectedText,
		Anchor:     a.Anchor,
		Body:       a.Body,
		Author:     &author,
		Scope:      a.Scope,
		ReplyCount: a.ReplyCount,
		LikeCount:  a.LikeCount,
		CreatedAt:  a.CreatedAt.Format(time.RFC3339),
	}
}

// containsID 判断 id 是否在切片中。
func containsID(ids []string, id string) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// loadIdeaCardPosts 批量加载来源帖子信息，避免逐条查询。
func loadIdeaCardPosts(ctx context.Context, postIDs []string) map[string]types.IdeaCardPost {
	out := make(map[string]types.IdeaCardPost, len(postIDs))
	if len(postIDs) == 0 {
		return out
	}
	var posts []model.Post
	if err := dal.DB.WithContext(ctx).
		Select("id", "title", "author_id", "channel", "cover_url", "status").
		Preload("Author").
		Where("id IN ?", postIDs).
		Find(&posts).Error; err != nil {
		log.Printf("[IdeaFeed] 来源帖子加载失败, err=%v", err)
		return out
	}
	for i := range posts {
		p := &posts[i]
		out[p.ID] = types.IdeaCardPost{
			ID:       p.ID,
			Title:    p.Title,
			Author:   mapper.AuthorToDTO(&p.Author),
			Channel:  p.Channel,
			CoverURL: p.CoverURL,
		}
	}
	return out
}

// buildExcerptCards 为「还没有任何公开想法」的帖子生成摘录卡，用于冷启动兜底。
//
// 一旦某篇帖子有了第一条公开想法，它就不再出现在这里——摘录卡自动退场。
// 这个替换关系保证冷启动阶段流里有东西可看，社区活起来之后流里全是人声，
// 而不是长期充斥机器抽的句子。
func (s *IdeaFeedService) buildExcerptCards(ctx context.Context, need, offset int, blocked []string) []types.IdeaCard {
	if need <= 0 {
		return nil
	}

	// 已有段落级公开想法的帖子集合，这些帖子不需要摘录卡替补。
	// 只统计能进流的想法（排除整篇想法）：一篇帖子若只有整篇想法，它在流里
	// 仍无人声，应当继续用摘录卡替补，否则会既进不了流也拿不到摘录卡而消失。
	var coveredIDs []string
	dal.DB.WithContext(ctx).Model(&model.Annotation{}).
		Distinct("post_id").
		Where("status = ? AND visibility = ? AND scope <> ?",
			model.AnnotationStatusActive, model.AnnotationVisibilityPublic, model.AnnotationScopeWhole).
		Pluck("post_id", &coveredIDs)

	query := dal.DB.WithContext(ctx).Model(&model.Post{}).
		Select("id", "title", "author_id", "channel", "cover_url", "content").
		Preload("Author").
		Where("status = ?", "published")
	if len(coveredIDs) > 0 {
		query = query.Where("id NOT IN ?", coveredIDs)
	}
	if len(blocked) > 0 {
		query = query.Where("author_id NOT IN ?", blocked)
	}

	var posts []model.Post
	if err := query.
		Order("created_at DESC").
		Offset(offset).
		Limit(need).
		Find(&posts).Error; err != nil {
		log.Printf("[IdeaFeed] 摘录卡候选查询失败, err=%v", err)
		return nil
	}

	cards := make([]types.IdeaCard, 0, len(posts))
	for i := range posts {
		p := &posts[i]
		excerpt, anc := pickExcerpt(p.Content)
		// 抽不出可用段落就跳过，不生成空卡。
		if excerpt == "" {
			continue
		}
		cards = append(cards, types.IdeaCard{
			Type:    "excerpt",
			ID:      p.ID + ":" + anc,
			Excerpt: excerpt,
			Anchor:  anc,
			Post: types.IdeaCardPost{
				ID:       p.ID,
				Title:    p.Title,
				Author:   mapper.AuthorToDTO(&p.Author),
				Channel:  p.Channel,
				CoverURL: p.CoverURL,
			},
		})
	}
	return cards
}

// pickExcerpt 从帖子正文里挑一段作为摘录，返回摘录文本与其段落锚点。
//
// 选段策略刻意保持简单：取最长的正文段落。它不追求「最精彩」——判断精彩需要
// 语义能力，而首版没有；取最长段落至少能保证拿到一段有实质内容的正文，
// 而不是标题或一句过渡。锚点口径与前端 ANCHOR_LEN 对齐，保证点击后能定位。
func pickExcerpt(content string) (string, string) {
	paras := anchor.ExtractParagraphs(content)
	best := ""
	for _, p := range paras {
		// 跳过标题类块：它们承载的是概括，不是可讨论的判断。
		if strings.HasPrefix(p.Tag, "h") {
			continue
		}
		t := strings.TrimSpace(p.Text)
		if len([]rune(t)) > len([]rune(best)) {
			best = t
		}
	}
	if best == "" {
		return "", ""
	}
	anc := truncateRunes(best, ideaAnchorRunes)
	return truncateRunes(best, ideaExcerptMaxRunes), anc
}
