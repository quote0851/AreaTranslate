<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  AI_PRESETS,
  DEFAULT_CONFIG,
  getConfig,
  setConfig,
  type TranslationConfig,
} from '../storage/config'
import type {
  AiPortMessage,
  TranslateResult,
} from '../shared/messages'
import type { SelectionContext } from '../translation/types'

const SOURCE_LANGUAGES = [
  { value: 'en', label: '英语 (English)' },
  { value: 'auto', label: '自动检测' },
  { value: 'zh-CN', label: '中文 (简体)' },
  { value: 'ja', label: '日语 (日本語)' },
  { value: 'ko', label: '韩语 (한국어)' },
  { value: 'fr', label: '法语 (Français)' },
  { value: 'de', label: '德语 (Deutsch)' },
  { value: 'es', label: '西班牙语 (Español)' },
  { value: 'ru', label: '俄语 (Русский)' },
]

const TARGET_LANGUAGES = [
  { value: 'zh-CN', label: '中文 (简体)' },
  { value: 'zh-TW', label: '中文 (繁体)' },
  { value: 'en', label: '英语 (English)' },
  { value: 'ja', label: '日语 (日本語)' },
  { value: 'ko', label: '韩语 (한국어)' },
  { value: 'fr', label: '法语 (Français)' },
  { value: 'de', label: '德语 (Deutsch)' },
  { value: 'es', label: '西班牙语 (Español)' },
  { value: 'ru', label: '俄语 (Русский)' },
]

const NAV = [
  { id: 'basic', label: '基础设置' },
  { id: 'translation', label: '翻译服务' },
  { id: 'ocr', label: 'OCR 识别' },
  { id: 'ai', label: 'AI 翻译' },
  { id: 'shortcut', label: '快捷键' },
  { id: 'about', label: '关于插件' },
] as const

const NAV_ICONS: Record<string, string> = {
  basic:
    '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  translation:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  ocr:
    '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  ai:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  shortcut:
    '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/>',
  about:
    '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
}

const FEEDBACK_URL = 'https://github.com/quote0851/AreaTranslate/issues'

const config = reactive<TranslationConfig>({ ...DEFAULT_CONFIG })

const current = ref<string>('basic')
const currentTitle = computed(
  () => NAV.find((n) => n.id === current.value)?.label ?? '设置',
)

const manifest = chrome.runtime.getManifest()

const saved = ref(false)
const testing = ref(false)
const testResult = ref('')
const aiTesting = ref(false)
const aiTestResult = ref('')

async function load(): Promise<void> {
  const c = await getConfig()
  Object.assign(config, c)
}

async function persist(): Promise<void> {
  const maxChars = Number(config.aiMaxContextChars)
  config.aiMaxContextChars = Number.isFinite(maxChars)
    ? Math.min(8000, Math.max(200, maxChars))
    : 3000
  await setConfig({ ...config })
}

async function save(): Promise<void> {
  if (config.aiEnabled && config.aiPreset === 'custom') {
    try {
      await ensureAiHostPermission()
    } catch {
      // 保存不因权限失败而中断；测试或实际使用时会再次提示
    }
  }
  await persist()
  saved.value = true
  setTimeout(() => (saved.value = false), 1500)
}

function applyAiPreset(): void {
  if (config.aiPreset === 'custom') return
  const preset = AI_PRESETS[config.aiPreset]
  if (!preset) return
  config.aiBaseUrl = preset.baseUrl
  config.aiModel = preset.model
}

watch(() => config.aiPreset, applyAiPreset)

function aiOriginPattern(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl)
    return `${url.protocol}//${url.host}/*`
  } catch {
    return null
  }
}

async function ensureAiHostPermission(): Promise<void> {
  const pattern = aiOriginPattern(config.aiBaseUrl)
  if (!pattern) throw new Error('AI 服务地址格式不正确')
  try {
    const granted = await chrome.permissions.request({ origins: [pattern] })
    if (!granted) throw new Error('未授予访问该 AI 服务地址的权限')
  } catch (err) {
    // 已通过 host_permissions 授权，或该地址不在 optional 权限范围内
    const has = await chrome.permissions.contains({ origins: [pattern] })
    if (!has) throw err
  }
}

