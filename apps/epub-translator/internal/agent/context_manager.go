package agent

import (
	"sync"
)

// ContextManager 翻译上下文管理器
// 维护术语表、章节摘要累积、翻译历史
type ContextManager struct {
	mu           sync.RWMutex
	glossary     map[string]string // 原文术语 -> 中文译名
	summaries    map[string]string // chapterID -> 累积摘要
	chapterOrder []string          // 章节顺序
}

// NewContextManager 创建上下文管理器
func NewContextManager() *ContextManager {
	return &ContextManager{
		glossary:  make(map[string]string),
		summaries: make(map[string]string),
	}
}

// SetGlossary 设置术语表
func (cm *ContextManager) SetGlossary(glossary map[string]string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.glossary = glossary
}

// GetGlossaryJSON 返回术语表 JSON 字符串
func (cm *ContextManager) GetGlossaryJSON() string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	if len(cm.glossary) == 0 {
		return ""
	}
	var sb []byte
	sb = append(sb, '{')
	first := true
	for k, v := range cm.glossary {
		if !first {
			sb = append(sb, ',')
		}
		sb = append(sb, '"')
		sb = append(sb, escapeJSON(k)...)
		sb = append(sb, '"', ':', '"')
		sb = append(sb, escapeJSON(v)...)
		sb = append(sb, '"')
		first = false
	}
	sb = append(sb, '}')
	return string(sb)
}

// AppendSummary 追加章节摘要
func (cm *ContextManager) AppendSummary(chapterID, summary string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	if existing, ok := cm.summaries[chapterID]; ok {
		cm.summaries[chapterID] = existing + " " + summary
	} else {
		cm.summaries[chapterID] = summary
		// Chapters are normally registered before translation starts. Avoid
		// adding a second occurrence when the first summary arrives later.
		registered := false
		for _, id := range cm.chapterOrder {
			if id == chapterID {
				registered = true
				break
			}
		}
		if !registered {
			cm.chapterOrder = append(cm.chapterOrder, chapterID)
		}
	}
}

// GetSummary 获取指定章节的累积摘要
func (cm *ContextManager) GetSummary(chapterID string) string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.summaries[chapterID]
}

// GetAllSummaries 获取所有章节摘要（按顺序拼接，用于跨章节上下文）
func (cm *ContextManager) GetAllSummaries(currentChapterID string) string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	var parts []string
	for _, chID := range cm.chapterOrder {
		if chID == currentChapterID {
			continue
		}
		if s, ok := cm.summaries[chID]; ok {
			parts = append(parts, s)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += " "
		}
		result += p
	}
	return result
}

// RegisterChapter 注册章节顺序
func (cm *ContextManager) RegisterChapter(chapterID string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	for _, id := range cm.chapterOrder {
		if id == chapterID {
			return
		}
	}
	cm.chapterOrder = append(cm.chapterOrder, chapterID)
}

func escapeJSON(s string) string {
	var sb []byte
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"':
			sb = append(sb, '\\', '"')
		case '\\':
			sb = append(sb, '\\', '\\')
		case '\n':
			sb = append(sb, '\\', 'n')
		case '\r':
			sb = append(sb, '\\', 'r')
		case '\t':
			sb = append(sb, '\\', 't')
		default:
			sb = append(sb, c)
		}
	}
	return string(sb)
}
