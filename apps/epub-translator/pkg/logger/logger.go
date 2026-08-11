package logger

import (
	"io"
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
)

var globalLogger *logrus.Logger

// Init 根据配置初始化全局 logger
func Init(cfg *config.LogConfig) (*logrus.Logger, error) {
	l := logrus.New()

	// Level
	level, err := logrus.ParseLevel(cfg.Level)
	if err != nil {
		level = logrus.InfoLevel
	}
	l.SetLevel(level)

	// Format
	switch cfg.Format {
	case "json":
		l.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: "2006-01-02 15:04:05",
		})
	default:
		l.SetFormatter(&logrus.TextFormatter{
			FullTimestamp:   true,
			TimestampFormat: "2006-01-02 15:04:05",
			ForceColors:     true,
		})
	}

	// Output
	var writers []io.Writer
	if cfg.Output == "stdout" || cfg.Output == "both" {
		writers = append(writers, os.Stdout)
	}
	if cfg.Output == "file" || cfg.Output == "both" {
		if cfg.FilePath != "" {
			dir := filepath.Dir(cfg.FilePath)
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, err
			}
			f, err := os.OpenFile(cfg.FilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
			if err != nil {
				return nil, err
			}
			writers = append(writers, f)
		}
	}
	if len(writers) == 0 {
		writers = append(writers, os.Stdout)
	}
	if len(writers) == 1 {
		l.SetOutput(writers[0])
	} else {
		l.SetOutput(io.MultiWriter(writers...))
	}

	globalLogger = l
	return l, nil
}

// L 获取全局 logger
func L() *logrus.Logger {
	if globalLogger == nil {
		// 兜底
		l := logrus.New()
		l.SetLevel(logrus.DebugLevel)
		globalLogger = l
	}
	return globalLogger
}
