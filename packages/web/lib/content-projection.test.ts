import assert from 'node:assert/strict'
import test from 'node:test'
import type { JSONContent } from '@tiptap/core'
import {
  contentDocText,
  countContentImages,
  markdownToTiptapDoc,
  normalizeContentDoc,
  protectMarkdownForRewrite,
  replaceContentImageSources,
  tiptapDocToMarkdown,
} from './content-projection'

const document: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '结构化写作' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '支持' },
        { type: 'text', text: '粗体', marks: [{ type: 'bold' }] },
        { type: 'text', text: '、' },
        { type: 'text', text: '链接', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        { type: 'text', text: '和图片。' },
      ],
    },
    { type: 'image', attrs: { src: 'blob:local-image', alt: '示例图' } },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '完成投影' }] }],
        },
      ],
    },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const ok = true' }] },
  ],
}

test('Tiptap JSON 投影为稳定 Markdown', () => {
  assert.equal(
    tiptapDocToMarkdown(document),
    '## 结构化写作\n\n支持**粗体**、[链接](https://example.com)和图片。\n\n![示例图](blob:local-image)\n\n- [x] 完成投影\n\n```ts\nconst ok = true\n```',
  )
})

test('Markdown 可回填为 Tiptap JSON 并保留核心结构', () => {
  const markdown = '# 标题\n\n正文 **加粗**。\n\n- [ ] 待办\n\n![图片](https://example.com/a.png)'
  const doc = markdownToTiptapDoc(markdown)
  assert.equal(doc.type, 'doc')
  assert.match(tiptapDocToMarkdown(doc), /^# 标题/m)
  assert.match(tiptapDocToMarkdown(doc), /\*\*加粗\*\*/)
  assert.equal(countContentImages(doc), 1)
})

test('已有 JSON 优先，旧 Markdown 作为兼容回填', () => {
  assert.equal(normalizeContentDoc(document, '# 旧内容'), document)
  assert.equal(contentDocText(normalizeContentDoc(null, '# 旧内容')), '旧内容')
})

test('图片地址替换保持输入文档不可变', () => {
  const replaced = replaceContentImageSources(document, new Map([['blob:local-image', 'https://cdn.example.com/image.jpg']]))
  assert.equal(countContentImages(replaced), 1)
  assert.match(tiptapDocToMarkdown(replaced), /https:\/\/cdn\.example\.com\/image\.jpg/)
  assert.match(tiptapDocToMarkdown(document), /blob:local-image/)
})

test('全文润色保护图片、链接、代码和分隔线', () => {
  const markdown = '正文 [链接](https://example.com/a) 和 `inline()`\n\n![图片](blob:local)\n\n```ts\nconst ok = true\n```\n\n---'
  const protectedRewrite = protectMarkdownForRewrite(markdown)
  assert.doesNotMatch(protectedRewrite.markdown, /blob:local|example\.com|const ok/)
  assert.equal(protectedRewrite.restore(`润色后 ${protectedRewrite.markdown}`), `润色后 ${markdown}`)
})

test('全文润色候选缺少受保护结构时拒绝应用', () => {
  const protectedRewrite = protectMarkdownForRewrite('正文\n\n![图片](blob:local)')
  assert.throws(() => protectedRewrite.restore('只剩正文'), /未完整保留/)
  assert.throws(() => protectedRewrite.restore(`${protectedRewrite.markdown}\n\n${protectedRewrite.markdown}`), /未完整保留/)
})
