package conf

import (
	"log"
	"os"
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
}

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

	corsOrigins := strings.Split(
		getEnvOrDefault("CORS_ORIGIN", "http://localhost:3000"),
		",",
	)
	for i, o := range corsOrigins {
		corsOrigins[i] = strings.TrimSpace(o)
	}

	return &Config{
		Port:          getEnvOrDefault("PORT", "3001"),
		DatabaseURL:   getEnvOrDefault("DATABASE_URL", "postgresql://aicom:aicom_dev@localhost:5432/aicom?sslmode=disable"),
		JWTSecret:     jwtSecret,
		CORSOrigins:   corsOrigins,
		NodeEnv:       nodeEnv,
		DeepSeekKey:   os.Getenv("DEEPSEEK_API_KEY"),
		DeepSeekURL:   getEnvOrDefault("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
		DeepSeekModel: getEnvOrDefault("DEEPSEEK_MODEL", "deepseek-chat"),
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
