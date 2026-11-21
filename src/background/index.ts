// Background Service Worker
// 职责：响应快捷键与按钮事件；调用 captureVisibleTab；管理 offscreen 文档并路由裁剪请求。

import type {
  OcrResult,
  RuntimeMessage,
  TranslateResult,
} from '../shared/messages'
import type { ViewportRect, ViewportSize } from '../shared/geometry'
import { translate } from '../translation/manager'
import { getConfig } from '../storage/config'
import { TranslationError } from '../translation/types'
import { startSelectionOnTab } from '../shared/startSelection'

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/index.html'

let creatingOffscreen: Promise<void> | null = null

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  })
  if (contexts.length > 0) return
  if (creatingOffscreen) return creatingOffscreen

  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: '在离屏文档中使用 Canvas 裁剪截图并执行本地 OCR',
    })
    .finally(() => {
      creatingOffscreen = null
    })
  await creatingOffscreen
}

async function handleCaptureRegion(
  rect: ViewportRect,
  viewport: ViewportSize,
): Promise<OcrResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.windowId) {
    return { ok: false, error: '未找到活动标签页' }
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
  })

  await ensureOffscreenDocument()

  // offscreen 文档无法访问 chrome.storage，配置需在 service worker 读取后随消息下发
  const config = await getConfig()

  const result = (await chrome.runtime.sendMessage({
    type: 'OCR_IMAGE',
    dataUrl,
    rect,
    viewport,
    ocrProvider: config.ocrProvider,
    localOcrUrl: config.localOcrUrl,
  })) as OcrResult

  return result
}

async function handleTranslate(text: string): Promise<TranslateResult> {
  try {
    const config = await getConfig()
    const translation = await translate(
      { text, sourceLang: config.sourceLang, targetLang: config.targetLang },
      config,
    )
    return { ok: true, translation }
  } catch (err) {
    if (err instanceof TranslationError) {
      return { ok: false, error: err.message, errorCode: err.code }
    }
    return { ok: false, error: String(err), errorCode: 'API_ERROR' }
  }
}

async function startSelectionOnActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id == null) return
  try {
    await startSelectionOnTab(tab.id)
  } catch (err) {
    // chrome:// 等无法注入的受限页面：无法框选，仅记录
    console.warn('[AreaTranslate] 无法启动框选：', err)
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.info('[AreaTranslate] installed')
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'start-selection') {
    void startSelectionOnActiveTab()
  }
})

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    if (message?.type === 'START_SELECTION') {
      void startSelectionOnActiveTab()
      sendResponse({ ok: true })
      return false
    }
    if (message?.type === 'CAPTURE_REGION') {
      void handleCaptureRegion(message.rect, message.viewport)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String(err) }))
      return true // 异步响应
    }
    if (message?.type === 'TRANSLATE') {
      void handleTranslate(message.text)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String(err) }))
      return true // 异步响应
    }
    return false
  },
)
