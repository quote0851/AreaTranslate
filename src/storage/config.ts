// 扩展配置与 chrome.storage.local 读写封装

export type TranslationProviderId = 'mymemory' | 'libretranslate'
export type OcrProviderId = 'xiaomi' | 'tesseract'

export interface TranslationConfig {
  sourceLang: string
  targetLang: string
  provider: TranslationProviderId
  libreTranslateUrl: string
  libreTranslateApiKey: string
  ocrProvider: OcrProviderId
}

export const DEFAULT_CONFIG: TranslationConfig = {
  sourceLang: 'en',
  targetLang: 'zh-CN',
  provider: 'mymemory',
  libreTranslateUrl: '',
  libreTranslateApiKey: '',
  ocrProvider: 'xiaomi',
}

const CONFIG_KEY = 'config'

export async function getConfig(): Promise<TranslationConfig> {
  const data = await chrome.storage.local.get(CONFIG_KEY)
  return { ...DEFAULT_CONFIG, ...(data[CONFIG_KEY] ?? {}) }
}

export async function setConfig(
  config: Partial<TranslationConfig>,
): Promise<void> {
  const current = await getConfig()
  await chrome.storage.local.set({ [CONFIG_KEY]: { ...current, ...config } })
}
