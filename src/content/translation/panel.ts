// 翻译结果浮层：Shadow DOM 隔离样式，展示原文/译文，支持复制、重译、关闭。
// 直译结果下方提供可选的 AI 翻译区块（手动触发、流式展示）。

import { createShadowHost } from './shadow'
import type { OcrResult } from '../../shared/messages'
import type { ViewportRect } from '../../shared/geometry'
import { clamp } from '../../shared/geometry'

const LOW_CONFIDENCE = 60

interface TranslationPanelOptions {
  onClose: () => void
  onRetranslate: () => void
  onAiTranslate: () => void
  onAiAbort: () => void
}

export class TranslationPanel {
  private host: HTMLDivElement | null = null
  private panelEl: HTMLDivElement | null = null
  private sourceEl: HTMLDivElement | null = null
  private targetEl: HTMLDivElement | null = null
  private statusEl: HTMLDivElement | null = null
  private copyBtn: HTMLButtonElement | null = null
  private retranslateBtn: HTMLButtonElement | null = null

  private aiSection: HTMLDivElement | null = null
  private aiSourceEl: HTMLSpanElement | null = null
  private aiResultEl: HTMLDivElement | null = null
  private aiStatusEl: HTMLDivElement | null = null
  private aiBtn: HTMLButtonElement | null = null
  private aiCopyBtn: HTMLButtonElement | null = null
  private aiStopBtn: HTMLButtonElement | null = null

  private currentText = ''
  private currentTranslation = ''
  private currentAiTranslation = ''
  private aiEnabled = false
  private loadingTimer: number | null = null
  private dragOffsetX = 0
  private dragOffsetY = 0

  private readonly onDragMove = (e: PointerEvent) => this.handleDragMove(e)
  private readonly onDragEnd = () => this.handleDragEnd()

  constructor(private readonly opts: TranslationPanelOptions) {}

  show(rect: ViewportRect, ocr: OcrResult, aiEnabled = false): void {
    this.stopLoadingTicker()
    if (!this.host) this.render()

    this.currentText = ocr.text ?? ''
    this.currentTranslation = ''
    if (this.sourceEl) this.sourceEl.textContent = this.currentText
    if (this.targetEl) this.targetEl.textContent = ''
    this.setCopyEnabled(false)
    this.applyAiAvailability(aiEnabled)

    if (!this.currentText) {
      this.setStatus('未识别到文本', 'warning')
    } else {
      const conf = ocr.confidence ?? 0
      if (conf > 0 && conf < LOW_CONFIDENCE) {
        this.setStatus(`识别置信度较低（${Math.round(conf)}%），结果仅供参考`, 'warning')
      } else {
        this.setStatus('正在翻译…', 'info')
      }
    }

    this.position(rect)
  }

