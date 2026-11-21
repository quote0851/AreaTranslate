<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
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

const config = reactive<TranslationConfig>({ ...DEFAULT_CONFIG })

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
  <main class="options">
    <h1>AreaTranslate 设置</h1>

    <section class="card">
      <h2>翻译语言</h2>
      <div class="row">
        <label>
          <span>源语言</span>
          <select v-model="config.sourceLang">
            <option v-for="l in SOURCE_LANGUAGES" :key="l.value" :value="l.value">
              {{ l.label }}
            </option>
          </select>
        </label>
        <label>
          <span>目标语言</span>
          <select v-model="config.targetLang">
            <option v-for="l in TARGET_LANGUAGES" :key="l.value" :value="l.value">
              {{ l.label }}
            </option>
          </select>
        </label>
      </div>
    </section>

    <section class="card">
      <h2>翻译服务</h2>
      <label class="radio">
        <input type="radio" value="bing" v-model="config.provider" />
        <span>必应翻译（免费、无需密钥，国内可直连，推荐）</span>
      </label>
      <label class="radio">
        <input type="radio" value="mymemory" v-model="config.provider" />
        <span>MyMemory（免费，额度较小，每天约 1000 词）</span>
      </label>
      <label class="radio">
        <input type="radio" value="libretranslate" v-model="config.provider" />
        <span>LibreTranslate（支持自建服务）</span>
      </label>
      <p class="hint">
        必应与 MyMemory 会自动互相兜底，其中一个额度用尽时仍能翻译。
      </p>

      <div v-if="config.provider === 'libretranslate'" class="indent">
        <label class="block">
          <span>服务地址</span>
          <input
            v-model="config.libreTranslateUrl"
            type="url"
            placeholder="https://libretranslate.example.com"
          />
        </label>
        <label class="block">
          <span>API Key（可选）</span>
          <input
            v-model="config.libreTranslateApiKey"
            type="password"
            autocomplete="off"
            placeholder="留空则使用公共实例"
          />
        </label>
      </div>
    </section>

    <section class="card">
      <h2>识别引擎</h2>
      <label class="radio">
        <input type="radio" value="xiaomi-local" v-model="config.ocrProvider" />
        <span>小米 OCR 0（本地 llama.cpp 服务，离线、无额度限制，推荐）</span>
      </label>
      <div v-if="config.ocrProvider === 'xiaomi-local'" class="indent">
        <label class="block">
          <span>本地服务地址</span>
          <input
            v-model="config.localOcrUrl"
            type="url"
            placeholder="http://127.0.0.1:8099"
          />
        </label>
        <p class="hint">
          需先在本机启动 llama-server，例如：<code>llama-server -m Xiaomi-OCR-0.Q4_K_M.gguf --mmproj mmproj-f16.gguf --port 8099</code>
        </p>
        <p class="hint">
          服务未启动时会直接报错，不会回退到其他引擎，便于排查。
        </p>
      </div>
      <label class="radio">
        <input type="radio" value="xiaomi" v-model="config.ocrProvider" />
        <span>小米 OCR 0（在线，识别更准，支持中英文与表格）</span>
      </label>
      <label class="radio">
        <input type="radio" value="tesseract" v-model="config.ocrProvider" />
        <span>Tesseract（本地离线，仅英文，不联网）</span>
      </label>
      <p class="hint">
        在线识别会把框选截图发送到 HuggingFace 上的小米 OCR 演示服务；失败时自动回退到本地识别。
      </p>
    </section>

    <section class="card">
      <h2>AI 翻译</h2>
      <label class="radio">
        <input type="checkbox" v-model="config.aiEnabled" />
        <span>启用 AI 翻译（默认关闭，在结果浮层中手动触发）</span>
      </label>
      <p class="hint">
        AI 翻译会把选区原文和页面上下文发送到你配置的服务，用于结合语境提升短文本准确度。
        直译结果始终保留，AI 失败时不影响直译。
      </p>

      <div v-if="config.aiEnabled" class="row">
        <label>
          <span>服务类型</span>
          <select v-model="config.aiPreset" @change="applyAiPreset">
            <option value="deepseek">DeepSeek 官方 API</option>
            <option value="local">本地 llama.cpp</option>
            <option value="custom">自定义 OpenAI 兼容服务</option>
          </select>
        </label>
        <label>
          <span>模型</span>
          <input v-model="config.aiModel" type="text" placeholder="deepseek-chat" />
        </label>
      </div>

      <div v-if="config.aiEnabled" class="indent">
        <label class="block">
          <span>服务地址（OpenAI 兼容 Base URL）</span>
          <input
            v-model="config.aiBaseUrl"
            type="url"
            placeholder="https://api.deepseek.com"
          />
        </label>
        <label class="block">
          <span>
            API Key{{ config.aiPreset === 'local' ? '（本地服务通常可留空）' : '' }}
          </span>
          <input
            v-model="config.aiApiKey"
            type="password"
            autocomplete="off"
            placeholder="sk-..."
          />
        </label>
        <label class="radio">
          <input type="checkbox" v-model="config.aiContextEnabled" />
          <span>发送页面上下文（标题、邻近段落、表头等）</span>
        </label>
        <label class="block">
          <span>上下文长度上限（字符）</span>
          <input
            v-model.number="config.aiMaxContextChars"
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
        <button
          class="btn secondary"
          type="button"
          :disabled="aiTesting"
          @click="testAiTranslation"
        >
          {{ aiTesting ? '测试中…' : '测试 AI 翻译' }}
        </button>
        <p v-if="aiTestResult" class="test-result">{{ aiTestResult }}</p>
      </div>
    </section>

    <section class="card">
      <h2>其他</h2>
      <p class="hint">
        快捷键：<code>Alt+Shift+T</code>
        <a href="#" @click.prevent="openShortcuts">在浏览器中修改</a>
      </p>
    </section>

    <div class="actions">
      <button class="btn" type="button" @click="save">保存设置</button>
      <button
        class="btn secondary"
        type="button"
        :disabled="testing"
        @click="testTranslation"
      >
        {{ testing ? '测试中…' : '测试翻译' }}
      </button>
      <span v-if="saved" class="saved">已保存</span>
    </div>

    <p v-if="testResult" class="test-result">{{ testResult }}</p>
  </main>
