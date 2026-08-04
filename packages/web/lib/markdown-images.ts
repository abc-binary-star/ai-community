// 反引号字符，用 charCode 生成，避免在源码里直接出现反引号
// （含反引号的字符串/正则在部分编译链路下会被误当作模板字符串处理）
const BT = String.fromCharCode(96)

// 图片扩展名判断：B站的 xxx.png@1192w.webp、贴吧的 xxx.jpg?tbpicau=... 都要能命中
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?)([?)@]|$)/i

// 检测文本中是否含 markdown 图片语法：标准 ![](url) 或 B站专栏的 BT 包裹 url
export function hasMdImage(text: string): boolean {
  if (/!\[[^\]]*\]\(\s*https?:\/\//i.test(text)) return true
  const marker = '!' + BT
  let idx = text.indexOf(marker)
  while (idx !== -1) {
    if (/^\s*https?:\/\//i.test(text.slice(idx + 2))) return true
    idx = text.indexOf(marker, idx + 1)
  }
  return false
}

// 把粘贴文本里的图片语法统一为标准 ![图片](url)：
// B站专栏复制出来是 BT 包裹 url 的纯文本（无 img 标签、无剪贴板文件项），贴吧是 ![](url)。
// 只处理 http(s) 图片链接，其它内容原样保留
export function normalizeMdImages(text: string): string {
  let out = text.replace(/!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g, (whole, url: string) => {
    const u = url.trim()
    return IMG_EXT.test(u) ? `![图片](${u})` : whole
  })

  const marker = '!' + BT
  const parts = out.split(marker)
  if (parts.length > 1) {
    out = parts
      .map((part, i) => {
        if (i === 0) return part
        const closingIdx = part.indexOf(BT)
        if (closingIdx === -1) return marker + part
        const url = part.slice(0, closingIdx).trim()
        const rest = part.slice(closingIdx + 1)
        if (/^https?:\/\//i.test(url)) return `![图片](${url})${rest}`
        return marker + part
      })
      .join('')
  }
  return out
}

// 提取 markdown 里所有外站 http(s) 图片地址（去重，保持出现顺序）。
// 本站已转存的地址（相对路径 /uploads 或本站域名）与 blob:/data: 不在其列
export function extractExternalImageUrls(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const re = /!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const url = m[1].trim()
    if (seen.has(url)) continue
    // 同源地址无需转存
    if (typeof window !== 'undefined' && url.startsWith(window.location.origin)) continue
    seen.add(url)
    found.push(url)
  }
  return found
}
