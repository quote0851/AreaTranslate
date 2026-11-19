// Content Script 入口：管理框选模式，协调截图、OCR 与翻译结果展示。

import { SelectionOverlay } from './selection/overlay'
import { TranslationPanel } from './translation/panel'
import type {
  OcrResult,
  RuntimeMessage,
  TranslateResult,
} from '../shared/messages'
import type { ViewportRect } from '../shared/geometry'

let overlay: SelectionOverlay | null = null
let panel: TranslationPanel | null = null
let lastOcrText = ''

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
      resultPanel.show(rect, response)
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

function ensurePanel(): TranslationPanel {
  if (!panel) {
    panel = new TranslationPanel({
      onClose: () => {
        panel = null
      },
      onRetranslate: () => {
        if (lastOcrText) void requestTranslation(lastOcrText)
      },
    })
  }
  return panel
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
