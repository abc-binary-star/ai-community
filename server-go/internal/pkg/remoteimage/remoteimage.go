// Package remoteimage 按 URL 拉取远程图片，用于把外站图片转存到本站存储。
//
// 存在意义：B站、贴吧等图床有防盗链（校验 Referer），浏览器直接引用其图片
// 地址会被返回 403。由服务端拉取时不带 Referer 即可正常获取，转存后由本站
// 域名提供，从而彻底摆脱对方的防盗链策略。
package remoteimage

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/pkg/fetchguard"
)

// 单张图片最大拉取体积 10MB，超出直接放弃（避免被超大文件拖垮）
const MaxFetchSize = 10 << 20

// 最多跟随 3 次重定向，每一跳都会重新经过 SSRF 校验
const maxRedirects = 3

// Result 拉取结果
type Result struct {
	Data        []byte
	ContentType string
}

// client 复用连接池；DialContext 在建立连接前校验目标 IP，
// 使 DNS 重绑定与重定向到内网都无法绕过 SSRF 防护
var client = &http.Client{
	Timeout: 20 * time.Second,
	Transport: &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			if err := fetchguard.CheckAddr(ctx, addr); err != nil {
				return nil, err
			}
			d := &net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}
			return d.DialContext(ctx, network, addr)
		},
		TLSHandshakeTimeout:   8 * time.Second,
		ResponseHeaderTimeout: 12 * time.Second,
		MaxIdleConns:          32,
		IdleConnTimeout:       60 * time.Second,
	},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= maxRedirects {
			return fmt.Errorf("重定向次数过多")
		}
		// 重定向目标同样要通过静态校验
		if _, err := fetchguard.ValidateURL(req.URL.String()); err != nil {
			return err
		}
		return nil
	},
}

// Fetch 拉取远程图片。
// 关键点：不设置 Referer 头。B站/贴吧的防盗链正是基于 Referer 判断，
// 不带该头时其图床会正常返回图片内容。
func Fetch(ctx context.Context, rawURL string) (*Result, error) {
	u, err := fetchguard.ValidateURL(rawURL)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("构造请求失败")
	}
	// 带常见 UA，部分图床会拒绝空 UA；但刻意不带 Referer 以绕过防盗链
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CommonsBot/1.0)")
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("图片拉取失败")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("图片源返回 %d", resp.StatusCode)
	}

	// Content-Length 已超限时提前拒绝，省去读取开销
	if resp.ContentLength > MaxFetchSize {
		return nil, fmt.Errorf("图片超过 10MB")
	}

	// 多读 1 字节用于判断是否超限，避免恶意源用分块编码绕过 Content-Length
	data, err := io.ReadAll(io.LimitReader(resp.Body, MaxFetchSize+1))
	if err != nil {
		return nil, fmt.Errorf("图片读取失败")
	}
	if len(data) > MaxFetchSize {
		return nil, fmt.Errorf("图片超过 10MB")
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("图片内容为空")
	}

	return &Result{Data: data, ContentType: resp.Header.Get("Content-Type")}, nil
}
