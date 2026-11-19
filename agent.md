# Codex 开发任务：AreaTranslate Chrome 区域截图翻译插件

## 一、项目目标

开发一个名为 AreaTranslate 的 Chrome 浏览器扩展。

核心功能：

用户通过快捷键或插件按钮启动区域截图模式，鼠标拖动框选网页中的任意区域，插件使用本地 OCR 识别区域中的文字，调用免费翻译接口翻译成中文，并将译文展示在原文下方。

产品原则：
- 不翻译整个网页。
- 不修改原网页内容。
- 不上传截图和图片。
- OCR 必须在本地运行。
- MVP 不依赖付费 API。
- 翻译结果通过独立浮层展示。
- 优先保证功能稳定和浏览器兼容性。

## 二、技术栈

- Chrome Extension Manifest V3
- Vue 3
- TypeScript
- Vite
- @crxjs/vite-plugin
- Tesseract.js
- Canvas API
- Chrome Tabs API
- Chrome Offscreen API
- chrome.storage.local
- Vitest
- Playwright

使用稳定版本依赖，避免引入不必要的 UI 组件库。

## 三、开发阶段

### P0：项目初始化

1. 创建 Vue 3 + TypeScript + Vite 项目。
2. 配置 Chrome Extension Manifest V3。
3. 配置 Background Service Worker。
4. 配置 Content Script。
5. 配置 Popup 页面。
6. 配置 Options 设置页面。
7. 配置快捷键 Alt+Shift+T。
8. 配置 Chrome 扩展开发和生产构建。
9. 验证构建结果可以在 Chrome 中通过「加载已解压的扩展程序」正常加载。

### P1：区域截图和框选

实现鼠标框选功能。

要求：

1. 点击插件按钮后启动框选模式。
2. 快捷键 Alt+Shift+T 可以启动框选模式。
3. 网页出现全屏半透明遮罩。
4. 鼠标按下后开始绘制选区。
5. 鼠标移动时动态更新选区边框。
6. 鼠标松开后确认选区。
7. 支持取消操作。
8. 支持 ESC 退出框选模式。
9. 选区小于合理阈值时不执行 OCR。
10. 框选层使用独立样式，避免受到网页 CSS 污染。

截图实现：

- Content Script 负责获取 viewport 坐标。
- Background Service Worker 调用 chrome.tabs.captureVisibleTab。
- 截图前隐藏遮罩，并等待浏览器完成绘制。
- 截图完成后再执行图像裁剪。
- 正确处理 devicePixelRatio、浏览器缩放和截图真实像素尺寸。
- 不允许将 CSS 像素直接当作图片像素使用。

### P2：本地 OCR

使用 Tesseract.js 实现本地 OCR。

要求：

1. 首版支持英文识别。
2. 使用英文模型 eng.traineddata。
3. Tesseract.js、Worker、WASM Core、语言模型全部打包到扩展。
4. 不允许在运行过程中从 CDN 加载远程代码或模型。
5. 使用 Offscreen Document 处理 Canvas 和 OCR。
6. 使用 chrome.runtime 消息进行模块通信。
7. OCR Worker 应复用，避免每次框选都重新初始化。
8. 返回识别文本和 confidence。
9. 对空文本和低置信度结果进行提示。
10. 识别图片时适当进行缩放和图像预处理。

特别注意：
- 遵守 Chrome MV3 扩展 CSP。
- 优先使用 workerBlobURL: false 的本地 Worker 配置。
- 根据实际安装的 Tesseract.js 版本使用正确的 API。
- 检查 Worker 和 WASM 文件的实际打包路径。
- 不允许依赖外部 CDN。

### P3：免费翻译服务

采用 Provider 适配器模式。

实现：

1. MyMemoryProvider
2. LibreTranslateProvider

默认使用 MyMemory。

MyMemory：
- 请求地址：https://api.mymemory.translated.net/get
- 默认语言方向：en|zh-CN
- 使用 GET 请求。
- 处理 responseStatus。
- 处理 responseData.translatedText。
- 处理请求失败和超时。
- 匿名免费额度按官方限制处理。
- 超长文本需要分段。

