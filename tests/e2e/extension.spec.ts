import { resolve } from 'node:path'
import { chromium, expect, test, type BrowserContext } from '@playwright/test'

const EXTENSION_PATH = resolve(__dirname, '../../dist')

let context: BrowserContext
let extensionId = ''

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })

  // 等待扩展 Service Worker 注册，并从中解析扩展 ID
  await context.waitForEvent('serviceworker', { timeout: 15000 })
  const workers = context.serviceWorkers()
  if (workers.length) {
    extensionId = new URL(workers[0].url()).host
  }
})

test.afterAll(async () => {
  await context.close()
})

test('扩展 Service Worker 已加载', () => {
  expect(extensionId).toMatch(/^[a-p]{32}$/)
})

test('Popup 页面可访问且标题正确', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`)
  await expect(page.locator('h1')).toHaveText('AreaTranslate')
  await page.close()
})

test('Options 设置页可访问', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await expect(page.locator('h1')).toHaveText('AreaTranslate 设置')
  await page.close()
})
