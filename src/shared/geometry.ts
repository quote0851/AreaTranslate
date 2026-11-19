// 选区与坐标相关类型和工具函数

export interface ViewportRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

// 选区面积低于该阈值（像素平方）时不执行后续处理
export const MIN_SELECTION_AREA = 100

// 根据两个对角点归一化为左上角原点 + 正宽高的矩形
export function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): ViewportRect {
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)
  return { x, y, width, height }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
