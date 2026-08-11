package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config 应用全局配置
type Config struct {
	Server      ServerConfig      `mapstructure:"server"`
	LLM         LLMConfig         `mapstructure:"llm"`
	Epub        EpubConfig        `mapstructure:"epub"`
	Concurrency ConcurrencyConfig `mapstructure:"concurrency"`
	Storage     StorageConfig     `mapstructure:"storage"`
	Database    DatabaseConfig    `mapstructure:"database"`
	Log         LogConfig         `mapstructure:"log"`
}

type ServerConfig struct {
	Host         string        `mapstructure:"host"`
	Port         int           `mapstructure:"port"`
	Mode         string        `mapstructure:"mode"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
}

func (s ServerConfig) Addr() string {
	return fmt.Sprintf("%s:%d", s.Host, s.Port)
}

type LLMConfig struct {
	Provider     string        `mapstructure:"provider"`
	APIKey       string        `mapstructure:"api_key"`
	BaseURL      string        `mapstructure:"base_url"`
	Model        string        `mapstructure:"model"`
	ReviewModel  string        `mapstructure:"review_model"`
	Timeout      time.Duration `mapstructure:"timeout"`
	MaxRetries   int           `mapstructure:"max_retries"`
	Temperature  float64       `mapstructure:"temperature"`
}

type EpubConfig struct {
	ChunkMaxTokens     int `mapstructure:"chunk_max_tokens"`
	ContextLeftChars   int `mapstructure:"context_left_chars"`
	ContextRightChars  int `mapstructure:"context_right_chars"`
	OverlapSentences   int `mapstructure:"overlap_sentences"`
}

type ConcurrencyConfig struct {
	MaxTasks         int `mapstructure:"max_tasks"`
	MaxChunksPerTask int `mapstructure:"max_chunks_per_task"`
}

type StorageConfig struct {
	Type  string           `mapstructure:"type"`
	Local LocalStorageConf `mapstructure:"local"`
}

type LocalStorageConf struct {
	UploadDir string `mapstructure:"upload_dir"`
	OutputDir string `mapstructure:"output_dir"`
	TempDir   string `mapstructure:"temp_dir"`
}

type DatabaseConfig struct {
	Driver string         `mapstructure:"driver"`
	SQLite SQLiteConfig   `mapstructure:"sqlite"`
}

type SQLiteConfig struct {
	Path string `mapstructure:"path"`
}

type LogConfig struct {
	Level    string `mapstructure:"level"`
	Format   string `mapstructure:"format"`
	Output   string `mapstructure:"output"`
	FilePath string `mapstructure:"file_path"`
}

// Load 从指定路径加载配置文件，并应用环境变量覆盖
func Load(path string) (*Config, error) {
	v := viper.New()

	if path != "" {
		v.SetConfigFile(path)
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath("./configs")
		v.AddConfigPath("/etc/epub-translator")
	}

	// 允许环境变量替换 ${VAR} 占位符
	v.SetTypeByDefaultValue(true)
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if err := v.ReadInConfig(); err != nil {
		// 配置文件不存在时也允许通过环境变量启动
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("读取配置文件失败: %w", err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("解析配置失败: %w", err)
	}

	// 二次处理: 将 ${VAR} 格式的值替换为真实环境变量
	expandEnvString(&cfg)

	// 默认值兜底
	applyDefaults(&cfg)

	// 确保目录存在
	if err := ensureDirs(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func expandEnvString(cfg *Config) {
	// 使用 viper 的机制不能覆盖嵌套字段，这里简单手动处理敏感字段
	if strings.HasPrefix(cfg.LLM.APIKey, "${") && strings.HasSuffix(cfg.LLM.APIKey, "}") {
		key := strings.TrimSuffix(strings.TrimPrefix(cfg.LLM.APIKey, "${"), "}")
		if v := os.Getenv(key); v != "" {
			cfg.LLM.APIKey = v
		}
	}
}

func applyDefaults(cfg *Config) {
	if cfg.Server.Host == "" {
		cfg.Server.Host = "0.0.0.0"
	}
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8888
	}
	if cfg.Server.Mode == "" {
		cfg.Server.Mode = "debug"
	}
	if cfg.LLM.Provider == "" {
		cfg.LLM.Provider = "openai" // openai（DeepSeek/方舟/OpenAI 等兼容端点）| ark（火山方舟专用）
	}
	if cfg.LLM.Model == "" {
		cfg.LLM.Model = "deepseek-chat"
	}
	if cfg.LLM.ReviewModel == "" {
		cfg.LLM.ReviewModel = "deepseek-chat"
	}
	if cfg.LLM.MaxRetries == 0 {
		cfg.LLM.MaxRetries = 3
	}
	if cfg.Epub.ChunkMaxTokens == 0 {
		cfg.Epub.ChunkMaxTokens = 1500
	}
	if cfg.Epub.ContextLeftChars == 0 {
		cfg.Epub.ContextLeftChars = 300
	}
	if cfg.Epub.OverlapSentences == 0 {
		cfg.Epub.OverlapSentences = 5
	}
	if cfg.Concurrency.MaxTasks == 0 {
		cfg.Concurrency.MaxTasks = 2
	}
	if cfg.Concurrency.MaxChunksPerTask == 0 {
		cfg.Concurrency.MaxChunksPerTask = 5
	}
	if cfg.Storage.Type == "" {
		cfg.Storage.Type = "local"
	}
	if cfg.Storage.Local.UploadDir == "" {
		cfg.Storage.Local.UploadDir = "./storage/uploads"
	}
	if cfg.Storage.Local.OutputDir == "" {
		cfg.Storage.Local.OutputDir = "./storage/outputs"
	}
	if cfg.Storage.Local.TempDir == "" {
		cfg.Storage.Local.TempDir = "./storage/temp"
	}
	if cfg.Database.Driver == "" {
		cfg.Database.Driver = "sqlite"
	}
	if cfg.Database.SQLite.Path == "" {
		cfg.Database.SQLite.Path = "./storage/translator.db"
	}
	if cfg.Log.Level == "" {
		cfg.Log.Level = "info"
	}
	if cfg.Log.Format == "" {
		cfg.Log.Format = "text"
	}
	if cfg.Log.Output == "" {
		cfg.Log.Output = "stdout"
	}
}

func ensureDirs(cfg *Config) error {
	dirs := []string{
		cfg.Storage.Local.UploadDir,
		cfg.Storage.Local.OutputDir,
		cfg.Storage.Local.TempDir,
	}
	if cfg.Database.Driver == "sqlite" {
		dirs = append(dirs, filepath.Dir(cfg.Database.SQLite.Path))
	}
	if cfg.Log.Output == "file" && cfg.Log.FilePath != "" {
		dirs = append(dirs, filepath.Dir(cfg.Log.FilePath))
	}
	for _, d := range dirs {
		if d == "" {
			continue
		}
		if err := os.MkdirAll(d, 0o755); err != nil {
			return fmt.Errorf("创建目录 %s 失败: %w", d, err)
		}
	}
	return nil
}
