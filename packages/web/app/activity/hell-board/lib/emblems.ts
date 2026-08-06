export interface EmblemSpec {
  key: string
  name: string
}

/** 队伍徽章（桌面 AI 素材 9 张，RPG 风格命名），图片位于 public/emblems/{key}.png */
export const EMBLEMS: EmblemSpec[] = [
  { key: 'werewolf', name: '赤月狼人' },
  { key: 'warrior', name: '铁血战神' },
  { key: 'mage', name: '奥术贤者' },
  { key: 'paladin', name: '圣光骑士' },
  { key: 'rogue', name: '暗影刺客' },
  { key: 'priest', name: '晨曦牧师' },
  { key: 'necromancer', name: '亡魂术师' },
  { key: 'druid', name: '古林德鲁伊' },
  { key: 'ranger', name: '猎风游侠' },
]

export function emblemByKey(key?: string | null): EmblemSpec {
  return EMBLEMS.find((e) => e.key === key) ?? EMBLEMS[0]
}
