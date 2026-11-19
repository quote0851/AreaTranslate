// 启动框选的公共逻辑：popup 与快捷键共用。
// 关键点：content script 只在页面加载时注入，扩展加载前已打开的页面不会自动注入。
// 这里先尝试 sendMessage，失败则用 scripting 动态注入 content script 后重试。

import type { RuntimeMessage } from './messages'

export async function startSelectionOnTab(tabId: number): Promise<void> {
  const message: RuntimeMessage = { type: 'START_SELECTION' }
  try {
    await chrome.tabs.sendMessage(tabId, message)
    return
  } catch {
    // content script 未注入，走动态注入
  }

  await injectContentScript(tabId)

  // 注入后 content script 的 onMessage 监听器可能在异步 chunk 加载中，稍作重试
  for (let i = 0; i < 10; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, message)
      return
    } catch {
      await sleep(100)
    }
  }
  throw new Error('内容脚本注入失败')
}

async function injectContentScript(tabId: number): Promise<void> {
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? []
  if (files.length === 0) return
  await chrome.scripting.executeScript({ target: { tabId }, files })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
