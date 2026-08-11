package model

import "time"

// TaskStatus 翻译任务状态
type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "PENDING"
	TaskStatusQueued     TaskStatus = "QUEUED"
	TaskStatusParsing    TaskStatus = "PARSING"
	TaskStatusTranslating TaskStatus = "TRANSLATING"
	TaskStatusAssembling TaskStatus = "ASSEMBLING"
	TaskStatusCompleted  TaskStatus = "COMPLETED"
	TaskStatusFailed     TaskStatus = "FAILED"
	TaskStatusCanceled   TaskStatus = "CANCELED"
)

// ChunkStatus 单个翻译块状态
type ChunkStatus string

const (
	ChunkStatusPending   ChunkStatus = "PENDING"
	ChunkStatusTranslating ChunkStatus = "TRANSLATING"
	ChunkStatusCompleted ChunkStatus = "COMPLETED"
	ChunkStatusFailed    ChunkStatus = "FAILED"
)

// Task 翻译任务
type Task struct {
	ID            string     `json:"id"`
	FileName      string     `json:"file_name"`
	BookTitle     string     `json:"book_title"`
	BookAuthor    string     `json:"book_author"`
	SourceLang    string     `json:"source_lang"`
	TargetLang    string     `json:"target_lang"`
	Model         string     `json:"model"`
	UploadPath    string     `json:"-"`
	OutputPath    string     `json:"-"`
	Status        TaskStatus `json:"status"`
	TotalChunks   int        `json:"total_chunks"`
	DoneChunks    int        `json:"done_chunks"`
	FailedChunks  int        `json:"failed_chunks"`
	ErrorMessage  string     `json:"error_message,omitempty"`
	GlossaryJSON  string     `json:"glossary,omitempty"`          // 已确认术语表 JSON
	GlossaryDraft string     `json:"glossary_draft,omitempty"`    // AI 抽取的候选术语 JSON
	GlossarySet   bool       `json:"glossary_set"`                // 术语表是否已确认
	Consistency   string     `json:"consistency_report,omitempty"` // 一致性报告 JSON
	QAReport      string     `json:"qa_report,omitempty"`         // QA 报告 JSON
	Accepted      bool       `json:"accepted"`                    // 是否通过 QA 验收
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
}

// Progress 返回百分比进度 0-100
func (t *Task) Progress() float64 {
	if t.TotalChunks == 0 {
		return 0
	}
	return float64(t.DoneChunks) / float64(t.TotalChunks) * 100
}

// Chunk 翻译分块
type Chunk struct {
	ID           string       `json:"id"`
	TaskID       string       `json:"task_id"`
	Index        int          `json:"index"`         // 在任务中的顺序
	ChapterID    string       `json:"chapter_id"`    // 所属章节 ID
	ChapterTitle string       `json:"chapter_title"` // 章节标题
	SourceText   string       `json:"source_text"`   // 原文 HTML 片段
	TargetText   string       `json:"target_text"`   // 译文 HTML 片段
	ContextLeft  string       `json:"context_left"`  // 前置上下文
	ContextRight string       `json:"context_right"` // 后置上下文
	Status       ChunkStatus  `json:"status"`
	RetryCount   int          `json:"retry_count"`
	ErrorMessage string       `json:"error_message,omitempty"`
	TokenCount   int          `json:"token_count"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}
