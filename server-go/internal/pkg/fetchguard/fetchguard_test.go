package fetchguard

import (
	"net"
	"testing"
)

func TestValidateURL_Allows(t *testing.T) {
	cases := []string{
		"https://i0.hdslb.com/bfs/new_dyn/abc.png@1192w.webp",
		"https://tiebapic.baidu.com/forum/pic/item/x.jpg?tbpicau=123",
		"http://example.com/a.png",
		"https://example.com:443/a.png",
	}
	for _, raw := range cases {
		if _, err := ValidateURL(raw); err != nil {
			t.Errorf("ValidateURL(%q) 应通过，却报错: %v", raw, err)
		}
	}
}

func TestValidateURL_Rejects(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"空字符串", ""},
		{"file 协议", "file:///etc/passwd"},
		{"ftp 协议", "ftp://example.com/a.png"},
		{"js 伪协议", "javascript:alert(1)"},
		{"环回地址", "http://127.0.0.1/admin"},
		{"localhost 形式的环回 IP", "http://127.0.0.1:8080/"},
		{"内网 10 段", "http://10.0.0.5/"},
		{"内网 192.168 段", "http://192.168.1.1/"},
		{"内网 172.16 段", "http://172.16.0.1/"},
		{"云元数据地址", "http://169.254.169.254/latest/meta-data/"},
		{"IPv6 环回", "http://[::1]/"},
		{"SSH 端口", "http://example.com:22/"},
		{"8080 常被内网服务占用", "http://example.com:8080/"},
		{"8443 常被内网服务占用", "https://example.com:8443/"},
		{"Redis 端口", "http://example.com:6379/"},
		{"缺少主机名", "http:///a.png"},
	}
	for _, tc := range cases {
		if _, err := ValidateURL(tc.raw); err == nil {
			t.Errorf("%s: ValidateURL(%q) 应被拒绝，却通过了", tc.name, tc.raw)
		}
	}
}

func TestIsPublicIP(t *testing.T) {
	private := []string{
		"127.0.0.1", "10.1.2.3", "192.168.0.1", "172.20.0.1",
		"169.254.169.254", "100.64.0.1", "198.18.0.1", "240.0.0.1",
		"0.0.0.0", "::1", "fc00::1", "fd12::1", "fe80::1",
	}
	for _, s := range private {
		if isPublicIP(net.ParseIP(s)) {
			t.Errorf("%s 应判定为非公网地址", s)
		}
	}

	public := []string{"1.1.1.1", "8.8.8.8", "203.0.113.9", "2400:3200::1"}
	for _, s := range public {
		if !isPublicIP(net.ParseIP(s)) {
			t.Errorf("%s 应判定为公网地址", s)
		}
	}
}