function openShortcuts(): void {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
}

async function testTranslation(): Promise<void> {
  await persist()
  testing.value = true
  testResult.value = ''
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      text: 'Hello, world!',
    })) as TranslateResult
    testResult.value = res?.ok
      ? `测试成功：${res.translation}`
      : `测试失败：${res.error ?? '未知错误'}`
  } catch (err) {
    testResult.value = `测试失败：${String(err)}`
  } finally {
    testing.value = false
  }
}

async function testAiTranslation(): Promise<void> {
  aiTesting.value = true
  aiTestResult.value = ''
  try {
    if (config.aiPreset === 'custom') {
      await ensureAiHostPermission()
    }
    await persist()
    const translation = await runAiTest()
    aiTestResult.value = `测试成功：${translation}`
  } catch (err) {
    aiTestResult.value = `测试失败：${
      err instanceof Error ? err.message : String(err)
    }`
  } finally {
    aiTesting.value = false
  }
}

function runAiTest(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'ai-translate' })
    const requestId = `test-${Date.now()}`
    let settled = false
    let timer = 0

    const finish = (action: () => void): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      try {
        port.disconnect()
      } catch {
        // 忽略重复断开
      }
      action()
    }

    timer = window.setTimeout(
      () => finish(() => reject(new Error('测试超时，请检查服务地址与网络'))),
      60_000,
    )

    port.onMessage.addListener((message: AiPortMessage) => {
      if (message.requestId !== requestId) return
      if (message.type === 'DONE') {
        finish(() => resolve(message.translation))
      } else if (message.type === 'ERROR') {
        finish(() => reject(new Error(message.error)))
      }
    })

    port.onDisconnect.addListener(() => {
      finish(() => reject(new Error('与后台的连接已断开')))
    })

    const context: SelectionContext = {
      source: 'dom',
      sourceText: '',
      pageTitle: 'AI 翻译测试',
      pageUrl: 'https://example.com/docs',
      nearbyText:
        'This section explains how the controller manages state and memory across requests.',
      pageText: '',
      ocrConfidence: 100,
    }
    const start: AiPortMessage = {
      type: 'START',
      requestId,
      text: 'The controller keeps the whole context in memory.',
      context,
    }
    port.postMessage(start)
  })
}

onMounted(load)
</script>

