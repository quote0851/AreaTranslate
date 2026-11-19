import { describe, expect, it } from 'vitest'
import { MAX_CHUNK_LENGTH, segmentText } from '../../src/translation/segment'

describe('segmentText', () => {
  it('短文本直接返回单元素', () => {
    expect(segmentText('Hello world')).toEqual(['Hello world'])
  })

  it('空文本返回单元素', () => {
    expect(segmentText('')).toEqual([''])
  })

  it('超长文本被切分为多个不超过上限的分段', () => {
    const sentence = 'This is a reasonably long sentence for testing segmentation behavior. '
    const text = sentence.repeat(60) // 约 3900 字符
    const chunks = segmentText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_LENGTH)
    }
    // 分段后拼接应保留全部内容（忽略空格差异）
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('This is a reasonably long sentence')
  })
})
