// Content Script 入口：管理框选模式，协调截图、OCR 与翻译结果展示。

import { SelectionOverlay } from './selection/overlay'
import { TranslationPanel } from './translation/panel'
import { collectSelectionContext } from './context/collect'
import type {
  AiPortMessage,
  OcrResult,
  RuntimeMessage,
  TranslateResult,
} from '../shared/messages'
import type { SelectionContext } from '../translation/types'
import type { ViewportRect } from '../shared/geometry'
import { DEFAULT_CONFIG, getConfig, type TranslationConfig } from '../storage/config'

let overlay: SelectionOverlay | null = null
let panel: TranslationPanel | null = null
let lastOcrText = ''
let lastOcrConfidence = 0
let lastRect: ViewportRect | null = null
let lastConfig: TranslationConfig = DEFAULT_CONFIG
let aiPort: chrome.runtime.Port | null = null
let aiRequestId = ''

function startSelection(): void {
  if (overlay) return
  overlay = new SelectionOverlay({
    onComplete: (rect) => void handleComplete(rect),
    onCancel: () => void handleCancel(),
  })
  overlay.start()
}

function handleCancel(): void {
  overlay?.destroy()
  overlay = null
}

const CAPTURE_TIMEOUT = 120_000
const TRANSLATE_TIMEOUT = 30_000

async function handleComplete(rect: ViewportRect): Promise<void> {
  if (!overlay) return
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const configPromise = getConfig().catch(() => DEFAULT_CONFIG)

  abortAiTranslation()
  lastOcrText = ''
  lastOcrConfidence = 0
  lastRect = null

  // 鼠标松开后立即显示浮层并进入「识别中」状态（浮层定位在框选区域外，不影响截图/OCR）
  const resultPanel = ensurePanel()
  resultPanel.showLoading(rect)

  // 截图前隐藏遮罩，并等待浏览器完成绘制
  overlay.hide()
  await waitForPaint(60)

  try {
    const response = (await withTimeout(
      chrome.runtime.sendMessage({
        type: 'CAPTURE_REGION',
        rect,
        viewport,
      }),
      CAPTURE_TIMEOUT,
      '识别超时，请重试',
    )) as OcrResult

    if (response?.ok) {
      lastOcrText = response.text ?? ''
      lastOcrConfidence = response.confidence ?? 0
      lastRect = rect
      const config = await configPromise
      lastConfig = config
      resultPanel.show(rect, response, config.aiEnabled)
      if (lastOcrText) {
        await requestTranslation(lastOcrText)
      }
    } else {
      resultPanel.show(rect, response)
      resultPanel.setError(response?.error ?? 'OCR 识别失败')
    }
  } catch (err) {
    resultPanel.show(rect, { ok: false, error: '截图异常' })
    resultPanel.setError(String(err))
  } finally {
    overlay?.destroy()
    overlay = null
  }
}

function buildSelectionContext(
  rect: ViewportRect,
  text: string,
  confidence: number,
  config: TranslationConfig,
): SelectionContext | null {
  if (!text) return null
  try {
    return collectSelectionContext({
      rect,
      ocrText: text,
      ocrConfidence: confidence,
      maxContextChars: config.aiMaxContextChars,
      contextEnabled: config.aiContextEnabled,
    })
  } catch (err) {
    console.warn('[AreaTranslate] 上下文采集失败：', err)
    return {
      source: 'ocr',
      sourceText: text,
      pageTitle: document.title,
      pageUrl:
        location.protocol === 'http:' || location.protocol === 'https:'
          ? `${location.origin}${location.pathname}`
          : '',
      nearbyText: '',
      pageText: '',
      ocrConfidence: confidence,
    }
  }
}

function ensurePanel(): TranslationPanel {
  if (!panel) {
    panel = new TranslationPanel({
      onClose: () => {
        abortAiTranslation()
        panel = null
      },
      onRetranslate: () => {
        if (lastOcrText) void requestTranslation(lastOcrText)
      },
      onAiTranslate: () => requestAiTranslation(),
      onAiAbort: () => {
        abortAiTranslation()
        panel?.setAiStopped()
      },
    })
  }
  return panel
}

function requestAiTranslation(): void {
  const rect = lastRect
  if (!rect || !lastOcrText.trim()) {
    panel?.setAiError('没有可翻译的原文')
    return
  }

  // 只在用户真正点击 AI 翻译时采集上下文，避免不必要的页面读取
  const context = buildSelectionContext(
    rect,
    lastOcrText,
    lastOcrConfidence,
    lastConfig,
  )
  if (!context || !context.sourceText.trim()) {
    panel?.setAiError('没有可翻译的原文')
    return
  }

  abortAiTranslation()
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  aiRequestId = requestId
  const sourceLabel = context.source === 'dom' ? '页面文本' : 'OCR 文本'
  panel?.setAiLoading(sourceLabel)

  const port = chrome.runtime.connect({ name: 'ai-translate' })
  aiPort = port

  port.onMessage.addListener((message: AiPortMessage) => {
    if (message.requestId !== aiRequestId) return
    if (message.type === 'DELTA') {
      panel?.setAiStreaming(message.text)
      return
    }
    if (message.type === 'DONE') {
      panel?.setAiTranslation(message.translation)
      closeAiPort()
      return
    }
    if (message.type === 'ERROR') {
      panel?.setAiError(message.error || 'AI 翻译失败')
      closeAiPort()
    }
  })

  port.onDisconnect.addListener(() => {
    if (aiPort !== port) return
    aiPort = null
    if (aiRequestId === requestId) {
      aiRequestId = ''
      panel?.setAiError('AI 翻译连接已断开，请重试')
    }
  })

  const startMessage: AiPortMessage = {
    type: 'START',
    requestId,
    text: context.sourceText,
    context,
  }
  port.postMessage(startMessage)
}

function abortAiTranslation(): void {
  const port = aiPort
  if (!port) return
  try {
    const abortMessage: AiPortMessage = {
      type: 'ABORT',
      requestId: aiRequestId,
    }
    port.postMessage(abortMessage)
  } catch {
    // 端口可能已断开
  }
  try {
    port.disconnect()
  } catch {
    // 忽略重复断开
  }
  aiPort = null
  aiRequestId = ''
}

function closeAiPort(): void {
  const port = aiPort
  aiPort = null
  aiRequestId = ''
  try {
    port?.disconnect()
  } catch {
    // 忽略重复断开
  }
}

async function requestTranslation(text: string): Promise<void> {
  panel?.setLoading()
  try {
    const result = (await withTimeout(
      chrome.runtime.sendMessage({ type: 'TRANSLATE', text }),
      TRANSLATE_TIMEOUT,
      '翻译超时，请重试',
    )) as TranslateResult

    if (result?.ok) {
      panel?.setTranslation(result.translation ?? '')
    } else {
      panel?.setError(result?.error ?? '翻译失败')
    }
  } catch (err) {
    panel?.setError(String(err))
  }
}

function waitForPaint(ms = 60): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, ms))
    })
  })
}

// 给消息往返加超时，避免 service worker / offscreen 异常时永久停留在「识别中」
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    if (message?.type === 'START_SELECTION') {
      startSelection()
      sendResponse({ ok: true })
      return false
    }
    if (message?.type === 'CANCEL_SELECTION') {
      handleCancel()
      sendResponse({ ok: true })
      return false
    }
    return false
  },
)
