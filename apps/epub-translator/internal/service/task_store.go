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
);

-- M2 精读模式：段落节级持久化（断点续跑 / 单节重译）
CREATE TABLE IF NOT EXISTS sections (
	task_id         TEXT NOT NULL,
	chapter_id      TEXT NOT NULL,
	section_index   INTEGER NOT NULL,
	kind            TEXT NOT NULL DEFAULT '',
	block_start     INTEGER NOT NULL DEFAULT -1,
	block_end       INTEGER NOT NULL DEFAULT -1,
	source_html     TEXT NOT NULL DEFAULT '',
	translated_html TEXT NOT NULL DEFAULT '',
	summary         TEXT NOT NULL DEFAULT '',
	status          TEXT NOT NULL DEFAULT 'PENDING',
	retry_count     INTEGER NOT NULL DEFAULT 0,
	error_message   TEXT NOT NULL DEFAULT '',
	frozen          INTEGER NOT NULL DEFAULT 0,
	updated_at      TEXT NOT NULL,
	PRIMARY KEY (task_id, chapter_id, section_index)
);
CREATE INDEX IF NOT EXISTS idx_sections_task_chapter ON sections (task_id, chapter_id);

-- M2 精读模式：章节级记忆（摘要 + 冻结设定快照）
CREATE TABLE IF NOT EXISTS chapter_memory (
	task_id    TEXT NOT NULL,
	chapter_id TEXT NOT NULL,
	summary    TEXT NOT NULL DEFAULT '',
	snapshot   TEXT NOT NULL DEFAULT '',
	updated_at TEXT NOT NULL,
	PRIMARY KEY (task_id, chapter_id)
);

-- M2 精读模式：全局术语表（翻译中动态学习 + 人工确认）
CREATE TABLE IF NOT EXISTS glossary_terms (
	task_id            TEXT NOT NULL,
	source             TEXT NOT NULL,
	target             TEXT NOT NULL,
	type               TEXT NOT NULL DEFAULT '',
	confidence         REAL NOT NULL DEFAULT 0,
	note               TEXT NOT NULL DEFAULT '',
	status             TEXT NOT NULL DEFAULT 'NEW',
	first_seen_chapter TEXT NOT NULL DEFAULT '',
	updated_at         TEXT NOT NULL,
	PRIMARY KEY (task_id, source)
);
CREATE INDEX IF NOT EXISTS idx_glossary_terms_task_status ON glossary_terms (task_id, status);

-- M2 精读模式：全书剧情线（每章一条摘要）
CREATE TABLE IF NOT EXISTS book_plotline (
	task_id       TEXT NOT NULL,
	chapter_index INTEGER NOT NULL,
	chapter_id    TEXT NOT NULL DEFAULT '',
	title         TEXT NOT NULL DEFAULT '',
	summary       TEXT NOT NULL DEFAULT '',
	updated_at    TEXT NOT NULL,
	PRIMARY KEY (task_id, chapter_index)
);`
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("初始化表结构失败: %w", err)
	}
	if err := migrateSectionsColumns(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("迁移 sections 表失败: %w", err)
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

// ---------- M2 段落节（sections） ----------

// migrateSectionsColumns 为旧版 sections 表补充 M2.2 新增列（kind/block_start/block_end）
func migrateSectionsColumns(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(sections)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	cols := make(map[string]bool)
	for rows.Next() {
		var (
			cid       int
			name      string
			ctype     string
			notnull   int
			dfltValue any
			pk        int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			return err
		}
		cols[name] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}
	// 表不存在（schema 已建，此处仅防御）
	if len(cols) == 0 {
		return nil
	}
	for _, c := range []struct{ name, ddl string }{
		{"kind", `ALTER TABLE sections ADD COLUMN kind TEXT NOT NULL DEFAULT ''`},
		{"block_start", `ALTER TABLE sections ADD COLUMN block_start INTEGER NOT NULL DEFAULT -1`},
		{"block_end", `ALTER TABLE sections ADD COLUMN block_end INTEGER NOT NULL DEFAULT -1`},
	} {
		if !cols[c.name] {
			if _, err := db.Exec(c.ddl); err != nil {
				return fmt.Errorf("添加列 %s 失败: %w", c.name, err)
			}
		}
	}
	return nil
}

// SaveSection 保存（或更新）单个段落节
func (s *TaskStore) SaveSection(sec *model.Section) error {
	if sec == nil {
		return fmt.Errorf("段落节不能为空")
	}
	if sec.TaskID == "" || sec.ChapterID == "" {
		return fmt.Errorf("段落节缺少 task_id 或 chapter_id")
	}
	_, err := s.db.Exec(`
