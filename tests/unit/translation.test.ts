import { afterEach, describe, expect, it, vi } from 'vitest'
import { MyMemoryProvider } from '../../src/translation/providers/mymemory'
import { LibreTranslateProvider } from '../../src/translation/providers/libretranslate'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MyMemoryProvider', () => {
  it('正常返回译文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          responseStatus: 200,
          responseData: { translatedText: '你好世界' },
        }),
      }),
    )
    const provider = new MyMemoryProvider()
    const result = await provider.translate({
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'zh-CN',
    })
    expect(result).toBe('你好世界')
  })

  it('额度用尽时抛出 QUOTA_EXCEEDED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          responseStatus: 200,
          responseData: {
            translatedText: 'MYMEMORY WARNING: YOU USED ALL FREE TRANSLATIONS FOR TODAY',
          },
        }),
      }),
    )
    const provider = new MyMemoryProvider()
    await expect(
      provider.translate({ text: 'hello', sourceLang: 'en', targetLang: 'zh-CN' }),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
  })

  it('接口异常时抛出 API_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ responseStatus: 500, responseData: {} }),
      }),
    )
    const provider = new MyMemoryProvider()
    await expect(
      provider.translate({ text: 'hello', sourceLang: 'en', targetLang: 'zh-CN' }),
    ).rejects.toMatchObject({ code: 'API_ERROR' })
  })
})

describe('LibreTranslateProvider', () => {
  it('403 时抛出 API_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      }),
    )
    const provider = new LibreTranslateProvider('https://example.com', '')
    await expect(
      provider.translate({ text: 'hello', sourceLang: 'en', targetLang: 'zh-CN' }),
    ).rejects.toMatchObject({ code: 'API_ERROR' })
  })

  it('未配置服务地址时抛出 API_ERROR', async () => {
    const provider = new LibreTranslateProvider('', '')
    await expect(
      provider.translate({ text: 'hello', sourceLang: 'en', targetLang: 'zh-CN' }),
    ).rejects.toMatchObject({ code: 'API_ERROR' })
  })
})
