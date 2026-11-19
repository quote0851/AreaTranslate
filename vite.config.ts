import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    vue(),
    crx({ manifest }),
  ],
  build: {
    target: 'chrome120',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // offscreen 文档不在 manifest 引用列表中，需显式声明为 HTML 入口
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
      },
    },
  },
})
