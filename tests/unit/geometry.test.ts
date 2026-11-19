import { describe, expect, it } from 'vitest'
import { clamp, normalizeRect } from '../../src/shared/geometry'

describe('normalizeRect', () => {
  it('将任意对角点归一化为左上角原点 + 正宽高', () => {
    expect(normalizeRect(10, 20, 30, 50)).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 30,
    })
  })

  it('处理反向拖拽（从右下到左上）', () => {
    expect(normalizeRect(30, 50, 10, 20)).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 30,
    })
  })

  it('处理零宽或零高', () => {
    expect(normalizeRect(5, 5, 5, 10)).toEqual({ x: 5, y: 5, width: 0, height: 5 })
  })
})

describe('clamp', () => {
  it('限制数值在区间内', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })
})
