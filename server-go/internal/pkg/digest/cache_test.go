package digest

import (
	"strconv"
	"testing"
	"time"
)

func TestCache_读写与命中(t *testing.T) {
	c := NewCache(time.Minute, 16)

	if _, ok := c.Get("missing"); ok {
		t.Error("未写入的 key 不应命中")
	}

	c.Set("k1", "v1")
	got, ok := c.Get("k1")
	if !ok {
		t.Fatal("已写入的 key 应命中")
	}
	if got != "v1" {
		t.Errorf("期望 v1，实际 %q", got)
	}
}

func TestCache_空值也缓存(t *testing.T) {
	c := NewCache(time.Minute, 16)
	c.Set("empty", "")

	got, ok := c.Get("empty")
	if !ok {
		t.Error("空值也应命中，避免对同一内容反复调用模型")
	}
	if got != "" {
		t.Errorf("期望空字符串，实际 %q", got)
	}
}

func TestCache_过期失效(t *testing.T) {
	c := NewCache(10*time.Millisecond, 16)
	c.Set("k", "v")

	time.Sleep(30 * time.Millisecond)

	if _, ok := c.Get("k"); ok {
		t.Error("超过 TTL 的条目不应命中")
	}
}

func TestCache_容量上限(t *testing.T) {
	capacity := 20
	c := NewCache(time.Minute, capacity)

	for i := 0; i < capacity*3; i++ {
		c.Set("k"+strconv.Itoa(i), "v")
	}

	if n := c.Len(); n > capacity {
		t.Errorf("条目数 %d 超出容量上限 %d", n, capacity)
	}
}

func TestNewCache_默认值(t *testing.T) {
	c := NewCache(0, 0)
	if c.ttl != DefaultTTL {
		t.Errorf("ttl<=0 应回落到 DefaultTTL，实际 %v", c.ttl)
	}
	if c.capacity != defaultCapacity {
		t.Errorf("capacity<=0 应回落到 %d，实际 %d", defaultCapacity, c.capacity)
	}
}
