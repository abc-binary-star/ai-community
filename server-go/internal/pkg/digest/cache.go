package digest

import (
	"sync"
	"time"
)

// DefaultTTL 缓存默认有效期
const DefaultTTL = 7 * 24 * time.Hour

// defaultCapacity 缓存条目上限。超出后按写入时间清理最旧的一批，
// 避免长期运行后无界增长（原标签缓存的 sync.Map 没有上限）。
const defaultCapacity = 4096

type entry struct {
	value     string
	expiresAt time.Time
	storedAt  time.Time
}

// Cache 带 TTL 和容量上限的进程内字符串缓存，可被多个 AI 功能共用。
type Cache struct {
	mu       sync.RWMutex
	items    map[string]entry
	ttl      time.Duration
	capacity int
}

// NewCache 创建缓存。ttl <= 0 时用 DefaultTTL，capacity <= 0 时用默认容量。
func NewCache(ttl time.Duration, capacity int) *Cache {
	if ttl <= 0 {
		ttl = DefaultTTL
	}
	if capacity <= 0 {
		capacity = defaultCapacity
	}
	return &Cache{
		items:    make(map[string]entry),
		ttl:      ttl,
		capacity: capacity,
	}
}

// Get 读取缓存。第二个返回值表示是否命中且未过期。
func (c *Cache) Get(key string) (string, bool) {
	c.mu.RLock()
	e, ok := c.items[key]
	c.mu.RUnlock()

	if !ok {
		return "", false
	}
	if time.Now().After(e.expiresAt) {
		c.mu.Lock()
		// 二次确认，避免与并发的 Set 竞争删掉新写入的值
		if cur, still := c.items[key]; still && time.Now().After(cur.expiresAt) {
			delete(c.items, key)
		}
		c.mu.Unlock()
		return "", false
	}
	return e.value, true
}

// Set 写入缓存。空值也会被缓存，避免对同一内容反复调用模型。
func (c *Cache) Set(key, value string) {
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.items) >= c.capacity {
		c.evictLocked(now)
	}
	c.items[key] = entry{
		value:     value,
		expiresAt: now.Add(c.ttl),
		storedAt:  now,
	}
}

// evictLocked 先清过期项；若仍然满，则丢弃最旧的四分之一。
// 调用方必须已持有写锁。
func (c *Cache) evictLocked(now time.Time) {
	for k, e := range c.items {
		if now.After(e.expiresAt) {
			delete(c.items, k)
		}
	}
	if len(c.items) < c.capacity {
		return
	}

	target := len(c.items) / 4
	if target == 0 {
		target = 1
	}
	// 按 storedAt 找出最旧的一批。条目量有上限，线性扫描可接受。
	oldest := make([]string, 0, target)
	var oldestTime []time.Time
	for k, e := range c.items {
		if len(oldest) < target {
			oldest = append(oldest, k)
			oldestTime = append(oldestTime, e.storedAt)
			continue
		}
		maxIdx := 0
		for i := 1; i < len(oldestTime); i++ {
			if oldestTime[i].After(oldestTime[maxIdx]) {
				maxIdx = i
			}
		}
		if e.storedAt.Before(oldestTime[maxIdx]) {
			oldest[maxIdx] = k
			oldestTime[maxIdx] = e.storedAt
		}
	}
	for _, k := range oldest {
		delete(c.items, k)
	}
}

// Len 返回当前缓存条目数（含尚未清理的过期项），供测试与监控使用。
func (c *Cache) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}