INSERT INTO sections (task_id, chapter_id, section_index, kind, block_start, block_end, source_html, translated_html, summary, status, retry_count, error_message, frozen, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(task_id, chapter_id, section_index) DO UPDATE SET
	kind = excluded.kind,
	block_start = excluded.block_start,
	block_end = excluded.block_end,
	source_html = excluded.source_html,
	translated_html = excluded.translated_html,
	summary = excluded.summary,
	status = excluded.status,
	retry_count = excluded.retry_count,
	error_message = excluded.error_message,
	frozen = excluded.frozen,
	updated_at = excluded.updated_at`,
		sec.TaskID, sec.ChapterID, sec.Index, sec.Kind, sec.BlockStart, sec.BlockEnd,
		sec.SourceHTML, sec.TranslatedHTML, sec.Summary,
		string(sec.Status), sec.RetryCount, sec.ErrorMessage, boolToInt(sec.Frozen),
		sec.UpdatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("保存段落节失败: %w", err)
	}
	return nil
}

// SaveSections 批量保存章节的全部段落节（事务原子写，用于切分后的节计划初始化）
func (s *TaskStore) SaveSections(taskID, chapterID string, sections []*model.Section) error {
	if len(sections) == 0 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
INSERT INTO sections (task_id, chapter_id, section_index, kind, block_start, block_end, source_html, translated_html, summary, status, retry_count, error_message, frozen, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(task_id, chapter_id, section_index) DO UPDATE SET
	kind = excluded.kind,
	block_start = excluded.block_start,
	block_end = excluded.block_end,
	source_html = excluded.source_html,
	translated_html = excluded.translated_html,
	summary = excluded.summary,
	status = excluded.status,
	retry_count = excluded.retry_count,
	error_message = excluded.error_message,
	frozen = excluded.frozen,
	updated_at = excluded.updated_at`)
	if err != nil {
		return fmt.Errorf("预编译段落节写入失败: %w", err)
	}
	defer stmt.Close()

	for _, sec := range sections {
		if sec == nil {
			continue
		}
		if _, err := stmt.Exec(taskID, chapterID, sec.Index, sec.Kind, sec.BlockStart, sec.BlockEnd,
			sec.SourceHTML, sec.TranslatedHTML, sec.Summary, string(sec.Status), sec.RetryCount,
			sec.ErrorMessage, boolToInt(sec.Frozen), sec.UpdatedAt.Format(time.RFC3339)); err != nil {
			return fmt.Errorf("写入段落节 %d 失败: %w", sec.Index, err)
		}
	}
	return tx.Commit()
}

// GetSection 获取单个段落节；不存在返回 (nil, nil)
func (s *TaskStore) GetSection(taskID, chapterID string, index int) (*model.Section, error) {
	var sec model.Section
	row := s.db.QueryRow(`
SELECT task_id, chapter_id, section_index, kind, block_start, block_end, source_html, translated_html, summary, status, retry_count, error_message, frozen, updated_at
FROM sections WHERE task_id = ? AND chapter_id = ? AND section_index = ?`,
		taskID, chapterID, index)
	if err := scanSection(row, &sec); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("查询段落节失败: %w", err)
	}
	return &sec, nil
}

// ListSections 按章节顺序列出全部段落节
func (s *TaskStore) ListSections(taskID, chapterID string) ([]*model.Section, error) {
	rows, err := s.db.Query(`
SELECT task_id, chapter_id, section_index, kind, block_start, block_end, source_html, translated_html, summary, status, retry_count, error_message, frozen, updated_at
FROM sections WHERE task_id = ? AND chapter_id = ? ORDER BY section_index ASC`,
		taskID, chapterID)
	if err != nil {
		return nil, fmt.Errorf("查询段落节列表失败: %w", err)
	}
	defer rows.Close()

	var sections []*model.Section
	for rows.Next() {
		var sec model.Section
		if err := scanSection(rows, &sec); err != nil {
			return nil, err
		}
		sections = append(sections, &sec)
	}
	return sections, rows.Err()
}

