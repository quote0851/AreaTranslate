// MyMemory 免费翻译服务（默认 Provider）

import { fetchWithTimeout } from '../http'
import {
  TranslationError,
  type TranslationProvider,
  type TranslationRequest,
} from '../types'

const ENDPOINT = 'https://api.mymemory.translated.net/get'

export class MyMemoryProvider implements TranslationProvider {
  readonly id = 'mymemory'

  async translate(request: TranslationRequest): Promise<string> {
    const url = new URL(ENDPOINT)
    const source = request.sourceLang === 'auto' ? 'Autodetect' : request.sourceLang
    url.searchParams.set('q', request.text)
    url.searchParams.set('langpair', `${source}|${request.targetLang}`)

    const resp = await fetchWithTimeout(url.toString())

    let data: unknown
    try {
      data = await resp.json()
    } catch {
      throw new TranslationError('API_ERROR', 'MyMemory 返回数据解析失败')
    }

    const body = data as {
      responseStatus?: number
      responseData?: { translatedText?: string }
    }

    if (body.responseStatus !== 200) {
      if (body.responseStatus === 429) {
        throw new TranslationError(
          'QUOTA_EXCEEDED',
          'MyMemory 免费额度已用尽（429）',
        )
      }
      throw new TranslationError('API_ERROR', `MyMemory 接口异常（${body.responseStatus}）`)
    }

    const translatedText = body.responseData?.translatedText?.trim() ?? ''
    if (!translatedText) {
      throw new TranslationError('EMPTY_RESULT', '翻译结果为空')
    }
    // MyMemory 匿名免费额度用尽时会在译文里返回警告
    if (/MYMEMORY WARNING/i.test(translatedText)) {
      throw new TranslationError('QUOTA_EXCEEDED', 'MyMemory 免费额度已用尽')
    }

    return translatedText
  }
}
