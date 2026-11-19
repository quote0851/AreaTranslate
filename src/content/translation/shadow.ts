// Shadow DOM 宿主创建：为内容脚本浮层提供样式隔离。

const MAX_Z_INDEX = 2147483647

export interface ShadowHost {
  host: HTMLDivElement
  shadow: ShadowRoot
}

export function createShadowHost(attribute: string): ShadowHost {
  const host = document.createElement('div')
  host.setAttribute(attribute, '')

  // 内联样式 + !important 抵御页面 CSS 对宿主元素的污染
  const styles: Array<[string, string]> = [
    ['all', 'initial'],
    ['display', 'block'],
    ['position', 'fixed'],
    ['top', '0'],
    ['left', '0'],
    ['z-index', String(MAX_Z_INDEX)],
    ['margin', '0'],
    ['padding', '0'],
    ['border', '0'],
  ]
  for (const [prop, value] of styles) {
    host.style.setProperty(prop, value, 'important')
  }

  const shadow = host.attachShadow({ mode: 'closed' })
  return { host, shadow }
}