// SectionProgress 统计章节的节总数与已翻译节数
func (s *TaskStore) SectionProgress(taskID, chapterID string) (total, done int, err error) {
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM sections WHERE task_id = ? AND chapter_id = ?`,
		taskID, chapterID).Scan(&total); err != nil {
		return 0, 0, fmt.Errorf("统计节总数失败: %w", err)
	}
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM sections WHERE task_id = ? AND chapter_id = ? AND status = ?`,
		taskID, chapterID, string(model.SectionStatusTranslated)).Scan(&done); err != nil {
		return 0, 0, fmt.Errorf("统计已翻译节数失败: %w", err)
	}
	return total, done, nil
}

// ---------- M2 章节记忆（chapter_memory） ----------

// SaveChapterMemory 保存（或更新）章节级记忆（摘要 + 冻结快照）
func (s *TaskStore) SaveChapterMemory(m *model.ChapterMemory) error {
	if m == nil || m.TaskID == "" || m.ChapterID == "" {
		return fmt.Errorf("章节记忆缺少 task_id 或 chapter_id")
	}
	_, err := s.db.Exec(`
INSERT INTO chapter_memory (task_id, chapter_id, summary, snapshot, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(task_id, chapter_id) DO UPDATE SET
	summary = excluded.summary,
	snapshot = excluded.snapshot,
	updated_at = excluded.updated_at`,
		m.TaskID, m.ChapterID, m.Summary, m.Snapshot, m.UpdatedAt.Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("保存章节记忆失败: %w", err)
	}
	return nil
}

// GetChapterMemory 获取章节级记忆；不存在返回 (nil, nil)
func (s *TaskStore) GetChapterMemory(taskID, chapterID string) (*model.ChapterMemory, error) {
	var m model.ChapterMemory
	var updatedAt string
	row := s.db.QueryRow(
		`SELECT task_id, chapter_id, summary, snapshot, updated_at FROM chapter_memory WHERE task_id = ? AND chapter_id = ?`,
		taskID, chapterID)
	if err := row.Scan(&m.TaskID, &m.ChapterID, &m.Summary, &m.Snapshot, &updatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("查询章节记忆失败: %w", err)
	}
	if t, err := parseTime(updatedAt); err == nil {
		m.UpdatedAt = t
	}
	return &m, nil
}

// ---------- M2 全局术语表（glossary_terms） ----------

// SaveGlossaryTerm 保存（或更新）单个术语条目（同 task+source 去重）
func (s *TaskStore) SaveGlossaryTerm(t *model.GlossaryTerm) error {
	if t == nil || t.TaskID == "" || t.Source == "" || t.Target == "" {
		return fmt.Errorf("术语条目缺少 task_id/source/target")
	}
	_, err := s.db.Exec(`
INSERT INTO glossary_terms (task_id, source, target, type, confidence, note, status, first_seen_chapter, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(task_id, source) DO UPDATE SET
	target = excluded.target,
	type = excluded.type,
	confidence = excluded.confidence,
	note = excluded.note,
	status = excluded.status,
	first_seen_chapter = excluded.first_seen_chapter,
	updated_at = excluded.updated_at`,
		t.TaskID, t.Source, t.Target, t.Type, t.Confidence, t.Note, string(t.Status),
		t.FirstSeenChapter, t.UpdatedAt.Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("保存术语条目失败: %w", err)
	}
	return nil
}

// ConfirmGlossaryTerm 人工确认术语译名（设为 CONFIRMED）
func (s *TaskStore) ConfirmGlossaryTerm(taskID, source, target string) error {
	_, err := s.db.Exec(`
INSERT INTO glossary_terms (task_id, source, target, status, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(task_id, source) DO UPDATE SET
	target = excluded.target,
	status = 'CONFIRMED',
	updated_at = excluded.updated_at`,
		taskID, source, target, string(model.TermStatusConfirmed), time.Now().Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("确认术语条目失败: %w", err)
	}
	return nil
}

