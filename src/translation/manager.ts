// 翻译管理器：按配置选择 Provider，负责分段与整体翻译流程。

import type { TranslationConfig } from '../storage/config'
import { segmentText } from './segment'
import type {
  TranslationProvider,
  TranslationRequest,
} from './types'
import { MyMemoryProvider } from './providers/mymemory'
import { LibreTranslateProvider } from './providers/libretranslate'

export function createProvider(config: TranslationConfig): TranslationProvider {
  if (config.provider === 'libretranslate') {
    return new LibreTranslateProvider(
      config.libreTranslateUrl,
      config.libreTranslateApiKey,
    )
  }
  return new MyMemoryProvider()
}

export async function translate(
  request: TranslationRequest,
  config: TranslationConfig,
): Promise<string> {
  const provider = createProvider(config)
  const chunks = segmentText(request.text)
  const results: string[] = []
  for (const chunk of chunks) {
    results.push(await provider.translate({ ...request, text: chunk }))
  }
  return results.join(' ')
}
