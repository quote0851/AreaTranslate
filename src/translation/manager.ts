// 翻译管理器：按配置选择 Provider，负责分段、整体翻译与免费服务兜底。

import type { TranslationConfig, TranslationProviderId } from '../storage/config'
import { segmentText } from './segment'
import {
  TranslationError,
  type TranslationProvider,
  type TranslationRequest,
} from './types'
import { MyMemoryProvider } from './providers/mymemory'
import { LibreTranslateProvider } from './providers/libretranslate'
import { BingProvider } from './providers/bing'

// 额度用尽的服务短期跳过，避免每个分段都先撞一次限流
const QUOTA_COOLDOWN = 10 * 60 * 1000
const disabledUntil = new Map<string, number>()

export function createProvider(
  config: TranslationConfig,
  id: TranslationProviderId = config.provider,
): TranslationProvider {
  if (id === 'libretranslate') {
    return new LibreTranslateProvider(
      config.libreTranslateUrl,
      config.libreTranslateApiKey,
    )
  }
  if (id === 'bing') {
    return new BingProvider()
  }
  return new MyMemoryProvider()
}

// 必应与 MyMemory 都是公开免费服务，可互相兜底；
// 自建的 LibreTranslate 不做兜底，避免把文本悄悄发给第三方。
function buildChain(config: TranslationConfig): TranslationProviderId[] {
  if (config.provider === 'libretranslate') {
    return ['libretranslate']
  }
  return config.provider === 'bing' ? ['bing', 'mymemory'] : ['mymemory', 'bing']
}

export async function translate(
  request: TranslationRequest,
  config: TranslationConfig,
): Promise<string> {
  const chain = buildChain(config)
  const chunks = segmentText(request.text)
  const results: string[] = []

  for (const chunk of chunks) {
    results.push(await translateChunk({ ...request, text: chunk }, config, chain))
  }
  return results.join(' ')
}

async function translateChunk(
  request: TranslationRequest,
  config: TranslationConfig,
  chain: TranslationProviderId[],
): Promise<string> {
  let lastError: unknown = null
  for (const id of chain) {
    const until = disabledUntil.get(id) ?? 0
    if (until > Date.now()) {
      continue
    }
    try {
      return await createProvider(config, id).translate(request)
    } catch (err) {
      lastError = err
      if (err instanceof TranslationError && err.code === 'QUOTA_EXCEEDED') {
        disabledUntil.set(id, Date.now() + QUOTA_COOLDOWN)
      }
    }
  }
  throw lastError ?? new TranslationError('API_ERROR', '翻译失败')
}
