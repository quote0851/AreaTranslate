<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getConfig, type TranslationConfig } from '../storage/config'
import { startSelectionOnTab } from '../shared/startSelection'

const LANG_LABELS: Record<string, string> = {
  auto: '自动检测',
  en: '英语',
  'zh-CN': '中文(简体)',
  'zh-TW': '中文(繁体)',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
}

const PROVIDER_LABELS: Record<string, string> = {
  bing: '必应翻译',
  mymemory: 'MyMemory',
  libretranslate: 'LibreTranslate',
}

const OCR_LABELS: Record<string, string> = {
  xiaomi: '小米 OCR 在线',
  'xiaomi-local': '小米 OCR 本地',
  tesseract: 'Tesseract',
}

const config = ref<TranslationConfig | null>(null)

onMounted(async () => {
  config.value = await getConfig()
})

const sourceLabel = computed(
  () =>
    LANG_LABELS[config.value?.sourceLang ?? ''] ?? config.value?.sourceLang ?? '英语',
)
const targetLabel = computed(
  () =>
    LANG_LABELS[config.value?.targetLang ?? ''] ?? config.value?.targetLang ?? '中文',
)
const providerLabel = computed(
  () => PROVIDER_LABELS[config.value?.provider ?? ''] ?? config.value?.provider ?? '翻译',
)
const ocrLabel = computed(
  () => OCR_LABELS[config.value?.ocrProvider ?? ''] ?? config.value?.ocrProvider ?? 'OCR',
)

async function startSelection(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id == null) return
  await startSelectionOnTab(tab.id)
  window.close()
}

function openOptions(): void {
  chrome.runtime.openOptionsPage()
}
</script>

<template>
  <main class="popup">
    <header class="header">
      <div class="brand">
        <svg class="logo" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" fill="var(--color-primary)" />
          <rect
            x="8"
            y="8"
            width="8"
            height="8"
            rx="1.5"
            fill="none"
            stroke="#fff"
            stroke-width="1.6"
            stroke-dasharray="2.6 2"
          />
        </svg>
        <span class="name">AreaTranslate</span>
      </div>
      <button
        class="icon-btn"
        type="button"
        title="设置"
        aria-label="设置"
        @click="openOptions"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </header>

    <section class="langs">
      <div class="lang">
        <span class="lang-label">源语言</span>
        <span class="lang-value">{{ sourceLabel }}</span>
      </div>
      <svg class="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
      <div class="lang">
        <span class="lang-label">目标语言</span>
        <span class="lang-value">{{ targetLabel }}</span>
      </div>
    </section>

    <button class="btn btn-primary start" type="button" @click="startSelection">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      </svg>
      开始框选翻译
    </button>

    <div class="shortcut">
      <span class="kbd">Alt</span>
      <span class="plus">+</span>
      <span class="kbd">Shift</span>
      <span class="plus">+</span>
      <span class="kbd">T</span>
    </div>

    <footer class="footer">
      <span class="service">
        <i class="status-dot success" />
        <span class="service-text">{{ providerLabel }}</span>
      </span>
      <span class="service">
        <i class="status-dot success" />
        <span class="service-text">{{ ocrLabel }}</span>
      </span>
    </footer>
  </main>
</template>

<style scoped>
:global(body) {
  background: var(--color-surface);
}

.popup {
  width: 320px;
  padding: var(--space-4);
  color: var(--color-text);
  background: var(--color-surface);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.name {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.langs {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 12px;
  margin-bottom: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-bg);
}

.lang {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.lang-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.lang-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow {
  align-self: center;
  flex-shrink: 0;
}

.start {
  width: 100%;
  height: 40px;
  font-size: 14px;
  font-weight: 600;
}

.shortcut {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
}

.plus {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.service {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.service-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
