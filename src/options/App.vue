<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { getConfig, setConfig, type TranslationConfig } from '../storage/config'
import type { TranslateResult } from '../shared/messages'

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

const config = reactive<TranslationConfig>({
  sourceLang: 'en',
  targetLang: 'zh-CN',
  provider: 'bing',
  libreTranslateUrl: '',
  libreTranslateApiKey: '',
  ocrProvider: 'xiaomi',
  localOcrUrl: 'http://127.0.0.1:8099',
})

const saved = ref(false)
const testing = ref(false)
const testResult = ref('')

async function load(): Promise<void> {
  const c = await getConfig()
  Object.assign(config, c)
}

function save(): void {
  void setConfig({ ...config })
  saved.value = true
  setTimeout(() => (saved.value = false), 1500)
}

function openShortcuts(): void {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
}

async function testTranslation(): Promise<void> {
  save()
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
select, input {
  padding: 6px 8px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}
.radio { flex-direction: row; align-items: center; gap: 8px; margin: 8px 0; }
.radio input { margin: 0; }
.indent { margin: 12px 0 0 24px; display: flex; flex-direction: column; gap: 12px; }
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
