// Package fetchguard 为「服务端按用户提供的 URL 拉取远程资源」提供 SSRF 防护。
//
// 该能力天然具备 SSRF 风险：攻击者可传入内网地址，借服务端身份探测或访问
// 内部服务（如 169.254.169.254 元数据接口、127.0.0.1 上的管理端口）。
// 本包在两个环节拦截：
//  1. 解析 URL 时校验 scheme 与端口；
//  2. 在 TCP 连接建立前校验实际目标 IP，因此 DNS 重绑定（DNS rebinding）
//     与重定向到内网都无法绕过。
package fetchguard

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// 允许的 URL scheme，仅 http/https
var allowedSchemes = map[string]bool{
	"http":  true,
	"https": true,
}

// 允许的目标端口，避免被用于探测内网非 HTTP 服务。
// 只放行标准 HTTP(S) 端口：公网图床均走 80/443，
// 8080/8443 等常被内网服务占用，放行会扩大 SSRF 探测面
var allowedPorts = map[string]bool{
	"":    true, // 使用 scheme 默认端口
	"80":  true,
	"443": true,
}

// ValidateURL 校验 URL 是否允许被服务端拉取，返回规范化后的 URL。
// 仅做静态校验（scheme/host/port），真实 IP 校验在 SafeDialer 中完成。
func ValidateURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("URL 不能为空")
	}
	if len(raw) > 2048 {
		return nil, fmt.Errorf("URL 过长")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("URL 格式不合法")
	}
	if !allowedSchemes[strings.ToLower(u.Scheme)] {
		return nil, fmt.Errorf("仅支持 http/https 链接")
	}
	if u.Hostname() == "" {
		return nil, fmt.Errorf("URL 缺少主机名")
	}
	if !allowedPorts[u.Port()] {
		return nil, fmt.Errorf("不允许的端口: %s", u.Port())
	}
	// 主机名形如 IP 时直接判定，避免把内网 IP 当域名放过
	if ip := net.ParseIP(u.Hostname()); ip != nil && !isPublicIP(ip) {
		return nil, fmt.Errorf("不允许访问内网地址")
	}
	return u, nil
}

// isPublicIP 判断 IP 是否为公网可路由地址。
// 覆盖 IPv4/IPv6 的环回、私有、链路本地、多播、唯一本地地址等非公网范围。
func isPublicIP(ip net.IP) bool {
	if ip == nil || ip.IsUnspecified() {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() {
		return false
	}
	// IPv4 特殊段：100.64/10（CGNAT）、192.0.0/24、198.18/15（基准测试）、240/4（保留）
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127:
			return false
		case v4[0] == 192 && v4[1] == 0 && v4[2] == 0:
			return false
		case v4[0] == 198 && (v4[1] == 18 || v4[1] == 19):
			return false
		case v4[0] >= 240:
			return false
		}
		return true
	}
	// IPv6：唯一本地地址 fc00::/7，以及 IPv4 映射地址需按 IPv4 规则再判一次
	if len(ip) == net.IPv6len {
		if ip[0] == 0xfc || ip[0] == 0xfd {
			return false
		}
	}
	return true
}

// CheckAddr 校验 "host:port" 形式的目标地址，解析其所有 IP 并要求全部为公网地址。
// 供 http.Transport 的 DialContext 在连接前调用。
func CheckAddr(ctx context.Context, addr string) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("目标地址不合法")
	}
	if !allowedPorts[port] {
		return fmt.Errorf("不允许的端口: %s", port)
	}
	// 已是 IP 则直接校验，否则解析域名
	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return fmt.Errorf("不允许访问内网地址")
		}
		return nil
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return fmt.Errorf("域名解析失败")
	}
	if len(ips) == 0 {
		return fmt.Errorf("域名无解析结果")
	}
	for _, ipAddr := range ips {
		if !isPublicIP(ipAddr.IP) {
			return fmt.Errorf("不允许访问内网地址")
		}
	}
	return nil
}
