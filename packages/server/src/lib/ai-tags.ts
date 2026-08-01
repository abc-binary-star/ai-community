// DeepSeek AI 标签推荐服务

const API_KEY = process.env.DEEPSEEK_API_KEY
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

/**
 * 调用 DeepSeek 大模型，根据帖子标题和内容推荐 3-5 个标签
 */
export async function suggestTags(title: string, content: string): Promise<string[]> {
  if (!API_KEY) {
    throw new Error('DEEPSEEK_API_KEY 未配置')
  }

  // 截断过长内容，避免超出 token 限制
  const truncatedContent = content.slice(0, 2000)
  const truncatedTitle = title.slice(0, 200)

  const systemPrompt = `你是一个社区分类标签助手。根据帖子标题和内容，为其分配 2-5 个分类标签，让帖子能被归到合适的类别下方便检索。

要求：
1. 标签是分类名称，不是内容关键词或人名
2. 每个标签 2-6 个字
3. 不要加 # 号或引号
4. 只返回标签，用逗号分隔
5. 无论内容长短，必须返回至少 2 个分类标签

分类参考：技术（前端、后端、AI、移动端、数据库、运维）、游戏（手游、端游、主机、攻略、赛事）、设计（UI、UX、平面、插画）、生活（美食、旅行、健身、宠物）、文化（文学、历史、电影、音乐、读书）、职场（求职、面试、副业、管理）、学术（数学、物理、论文）、其他

例如：
- "王者荣耀嫦娥攻略" → "手游,攻略,游戏"
- "鲁迅与狂人日记" → "文学,读书,文化"
- "React Server Components 实战" → "前端,技术,React"
- "周末去大理旅游攻略" → "旅行,生活,攻略"`

  const userPrompt = `标题：${truncatedTitle}\n内容：${truncatedContent}`

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('DeepSeek API 错误:', res.status, errText)
    throw new Error(`AI 服务请求失败 (${res.status})`)
  }

  const data: any = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''

  // 解析返回的逗号分隔标签
  const tags = text
    .split(/[,，、\s\n]+/)
    .map((t) => t.trim().replace(/^#+/, ''))
    .filter((t) => t.length > 0 && t.length <= 20)
    .slice(0, 5)

  return tags
}