</template>

<style scoped>
.options {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2328;
}
h1 { font-size: 20px; margin: 0 0 16px; }
.card {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
h2 { font-size: 14px; margin: 0 0 12px; }
.row { display: flex; gap: 16px; }
label { display: flex; flex-direction: column; font-size: 13px; gap: 4px; }
label span { color: #59636e; font-size: 12px; }
select, input[type="text"], input[type="url"], input[type="password"], input[type="number"] {
  padding: 6px 8px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}
.radio { flex-direction: row; align-items: center; gap: 8px; margin: 8px 0; }
.radio input { margin: 0; }
.indent { margin: 12px 0 0 24px; display: flex; flex-direction: column; gap: 12px; }
.indent .btn { align-self: flex-start; }
.block { display: flex; flex-direction: column; gap: 4px; }
.hint { font-size: 13px; color: #59636e; margin: 6px 0; }
.hint a { color: #0969da; margin-left: 8px; }
.hint code { background: #f6f8fa; padding: 1px 5px; border-radius: 4px; }
.actions { display: flex; align-items: center; gap: 12px; }
.btn {
  padding: 8px 16px;
  border: 1px solid #0969da;
  border-radius: 6px;
  background: #0969da;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.btn.secondary { background: #fff; color: #0969da; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.saved { color: #1a7f37; font-size: 13px; }
.test-result { margin-top: 16px; font-size: 13px; color: #1f2328; }
</style>
