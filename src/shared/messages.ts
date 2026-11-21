// 运行时消息类型定义（content / background / popup / options / offscreen 之间通信）

import type { ViewportRect, ViewportSize } from './geometry'
import type { OcrProviderId } from '../storage/config'
import type { SelectionContext } from '../translation/types'

export type RuntimeMessage =
  | { type: 'START_SELECTION' }
  | { type: 'CANCEL_SELECTION' }
  | { type: 'CAPTURE_REGION'; rect: ViewportRect; viewport: ViewportSize }
  | {
      type: 'OCR_IMAGE'
      dataUrl: string
      rect: ViewportRect
      viewport: ViewportSize
      ocrProvider: OcrProviderId
      localOcrUrl: string
    }
  | { type: 'TRANSLATE'; text: string }

// 截图 + OCR 的统一返回结果
export interface OcrResult {
  ok: boolean
  text?: string
  confidence?: number
  dataUrl?: string
  width?: number
  height?: number
  error?: string
}

// 翻译返回结果
export interface TranslateResult {
  ok: boolean
  translation?: string
  error?: string
  errorCode?: string
}

// AI 翻译端口消息：content/options 与 background 之间的流式协议
export type AiPortMessage =
  | {
      type: 'START'
      requestId: string
      text: string
      context: SelectionContext | null
    }
  | { type: 'ABORT'; requestId: string }
  | { type: 'DELTA'; requestId: string; text: string }
  | { type: 'DONE'; requestId: string; translation: string }
  | {
      type: 'ERROR'
      requestId: string
      error: string
      errorCode?: string
    }
