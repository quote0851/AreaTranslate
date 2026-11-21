// 小米 OCR 0 本地识别：调用本机 llama.cpp 的 llama-server（OpenAI 兼容接口）。
// 模型与启动方式见设置页提示；服务默认监听 http://127.0.0.1:8099。

import type { OcrTextResult } from './engine'
import { toPlainText } from './xiaomi'

const DEFAULT_BASE_URL = 'http://127.0.0.1:8099'
const MAX_TOKENS = 768
const REQUEST_TIMEOUT = 60_000

// 只要原文，不要解释或 markdown 结构：后续还要交给翻译
const PROMPT =
  'Transcribe all visible text in the image exactly as it appears, preserving reading order. ' +
  'Output only the recognized text, without any explanation, markdown formatting, or translation.'

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
}

export async function recognizeWithLocalOcr(
  dataUrl: string,
  baseUrl: string,
): Promise<OcrTextResult> {
  const base = normalizeBaseUrl(baseUrl)
  const body = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0,
    stream: false,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    let res: Response
    try {
      res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error('本地 OCR 识别超时，请重试')
      }
      throw new Error(
        `无法连接本地 OCR 服务（${base}），请确认 llama-server 已启动并监听该端口`,
      )
    }

    if (!res.ok) {
      throw new Error(`本地 OCR 服务返回 HTTP ${res.status}`)
    }

    const data = (await res.json()) as ChatCompletionResponse
    const text = toPlainText(data.choices?.[0]?.message?.content ?? '')
    if (!text) {
      throw new Error('本地 OCR 未识别到文本')
    }
    return { text, confidence: 100 }
  } finally {
    clearTimeout(timer)
  }
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '')
  return trimmed || DEFAULT_BASE_URL
}
