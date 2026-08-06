package conf

import (
	"log"
	"os"
	"strconv"
	"strings"
)

// Config 全局配置
type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	CORSOrigins   []string
	NodeEnv       string
	DeepSeekKey   string
	DeepSeekURL   string
	DeepSeekModel string
	VolcASRKey    string
	VolcASRResID  string
	// AI 限流配置
	AIConcurrentLimit       int
	AIDailyTokenLimit       int
	AIFreeDailyTokenLimit   int
	AIProDailyTokenLimit    int
	AIFreeGlobalTokenPool   int
	AIProGlobalTokenPool    int
	AIFreeRewriteMaxChars   int
	AIProRewriteMaxChars    int
	AIFreeTranscribeMaxSecs int
	// 对象存储配置（S3 兼容：Cloudflare R2 / 阿里云 OSS）
	S3Endpoint  string
	S3Region    string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3PublicURL string // 公开访问的基础 URL（CDN 域名或 R2 公开域名）
}

// Global 全局配置实例，Load 后可用
var Global *Config

// Load 从环境变量加载配置
func Load() *Config {
	nodeEnv := getEnvOrDefault("NODE_ENV", "development")

	// 生产环境必须显式配置 JWT_SECRET
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		if nodeEnv == "production" {
			log.Fatal("生产环境必须配置 JWT_SECRET 环境变量（至少 32 位随机字符串）")
		}
		jwtSecret = "dev-secret-change-me"
	}
	if nodeEnv == "production" && len(jwtSecret) < 32 {
		log.Fatal("生产环境 JWT_SECRET 至少需要 32 位字符")
	}

	corsOrigins := strings.Split(
		getEnvOrDefault("CORS_ORIGIN", "http://localhost:3000"),
		",",
	)
	for i, o := range corsOrigins {
		corsOrigins[i] = strings.TrimSpace(o)
	}

	cfg := &Config{
		Port:                    getEnvOrDefault("PORT", "3001"),
		DatabaseURL:             getEnvOrDefault("DATABASE_URL", "postgresql://aicom:aicom_dev@localhost:5432/aicom?sslmode=disable"),
		JWTSecret:               jwtSecret,
		CORSOrigins:             corsOrigins,
		NodeEnv:                 nodeEnv,
		DeepSeekKey:             os.Getenv("DEEPSEEK_API_KEY"),
		DeepSeekURL:             getEnvOrDefault("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
		DeepSeekModel:           getEnvOrDefault("DEEPSEEK_MODEL", "deepseek-chat"),
		VolcASRKey:              os.Getenv("VOLC_ASR_API_KEY"),
		VolcASRResID:            getEnvOrDefault("VOLC_ASR_RESOURCE_ID", "volc.bigasr.sauc.duration"),
		AIConcurrentLimit:       getEnvIntOrDefault("AI_CONCURRENT_LIMIT", 5),
		AIDailyTokenLimit:       getEnvIntOrDefault("AI_DAILY_TOKEN_LIMIT", 2000000),
		AIFreeDailyTokenLimit:   getEnvIntOrDefault("AI_FREE_DAILY_TOKEN_LIMIT", 100000),
		AIProDailyTokenLimit:    getEnvIntOrDefault("AI_PRO_DAILY_TOKEN_LIMIT", 500000),
		AIFreeGlobalTokenPool:   getEnvIntOrDefault("AI_FREE_GLOBAL_TOKEN_POOL", 700000),
		AIProGlobalTokenPool:    getEnvIntOrDefault("AI_PRO_GLOBAL_TOKEN_POOL", 1300000),
		AIFreeRewriteMaxChars:   getEnvIntOrDefault("AI_FREE_REWRITE_MAX_CHARS", 8000),
		AIProRewriteMaxChars:    getEnvIntOrDefault("AI_PRO_REWRITE_MAX_CHARS", 40000),
		AIFreeTranscribeMaxSecs: getEnvIntOrDefault("AI_FREE_TRANSCRIBE_MAX_SECONDS", 180),
		S3Endpoint:              getEnvOrDefault("S3_ENDPOINT", ""),
		S3Region:                getEnvOrDefault("S3_REGION", "auto"),
		S3Bucket:                getEnvOrDefault("S3_BUCKET", ""),
		S3AccessKey:             os.Getenv("S3_ACCESS_KEY_ID"),
		S3SecretKey:             os.Getenv("S3_SECRET_ACCESS_KEY"),
		S3PublicURL:             getEnvOrDefault("S3_PUBLIC_BASE_URL", ""),
	}
	Global = cfg
	return cfg
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func getEnvIntOrDefault(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return defaultVal
}
