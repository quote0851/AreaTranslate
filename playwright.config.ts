import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  retries: 0,
  reporter: [['list']],
  use: {
    // 扩展需在非无头模式下加载
    headless: false,
  },
})
