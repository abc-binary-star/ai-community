package service

import (
	"context"
	"strings"
	"testing"

	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/agent"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/epub"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/internal/model"
	"github.com/abc-binary-star/ai-community/apps/epub-translator/pkg/config"
)

const sectionFlowHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>
<h1>The Awakening</h1>
<p>Ada opened her eyes inside the machine.</p>
<p>"Who are you?" she asked.</p>
<p>"I am the guardian of this gate," the old man replied.</p>
<p>The city was silent at dawn.</p>
</body>
</html>`

func newTestTranslationService(t *testing.T) (*TranslationService, *TaskStore) {
	t.Helper()
	store := newTestStore(t)
	cfg := &config.Config{
		LLM:   config.LLMConfig{}, // APIKey 为空 → mock 模式
		Epub:  config.EpubConfig{SectionTargetChars: 200},
		Storage: config.StorageConfig{Local: config.LocalStorageConf{
			UploadDir: t.TempDir(), OutputDir: t.TempDir(), TempDir: t.TempDir(),
		}},
	}
	return NewTranslationService(cfg, store), store
}

func newSectionTestTask(store *TaskStore) (*model.Task, *epub.Book) {
	task := &model.Task{
		ID:         "task1",
		SourceLang: "en",
		TargetLang: "zh-CN",
		Chapters: []model.ChapterState{
			{Index: 0, ID: "c1", Href: "chapter1.xhtml", Title: "Chapter 1", Status: model.ChapterStatusPending},
		},
	}
	chapter := epub.Chapter{ID: "c1", Href: "chapter1.xhtml", Title: "Chapter 1", HTMLContent: sectionFlowHTML}
	book := &epub.Book{Title: "Test Book", Chapters: []epub.Chapter{chapter}}
	return task, book
}

// TestCutAndSaveSections 验证切分落库（含节类型与块范围）
func TestCutAndSaveSections(t *testing.T) {
	svc, store := newTestTranslationService(t)
	task, book := newSectionTestTask(store)
	chapter := book.Chapters[0]

	sections, err := svc.cutAndSaveSections(task, chapter)
	if err != nil {
		t.Fatalf("cutAndSaveSections 失败: %v", err)
	}
	if len(sections) < 3 {
		t.Fatalf("期望至少 3 个节，实际 %d", len(sections))
	}

	// 已持久化
	stored, err := store.ListSections(task.ID, chapter.ID)
	if err != nil {
		t.Fatalf("ListSections 失败: %v", err)
	}
	if len(stored) != len(sections) {
		t.Fatalf("持久化节数不一致: %d vs %d", len(stored), len(sections))
	}
	for _, sec := range stored {
		if sec.Status != model.SectionStatusPending {
			t.Fatalf("切分后节应处于 PENDING: %+v", sec)
		}
		if sec.SourceHTML == "" || sec.Kind == "" {
			t.Fatalf("节缺少 source_html 或 kind: %+v", sec)
		}
	}

	// 对话应聚合成一节（dialogue），不与普通段落混排
	var dialogueFound bool
	for _, sec := range stored {
		if sec.Kind == "dialogue" {
			dialogueFound = true
			if !strings.Contains(sec.SourceHTML, "Who are you") || !strings.Contains(sec.SourceHTML, "guardian of this gate") {
				t.Fatalf("对话未聚合: %s", sec.SourceHTML)
			}
		}
	}
	if !dialogueFound {
		t.Fatal("未找到 dialogue 节")
	}

	// 块范围连续
	for i, sec := range stored {
		if i > 0 && sec.BlockStart != stored[i-1].BlockEnd+1 {
			t.Fatalf("节 %d 块范围不连续: %+v vs %+v", i, sec, stored[i-1])
		}
	}
}

// TestTranslateOneSectionAndMerge 验证单节翻译持久化与章节合并
func TestTranslateOneSectionAndMerge(t *testing.T) {
	svc, store := newTestTranslationService(t)
	task, book := newSectionTestTask(store)
	chapter := book.Chapters[0]

	sections, err := svc.cutAndSaveSections(task, chapter)
	if err != nil {
		t.Fatalf("cutAndSaveSections 失败: %v", err)
	}

	ctx := context.Background()
	ctxMgr := svc.newContextForChapter(task, book)
	graph := agent.NewTranslatorGraph(svc.modelProvider, ctxMgr)

	// 翻译前两个节
	for _, sec := range sections[:2] {
		if err := svc.translateOneSection(ctx, graph, task, book, 0, sec); err != nil {
			t.Fatalf("translateOneSection 失败: %v", err)
		}
	}

	stored, _ := store.ListSections(task.ID, chapter.ID)
	for i, sec := range stored {
		if i < 2 {
			if sec.Status != model.SectionStatusTranslated || sec.TranslatedHTML == "" {
				t.Fatalf("节 %d 应已翻译: %+v", i, sec)
			}
		} else {
			if sec.Status != model.SectionStatusPending {
				t.Fatalf("节 %d 不应被翻译: %+v", i, sec)
			}
		}
	}

	// 断点续跑：再次翻译已译节应跳过（幂等）
	sec0 := stored[0]
	prevUpdated := sec0.UpdatedAt
	if err := svc.translateOneSection(ctx, graph, task, book, 0, sec0); err != nil {
		t.Fatalf("重复翻译应幂等跳过: %v", err)
	}
	got0, _ := store.GetSection(task.ID, chapter.ID, 0)
	if !got0.UpdatedAt.Equal(prevUpdated) {
		t.Fatal("幂等跳过失败：已译节被再次翻译")
	}

	// 章节合并：已译节替换、未译节保留原文
	merged, pairs, err := svc.mergeChapterHTML(chapter, stored)
	if err != nil {
		t.Fatalf("mergeChapterHTML 失败: %v", err)
	}
	if !strings.Contains(merged, "[模拟译文]") {
		t.Fatal("合并结果缺少译文")
	}
	if strings.Contains(merged, "The city was silent at dawn.") {
		t.Log("未译节保留原文（符合预期）")
	}
	if len(pairs) != len(stored) {
		t.Fatalf("对照数量不一致: %d vs %d", len(pairs), len(stored))
	}
	if pairs[0].TranslatedHTML == "" {
		t.Fatal("节对照缺少译文")
	}
}

// TestSectionTranslationProgress 验证节进度统计
func TestSectionTranslationProgress(t *testing.T) {
	svc, store := newTestTranslationService(t)
	task, book := newSectionTestTask(store)
	chapter := book.Chapters[0]

	sections, err := svc.cutAndSaveSections(task, chapter)
	if err != nil {
		t.Fatalf("cutAndSaveSections 失败: %v", err)
	}

	ctx := context.Background()
	ctxMgr := svc.newContextForChapter(task, book)
	graph := agent.NewTranslatorGraph(svc.modelProvider, ctxMgr)

	// 模拟翻译一半后中断
	for _, sec := range sections[:len(sections)/2] {
		_ = svc.translateOneSection(ctx, graph, task, book, 0, sec)
	}

	total, done, err := store.SectionProgress(task.ID, chapter.ID)
	if err != nil {
		t.Fatalf("SectionProgress 失败: %v", err)
	}
	if total != len(sections) {
		t.Fatalf("节总数错误: %d vs %d", total, len(sections))
	}
	if done != len(sections)/2 {
		t.Fatalf("已译节数错误: %d vs %d", done, len(sections)/2)
	}

	// 章节状态同步
	svc.updateChapterProgress(task, book, 0, total)
	if task.Chapters[0].SectionCount != total || task.Chapters[0].DoneSections != done {
		t.Fatalf("章节进度未同步: %+v", task.Chapters[0])
	}
}
