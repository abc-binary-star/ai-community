package remoteimage

import (
	"context"
	"testing"
	"time"
)

// TestFetch_RejectsUnsafeTargets 确认 SSRF 防护在 Fetch 入口即生效，
// 无需外网：这些目标在校验阶段就会被拒，不会真正发起请求。
func TestFetch_RejectsUnsafeTargets(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{"file 协议", "file:///etc/passwd"},
		{"环回地址", "http://127.0.0.1/"},
		{"非标准端口", "http://example.com:8080/"},
		{"云元数据地址", "http://169.254.169.254/latest/meta-data/"},
		{"内网 10 段", "http://10.0.0.1/"},
		{"内网 192.168 段", "http://192.168.1.1/"},
		{"IPv6 环回", "http://[::1]/"},
		{"非法端口", "http://example.com:22/"},
		{"空 URL", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			if _, err := Fetch(ctx, tc.url); err == nil {
				t.Errorf("Fetch(%q) 应被拒绝，却成功了", tc.url)
			}
		})
	}
}