  // 截图/OCR 开始前先显示浮层并进入「识别中」状态，避免 OCR 期间页面无反馈
  showLoading(rect: ViewportRect): void {
    this.stopLoadingTicker()
    if (!this.host) this.render()
    this.currentText = ''
    this.currentTranslation = ''
    if (this.sourceEl) this.sourceEl.textContent = ''
    if (this.targetEl) this.targetEl.textContent = ''
    this.setCopyEnabled(false)
    this.applyAiAvailability(false)
    this.position(rect)

    // 计时显示，让用户明确看到仍在处理中
    const startedAt = Date.now()
    this.setStatus('正在识别文字…（0s）', 'info')
    this.loadingTimer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      this.setStatus(`正在识别文字…（${seconds}s）`, 'info')
    }, 1000)
  }

  private stopLoadingTicker(): void {
    if (this.loadingTimer !== null) {
      window.clearInterval(this.loadingTimer)
      this.loadingTimer = null
    }
  }

  setLoading(): void {
    this.stopLoadingTicker()
    this.setStatus('正在翻译…', 'info')
  }

  setTranslation(text: string): void {
    this.currentTranslation = text
    if (this.targetEl) this.targetEl.textContent = text
    this.setCopyEnabled(!!text)
    this.setStatus(text ? '翻译完成' : '未获取到翻译结果', text ? 'info' : 'warning')
  }

  setError(message: string): void {
    this.stopLoadingTicker()
    this.setStatus(message, 'error')
    this.setCopyEnabled(false)
  }

  setAiLoading(sourceLabel: string): void {
    this.currentAiTranslation = ''
    if (this.aiResultEl) this.aiResultEl.textContent = ''
    this.setAiSource(sourceLabel)
    this.setAiStatus('AI 正在翻译…', 'info')
    if (this.aiBtn) this.aiBtn.disabled = true
    if (this.aiCopyBtn) this.aiCopyBtn.disabled = true
    if (this.aiStopBtn) this.aiStopBtn.hidden = false
  }

  setAiStreaming(text: string): void {
    this.currentAiTranslation = text
    if (this.aiResultEl) this.aiResultEl.textContent = text
    this.setAiStatus('AI 正在翻译…', 'info')
  }

  setAiTranslation(text: string): void {
    this.currentAiTranslation = text
    if (this.aiResultEl) this.aiResultEl.textContent = text
    if (this.aiBtn) this.aiBtn.disabled = false
    if (this.aiStopBtn) this.aiStopBtn.hidden = true
    if (this.aiCopyBtn) this.aiCopyBtn.disabled = !text
    this.setAiStatus(
      text ? 'AI 翻译完成（结合页面上下文）' : 'AI 未返回译文',
      text ? 'info' : 'warning',
    )
  }

  setAiError(message: string): void {
    if (this.aiBtn) this.aiBtn.disabled = false
    if (this.aiStopBtn) this.aiStopBtn.hidden = true
    if (this.aiCopyBtn) this.aiCopyBtn.disabled = !this.currentAiTranslation
    this.setAiStatus(message, 'error')
  }

  setAiStopped(): void {
    if (this.aiBtn) this.aiBtn.disabled = false
    if (this.aiStopBtn) this.aiStopBtn.hidden = true
    if (this.aiCopyBtn) this.aiCopyBtn.disabled = !this.currentAiTranslation
    this.setAiStatus('AI 翻译已取消', 'warning')
  }

  close(): void {
    this.stopLoadingTicker()
    this.handleDragEnd()
    this.host?.remove()
    this.host = null
    this.panelEl = null
    this.sourceEl = null
    this.targetEl = null
    this.statusEl = null
    this.copyBtn = null
    this.retranslateBtn = null
    this.aiSection = null
    this.aiSourceEl = null
    this.aiResultEl = null
    this.aiStatusEl = null
    this.aiBtn = null
    this.aiCopyBtn = null
    this.aiStopBtn = null
    this.currentAiTranslation = ''
    this.opts.onClose()
  }

  private applyAiAvailability(enabled: boolean): void {
    this.aiEnabled = enabled
    if (this.aiSection) this.aiSection.hidden = !enabled
    this.resetAi()
  }

  private resetAi(): void {
    this.currentAiTranslation = ''
    if (this.aiResultEl) this.aiResultEl.textContent = ''
    if (this.aiSourceEl) this.aiSourceEl.textContent = ''
    if (this.aiBtn) this.aiBtn.disabled = false
    if (this.aiCopyBtn) this.aiCopyBtn.disabled = true
    if (this.aiStopBtn) this.aiStopBtn.hidden = true
    this.setAiStatus(
      this.aiEnabled ? '结合页面上下文，提升短文本准确度' : '',
      'info',
    )
  }

  private setAiSource(label: string): void {
    if (this.aiSourceEl) {
      this.aiSourceEl.textContent = label ? `原文取自${label}` : ''
    }
  }

  private setAiStatus(text: string, kind: 'info' | 'error' | 'warning'): void {
    if (!this.aiStatusEl) return
    this.aiStatusEl.textContent = text
    this.aiStatusEl.className = `ai-status ${kind}`
  }

  private render(): void {
    const { host, shadow } = createShadowHost('data-areatranslate-panel')
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel {
          width: 340px;
          max-width: calc(100vw - 16px);
          max-height: calc(100vh - 16px);
          display: flex;
          flex-direction: column;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
          font: 13px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
          color: #0f172a;
          overflow: hidden;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
          cursor: move;
          user-select: none;
          -webkit-user-select: none;
          touch-action: none;
          flex-shrink: 0;
        }
        .panel.dragging { opacity: .92; }
        .title { font-weight: 600; font-size: 13px; }
        .close {
          border: none; background: none; cursor: pointer;
          font-size: 18px; line-height: 1; color: #64748b; padding: 0 2px;
        }
        .close:hover { color: #0f172a; }
        .body {
          padding: 10px 12px; max-height: 380px; overflow-y: auto;
          flex: 1 1 auto; min-height: 0;
        }
        .label {
          font-size: 11px; color: #64748b; margin: 10px 0 4px;
          text-transform: uppercase; letter-spacing: .04em;
        }
        .label:first-child { margin-top: 0; }
        .text { white-space: pre-wrap; word-break: break-word; }
        .text.source { color: #0f172a; }
        .text.target { color: #2563eb; }
        .status { padding: 6px 12px; font-size: 12px; color: #64748b; flex-shrink: 0; }
        .status.error { color: #dc2626; }
        .status.warning { color: #d97706; }
        .actions {
          display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .btn {
          flex: 1; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 8px;
          background: #f8fafc; cursor: pointer; font-size: 12px; color: #0f172a;
        }
        .btn:disabled { opacity: .5; cursor: not-allowed; }
        .btn:hover:not(:disabled) { background: #e2e8f0; }
        .btn[hidden] { display: none; }
        .ai-section {
          margin-top: 12px; padding-top: 10px;
          border-top: 1px dashed #e2e8f0;
        }
        .ai-section[hidden] { display: none; }
        .ai-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px;
        }
        .ai-head .label { margin: 0; }
        .ai-source { font-size: 11px; color: #64748b; }
        .text.ai-result { margin-top: 4px; color: #8250df; }
        .ai-status { margin-top: 6px; font-size: 12px; color: #64748b; }
        .ai-status.error { color: #dc2626; }
        .ai-status.warning { color: #d97706; }
        .ai-actions { display: flex; gap: 8px; margin-top: 8px; }
        .ai-actions .btn { padding: 5px 6px; }
      </style>
      <div class="panel">
        <div class="header">
          <span class="title">翻译结果</span>
          <button class="close" data-action="close" title="关闭">×</button>
        </div>
        <div class="body">
          <div class="label">原文</div>
          <div class="text source"></div>
          <div class="label">译文</div>
          <div class="text target"></div>
          <div class="ai-section" hidden>
            <div class="ai-head">
              <span class="label">AI 翻译</span>
              <span class="ai-source"></span>
            </div>
            <div class="text ai-result"></div>
            <div class="ai-status"></div>
            <div class="ai-actions">
              <button class="btn" data-action="ai">AI 翻译</button>
              <button class="btn" data-action="ai-copy" disabled>复制</button>
              <button class="btn" data-action="ai-stop" hidden>停止</button>
            </div>
          </div>
        </div>
        <div class="status"></div>
        <div class="actions">
          <button class="btn" data-action="copy" disabled>复制译文</button>
          <button class="btn" data-action="retranslate">重新翻译</button>
        </div>
      </div>
    `

    this.host = host
    this.panelEl = shadow.querySelector('.panel')
    this.sourceEl = shadow.querySelector('.text.source')
    this.targetEl = shadow.querySelector('.text.target')
    this.statusEl = shadow.querySelector('.status')
    this.copyBtn = shadow.querySelector('[data-action="copy"]')
    this.retranslateBtn = shadow.querySelector('[data-action="retranslate"]')
    this.aiSection = shadow.querySelector('.ai-section')
    this.aiSourceEl = shadow.querySelector('.ai-source')
    this.aiResultEl = shadow.querySelector('.text.ai-result')
    this.aiStatusEl = shadow.querySelector('.ai-status')
    this.aiBtn = shadow.querySelector('[data-action="ai"]')
    this.aiCopyBtn = shadow.querySelector('[data-action="ai-copy"]')
    this.aiStopBtn = shadow.querySelector('[data-action="ai-stop"]')

    shadow.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close())
    shadow.querySelector('.header')?.addEventListener('pointerdown', (e) =>
      this.handleDragStart(e as PointerEvent),
    )
    this.copyBtn?.addEventListener('click', () => void this.copyTranslation())
    this.retranslateBtn?.addEventListener('click', () => this.opts.onRetranslate())
    this.aiBtn?.addEventListener('click', () => this.opts.onAiTranslate())
    this.aiCopyBtn?.addEventListener('click', () => void this.copyAiTranslation())
    this.aiStopBtn?.addEventListener('click', () => this.opts.onAiAbort())

    document.documentElement.appendChild(host)
  }

  private setStatus(text: string, kind: 'info' | 'error' | 'warning'): void {
    if (!this.statusEl) return
    this.statusEl.textContent = text
    this.statusEl.className = `status ${kind}`
  }

  private setCopyEnabled(enabled: boolean): void {
    if (this.copyBtn) this.copyBtn.disabled = !enabled
  }

  // 拖动标题栏移动浮层；限制在视口内
  private handleDragStart(e: PointerEvent): void {
    if (e.button !== 0 || !this.host) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button')) return

    e.preventDefault()
    const box = this.host.getBoundingClientRect()
    this.dragOffsetX = e.clientX - box.left
    this.dragOffsetY = e.clientY - box.top
    this.panelEl?.classList.add('dragging')

    window.addEventListener('pointermove', this.onDragMove)
    window.addEventListener('pointerup', this.onDragEnd)
    window.addEventListener('pointercancel', this.onDragEnd)
  }

  private handleDragMove(e: PointerEvent): void {
    if (!this.host || !this.panelEl) return
    e.preventDefault()

    const width = this.panelEl.offsetWidth
    const height = this.panelEl.offsetHeight
    const left = clamp(e.clientX - this.dragOffsetX, 0, Math.max(0, window.innerWidth - width))
    const top = clamp(e.clientY - this.dragOffsetY, 0, Math.max(0, window.innerHeight - height))

    this.host.style.setProperty('left', `${Math.round(left)}px`, 'important')
    this.host.style.setProperty('top', `${Math.round(top)}px`, 'important')
  }

  private handleDragEnd(): void {
    this.panelEl?.classList.remove('dragging')
    window.removeEventListener('pointermove', this.onDragMove)
    window.removeEventListener('pointerup', this.onDragEnd)
    window.removeEventListener('pointercancel', this.onDragEnd)
  }

  private async copyTranslation(): Promise<void> {
    if (!this.currentTranslation) return
    const ok = await copyToClipboard(this.currentTranslation)
    this.setStatus(ok ? '已复制到剪贴板' : '复制失败，请手动复制', ok ? 'info' : 'error')
  }

  private async copyAiTranslation(): Promise<void> {
    if (!this.currentAiTranslation) return
    const ok = await copyToClipboard(this.currentAiTranslation)
    this.setAiStatus(ok ? '已复制 AI 译文' : '复制失败，请手动复制', ok ? 'info' : 'error')
  }

  private position(rect: ViewportRect): void {
    if (!this.host || !this.panelEl) return
    const panelWidth = this.panelEl.offsetWidth || 340
    const panelHeight = this.panelEl.offsetHeight || 200
    const gap = 8
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = rect.x
    if (left + panelWidth > vw - margin) {
      left = Math.max(margin, vw - panelWidth - margin)
    }

    let top = rect.y + rect.height + gap
    if (top + panelHeight > vh - margin) {
      top = rect.y - panelHeight - gap
    }
    top = Math.max(margin, Math.min(top, vh - panelHeight - margin))

    // 用 important 覆盖宿主上的 left/top:0!important 预设，否则会被钉在左上角
    this.host.style.setProperty('left', `${Math.round(left)}px`, 'important')
    this.host.style.setProperty('top', `${Math.round(top)}px`, 'important')
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