// ListGlossaryTerms 列出任务全部术语（NEW 优先，便于侧栏提示新增）
func (s *TaskStore) ListGlossaryTerms(taskID string) ([]*model.GlossaryTerm, error) {
	rows, err := s.db.Query(`
SELECT task_id, source, target, type, confidence, note, status, first_seen_chapter, updated_at
FROM glossary_terms WHERE task_id = ? ORDER BY status = 'CONFIRMED' ASC, updated_at DESC`,
		taskID)
	if err != nil {
		return nil, fmt.Errorf("查询术语表失败: %w", err)
	}
	defer rows.Close()

	var terms []*model.GlossaryTerm
	for rows.Next() {
		var t model.GlossaryTerm
		if err := scanGlossaryTerm(rows, &t); err != nil {
			return nil, err
		}
		terms = append(terms, &t)
	}
	return terms, rows.Err()
}

// ---------- M2 全书剧情线（book_plotline） ----------

// AppendPlotline 追加/更新某章的剧情线条目（按 chapter_index upsert）
func (s *TaskStore) AppendPlotline(e *model.PlotlineEntry) error {
	if e == nil || e.TaskID == "" {
		return fmt.Errorf("剧情线条目缺少 task_id")
	}
	_, err := s.db.Exec(`
INSERT INTO book_plotline (task_id, chapter_index, chapter_id, title, summary, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(task_id, chapter_index) DO UPDATE SET
	chapter_id = excluded.chapter_id,
	title = excluded.title,
	summary = excluded.summary,
	updated_at = excluded.updated_at`,
		e.TaskID, e.ChapterIndex, e.ChapterID, e.Title, e.Summary, e.UpdatedAt.Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("保存剧情线条目失败: %w", err)
	}
	return nil
}

// GetPlotline 按章序返回全书剧情线
func (s *TaskStore) GetPlotline(taskID string) ([]*model.PlotlineEntry, error) {
	rows, err := s.db.Query(`
SELECT task_id, chapter_index, chapter_id, title, summary, updated_at
FROM book_plotline WHERE task_id = ? ORDER BY chapter_index ASC`, taskID)
	if err != nil {
		return nil, fmt.Errorf("查询剧情线失败: %w", err)
	}
	defer rows.Close()

	var entries []*model.PlotlineEntry
	for rows.Next() {
		var e model.PlotlineEntry
		var updatedAt string
		if err := rows.Scan(&e.TaskID, &e.ChapterIndex, &e.ChapterID, &e.Title, &e.Summary, &updatedAt); err != nil {
			return nil, err
		}
		if t, err := parseTime(updatedAt); err == nil {
			e.UpdatedAt = t
		}
		entries = append(entries, &e)
	}
	return entries, rows.Err()
}

// ---------- 行扫描辅助 ----------

type sectionScanner interface {
	Scan(dest ...any) error
}

func scanSection(row sectionScanner, sec *model.Section) error {
	var status, updatedAt string
	var frozen int
	err := row.Scan(&sec.TaskID, &sec.ChapterID, &sec.Index, &sec.Kind, &sec.BlockStart, &sec.BlockEnd,
		&sec.SourceHTML, &sec.TranslatedHTML, &sec.Summary, &status, &sec.RetryCount,
		&sec.ErrorMessage, &frozen, &updatedAt)
	if err != nil {
		return err
	}
	sec.Status = model.SectionStatus(status)
	sec.Frozen = intToBool(frozen)
	if t, err := parseTime(updatedAt); err == nil {
		sec.UpdatedAt = t
	}
	return nil
}

func scanGlossaryTerm(row sectionScanner, t *model.GlossaryTerm) error {
	var status, updatedAt string
	err := row.Scan(&t.TaskID, &t.Source, &t.Target, &t.Type, &t.Confidence, &t.Note, &status, &t.FirstSeenChapter, &updatedAt)
	if err != nil {
		return err
	}
	t.Status = model.TermStatus(status)
	if ts, err := parseTime(updatedAt); err == nil {
		t.UpdatedAt = ts
	}
	return nil
}

func parseTime(s string) (time.Time, error) {
	return time.Parse(time.RFC3339, s)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func intToBool(i int) bool {
	return i != 0
}
