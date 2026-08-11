package agent

import (
	"encoding/json"
	"testing"
)

func TestContextManagerPreservesGlossaryAndChapterContext(t *testing.T) {
	cm := NewContextManager()
	if got := cm.GetGlossaryJSON(); got != "" {
		t.Fatalf("空术语表应返回空字符串: %q", got)
	}

	cm.SetGlossary(map[string]string{
		`Ada\AI`:      `艾达\AI`,
		"quote\"term": "带\"引号",
		"line":        "第一行\n第二行",
	})
	var glossary map[string]string
	if err := json.Unmarshal([]byte(cm.GetGlossaryJSON()), &glossary); err != nil {
		t.Fatalf("术语表 JSON 无法解码: %v", err)
	}
	if glossary[`Ada\AI`] != `艾达\AI` || glossary["quote\"term"] != "带\"引号" || glossary["line"] != "第一行\n第二行" {
		t.Fatalf("术语表转义或内容错误: %#v", glossary)
	}

	cm.RegisterChapter("ch-2")
	cm.RegisterChapter("ch-1")
	cm.RegisterChapter("ch-2") // 重复注册不能改变顺序
	cm.AppendSummary("ch-2", "第二章首段")
	cm.AppendSummary("ch-2", "第二章后段")
	cm.AppendSummary("ch-1", "第一章摘要")

	if got := cm.GetSummary("ch-2"); got != "第二章首段 第二章后段" {
		t.Fatalf("章节摘要追加异常: %q", got)
	}
	if got := cm.GetAllSummaries("ch-2"); got != "第一章摘要" {
		t.Fatalf("跨章节摘要顺序或排除当前章节异常: %q", got)
	}
	if got := cm.GetAllSummaries("unknown"); got != "第二章首段 第二章后段 第一章摘要" {
		t.Fatalf("全部摘要顺序异常: %q", got)
	}
}
