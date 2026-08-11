package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/model"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/logger"
)

// TaskStore 任务持久化存储（SQLite 单表 JSON）
// 支撑 M1 书籍工作台：任务与章节状态跨重启保留
type TaskStore struct {
	db *sql.DB
}

// NewTaskStore 打开（或创建）SQLite 数据库并建表
func NewTaskStore(path string) (*TaskStore, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}
	// 并发写需启用 WAL 与 busy_timeout
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA journal_mode=WAL;`); err != nil {
		logger.L().Warnf("启用 WAL 失败: %v", err)
	}
	if _, err := db.Exec(`PRAGMA busy_timeout=5000;`); err != nil {
		logger.L().Warnf("设置 busy_timeout 失败: %v", err)
	}

	schema := `
CREATE TABLE IF NOT EXISTS tasks (
	id         TEXT PRIMARY KEY,
	data       TEXT NOT NULL,
	created_at TEXT NOT NULL
);`
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("初始化表结构失败: %w", err)
	}

	logger.L().Infof("任务存储就绪: %s", path)
	return &TaskStore{db: db}, nil
}

// Save 保存（或更新）任务
func (s *TaskStore) Save(task *model.Task) error {
	data, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("序列化任务失败: %w", err)
	}
	_, err = s.db.Exec(
		`INSERT INTO tasks (id, data, created_at) VALUES (?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
		task.ID, string(data), task.CreatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("保存任务失败: %w", err)
	}
	return nil
}

// Mutate 原子读-改-写：基于最新库状态执行 fn 修改并落库
// 用于翻译完成后的状态写回，避免并发覆盖其他章节的进度
func (s *TaskStore) Mutate(id string, fn func(*model.Task)) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	defer tx.Rollback()

	var data string
	if err := tx.QueryRow(`SELECT data FROM tasks WHERE id = ?`, id).Scan(&data); err != nil {
		return err // sql.ErrNoRows 或查询错误
	}
	var task model.Task
	if err := json.Unmarshal([]byte(data), &task); err != nil {
		return fmt.Errorf("反序列化任务失败: %w", err)
	}

	fn(&task)

	newData, err := json.Marshal(&task)
	if err != nil {
		return fmt.Errorf("序列化任务失败: %w", err)
	}
	if _, err := tx.Exec(
		`UPDATE tasks SET data = ?, created_at = ? WHERE id = ?`,
		string(newData), task.CreatedAt.Format(time.RFC3339), id,
	); err != nil {
		return fmt.Errorf("更新任务失败: %w", err)
	}
	return tx.Commit()
}

// Get 获取任务
func (s *TaskStore) Get(id string) (*model.Task, error) {
	var data string
	err := s.db.QueryRow(`SELECT data FROM tasks WHERE id = ?`, id).Scan(&data)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("查询任务失败: %w", err)
	}
	var task model.Task
	if err := json.Unmarshal([]byte(data), &task); err != nil {
		return nil, fmt.Errorf("反序列化任务失败: %w", err)
	}
	return &task, nil
}

// List 列出所有任务（按创建时间倒序）
func (s *TaskStore) List() ([]*model.Task, error) {
	rows, err := s.db.Query(`SELECT data FROM tasks ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("查询任务列表失败: %w", err)
	}
	defer rows.Close()

	var tasks []*model.Task
	for rows.Next() {
		var data string
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		var task model.Task
		if err := json.Unmarshal([]byte(data), &task); err != nil {
			logger.L().Warnf("解析任务记录失败，跳过: %v", err)
			continue
		}
		tasks = append(tasks, &task)
	}
	return tasks, rows.Err()
}

// Close 关闭数据库
func (s *TaskStore) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}
