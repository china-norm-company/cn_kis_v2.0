import { describe, expect, it } from 'vitest'
import { formatExecutionPeriodToMMMMDDYY } from './executionOrderPlanConfig'

describe('formatExecutionPeriodToMMMMDDYY', () => {
  it('将同年同月「起始日-结束日」简写展开为中文范围', () => {
    expect(formatExecutionPeriodToMMMMDDYY('2026/3/26-31')).toBe('2026年3月26日~2026年3月31日')
    expect(formatExecutionPeriodToMMMMDDYY('2026-03-26-31')).toBe('2026年3月26日~2026年3月31日')
  })

  it('去掉末尾误粘的 Excel 序列号后再格式化', () => {
    expect(formatExecutionPeriodToMMMMDDYY('2026/3/26-31 46111')).toBe('2026年3月26日~2026年3月31日')
    expect(formatExecutionPeriodToMMMMDDYY('2026/3/24-27 46105')).toBe('2026年3月24日~2026年3月27日')
  })

  it('解析英文月份范围 Jan,03,2026-Mar.30,2026（及带空格变体）', () => {
    expect(formatExecutionPeriodToMMMMDDYY('Jan,03,2026-Mar.30,2026')).toBe(
      '2026年1月3日~2026年3月30日'
    )
    expect(formatExecutionPeriodToMMMMDDYY('Jan, 03, 2026 - Mar. 30, 2026')).toBe(
      '2026年1月3日~2026年3月30日'
    )
  })

  it('保留已有斜杠范围行为', () => {
    expect(formatExecutionPeriodToMMMMDDYY('2026/1/16-1/23')).toContain('年')
  })
})
