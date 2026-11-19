# AreaTranslate

区域截图翻译 Chrome 扩展：框选网页任意区域，本地 OCR 识别并翻译为中文。

## 功能

- 框选网页任意区域，OCR 识别文字并翻译为中文
- 快捷键 `Alt+Shift+T` 或点击扩展按钮启动框选
- 识别引擎可选：小米 OCR 0（在线，中英文/表格，默认）或 Tesseract（本地离线，仅英文）
- 翻译服务可选 MyMemory（免费，默认）或 LibreTranslate（支持自建）
- 结果浮层支持复制、重新翻译、关闭，位置自适应

## 技术栈

- Vue 3 + TypeScript + Vite
- @crxjs/vite-plugin（Manifest V3 构建）
- Tesseract.js（本地 OCR，Offscreen Document）
- Vitest（单元测试）、Playwright（交互测试）

## 目录结构

```
src/
  background/       Service Worker：快捷键、截图、offscreen 协调、翻译
  content/          Content Script：框选、结果浮层
  offscreen/        Offscreen Document：Canvas 裁剪 + OCR
  ocr/              OCR 引擎（Tesseract.js 封装）
  translation/      翻译 Provider（MyMemory / LibreTranslate）
  storage/          配置读写（chrome.storage.local）
  popup/            弹出页
  options/          设置页
  shared/           消息类型、几何工具
public/ocr/         本地化的 OCR worker/core/语言模型
tests/              单元测试与交互测试
```

## 开发

```bash
npm install
npm run dev        # 开发构建（watch）
npm run build      # 生产构建到 dist/
```

## 加载到 Chrome

1. `npm run build`
2. 打开 `chrome://extensions`
3. 打开右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择 `dist/` 目录
5. 在网页上按 `Alt+Shift+T` 或点击扩展按钮，拖动框选要翻译的区域

快捷键可在 `chrome://extensions/shortcuts` 修改。

## 测试

```bash
npm run typecheck   # 类型检查
npm run lint        # ESLint
npm run test        # Vitest 单元测试
```

交互测试（需先 `npm run build` 并安装 Chromium）：

```bash
npx playwright install chromium
npx playwright test
```

## 识别引擎

### 小米 OCR 0（在线，默认）

截图会以 base64 发送到 HuggingFace Space `loongwayX/Xiaomi-OCR-0-demo` 的 Gradio 接口
（`/gradio_api/call/recognize`），用于中英文、表格、公式等场景，识别更准。
在线识别失败（网络、额度、Space 休眠）时会自动回退到本地 Tesseract。

### Tesseract（本地离线）

`public/ocr/` 下存放了本地化的 Tesseract.js 运行依赖：

- `worker.min.js`：Tesseract.js worker（来自 `node_modules/tesseract.js/dist`）
- `tesseract-core.wasm.js`：WASM Core（来自 `node_modules/tesseract.js-core`，已内嵌 wasm）
- `lang/eng.traineddata.gz`：英文语言模型（从 `@tesseract.js-data/eng` 下载）

运行时 `workerPath` / `corePath` / `langPath` 均指向 `chrome.runtime.getURL('ocr/...')`，不从 CDN 加载任何代码或模型。

## 翻译服务

- **MyMemory**：免费，默认。有每日额度限制，额度用尽时会提示。
- **LibreTranslate**：支持自建服务地址与可选 API Key，在设置页配置。

## 隐私

- 选择本地 Tesseract 时 OCR 完全在本地完成，截图与识别文本不会上传
- 选择小米 OCR 时，框选截图会发送到该在线识别服务；识别文本仅用于翻译，不写入日志
- 仅翻译文本会发送到所选的翻译服务
- API Key 仅保存在 `chrome.storage.local`，不写入源码或日志
