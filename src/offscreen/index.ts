// Offscreen Document：裁剪截图 + 本地 OCR。
// Canvas 与 Tesseract worker 均在此离屏文档中运行。

import { recognize as recognizeLocal } from '../ocr/engine'
import { recognizeWithXiaomi } from '../ocr/xiaomi'
import type { OcrProviderId } from '../storage/config'
import type { OcrResult, RuntimeMessage } from '../shared/messages'
import type { ViewportRect, ViewportSize } from '../shared/geometry'
import { clamp } from '../shared/geometry'

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    if (message?.type === 'OCR_IMAGE') {
      void runOcr(message.dataUrl, message.rect, message.viewport, message.ocrProvider)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String(err) }))
      return true // 异步响应
    }
    return false
  },
)

async function runOcr(
  dataUrl: string,
  rect: ViewportRect,
  viewport: ViewportSize,
  ocrProvider: OcrProviderId,
): Promise<OcrResult> {
  const img = await loadImage(dataUrl)
  try {
    // captureVisibleTab 返回物理像素；用「图片宽 / 视口 CSS 宽」做缩放，
    // 正确处理 devicePixelRatio 与浏览器缩放，避免把 CSS 像素当图片像素用。
    const scaleX = img.width / viewport.width
    const scaleY = img.height / viewport.height

    const sx = clamp(Math.round(rect.x * scaleX), 0, img.width)
    const sy = clamp(Math.round(rect.y * scaleY), 0, img.height)
    const sw = clamp(Math.round(rect.width * scaleX), 0, img.width - sx)
    const sh = clamp(Math.round(rect.height * scaleY), 0, img.height - sy)

    if (sw <= 0 || sh <= 0) {
      return { ok: false, error: '裁剪区域无效' }
    }

    let canvas = new OffscreenCanvas(sw, sh)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return { ok: false, error: '无法创建 Canvas 上下文' }
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    // 预处理：过小的选区放大，提升识别率
    canvas = preprocess(canvas)

    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const croppedDataUrl = await blobToDataUrl(blob)

    const { text, confidence } = await runEngine(croppedDataUrl, ocrProvider)

    return {
      ok: true,
      text,
      confidence,
      dataUrl: croppedDataUrl,
      width: canvas.width,
      height: canvas.height,
    }
  } finally {
    img.src = ''
  }
}

// 按设置选择识别引擎；在线引擎失败时自动回退到本地 Tesseract，避免无结果
async function runEngine(
  dataUrl: string,
  ocrProvider: OcrProviderId,
): Promise<{ text: string; confidence: number }> {
  if (ocrProvider === 'xiaomi') {
    try {
      return await recognizeWithXiaomi(dataUrl)
    } catch (err) {
      console.warn('[AreaTranslate] 小米 OCR 失败，回退本地识别：', err)
    }
  }
  return recognizeLocal(dataUrl)
}

function preprocess(canvas: OffscreenCanvas): OffscreenCanvas {
  const MIN_WIDTH = 400
  const scale =
    canvas.width < MIN_WIDTH ? Math.min(3, MIN_WIDTH / canvas.width) : 1
  if (scale <= 1) return canvas

  const w = Math.round(canvas.width * scale)
  const h = Math.round(canvas.height * scale)
  const out = new OffscreenCanvas(w, h)
  const ctx = out.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(canvas, 0, 0, w, h)
  return out
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('读取 Blob 失败'))
    reader.readAsDataURL(blob)
  })
}
