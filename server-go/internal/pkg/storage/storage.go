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
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Service 存储服务，支持本地文件系统（开发）和 S3 兼容存储（生产）
type Service struct {
	localDir  string
	publicURL string
	s3Enabled bool
	s3Client  *s3.Client
	bucket    string
}

var defaultSvc *Service

// Init 初始化存储服务
func Init(cfg *conf.Config) {
	svc := &Service{
		publicURL: cfg.S3PublicURL,
	}
	if cfg.S3Endpoint != "" && cfg.S3Bucket != "" && cfg.S3AccessKey != "" && cfg.S3SecretKey != "" {
		svc.s3Enabled = true
		svc.bucket = cfg.S3Bucket

		awsCfg, err := config.LoadDefaultConfig(context.Background(),
			config.WithRegion(cfg.S3Region),
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				cfg.S3AccessKey, cfg.S3SecretKey, "",
			)),
		)
		if err != nil {
			log.Fatalf("S3 配置加载失败: %v", err)
		}

		svc.s3Client = s3.NewFromConfig(awsCfg, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(cfg.S3Endpoint)
			o.UsePathStyle = true
		})

		if svc.publicURL == "" {
			svc.publicURL = fmt.Sprintf("https://%s.%s", cfg.S3Bucket, cfg.S3Endpoint)
		}
		log.Printf("存储服务：S3 兼容对象存储已启用，Bucket: %s", cfg.S3Bucket)
	} else {
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
	if s.s3Enabled {
		return s.saveToS3(ctx, reader, key)
	}
	return s.saveToLocal(reader, key)
}

func (s *Service) saveToS3(ctx context.Context, reader io.Reader, key string) (string, error) {
	_, err := s.s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
		Body:   reader,
	})
	if err != nil {
		return "", fmt.Errorf("S3 上传失败: %w", err)
	}
	return fmt.Sprintf("%s/%s", s.publicURL, key), nil
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
	return fmt.Sprintf("%s/%s", s.publicURL, key), nil
}

// GenerateKey 生成存储 key：{purpose}/{yyyyMM}/{timestamp}.{ext}
func GenerateKey(purpose, ext string) string {
	now := time.Now()
	return fmt.Sprintf("%s/%s/%s.%s", purpose, now.Format("200601"), fmt.Sprintf("%d", now.UnixNano()), ext)
}
