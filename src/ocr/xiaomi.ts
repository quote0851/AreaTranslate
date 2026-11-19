// 小米 OCR 0（Xiaomi-OCR-0）在线识别：调用官方 HuggingFace Space 的 Gradio 接口。
// 接口流程：POST /gradio_api/call/recognize 拿到 event_id，再 GET 事件流读取识别结果。

import type { OcrTextResult } from './engine'

const SPACE_ORIGIN = 'https://loongwayx-xiaomi-ocr-0-demo.hf.space'
const RECOGNIZE_API = `${SPACE_ORIGIN}/gradio_api/call/recognize`
const MAX_TOKENS = 2048
const START_TIMEOUT = 30_000
const RESULT_TIMEOUT = 120_000

interface RecognizePayload {
  task: 'document'
  mode: 'page'
  image_base64: string
  max_tokens: number
}

interface XiaomiFrame {
  type: 'delta' | 'done' | 'error' | 'progress' | 'page_done' | 'page_result'
  content?: string
  text?: string
  error?: string
}

export async function recognizeWithXiaomi(
  dataUrl: string,
): Promise<OcrTextResult> {
  const eventId = await startRecognize(dataUrl)
  const content = await readResult(eventId)
  return { text: toPlainText(content), confidence: 100 }
}

async function startRecognize(dataUrl: string): Promise<string> {
  const payload: RecognizePayload = {
    task: 'document',
    mode: 'page',
    image_base64: dataUrl,
    max_tokens: MAX_TOKENS,
  }

  const res = await fetchWithTimeout(
    RECOGNIZE_API,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [JSON.stringify(payload)] }),
    },
    START_TIMEOUT,
  )
  if (!res.ok) {
    throw new Error(`小米 OCR 请求失败（HTTP ${res.status}）`)
  }
  const data = (await res.json()) as { event_id?: string }
  if (!data.event_id) {
    throw new Error('小米 OCR 未返回任务 ID')
  }
  return data.event_id
}

async function readResult(eventId: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${RECOGNIZE_API}/${eventId}`,
    { method: 'GET', headers: { Accept: 'text/event-stream' } },
    RESULT_TIMEOUT,
  )
  if (!res.ok) {
    throw new Error(`小米 OCR 读取结果失败（HTTP ${res.status}）`)
  }

  const frames = parseFrames(await res.text())
  const failure = frames.find((f) => f.type === 'error')
  if (failure) {
    throw new Error(failure.error || '小米 OCR 识别失败')
  }

  const done = [...frames].reverse().find((f) => f.type === 'done')
  const content = done?.content ?? ''
  if (!content.trim()) {
    throw new Error('小米 OCR 未识别到文本')
  }
  return content
}

// 解析 Gradio SSE：每个事件由 "event: xxx" 与 "data: [...]" 组成。
// data 是「字符串数组」，第一个元素是承载业务 JSON 的字符串。
function parseFrames(body: string): XiaomiFrame[] {
  const frames: XiaomiFrame[] = []
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const raw = line.slice(5).trim()
    if (!raw || raw === 'null') continue
    try {
      const parsed: unknown = JSON.parse(raw)
      const first = Array.isArray(parsed) ? parsed[0] : parsed
      if (typeof first !== 'string') continue
      frames.push(JSON.parse(first) as XiaomiFrame)
    } catch {
      // 忽略无法解析的心跳帧
    }
  }
  return frames
}

// 把模型输出的 markdown 精简为适合展示与翻译的纯文本
function toPlainText(markdown: string): string {
  return markdown
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>\s*/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error('小米 OCR 请求超时，请重试或切换到本地识别')
    }
    throw new Error(`小米 OCR 网络异常：${String(err)}`)
  } finally {
    clearTimeout(timer)
  }
}
