// 运行时消息类型定义（content / background / popup / options / offscreen 之间通信）

import type { ViewportRect, ViewportSize } from './geometry'
import type { OcrProviderId } from '../storage/config'

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
