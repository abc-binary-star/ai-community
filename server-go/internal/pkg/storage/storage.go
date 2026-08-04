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
	"github.com/aliyun/aliyun-oss-go-sdk/oss"
)

// Service 存储服务，支持本地文件系统（开发）和阿里云 OSS（生产）
type Service struct {
	localDir  string
	publicURL string
	ossEnabled bool
	ossBucket *oss.Bucket
}

var defaultSvc *Service

// Init 初始化存储服务
func Init(cfg *conf.Config) {
	svc := &Service{
		publicURL: cfg.S3PublicURL,
	}
	if cfg.S3Endpoint != "" && cfg.S3Bucket != "" && cfg.S3AccessKey != "" && cfg.S3SecretKey != "" {
		// 阿里云 OSS
		client, err := oss.New(
			cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey,
			oss.Timeout(30, 60), // 连接超时 30s，读写超时 60s
		)
		if err != nil {
			log.Fatalf("OSS 客户端创建失败: %v", err)
		}
		bucket, err := client.Bucket(cfg.S3Bucket)
		if err != nil {
			log.Fatalf("OSS Bucket 获取失败: %v", err)
		}
		svc.ossEnabled = true
		svc.ossBucket = bucket
		if svc.publicURL == "" {
			svc.publicURL = fmt.Sprintf("https://%s.%s", cfg.S3Bucket, cfg.S3Endpoint)
		}
		log.Printf("存储服务：阿里云 OSS 已启用，Bucket: %s", cfg.S3Bucket)
	} else {
		// 开发模式：使用本地文件系统
		svc.localDir = "./uploads"
		if err := os.MkdirAll(svc.localDir, 0755); err != nil {
			log.Fatalf("创建本地存储目录失败: %v", err)
		}
		if svc.publicURL == "" {
			svc.publicURL = "/uploads"
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
	if s.ossEnabled {
		return s.saveToOSS(ctx, reader, key)
	}
	return s.saveToLocal(reader, key)
}

// Exists 判断指定 key 的对象是否已存在（内容寻址去重复用）
func (s *Service) Exists(ctx context.Context, key string) (bool, error) {
	if s.ossEnabled {
		return s.ossBucket.IsObjectExist(key)
	}
	_, err := os.Stat(filepath.Join(s.localDir, key))
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// URLOf 根据 key 生成对外可访问的 URL（与 SaveFile 返回值格式一致）
func (s *Service) URLOf(key string) string {
	return fmt.Sprintf("%s/%s", s.publicURL, key)
}

func (s *Service) saveToOSS(ctx context.Context, reader io.Reader, key string) (string, error) {
	if err := s.ossBucket.PutObject(key, reader); err != nil {
		return "", fmt.Errorf("OSS 上传失败: %w", err)
	}
	return s.URLOf(key), nil
}

func (s *Service) saveToLocal(reader io.Reader, key string) (string, error) {
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
	return s.URLOf(key), nil
}

// GenerateKey 生成存储 key：{purpose}/{yyyyMM}/{timestamp}.{ext}
func GenerateKey(purpose, ext string) string {
	now := time.Now()
	return fmt.Sprintf("%s/%s/%s.%s", purpose, now.Format("200601"), fmt.Sprintf("%d", now.UnixNano()), ext)
}

// ContentKey 生成内容寻址存储 key：{purpose}/{yyyyMM}/{contentHash}.{ext}
// 相同内容的图片始终指向同一个 key，天然去重（同内容只存一份）
func ContentKey(purpose, ext, contentHash string) string {
	now := time.Now()
	return fmt.Sprintf("%s/%s/%s.%s", purpose, now.Format("200601"), contentHash, ext)
}
