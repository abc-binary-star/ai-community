export interface EmblemSpec {
  key: string
  name: string
}

/** 队伍彩虹徽章（CSS/SVG 渲染，纯矢量无需图片素材） */
export const EMBLEMS: EmblemSpec[] = [
  { key: 'rainbow-crest-1', name: '赤虹徽章' },
  { key: 'rainbow-crest-2', name: '橙光徽章' },
  { key: 'rainbow-crest-3', name: '金晖徽章' },
  { key: 'rainbow-crest-4', name: '青叶徽章' },
  { key: 'rainbow-crest-5', name: '湛蓝徽章' },
  { key: 'rainbow-crest-6', name: '紫霞徽章' },
]

export function emblemByKey(key?: string | null): EmblemSpec {
  return EMBLEMS.find((e) => e.key === key) ?? EMBLEMS[0]
}

/** 徽章 key 中的序号（rainbow-crest-N） */
export function emblemOrder(key?: string | null): number {
  if (!key) return 0
  const m = /rainbow-crest-(\d+)/.exec(key)
  return m ? Number(m[1]) : 0
}