// 必应翻译（免费网页接口）：无需申请密钥，国内可直连。
// 先取翻译页下发的防滥用参数，再调用 ttranslatev3 接口。

import { fetchWithTimeout } from '../http'
import {
  TranslationError,
  type TranslationProvider,
  type TranslationRequest,
} from '../types'

const PAGE_URL = 'https://cn.bing.com/translator'
const ENDPOINT = 'https://cn.bing.com/ttranslatev3'
// 页面参数有时效，缓存半小时后重新获取
const TOKEN_TTL = 30 * 60 * 1000

interface BingToken {
  key: string
  ts: string
  ig: string
  fetchedAt: number
}

interface BingResponse {
  translations?: Array<{ text?: string }>
  errorMessage?: string
}

let cachedToken: BingToken | null = null
let requestSeq = 0

const LANG_MAP: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'zh-HK': 'zh-Hant',
  auto: 'auto-detect',
}

export class BingProvider implements TranslationProvider {
  readonly id = 'bing'

  async translate(request: TranslationRequest): Promise<string> {
    const text = request.text.trim()
    if (!text) return ''

    try {
      return await this.request(text, request, false)
    } catch (err) {
      // 页面参数过期时刷新一次再试
      if (err instanceof TranslationError && err.code === 'API_ERROR') {
        return this.request(text, request, true)
      }
      throw err
    }
  }

  private async request(
    text: string,
    request: TranslationRequest,
    refreshToken: boolean,
  ): Promise<string> {
    const token = await getToken(refreshToken)
    const body = new URLSearchParams({
      fromLang: LANG_MAP[request.sourceLang] ?? request.sourceLang,
      to: LANG_MAP[request.targetLang] ?? request.targetLang,
      text,
      token: token.key,
      key: token.ts,
    })
    const url =
      `${ENDPOINT}?isVertical=1&&IG=${encodeURIComponent(token.ig)}` +
      `&IID=translator.5028.${++requestSeq}`

    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    let data: BingResponse | BingResponse[]
    try {
      data = (await resp.json()) as BingResponse | BingResponse[]
    } catch {
      throw new TranslationError('API_ERROR', '必应翻译返回数据解析失败')
    }

    if (!Array.isArray(data)) {
      throw new TranslationError(
        'API_ERROR',
        `必应翻译接口异常（${data.errorMessage ?? resp.status}）`,
      )
    }

    const translated = data[0]?.translations?.[0]?.text?.trim() ?? ''
    if (!translated) {
      throw new TranslationError('EMPTY_RESULT', '翻译结果为空')
    }
    return translated
  }
}

async function getToken(force: boolean): Promise<BingToken> {
  if (
    !force &&
    cachedToken &&
    Date.now() - cachedToken.fetchedAt < TOKEN_TTL
  ) {
    return cachedToken
  }

  const resp = await fetchWithTimeout(PAGE_URL)
  if (!resp.ok) {
    throw new TranslationError(
      'API_ERROR',
      `必应翻译页面加载失败（${resp.status}）`,
    )
  }

  const html = await resp.text()
  const params = html.match(
    /params_AbusePreventionHelper\s*=\s*\[\s*(\d+)\s*,\s*"([^"]+)"/,
  )
  const ig = html.match(/IG:"([^"]+)"/)
  if (!params || !ig) {
    throw new TranslationError('API_ERROR', '必应翻译参数解析失败')
  }

  cachedToken = {
    ts: params[1],
    key: params[2],
    ig: ig[1],
    fetchedAt: Date.now(),
  }
  return cachedToken
}
