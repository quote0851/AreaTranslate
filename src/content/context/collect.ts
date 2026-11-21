// 选区上下文采集：优先取与选区相交的 DOM 文本，取不到时使用 OCR 文本。
// 只采集文本，不采集输入框内容，也不上传截图。

import type { ViewportRect } from '../../shared/geometry'
import type { SelectionContext } from '../../translation/types'

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'IFRAME',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'OBJECT',
  'EMBED',
])

const BLOCK_TAGS = new Set([
  'P',
  'LI',
  'TD',
  'TH',
  'DIV',
  'SECTION',
  'ARTICLE',
  'MAIN',
  'HEADER',
  'FOOTER',
  'BLOCKQUOTE',
  'PRE',
  'FIGURE',
  'FIGCAPTION',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TABLE',
  'TR',
])

const MEDIA_SELECTOR = 'img,canvas,video,picture,svg,object,embed,iframe'

export interface CollectContextOptions {
  rect: ViewportRect
  ocrText: string
  ocrConfidence: number
  maxContextChars: number
  contextEnabled: boolean
}

export function collectSelectionContext(
  options: CollectContextOptions,
): SelectionContext {
  const center = getElementAtCenter(options.rect)
  const domText = center && isMediaElement(center)
    ? ''
    : collectTextInRect(options.rect)
  const useDom = shouldUseDom(domText, options.ocrText)
  const sourceText = useDom ? domText : options.ocrText

  return {
    source: useDom ? 'dom' : 'ocr',
    sourceText,
    pageTitle: document.title,
    pageUrl: currentPageUrl(),
    nearbyText: options.contextEnabled
      ? collectNearby(center, options.maxContextChars)
      : '',
    pageText: options.contextEnabled
      ? collectPageText(options.maxContextChars)
      : '',
    ocrConfidence: options.ocrConfidence,
  }
}

function getElementAtCenter(rect: ViewportRect): Element | null {
  const x = rect.x + rect.width / 2
  const y = rect.y + rect.height / 2
  const elements = document.elementsFromPoint(x, y)
  for (const el of elements) {
    if (!el.closest('[data-areatranslate-panel]')) return el
  }
  return null
}

function isMediaElement(el: Element): boolean {
  return !!el.closest(MEDIA_SELECTOR)
}

// DOM 文本明显少于 OCR 时，说明选区主体可能是图片，保留 OCR 结果
function shouldUseDom(domText: string, ocrText: string): boolean {
  const dom = domText.trim()
  if (dom.length < 2) return false
  const ocr = ocrText.trim()
  if (!ocr) return true
  return dom.length >= ocr.length * 0.5
}

interface TextPiece {
  text: string
  top: number
  left: number
  block: boolean
}

function collectTextInRect(rect: ViewportRect): string {
  if (!document.body) return ''

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent
      if (!text || !text.trim()) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const range = document.createRange()
  const pieces: TextPiece[] = []
  let visited = 0
  let node = walker.nextNode()

  while (node && visited < 8000 && pieces.length < 400) {
    visited += 1
    const textNode = node as Text
    const text = textNode.textContent ?? ''
    if (text.trim()) {
      range.selectNodeContents(textNode)
      const clientRects = range.getClientRects()
      let hit = false
      let top = Infinity
      let left = Infinity
      for (let i = 0; i < clientRects.length; i += 1) {
        const clientRect = clientRects[i]
        if (intersects(clientRect, rect)) {
          hit = true
          top = Math.min(top, clientRect.top)
          left = Math.min(left, clientRect.left)
        }
      }
      if (hit) {
        const parent = textNode.parentElement
        pieces.push({
          text: text.replace(/\s+/g, ' '),
          top: Number.isFinite(top) ? top : 0,
          left: Number.isFinite(left) ? left : 0,
          block: !!parent && BLOCK_TAGS.has(parent.tagName),
        })
      }
    }
    node = walker.nextNode()
  }

  pieces.sort((a, b) => a.top - b.top || a.left - b.left)
  let output = ''
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i]
    if (i > 0) {
      const prev = pieces[i - 1]
      output += piece.block || Math.abs(piece.top - prev.top) > 4 ? '\n' : ' '
    }
    output += piece.text
  }
  return truncate(normalizeText(output), 8000)
}

function collectNearby(center: Element | null, maxChars: number): string {
  if (!center) return ''

  const block =
    center.closest('p,li,td,th,blockquote,pre,figcaption,article,section,div') ??
    center
  const parts: string[] = []

  const heading = findHeading(block)
  if (heading) parts.push(`标题：${heading}`)

  const table = block.closest('table')
  if (table) {
    const header =
      table.querySelector('thead')?.textContent?.trim() ||
      table.querySelector('tr')?.textContent?.trim()
    if (header) parts.push(`表头：${normalizeText(header)}`)
  }

  const prev = siblingText(block, 'previousElementSibling')
  if (prev) parts.push(`上一段：${prev}`)
  const next = siblingText(block, 'nextElementSibling')
  if (next) parts.push(`下一段：${next}`)

  return truncate(
    normalizeText(parts.join('\n')),
    Math.min(Math.max(200, maxChars), 1200),
  )
}

function findHeading(start: Element): string {
  let el: Element | null = start
  for (let depth = 0; depth < 4 && el; depth += 1) {
    const text = el.querySelector('h1,h2,h3,h4,h5,h6')?.textContent?.trim()
    if (text) return truncate(normalizeText(text), 200)
    el = el.parentElement
  }
  return ''
}

function siblingText(
  start: Element,
  direction: 'previousElementSibling' | 'nextElementSibling',
): string {
  let el = start[direction]
  for (let i = 0; i < 2 && el; i += 1) {
    const text = el instanceof HTMLElement ? el.innerText.trim() : ''
    if (text.length >= 2) return truncate(normalizeText(text), 500)
    el = el[direction]
  }
  return ''
}

function collectPageText(maxChars: number): string {
  if (!document.body) return ''
  const limit = Math.max(200, maxChars)
  const raw = (document.body.innerText || '').slice(0, limit * 3)
  return truncate(normalizeText(raw), limit)
}

function currentPageUrl(): string {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return ''
  return `${location.origin}${location.pathname}`
}

function intersects(a: DOMRect, rect: ViewportRect): boolean {
  const left = Math.max(a.left, rect.x)
  const top = Math.max(a.top, rect.y)
  const right = Math.min(a.right, rect.x + rect.width)
  const bottom = Math.min(a.bottom, rect.y + rect.height)
  return right - left > 4 && bottom - top > 4
}

function normalizeText(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
