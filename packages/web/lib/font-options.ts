// 编辑器全文字体选项（免费可商用字体，SIL OFL / 免费商用授权）
// key 作为帖子持久化标识，family 为 next/font 注入的 CSS 变量
export interface FontOption {
  key: string
  name: string
  family: string
  hint: string
}

export const FONT_OPTIONS: FontOption[] = [
  { key: 'default', name: '默认字体', family: 'var(--font-sans)', hint: '界面默认' },
  { key: 'noto-serif', name: '思源宋体', family: 'var(--font-noto-serif)', hint: '衬线体' },
  { key: 'smiley', name: '得意黑', family: 'var(--font-smiley)', hint: '展示标题' },
  { key: 'zcool', name: '站酷快乐体', family: 'var(--font-zcool)', hint: '圆润活泼' },
]

// 根据持久化的 key 解析出字体 family；未匹配或为空时返回默认字体
export function fontFamily(key?: string): string {
  const opt = FONT_OPTIONS.find((o) => o.key === key)
  return opt ? opt.family : FONT_OPTIONS[0].family
}