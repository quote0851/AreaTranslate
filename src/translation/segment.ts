// 超长文本分段：免费翻译接口对单次请求长度有限制，需按句切分。

export const MAX_CHUNK_LENGTH = 450

export function segmentText(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  if (text.length <= maxLength) return [text]

  const sentences = text.split(/(?<=[.!?。！？])\s+/)
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const part = sentence.trim()
    if (!part) continue
    if (current && (current + ' ' + part).length > maxLength) {
      chunks.push(current)
      current = part
    } else {
      current = current ? `${current} ${part}` : part
    }
  }

  if (current) chunks.push(current)
  return chunks.length ? chunks : [text]
}
