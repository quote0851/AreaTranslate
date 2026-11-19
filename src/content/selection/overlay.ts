// 框选层：全屏半透明遮罩 + 选区绘制，使用 Shadow DOM 隔离样式
// 坐标基于 clientX/clientY（viewport CSS 像素），与 captureVisibleTab 的裁剪坐标一致。

import {
  MIN_SELECTION_AREA,
  normalizeRect,
  type ViewportRect,
} from '../../shared/geometry'

interface SelectionOverlayOptions {
  onComplete: (rect: ViewportRect) => void
  onCancel: () => void
}

const MAX_Z_INDEX = 2147483647

export class SelectionOverlay {
  private host: HTMLDivElement | null = null
  private overlayEl: HTMLDivElement | null = null
  private selectionEl: HTMLDivElement | null = null
  private tipEl: HTMLDivElement | null = null

  private startX = 0
  private startY = 0
  private dragging = false
  private finished = false

  private readonly onMouseDown = (e: MouseEvent) => this.handleMouseDown(e)
  private readonly onMouseMove = (e: MouseEvent) => this.handleMouseMove(e)
  private readonly onMouseUp = (e: MouseEvent) => this.handleMouseUp(e)
  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e)
  private readonly onWheel = (e: WheelEvent) => e.preventDefault()

  constructor(private readonly opts: SelectionOverlayOptions) {}

  start(): void {
    if (this.host) return

    const host = document.createElement('div')
    host.setAttribute('data-areatranslate-overlay', '')
    // 使用内联样式 + !important 抵御页面 CSS 对宿主元素的污染
    const hostStyles: Array<[string, string]> = [
      ['all', 'initial'],
      ['position', 'fixed'],
      ['inset', '0'],
      ['width', '100vw'],
      ['height', '100vh'],
      ['z-index', String(MAX_Z_INDEX)],
      ['margin', '0'],
      ['padding', '0'],
      ['pointer-events', 'auto'],
    ]
    for (const [prop, value] of hostStyles) {
      host.style.setProperty(prop, value, 'important')
    }

    const shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .overlay {
          position: fixed;
          inset: 0;
          cursor: crosshair;
          user-select: none;
          -webkit-user-select: none;
        }
        .selection {
          position: fixed;
          display: none;
          border: 2px solid #0969da;
          background: rgba(9, 105, 218, 0.1);
          box-shadow: 0 0 0 10000px rgba(0, 0, 0, 0.45);
          box-sizing: border-box;
          pointer-events: none;
        }
        .tip {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 14px;
          background: rgba(0, 0, 0, 0.78);
          color: #fff;
          font: 13px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
          border-radius: 6px;
          pointer-events: none;
          white-space: nowrap;
        }
      </style>
      <div class="overlay"></div>
      <div class="selection"></div>
      <div class="tip">拖动框选要翻译的区域，按 ESC 取消</div>
    `

    this.host = host
    this.overlayEl = shadow.querySelector('.overlay')
    this.selectionEl = shadow.querySelector('.selection')
    this.tipEl = shadow.querySelector('.tip')

    document.documentElement.appendChild(host)

    this.overlayEl?.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('wheel', this.onWheel, { passive: false })
  }

  // 截图前隐藏遮罩（保留宿主引用，等待浏览器完成绘制）
  hide(): void {
    this.host?.style.setProperty('display', 'none', 'important')
  }

  destroy(): void {
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('wheel', this.onWheel)
    this.overlayEl?.removeEventListener('mousedown', this.onMouseDown)
    this.host?.remove()
    this.host = null
    this.overlayEl = null
    this.selectionEl = null
    this.tipEl = null
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    this.dragging = true
    this.startX = e.clientX
    this.startY = e.clientY
    this.updateSelection(e.clientX, e.clientY)
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.dragging) return
    this.updateSelection(e.clientX, e.clientY)
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.dragging) return
    this.dragging = false
    const rect = normalizeRect(this.startX, this.startY, e.clientX, e.clientY)
    if (rect.width * rect.height < MIN_SELECTION_AREA) {
      this.finishCancel()
      return
    }
    this.finished = true
    this.opts.onComplete(rect)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.finishCancel()
    }
  }

  private updateSelection(x: number, y: number): void {
    if (!this.selectionEl) return
    const rect = normalizeRect(this.startX, this.startY, x, y)
    this.selectionEl.style.display = 'block'
    this.selectionEl.style.left = `${rect.x}px`
    this.selectionEl.style.top = `${rect.y}px`
    this.selectionEl.style.width = `${rect.width}px`
    this.selectionEl.style.height = `${rect.height}px`
    this.tipEl?.style.setProperty('display', 'none')
  }

  private finishCancel(): void {
    if (this.finished) return
    this.finished = true
    this.opts.onCancel()
  }
}
