package service

import (
	"bytes"
	"encoding/json"

	"github.com/abc-binary-star/ai-community/server-go/internal/types"
)

const (
	maxPostContentDocBytes = 2 << 20
	maxPostContentDocDepth = 64
	maxPostContentDocNodes = 20000
)

type postContentNode struct {
	Type    string            `json:"type"`
	Text    *string           `json:"text,omitempty"`
	Content []json.RawMessage `json:"content,omitempty"`
	Marks   []json.RawMessage `json:"marks,omitempty"`
	Attrs   json.RawMessage   `json:"attrs,omitempty"`
}

// validateUpdatePostInputPair 处理与“内容是否成对”相关的前置校验，不依赖数据库连接。
// 规则：
//   - 若传入 contentDoc 但未传入 content（缺少 Markdown 投影），直接拒绝。
func validateUpdatePostInputPair(req types.UpdatePostReq) error {
	if req.ContentDoc != nil && req.Content == nil {
		return ErrPostInvalidInput
	}
	return nil
}

// validateCreatePostInputPair 处理 CreatePost 入口与 contentDocEnabled 相关的前置校验，不依赖数据库连接。
// 规则：
//   - 若 contentDocEnabled=true（显式或默认），必须成对传入 contentDoc。
//   - 若传入 contentDoc，则必须满足 validatePostContentDoc。
func validateCreatePostInputPair(req types.CreatePostReq) error {
	docEnabled := true
	if req.ContentDocEnabled != nil {
		docEnabled = *req.ContentDocEnabled
	}
	if docEnabled && req.ContentDoc == nil {
		return ErrPostInvalidInput
	}
	if req.ContentDoc != nil {
		return validatePostContentDoc(req.ContentDoc)
	}
	return nil
}

func validatePostContentDoc(raw json.RawMessage) error {
	if len(raw) == 0 || len(raw) > maxPostContentDocBytes || !json.Valid(raw) {
		return ErrPostInvalidInput
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var root postContentNode
	if err := dec.Decode(&root); err != nil || root.Type != "doc" || root.Content == nil || root.Text != nil || len(root.Marks) > 0 || len(root.Attrs) > 0 {
		return ErrPostInvalidInput
	}
	nodes := 1
	for _, child := range root.Content {
		if err := validatePostContentNode(child, 1, &nodes); err != nil {
			return err
		}
	}
	return nil
}

func validatePostContentNode(raw json.RawMessage, depth int, nodes *int) error {
	if depth > maxPostContentDocDepth || *nodes >= maxPostContentDocNodes {
		return ErrPostInvalidInput
	}
	*nodes++
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var node postContentNode
	if err := dec.Decode(&node); err != nil || node.Type == "" {
		return ErrPostInvalidInput
	}
	if node.Type == "doc" {
		return ErrPostInvalidInput
	}
	if node.Type == "text" {
		if node.Text == nil || len(node.Content) > 0 || len(node.Attrs) > 0 {
			return ErrPostInvalidInput
		}
	} else if node.Text != nil {
		return ErrPostInvalidInput
	}
	if len(node.Attrs) > 0 && !isJSONObject(node.Attrs) {
		return ErrPostInvalidInput
	}
	for _, markRaw := range node.Marks {
		dec := json.NewDecoder(bytes.NewReader(markRaw))
		dec.DisallowUnknownFields()
		var mark struct {
			Type  string          `json:"type"`
			Attrs json.RawMessage `json:"attrs,omitempty"`
		}
		if err := dec.Decode(&mark); err != nil || mark.Type == "" || len(mark.Attrs) > 0 && !isJSONObject(mark.Attrs) {
			return ErrPostInvalidInput
		}
	}
	for _, child := range node.Content {
		if err := validatePostContentNode(child, depth+1, nodes); err != nil {
			return err
		}
	}
	return nil
}

func isJSONObject(raw json.RawMessage) bool {
	var value map[string]interface{}
	return json.Unmarshal(raw, &value) == nil && value != nil
}