<template>
  <div class="settings">
    <aside class="sidebar">
      <div class="sidebar-brand">
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
        <span>AreaTranslate</span>
      </div>
      <nav class="nav">
        <button
          v-for="n in NAV"
          :key="n.id"
          type="button"
          class="nav-item"
          :class="{ active: current === n.id }"
          @click="current = n.id"
        >
          <!-- eslint-disable-next-line vue/no-v-html -- 图标为静态内置 SVG 片段，非用户输入 -->
          <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="NAV_ICONS[n.id]"></svg>
          <span>{{ n.label }}</span>
        </button>
      </nav>
    </aside>

    <div class="content">
      <header class="content-header">
        <div>
          <h1>{{ currentTitle }}</h1>
          <p class="content-subtitle">AreaTranslate 设置</p>
        </div>
        <div class="header-actions">
          <span v-if="saved" class="saved">已保存</span>
          <button class="btn btn-primary" type="button" @click="save">保存设置</button>
        </div>
      </header>

      <div class="content-body">
        <!-- 基础设置 -->
        <section v-if="current === 'basic'" class="section">
          <div class="card section-card">
            <div class="card-head">
              <h2>翻译语言</h2>
              <p class="card-desc">设置框选翻译时默认的源语言与目标语言</p>
            </div>
            <div class="lang-grid">
              <label class="field">
                <span class="field-label">源语言</span>
                <select v-model="config.sourceLang" class="select">
                  <option v-for="l in SOURCE_LANGUAGES" :key="l.value" :value="l.value">
                    {{ l.label }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">目标语言</span>
                <select v-model="config.targetLang" class="select">
                  <option v-for="l in TARGET_LANGUAGES" :key="l.value" :value="l.value">
                    {{ l.label }}
                  </option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <!-- 翻译服务 -->
        <section v-if="current === 'translation'" class="section">
          <div class="card section-card">
            <div class="card-head">
              <h2>翻译服务</h2>
              <p class="card-desc">选择翻译文本所用的服务，必应与 MyMemory 会自动互相兜底</p>
            </div>

            <div class="option-group">
              <label class="radio-card" :class="{ selected: config.provider === 'bing' }">
                <input v-model="config.provider" type="radio" value="bing" class="card-input" />
                <span class="radio-dot"></span>
                <span class="radio-body">
                  <span class="radio-title">必应翻译</span>
                  <span class="radio-desc">免费、无需密钥，国内可直连</span>
                </span>
                <span class="badge badge-primary">推荐</span>
              </label>

              <label class="radio-card" :class="{ selected: config.provider === 'mymemory' }">
                <input v-model="config.provider" type="radio" value="mymemory" class="card-input" />
                <span class="radio-dot"></span>
                <span class="radio-body">
                  <span class="radio-title">MyMemory</span>
                  <span class="radio-desc">免费，额度较小，每天约 1000 词</span>
                </span>
              </label>

              <label class="radio-card" :class="{ selected: config.provider === 'libretranslate' }">
                <input v-model="config.provider" type="radio" value="libretranslate" class="card-input" />
                <span class="radio-dot"></span>
                <span class="radio-body">
                  <span class="radio-title">LibreTranslate</span>
                  <span class="radio-desc">支持自建服务，数据不经过第三方</span>
                </span>
              </label>
            </div>

            <div v-if="config.provider === 'libretranslate'" class="config-block">
              <label class="field">
                <span class="field-label">服务地址</span>
                <input
                  v-model="config.libreTranslateUrl"
                  class="input"
                  type="url"
                  placeholder="https://libretranslate.example.com"
                />
              </label>
              <label class="field">
                <span class="field-label">API Key（可选）</span>
                <input
                  v-model="config.libreTranslateApiKey"
                  class="input"
                  type="password"
                  autocomplete="off"
                  placeholder="留空则使用公共实例"
                />
              </label>
            </div>

            <hr class="divider" />

            <div class="test-row">
              <button
                class="btn btn-secondary"
                type="button"
                :disabled="testing"
                @click="testTranslation"
              >
                {{ testing ? '测试中…' : '测试翻译' }}
              </button>
              <p v-if="testResult" class="alert" :class="testResult.startsWith('测试成功') ? 'alert-success' : 'alert-error'">
                {{ testResult }}
              </p>
            </div>
          </div>
        </section>

        <!-- OCR 识别 -->
        <section v-if="current === 'ocr'" class="section">
          <div class="card section-card">
            <div class="card-head">
              <h2>OCR 识别引擎</h2>
              <p class="card-desc">选择用于识别框选截图的引擎</p>
            </div>

            <div class="option-group">
              <label class="radio-card" :class="{ selected: config.ocrProvider === 'xiaomi-local' }">
                <input v-model="config.ocrProvider" type="radio" value="xiaomi-local" class="card-input" />
                <span class="radio-dot"></span>
                <span class="radio-body">
                  <span class="radio-title">小米 OCR 本地</span>
                  <span class="radio-desc">本地 llama.cpp 服务，离线、无额度限制</span>
                </span>
                <span class="badge badge-primary">推荐</span>
              </label>

              <label class="radio-card" :class="{ selected: config.ocrProvider === 'xiaomi' }">
                <input v-model="config.ocrProvider" type="radio" value="xiaomi" class="card-input" />
                <span class="radio-dot"></span>
                <span class="radio-body">
                  <span class="radio-title">小米 OCR 在线</span>
                  <span class="radio-desc">识别更准，支持中英文与表格</span>
                </span>
              </label>

              <label class="radio-card" :class="{ selected: config.ocrProvider === 'tesseract' }">
                <input v-model="config.ocrProvider" type="radio" value="tesseract" class="card-input" />
                <span class="radio-dot"></span>
                <span class="radio-body">
                  <span class="radio-title">Tesseract</span>
                  <span class="radio-desc">本地离线，仅英文，不联网</span>
                </span>
              </label>
            </div>

            <div v-if="config.ocrProvider === 'xiaomi-local'" class="config-block">
              <label class="field">
                <span class="field-label">本地服务地址</span>
                <input
                  v-model="config.localOcrUrl"
                  class="input"
                  type="url"
                  placeholder="http://127.0.0.1:8099"
                />
              </label>
              <p class="alert alert-info">
                需先在本机启动 llama-server，例如：<code>llama-server -m Xiaomi-OCR-0.Q4_K_M.gguf --mmproj mmproj-f16.gguf --port 8099</code>
              </p>
              <p class="hint">
                服务未启动时会直接报错，不会回退到其他引擎，便于排查。
              </p>
            </div>

            <p class="hint">
              在线识别会把框选截图发送到 HuggingFace 上的小米 OCR 演示服务；失败时自动回退到本地识别。
            </p>
          </div>
        </section>

        <!-- AI 翻译 -->
        <section v-if="current === 'ai'" class="section">
          <div class="card section-card">
            <div class="card-head">
              <h2>AI 翻译</h2>
              <p class="card-desc">结合页面上下文提升短文本翻译准确度</p>
            </div>

            <div class="setting-row">
              <div class="setting-row-body">
                <span class="setting-title">启用 AI 翻译</span>
                <span class="setting-desc">默认关闭，在结果浮层中手动触发</span>
              </div>
              <label class="switch">
                <input v-model="config.aiEnabled" type="checkbox" />
                <span class="switch-track"></span>
              </label>
            </div>

            <p class="hint">
              AI 翻译会把选区原文和页面上下文发送到你配置的服务，用于结合语境提升短文本准确度。
              直译结果始终保留，AI 失败时不影响直译。
            </p>

            <div v-if="config.aiEnabled" class="config-block">
              <div class="subhead">服务商</div>
              <div class="option-group">
                <label class="radio-card" :class="{ selected: config.aiPreset === 'deepseek' }">
                  <input v-model="config.aiPreset" type="radio" value="deepseek" class="card-input" />
                  <span class="radio-dot"></span>
                  <span class="radio-body">
                    <span class="radio-title">DeepSeek 官方 API</span>
                    <span class="radio-desc">调用 api.deepseek.com 官方接口</span>
                  </span>
                </label>

                <label class="radio-card" :class="{ selected: config.aiPreset === 'local' }">
                  <input v-model="config.aiPreset" type="radio" value="local" class="card-input" />
                  <span class="radio-dot"></span>
                  <span class="radio-body">
                    <span class="radio-title">本地 llama.cpp</span>
                    <span class="radio-desc">连接本地 127.0.0.1:8080/v1</span>
                  </span>
                </label>

                <label class="radio-card" :class="{ selected: config.aiPreset === 'custom' }">
                  <input v-model="config.aiPreset" type="radio" value="custom" class="card-input" />
                  <span class="radio-dot"></span>
                  <span class="radio-body">
                    <span class="radio-title">自定义 OpenAI 兼容服务</span>
                    <span class="radio-desc">连接任意 OpenAI 兼容服务</span>
                  </span>
                </label>
              </div>

              <div class="field-grid">
                <label class="field">
                  <span class="field-label">模型名称</span>
                  <input v-model="config.aiModel" class="input" type="text" placeholder="deepseek-chat" />
                </label>
                <label class="field">
                  <span class="field-label">API Base URL</span>
                  <input
                    v-model="config.aiBaseUrl"
                    class="input"
                    type="url"
                    placeholder="https://api.deepseek.com"
                  />
                </label>
              </div>

              <label class="field">
                <span class="field-label">API Key{{ config.aiPreset === 'local' ? '（本地服务通常可留空）' : '' }}</span>
                <input
                  v-model="config.aiApiKey"
                  class="input"
                  type="password"
                  autocomplete="off"
                  placeholder="sk-..."
                />
              </label>

              <div class="setting-row">
                <div class="setting-row-body">
                  <span class="setting-title">发送页面上下文</span>
                  <span class="setting-desc">标题、邻近段落、表头等</span>
                </div>
                <label class="switch">
                  <input v-model="config.aiContextEnabled" type="checkbox" />
                  <span class="switch-track"></span>
                </label>
              </div>

              <label class="field">
                <span class="field-label">上下文长度上限（字符）</span>
                <input
                  v-model.number="config.aiMaxContextChars"
                  class="input"
                  type="number"
                  min="200"
                  max="8000"
                  step="100"
                />
              </label>

              <p class="hint">
                DeepSeek 预设会调用 <code>https://api.deepseek.com/chat/completions</code>；
                本地预设默认连接 <code>http://127.0.0.1:8080/v1</code>。
                自定义地址首次使用时会请求该域名的访问权限。
              </p>

              <div class="test-row">
                <button
                  class="btn btn-secondary"
                  type="button"
                  :disabled="aiTesting"
                  @click="testAiTranslation"
                >
                  {{ aiTesting ? '测试中…' : '测试 AI 翻译' }}
                </button>
                <p v-if="aiTestResult" class="alert" :class="aiTestResult.startsWith('测试成功') ? 'alert-success' : 'alert-error'">
                  {{ aiTestResult }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- 快捷键 -->
        <section v-if="current === 'shortcut'" class="section">
          <div class="card section-card">
            <div class="card-head">
              <h2>快捷键</h2>
              <p class="card-desc">启动框选翻译的默认快捷键</p>
            </div>
            <div class="shortcut-row">
              <span class="kbd">Alt</span>
              <span class="plus">+</span>
              <span class="kbd">Shift</span>
              <span class="plus">+</span>
              <span class="kbd">T</span>
              <a class="link" href="#" @click.prevent="openShortcuts">在浏览器中修改</a>
            </div>
          </div>
        </section>

        <!-- 关于插件 -->
        <section v-if="current === 'about'" class="section">
          <div class="card section-card">
            <div class="card-head">
              <h2>关于插件</h2>
            </div>
            <div class="about-list">
              <div class="about-row">
                <span class="about-key">插件名称</span>
                <span class="about-value">{{ manifest.name }}</span>
              </div>
              <div class="about-row">
                <span class="about-key">版本号</span>
                <span class="about-value">v{{ manifest.version }}</span>
              </div>
              <div class="about-row">
                <span class="about-key">项目介绍</span>
                <span class="about-value">{{ manifest.description }}</span>
              </div>
              <div class="about-row">
                <span class="about-key">反馈</span>
                <a class="link" :href="FEEDBACK_URL" target="_blank" rel="noreferrer">提交问题或建议</a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  min-height: 100vh;
  background: var(--color-bg);
}

/* ---------- 左侧导航 ---------- */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  padding: var(--space-4) var(--space-3);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px var(--space-4);
  font-size: 14px;
  font-weight: 600;
}

