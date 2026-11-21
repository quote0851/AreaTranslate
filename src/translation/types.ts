// 翻译服务统一类型与接口

export interface TranslationRequest {
  text: string
  sourceLang: string
  targetLang: string
}

export type TranslationErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'API_ERROR'
  | 'EMPTY_RESULT'

export class TranslationError extends Error {
  constructor(
    public readonly code: TranslationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'TranslationError'
  }
}

export interface TranslationProvider {
  readonly id: string
  translate(request: TranslationRequest): Promise<string>
}

// 选区上下文：DOM 文本优先，OCR 兜底
export interface SelectionContext {
  source: 'dom' | 'ocr'
  sourceText: string
  pageTitle: string
  pageUrl: string
  nearbyText: string
  pageText: string
  ocrConfidence: number
}

export interface AiTranslationRequest extends TranslationRequest {
  context: SelectionContext | null
}
