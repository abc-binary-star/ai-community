package service

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/model"
)

func newTestStore(t *testing.T) *TaskStore {
	t.Helper()
	store, err := NewTaskStore(filepath.Join(t.TempDir(), "translator.db"))
	if err != nil {
		t.Fatalf("NewTaskStore 失败: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestTaskStoreSaveAndGetSection(t *testing.T) {
	store := newTestStore(t)
	now := time.Now()

	sec := &model.Section{
		TaskID:     "t1",
		ChapterID:  "c1",
		Index:      0,
		SourceHTML: "<p>Ada opened her eyes.</p>",
		Status:     model.SectionStatusPending,
		UpdatedAt:  now,
	}
	if err := store.SaveSection(sec); err != nil {
		t.Fatalf("SaveSection 失败: %v", err)
	}

	got, err := store.GetSection("t1", "c1", 0)
	if err != nil {
		t.Fatalf("GetSection 失败: %v", err)
	}
	if got == nil {
		t.Fatal("GetSection 返回空")
	}
	if got.SourceHTML != sec.SourceHTML || got.Status != model.SectionStatusPending {
		t.Fatalf("段落节字段不一致: %+v", got)
	}
	// 存储使用 RFC3339（秒级精度），比较时截断
	if !got.UpdatedAt.Equal(now.Truncate(time.Second)) {
		t.Fatalf("updated_at 不一致: %v vs %v", got.UpdatedAt, now)
	}

	// 不存在的节返回 (nil, nil)
	missing, err := store.GetSection("t1", "c1", 99)
	if err != nil {
		t.Fatalf("GetSection(missing) 失败: %v", err)
	}
	if missing != nil {
		t.Fatal("不存在的段落节应返回 nil")
	}
}

func TestTaskStoreSectionUpsertKeepsSingleRow(t *testing.T) {
	store := newTestStore(t)
	sec := &model.Section{
		TaskID:    "t1",
		ChapterID: "c1",
		Index:     1,
		Status:    model.SectionStatusPending,
		UpdatedAt: time.Now(),
	}
	if err := store.SaveSection(sec); err != nil {
		t.Fatalf("SaveSection 失败: %v", err)
	}

	// 模拟翻译完成后的写回：同主键更新
	sec.Status = model.SectionStatusTranslated
	sec.TranslatedHTML = "<p>艾达睁开了双眼。</p>"
	sec.Summary = "主角苏醒"
	sec.RetryCount = 1
	sec.Frozen = true
	if err := store.SaveSection(sec); err != nil {
		t.Fatalf("SaveSection(update) 失败: %v", err)
	}

	list, err := store.ListSections("t1", "c1")
	if err != nil {
		t.Fatalf("ListSections 失败: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("更新后应仍只有 1 条，实际 %d", len(list))
	}
	got := list[0]
	if got.Status != model.SectionStatusTranslated || got.TranslatedHTML == "" || got.Summary == "" {
		t.Fatalf("更新字段未生效: %+v", got)
	}
	if !got.Frozen {
		t.Fatal("frozen 应已置为 true")
	}
}

func TestTaskStoreSaveSectionsAndProgress(t *testing.T) {
	store := newTestStore(t)
	sections := make([]*model.Section, 3)
	for i := range sections {
		sections[i] = &model.Section{
			TaskID:    "t1",
			ChapterID: "c2",
			Index:     i,
			Status:    model.SectionStatusPending,
			UpdatedAt: time.Now(),
		}
	}
	if err := store.SaveSections("t1", "c2", sections); err != nil {
		t.Fatalf("SaveSections 失败: %v", err)
	}

	// 前两节标记完成
	for i := 0; i < 2; i++ {
		sec, _ := store.GetSection("t1", "c2", i)
		sec.Status = model.SectionStatusTranslated
		if err := store.SaveSection(sec); err != nil {
			t.Fatalf("更新节 %d 失败: %v", i, err)
		}
	}

	total, done, err := store.SectionProgress("t1", "c2")
	if err != nil {
		t.Fatalf("SectionProgress 失败: %v", err)
	}
	if total != 3 || done != 2 {
		t.Fatalf("进度统计错误: total=%d done=%d", total, done)
	}

	// 按章序号升序
	list, err := store.ListSections("t1", "c2")
	if err != nil {
		t.Fatalf("ListSections 失败: %v", err)
	}
	for i, sec := range list {
		if sec.Index != i {
			t.Fatalf("章节顺序错误: list[%d].Index=%d", i, sec.Index)
		}
	}
}

func TestTaskStoreChapterMemory(t *testing.T) {
	store := newTestStore(t)
	m := &model.ChapterMemory{
		TaskID:    "t1",
		ChapterID: "c1",
		Summary:   "第一章摘要",
		Snapshot:  "人物：艾达；地点：孤儿院",
		UpdatedAt: time.Now(),
	}
	if err := store.SaveChapterMemory(m); err != nil {
		t.Fatalf("SaveChapterMemory 失败: %v", err)
	}

	got, err := store.GetChapterMemory("t1", "c1")
	if err != nil {
		t.Fatalf("GetChapterMemory 失败: %v", err)
	}
	if got == nil || got.Summary != m.Summary || got.Snapshot != m.Snapshot {
		t.Fatalf("章节记忆不一致: %+v", got)
	}

	// 更新摘要（upsert）
	m.Summary = "更新后的摘要"
	if err := store.SaveChapterMemory(m); err != nil {
		t.Fatalf("SaveChapterMemory(update) 失败: %v", err)
	}
	got, _ = store.GetChapterMemory("t1", "c1")
	if got.Summary != "更新后的摘要" {
		t.Fatalf("章节记忆未更新: %+v", got)
	}

	missing, err := store.GetChapterMemory("t1", "cX")
	if err != nil || missing != nil {
		t.Fatalf("不存在的章节记忆应返回 nil: %v %v", missing, err)
	}
}

func TestTaskStoreGlossaryTerms(t *testing.T) {
	store := newTestStore(t)

	// 翻译中动态学习的新术语
	if err := store.SaveGlossaryTerm(&model.GlossaryTerm{
		TaskID:           "t1",
		Source:           "Ada",
		Target:           "艾达",
		Type:             "person",
		Confidence:       0.9,
		Status:           model.TermStatusNew,
		FirstSeenChapter: "c1",
		UpdatedAt:        time.Now(),
	}); err != nil {
		t.Fatalf("SaveGlossaryTerm 失败: %v", err)
	}

	// 同 source 再次出现不应重复，且覆盖建议译名
	if err := store.SaveGlossaryTerm(&model.GlossaryTerm{
		TaskID:           "t1",
		Source:           "Ada",
		Target:           "阿达",
		Type:             "person",
		Status:           model.TermStatusNew,
		FirstSeenChapter: "c1",
		UpdatedAt:        time.Now(),
	}); err != nil {
		t.Fatalf("SaveGlossaryTerm(upsert) 失败: %v", err)
	}

	// 人工确认后状态流转为 CONFIRMED
	if err := store.ConfirmGlossaryTerm("t1", "Ada", "艾达"); err != nil {
		t.Fatalf("ConfirmGlossaryTerm 失败: %v", err)
	}

	terms, err := store.ListGlossaryTerms("t1")
	if err != nil {
		t.Fatalf("ListGlossaryTerms 失败: %v", err)
	}
	if len(terms) != 1 {
		t.Fatalf("术语应去重为 1 条，实际 %d", len(terms))
	}
	got := terms[0]
	if got.Status != model.TermStatusConfirmed || got.Target != "艾达" {
		t.Fatalf("术语确认未生效: %+v", got)
	}
}

func TestTaskStorePlotline(t *testing.T) {
	store := newTestStore(t)
	now := time.Now()

	if err := store.AppendPlotline(&model.PlotlineEntry{TaskID: "t1", ChapterIndex: 1, ChapterID: "c2", Title: "第二章", Summary: "B", UpdatedAt: now}); err != nil {
		t.Fatalf("AppendPlotline 失败: %v", err)
	}
	if err := store.AppendPlotline(&model.PlotlineEntry{TaskID: "t1", ChapterIndex: 0, ChapterID: "c1", Title: "第一章", Summary: "A", UpdatedAt: now}); err != nil {
		t.Fatalf("AppendPlotline 失败: %v", err)
	}
	// 第二章重译后更新摘要（upsert 保持位置）
	if err := store.AppendPlotline(&model.PlotlineEntry{TaskID: "t1", ChapterIndex: 1, ChapterID: "c2", Title: "第二章", Summary: "B2", UpdatedAt: now}); err != nil {
		t.Fatalf("AppendPlotline(update) 失败: %v", err)
	}

	entries, err := store.GetPlotline("t1")
	if err != nil {
		t.Fatalf("GetPlotline 失败: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("剧情线应 2 条，实际 %d", len(entries))
	}
	if entries[0].ChapterIndex != 0 || entries[0].Summary != "A" {
		t.Fatalf("剧情线顺序/内容错误: %+v", entries[0])
	}
	if entries[1].ChapterIndex != 1 || entries[1].Summary != "B2" {
		t.Fatalf("剧情线更新未生效: %+v", entries[1])
	}
}

// TestTaskStoreSectionsMigration 验证旧版 sections 表（无 M2.2 列）启动时自动迁移
func TestTaskStoreSectionsMigration(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "old.db")

	// 手工创建旧版 sections 表（缺少 kind/block_start/block_end）
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("打开旧库失败: %v", err)
	}
	oldSchema := `CREATE TABLE sections (
		task_id         TEXT NOT NULL,
		chapter_id      TEXT NOT NULL,
		section_index   INTEGER NOT NULL,
		source_html     TEXT NOT NULL DEFAULT '',
		translated_html TEXT NOT NULL DEFAULT '',
		summary         TEXT NOT NULL DEFAULT '',
		status          TEXT NOT NULL DEFAULT 'PENDING',
		retry_count     INTEGER NOT NULL DEFAULT 0,
		error_message   TEXT NOT NULL DEFAULT '',
		frozen          INTEGER NOT NULL DEFAULT 0,
		updated_at      TEXT NOT NULL,
		PRIMARY KEY (task_id, chapter_id, section_index)
	);`
	if _, err := db.Exec(oldSchema); err != nil {
		t.Fatalf("创建旧表失败: %v", err)
	}
	_ = db.Close()

	store, err := NewTaskStore(dbPath)
	if err != nil {
		t.Fatalf("NewTaskStore 迁移失败: %v", err)
	}
	defer store.Close()

	// 迁移后新字段可正常写入/读取
	sec := &model.Section{
		TaskID:     "t1",
		ChapterID:  "c1",
		Index:      0,
		Kind:       "quote",
		BlockStart: 2,
		BlockEnd:   3,
		SourceHTML: "<p>keep whole</p>",
		Status:     model.SectionStatusPending,
		UpdatedAt:  time.Now(),
	}
	if err := store.SaveSection(sec); err != nil {
		t.Fatalf("迁移后 SaveSection 失败: %v", err)
	}
	got, err := store.GetSection("t1", "c1", 0)
	if err != nil || got == nil {
		t.Fatalf("迁移后 GetSection 失败: %v %v", got, err)
	}
	if got.Kind != "quote" || got.BlockStart != 2 || got.BlockEnd != 3 {
		t.Fatalf("迁移后新字段未生效: %+v", got)
	}
}
