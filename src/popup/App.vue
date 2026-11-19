<script setup lang="ts">
import { startSelectionOnTab } from '../shared/startSelection'

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
    <h1>AreaTranslate</h1>
    <p class="desc">框选网页任意区域，本地 OCR 识别并翻译为中文。</p>
    <button class="primary" type="button" @click="startSelection">
      开始框选翻译
    </button>
    <p class="hint">快捷键：Alt+Shift+T</p>
    <button class="link" type="button" @click="openOptions">设置</button>
  </main>
</template>

<style scoped>
.popup {
  width: 220px;
  padding: 16px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2328;
}
h1 {
  margin: 0;
  font-size: 16px;
}
.desc {
  margin: 8px 0 12px;
  font-size: 12px;
  color: #59636e;
  line-height: 1.5;
}
.primary {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: #0969da;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.primary:hover {
  background: #0552b0;
}
.hint {
  margin: 8px 0;
  font-size: 12px;
  color: #59636e;
  text-align: center;
}
.link {
  width: 100%;
  padding: 6px;
  border: none;
  background: none;
  color: #0969da;
  font-size: 12px;
  cursor: pointer;
}
</style>
