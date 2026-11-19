// 本地 OCR 引擎：封装 Tesseract.js，worker 复用，所有资源本地打包。

import { createWorker, type Worker } from 'tesseract.js'

export interface OcrTextResult {
  text: string
  confidence: number
}

export type OcrImageInput = string | Blob | OffscreenCanvas | HTMLImageElement

const LANG = 'eng'
const OEM_LSTM_ONLY = 1

let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(LANG, OEM_LSTM_ONLY, {
      // 全部指向扩展内本地资源，不在运行时从 CDN 加载任何代码或模型
      workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
      corePath: chrome.runtime.getURL('ocr/tesseract-core.wasm.js'),
      langPath: chrome.runtime.getURL('ocr/lang'),
      workerBlobURL: false,
      gzip: true,
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.debug('[AreaTranslate] OCR progress', m.progress)
        }
      },
    })
    // 初始化失败时重置，避免后续复用损坏的 worker
    workerPromise.catch(() => {
      workerPromise = null
    })
  }
  return workerPromise
}

// 识别图片并返回文本与置信度。worker 复用，避免每次框选都重新初始化。
export async function recognize(image: OcrImageInput): Promise<OcrTextResult> {
  const worker = await getWorker()
  const result = await worker.recognize(image)
  const text = (result.data.text ?? '').trim()
  const confidence = result.data.confidence ?? 0
  return { text, confidence }
}
