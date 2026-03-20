import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImpactAnalysisPanel, type ImpactData } from '../components/ImpactAnalysisPanel'

const SAMPLE_IMPACT: ImpactData = {
  affected_workorders: 5,
  affected_schedules: 3,
  cost_impact: 12000,
  summary: '变更将影响 5 个工单和 3 个排程',
  recommendations: ['调整排程时间', '通知相关人员', '更新预算'],
}

describe('ImpactAnalysisPanel', () => {
  it('renders 3 stat cards', () => {
    render(<ImpactAnalysisPanel impact={SAMPLE_IMPACT} />)

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('受影响工单')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('受影响排程')).toBeInTheDocument()
    expect(screen.getByText('¥12000')).toBeInTheDocument()
    expect(screen.getByText('成本影响')).toBeInTheDocument()
  })

  it('renders recommendations list', () => {
    render(<ImpactAnalysisPanel impact={SAMPLE_IMPACT} />)

    expect(screen.getByText('调整排程时间')).toBeInTheDocument()
    expect(screen.getByText('通知相关人员')).toBeInTheDocument()
    expect(screen.getByText('更新预算')).toBeInTheDocument()
  })

  it('renders summary text', () => {
    render(<ImpactAnalysisPanel impact={SAMPLE_IMPACT} />)
    expect(screen.getByText('变更将影响 5 个工单和 3 个排程')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<ImpactAnalysisPanel isLoading />)
    expect(screen.getByText('分析中...')).toBeInTheDocument()
  })

  it('shows empty state when impact is null', () => {
    render(<ImpactAnalysisPanel impact={null} />)
    expect(screen.getByText('暂无影响分析数据')).toBeInTheDocument()
  })

  it('handles string recommendations', () => {
    const impact: ImpactData = {
      ...SAMPLE_IMPACT,
      recommendations: '建议重新评估风险',
    }
    render(<ImpactAnalysisPanel impact={impact} />)
    expect(screen.getByText('建议重新评估风险')).toBeInTheDocument()
  })
})
