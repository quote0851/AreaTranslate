// Background Service Worker
// 职责：响应快捷键与按钮事件；调用 captureVisibleTab；管理 offscreen 文档并路由裁剪请求。

import type {
  AiPortMessage,
  OcrResult,
  RuntimeMessage,
  TranslateResult,
} from '../shared/messages'
import type { ViewportRect, ViewportSize } from '../shared/geometry'
import { translate } from '../translation/manager'
import { translateWithAi } from '../translation/ai'
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

const AI_PORT_NAME = 'ai-translate'

async function handleAiTranslate(
  port: chrome.runtime.Port,
  message: Extract<AiPortMessage, { type: 'START' }>,
  signal: AbortSignal,
): Promise<void> {
  try {
    const config = await getConfig()
    if (!config.aiEnabled) {
      throw new TranslationError('API_ERROR', '请先在设置中启用 AI 翻译')
    }
    const translation = await translateWithAi(
      {
        text: message.text,
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
        context: message.context,
      },
      config,
      {
        signal,
        onDelta: (text) => {
          postToPort(port, {
            type: 'DELTA',
            requestId: message.requestId,
            text,
          })
        },
      },
    )
    postToPort(port, {
      type: 'DONE',
      requestId: message.requestId,
      translation,
    })
  } catch (err) {
    // 用户主动取消/关闭浮层时不回报错误
    if (signal.aborted) return
    const error =
      err instanceof TranslationError
        ? err
        : new TranslationError('API_ERROR', String(err))
    postToPort(port, {
      type: 'ERROR',
      requestId: message.requestId,
      error: error.message,
      errorCode: error.code,
    })
  }
}

function postToPort(port: chrome.runtime.Port, message: AiPortMessage): void {
  try {
    port.postMessage(message)
  } catch {
    // 端口已关闭，忽略
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== AI_PORT_NAME) return

  let controller: AbortController | null = null
  let activeRequestId = ''

  port.onMessage.addListener((message: AiPortMessage) => {
    if (message.type === 'START') {
      controller?.abort()
      activeRequestId = message.requestId
      const nextController = new AbortController()
      controller = nextController
      void handleAiTranslate(port, message, nextController.signal)
      return
    }
    if (message.type === 'ABORT' && message.requestId === activeRequestId) {
      controller?.abort()
    }
  })

  port.onDisconnect.addListener(() => {
    controller?.abort()
    controller = null
  })
})

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
