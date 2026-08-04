package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/conf"
)

// Service 存储服务，支持本地文件系统（开发）和 S3 兼容存储（生产）
type Service struct {
	localDir  string // 本地存储目录
	publicURL string // 公开访问基础 URL
	s3Enabled bool
}

var defaultSvc *Service

// Init 初始化存储服务
func Init(cfg *conf.Config) {
	svc := &Service{
		publicURL: cfg.S3PublicURL,
	}
	if cfg.S3Endpoint != "" && cfg.S3Bucket != "" && cfg.S3AccessKey != "" && cfg.S3SecretKey != "" {
		svc.s3Enabled = true
		log.Println("存储服务：S3 兼容对象存储已启用")
		// TODO: 初始化 S3 client（AWS SDK for Go v2），后续阶段实现
	} else {
		// 开发模式：使用本地文件系统
		svc.localDir = "./uploads"
		if err := os.MkdirAll(svc.localDir, 0755); err != nil {
			log.Fatalf("创建本地存储目录失败: %v", err)
		}
		if svc.publicURL == "" {
			svc.publicURL = "/uploads" // 通过 Nginx 或 Hertz 静态文件服务访问
		}
		log.Println("存储服务：本地文件系统模式（开发用），目录:", svc.localDir)
	}
	defaultSvc = svc
}

// Get 返回默认存储服务实例
func Get() *Service {
	return defaultSvc
}

// SaveFile 保存文件，返回可访问的 URL
func (s *Service) SaveFile(ctx context.Context, reader io.Reader, key string) (string, error) {
	if s.s3Enabled {
		// TODO: S3 上传逻辑，后续阶段实现
		return "", fmt.Errorf("S3 存储尚未实现")
	}
	// 本地存储
	localPath := filepath.Join(s.localDir, key)
	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		return "", fmt.Errorf("创建目录失败: %w", err)
	}
	file, err := os.Create(localPath)
	if err != nil {
		return "", fmt.Errorf("创建文件失败: %w", err)
	}
	defer file.Close()
	if _, err := io.Copy(file, reader); err != nil {
		return "", fmt.Errorf("写入文件失败: %w", err)
	}
	url := fmt.Sprintf("%s/%s", s.publicURL, key)
	return url, nil
}

// GenerateKey 生成存储 key：{purpose}/{yyyyMM}/{uuid}.{ext}
func GenerateKey(purpose, ext string) string {
	now := time.Now()
	return fmt.Sprintf("%s/%s/%s.%s", purpose, now.Format("200601"), fmt.Sprintf("%d", now.UnixNano()), ext)
}
