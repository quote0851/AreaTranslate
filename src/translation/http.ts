// 带超时的 fetch 封装，将网络错误与超时映射为 TranslationError

import { TranslationError } from './types'

const DEFAULT_TIMEOUT_MS = 10000

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new TranslationError('TIMEOUT', '翻译请求超时，请稍后重试')
    }
    throw new TranslationError('NETWORK_ERROR', '网络错误，请检查网络连接')
  } finally {
    clearTimeout(timer)
  }
}
