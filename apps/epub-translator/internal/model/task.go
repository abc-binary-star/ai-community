package model

import "time"

// TaskStatus 翻译任务状态
type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "PENDING"
	TaskStatusQueued     TaskStatus = "QUEUED"
	TaskStatusParsing    TaskStatus = "PARSING"
	TaskStatusReady      TaskStatus = "READY" // 已解析，等待按章翻译
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

// ChapterStatus 章节翻译状态
type ChapterStatus string

const (
	ChapterStatusPending    ChapterStatus = "PENDING"    // 未翻译
	ChapterStatusTranslating ChapterStatus = "TRANSLATING" // 翻译中
	ChapterStatusTranslated ChapterStatus = "TRANSLATED"  // 已翻译
	ChapterStatusReviewed   ChapterStatus = "REVIEWED"    // 已审核
)

// SectionStatus 段落节翻译状态
type SectionStatus string

const (
	SectionStatusPending     SectionStatus = "PENDING"     // 未翻译
	SectionStatusTranslating SectionStatus = "TRANSLATING" // 翻译中
	SectionStatusTranslated  SectionStatus = "TRANSLATED"  // 已翻译
	SectionStatusFailed      SectionStatus = "FAILED"      // 翻译失败（可重译）
)

// TermStatus 全局术语条目状态
type TermStatus string

const (
	TermStatusNew       TermStatus = "NEW"       // 翻译中动态学习，待人工确认
	TermStatusConfirmed TermStatus = "CONFIRMED" // 已人工确认，后续翻译强制遵守
)

// ChunkPair 单块翻译的原文/译文对照（阅读器"点击段落看原文"用）
type ChunkPair struct {
	SourceHTML     string `json:"source_html,omitempty"`
	TranslatedHTML string `json:"translated_html,omitempty"`
}

// ChapterState 章节状态（书籍工作台 / 按章翻译）
type ChapterState struct {
	Index          int           `json:"index"`
	ID             string        `json:"id"`
	Href           string        `json:"href"`
	Title          string        `json:"title"`
	Kind           string        `json:"kind,omitempty"` // cover/titlepage/colophon/toc/""（正文）
	Status         ChapterStatus `json:"status"`
	TranslatedHTML string        `json:"translated_html,omitempty"` // 翻译后的 HTML
	ChunkPairs     []ChunkPair   `json:"chunk_pairs,omitempty"`     // 块级对照（原文↔译文）
	SectionCount   int           `json:"section_count,omitempty"`   // 段落节总数（M2 精读模式）
	DoneSections   int           `json:"done_sections,omitempty"`   // 已翻译节数（M2 断点续跑）
	Summary        string        `json:"summary,omitempty"`         // 本章摘要（M2 剧情记忆）
	Snapshot       string        `json:"snapshot,omitempty"`        // 章节冻结设定快照（M2 冻结上下文）
}

// Section 段落节（M2 精读翻译的最小翻译单元）
// 每节以语义段落聚合（默认约 500 字），逐节翻译并持久化，支撑断点续跑与单节重译
type Section struct {
	TaskID         string        `json:"task_id"`
	ChapterID      string        `json:"chapter_id"`
	Index          int           `json:"index"` // 章节内节序号，从 0 开始
	SourceHTML     string        `json:"source_html"`
	TranslatedHTML string        `json:"translated_html,omitempty"`
	Summary        string        `json:"summary,omitempty"` // 本节剧情摘要
	Status         SectionStatus `json:"status"`
	RetryCount     int           `json:"retry_count"`
	ErrorMessage   string        `json:"error_message,omitempty"`
	Frozen         bool          `json:"frozen,omitempty"` // 是否在章节冻结上下文中翻译
	UpdatedAt      time.Time     `json:"updated_at"`
}

// ChapterMemory 章节级记忆（M2 冻结上下文）：摘要 + 设定快照
type ChapterMemory struct {
	TaskID    string    `json:"task_id"`
	ChapterID string    `json:"chapter_id"`
	Summary   string    `json:"summary,omitempty"`  // 本章剧情摘要
	Snapshot  string    `json:"snapshot,omitempty"` // 设定快照（人物现状/地点/已提名词）
	UpdatedAt time.Time `json:"updated_at"`
}

// GlossaryTerm 全局术语条目（M2 翻译中动态学习 + 人工确认）
type GlossaryTerm struct {
	TaskID           string     `json:"task_id"`
	Source           string     `json:"source"`
	Target           string     `json:"target"`
	Type             string     `json:"type,omitempty"` // person/place/org/brand/term
	Confidence       float64    `json:"confidence,omitempty"`
	Note             string     `json:"note,omitempty"`
	Status           TermStatus `json:"status"`
	FirstSeenChapter string     `json:"first_seen_chapter,omitempty"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// PlotlineEntry 全书剧情线条目（每章一条，按章序排列）
type PlotlineEntry struct {
	TaskID       string    `json:"task_id"`
	ChapterIndex int       `json:"chapter_index"`
	ChapterID    string    `json:"chapter_id,omitempty"`
	Title        string    `json:"title,omitempty"`
	Summary      string    `json:"summary"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Task 翻译任务
type Task struct {
	ID            string     `json:"id"`
	FileName      string     `json:"file_name"`
	BookTitle     string     `json:"book_title"`
	BookAuthor    string     `json:"book_author"`
	SourceLang    string     `json:"source_lang"`
	TargetLang    string     `json:"target_lang"`
	Model         string     `json:"model"`
	UploadPath    string     `json:"upload_path,omitempty"` // 上传文件路径（持久化用，API 响应当中不返回）
	OutputPath    string     `json:"output_path,omitempty"`
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
	Chapters      []ChapterState `json:"chapters,omitempty"`      // 章节状态（按章翻译）
	FrontMatterDone bool     `json:"front_matter_done"`           // 前置页汉化是否完成
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
