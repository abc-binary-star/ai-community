package service

import "testing"

func TestParseEnrichResult_标准JSON(t *testing.T) {
	text := `{"titles":["标题一","标题二","标题三"],"summary":"这是一段摘要文本内容","tags":["技术","后端"]}`

	got := parseEnrichResult(text, "")
	if got == nil {
		t.Fatal("标准 JSON 应解析成功")
	}
	if len(got.Titles) != 3 {
		t.Errorf("期望 3 个标题，实际 %d", len(got.Titles))
	}
	if got.Summary != "这是一段摘要文本内容" {
		t.Errorf("摘要解析错误：%q", got.Summary)
	}
	if len(got.Tags) != 2 {
		t.Errorf("期望 2 个标签，实际 %d", len(got.Tags))
	}
}

func TestParseEnrichResult_带代码块围栏(t *testing.T) {
	text := "```json\n" + `{"titles":["甲标题","乙标题","丙标题"],"summary":"摘要内容在这里","tags":["设计"]}` + "\n```"

	got := parseEnrichResult(text, "")
	if got == nil {
		t.Fatal("带围栏的 JSON 应能解析（一级去围栏后成功）")
	}
	if len(got.Titles) != 3 {
		t.Errorf("期望 3 个标题，实际 %d", len(got.Titles))
	}
}

func TestParseEnrichResult_夹带前言后语(t *testing.T) {
	// 二级降级：正则抠出 JSON 片段
	text := `好的，根据你的内容我生成了以下结果：
{"titles":["甲标题","乙标题","丙标题"],"summary":"这是摘要正文","tags":["游戏","攻略"]}
希望对你有帮助！`

	got := parseEnrichResult(text, "")
	if got == nil {
		t.Fatal("夹带前言后语时应由二级降级救回")
	}
	if got.Summary != "这是摘要正文" {
		t.Errorf("摘要解析错误：%q", got.Summary)
	}
}

func TestParseEnrichResult_完全不按JSON输出(t *testing.T) {
	// 三级降级：按行提取
	text := `标题：如何优化缓存命中率
标题：缓存踩坑记录
标题：聊聊缓存那些事
摘要：本文记录了一次线上缓存问题的完整排查过程
标签：技术,后端,数据库`

	got := parseEnrichResult(text, "")
	if got == nil {
		t.Fatal("按行格式应由三级降级解析成功")
	}
	if len(got.Titles) != 3 {
		t.Errorf("期望 3 个标题，实际 %d: %v", len(got.Titles), got.Titles)
	}
	if got.Summary == "" {
		t.Error("摘要不应为空")
	}
	if len(got.Tags) != 3 {
		t.Errorf("期望 3 个标签，实际 %d: %v", len(got.Tags), got.Tags)
	}
}

func TestParseEnrichResult_彻底无法解析(t *testing.T) {
	text := "抱歉，我无法完成这个请求。"
	if got := parseEnrichResult(text, ""); got != nil {
		t.Errorf("无法解析的内容应返回 nil，实际 %+v", got)
	}
}

func TestParseEnrichResult_单项模式只需对应字段(t *testing.T) {
	// only=title 时，只要拿到 titles 就算成功
	text := `{"titles":["甲标题","乙标题","丙标题"]}`
	if got := parseEnrichResult(text, "title"); got == nil {
		t.Error("only=title 且含 titles 时应解析成功")
	}
	// only=summary 但只给了 titles，应失败
	if got := parseEnrichResult(text, "summary"); got != nil {
		t.Error("only=summary 但无 summary 字段时应返回 nil")
	}
}

func TestParseEnrichResult_三项模式至少两项(t *testing.T) {
	// 只有一项时判为失败，交给降级补齐
	only1 := `{"titles":["甲标题","乙标题","丙标题"]}`
	if got := parseEnrichResult(only1, ""); got != nil {
		t.Error("三项模式下只拿到一项应返回 nil，走降级补齐")
	}
	// 两项时通过
	only2 := `{"titles":["甲标题","乙标题","丙标题"],"summary":"摘要内容"}`
	if got := parseEnrichResult(only2, ""); got == nil {
		t.Error("三项模式下拿到两项应算成功")
	}
}

func TestCleanTitles_去序号与引号(t *testing.T) {
	in := []string{"1. 第一个标题", "2、第二个标题", `"第三个标题"`, "x", ""}
	got := cleanTitles(in)

	want := []string{"第一个标题", "第二个标题", "第三个标题"}
	if len(got) != len(want) {
		t.Fatalf("期望 %d 个标题，实际 %d: %v", len(want), len(got), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("第 %d 个标题：期望 %q，实际 %q", i+1, want[i], got[i])
		}
	}
}

func TestCleanTags_去重与去井号(t *testing.T) {
	in := []string{"#技术", "技术", " 后端 ", "", "这个标签名字实在是太长了超过二十个字符所以应该被过滤掉"}
	got := cleanTags(in)

	if len(got) != 2 {
		t.Fatalf("期望 2 个标签（去重去长），实际 %d: %v", len(got), got)
	}
	if got[0] != "技术" || got[1] != "后端" {
		t.Errorf("标签清洗结果错误：%v", got)
	}
}

func TestCleanTags_上限5个(t *testing.T) {
	in := []string{"一", "二", "三", "四", "五", "六", "七"}
	if got := cleanTags(in); len(got) != 5 {
		t.Errorf("标签应截至 5 个，实际 %d", len(got))
	}
}
