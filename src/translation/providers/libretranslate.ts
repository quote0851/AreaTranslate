// LibreTranslate 翻译服务（支持用户自建服务地址与可选 API Key）

import { fetchWithTimeout } from '../http'
import {
  TranslationError,
  type TranslationProvider,
  type TranslationRequest,
} from '../types'

export class LibreTranslateProvider implements TranslationProvider {
  readonly id = 'libretranslate'

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async translate(request: TranslationRequest): Promise<string> {
    if (!this.baseUrl) {
      throw new TranslationError('API_ERROR', '未配置 LibreTranslate 服务地址')
    }

    const url = `${this.baseUrl.replace(/\/+$/, '')}/translate`
    const body: Record<string, string> = {
      q: request.text,
      source: request.sourceLang,
      target: request.targetLang,
      format: 'text',
    }
    if (this.apiKey) {
      body.api_key = this.apiKey
    }

    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      if (resp.status === 403) {
        throw new TranslationError('API_ERROR', 'LibreTranslate API Key 无效或无权限')
      }
      throw new TranslationError('API_ERROR', `LibreTranslate 接口异常（HTTP ${resp.status}）`)
    }

    let data: unknown
    try {
      data = await resp.json()
    } catch {
      throw new TranslationError('API_ERROR', 'LibreTranslate 返回数据解析失败')
    }

    const translatedText = (data as { translatedText?: string })?.translatedText?.trim() ?? ''
    if (!translatedText) {
      throw new TranslationError('EMPTY_RESULT', '翻译结果为空')
    }
    return translatedText
  }
}