.logo {
  width: 22px;
  height: 22px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.nav-item:hover {
  background: var(--color-bg);
  color: var(--color-text);
}
.nav-item.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.nav-icon {
  flex-shrink: 0;
}

/* ---------- 右侧内容 ---------- */
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: var(--space-4) var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.content-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.content-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.saved {
  font-size: 13px;
  color: var(--color-success);
}

.content-body {
  flex: 1;
  padding: var(--space-6) var(--space-6) var(--space-8);
}

.section-card {
  padding: var(--space-6);
}

.card-head {
  margin-bottom: var(--space-4);
}

.card-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.card-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.lang-grid,
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-bg);
}

.subhead {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
}

.setting-row-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-title {
  font-size: 14px;
  font-weight: 500;
}

.setting-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-bg);
  font-size: 12px;
}

.alert code {
  font-family: inherit;
  font-size: 12px;
  word-break: break-all;
}

.test-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.test-row .alert {
  margin: 0;
  word-break: break-all;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.plus {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.link {
  margin-left: 12px;
  font-size: 13px;
  color: var(--color-primary);
  text-decoration: none;
}
.link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.about-list {
  display: flex;
  flex-direction: column;
}

.about-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}
.about-row:last-child {
  border-bottom: none;
}

.about-key {
  width: 72px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.about-value {
  font-size: 13px;
  color: var(--color-text);
}

/* ---------- 响应式 ---------- */
@media (max-width: 760px) {
  .settings {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    padding: var(--space-3);
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-brand {
    padding-bottom: var(--space-3);
  }

  .nav {
    flex-direction: row;
    overflow-x: auto;
    gap: 4px;
  }

  .nav-item {
    width: auto;
    flex-shrink: 0;
  }

  .content-header {
    padding: var(--space-4);
  }

  .content-body {
    padding: var(--space-4);
  }

  .lang-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