LibreTranslate：
- 支持用户自定义服务地址。
- 支持可选 API Key。
- 支持用户自建服务。
- 不将公共实例写死为唯一服务。

建立统一接口：

interface TranslationProvider {
  translate(
    request: TranslationRequest
  ): Promise<string>;
}

要求：
- Provider 之间可以切换。
- 翻译失败不影响 OCR 结果保留。
- 支持重新翻译。
- 不记录用户识别的原文。
- 显示额度不足、网络错误、接口异常等具体错误。

### P4：翻译结果浮层

使用 Vue 组件实现 TranslationPanel。

要求：

1. 显示识别出的英文原文。
2. 原文下方显示中文译文。
3. 面板显示在框选区域下方。
4. 下方空间不足时自动调整到上方。
5. 右侧空间不足时自动向左调整。
6. 不覆盖原网页的核心内容。
7. 使用 Shadow DOM 隔离样式。
8. 浮层有独立的层级管理。
9. 支持复制译文。
10. 支持关闭。
11. 支持重新翻译。
12. 支持加载中状态。
13. 支持 OCR 失败状态。
14. 支持翻译失败状态。
15. 关闭时清理相关事件监听和状态。

面板不要直接修改网页原始 DOM 内容。

### P5：设置页面

实现简单的 Popup 和 Options 页面。

设置项：

- 默认源语言。
- 默认目标语言。
- 翻译 Provider。
- LibreTranslate 服务地址。
- LibreTranslate API Key（可选）。
- 快捷键说明。
- 本地 OCR 状态。
- 测试翻译服务按钮。

配置保存在 chrome.storage.local。

API Key 不应硬编码在源码中，也不要记录在日志中。

### P6：测试和打包

完成：

1. TypeScript 类型检查。
2. ESLint 检查。
3. Vitest 单元测试。
4. Chrome 扩展加载测试。
5. Playwright 基本交互测试。
6. 截图坐标测试。
7. 不同浏览器缩放比例测试。
8. 翻译接口异常测试。
9. README 编写。
10. 生产构建。

最终提供：
- 可加载的 Chrome 扩展 dist 目录。
- 项目 README。
- 本地开发说明。
- 构建说明。
- 已知限制。

## 四、建议目录结构

请将项目按照以下模块划分：

src/background/
src/content/
src/content/selection/
src/content/translation/
src/offscreen/
src/ocr/
src/translation/
src/translation/providers/
src/popup/
src/options/
src/storage/
src/shared/

public/manifest.json
public/ocr/
tests/unit/
tests/e2e/

如果实际构建工具要求调整入口或目录结构，可以合理调整，但必须保证模块职责清晰。

## 五、开发规范

1. 先阅读项目现有结构，不要盲目覆盖文件。
2. 如果当前目录不是空目录，先确认已有代码用途。
3. 先制定实施计划，再开始编码。
4. 每个阶段完成后进行类型检查和构建验证。
5. 优先使用最小改动。
6. 不允许使用伪代码冒充已实现功能。
7. 不允许用模拟翻译结果代替真实接口。
8. 不允许用 CDN 代替本地 OCR 模型。
9. 不允许将 API Key 硬编码到源码。
10. 不允许在未经验证时声称功能已经完成。
11. 如果发现技术限制，先说明原因并给出可行替代方案。
12. 发现问题时优先定位根因，不要通过大量无关代码绕过。

## 六、最终验收标准

必须真实验证以下流程：

打开 Chrome 网页
→ 按 Alt+Shift+T
→ 鼠标框选一段英文
→ 截取选区
→ 本地 OCR
→ 调用免费翻译接口
→ 原文下方显示中文
→ 点击复制
→ 关闭浮层。

以上完整流程能够正常运行，才算 MVP 完成。

请先输出：
1. 项目结构分析。
2. 技术实现计划。
3. 可能遇到的技术风险。
4. 预计修改和新增的文件。

待计划确认后，按 P0 到 P6 分阶段实施，并在每个阶段汇报实际完成情况、测试结果和未解决问题。