export type PolishStyleKey = 'natural' | 'formal' | 'casual' | 'friendly'

export interface PolishStyleOption {
  key: PolishStyleKey
  label: string
  hint: string
}

export const POLISH_STYLES: PolishStyleOption[] = [
  { key: 'natural', label: '简洁自然', hint: '默认风格，通顺流畅' },
  { key: 'formal', label: '正式严谨', hint: '适合公告、通知类' },
  { key: 'casual', label: '口语轻松', hint: '适合日常分享、吐槽' },
  { key: 'friendly', label: '亲和友好', hint: '适合交流、求助帖' },
]

export function polishStyleLabel(key: PolishStyleKey): string {
  return POLISH_STYLES.find((s) => s.key === key)?.label ?? '简洁自然'
}
