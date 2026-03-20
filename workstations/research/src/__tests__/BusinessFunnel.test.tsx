import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BusinessFunnel, type FunnelData } from '../components/BusinessFunnel'

const SAMPLE_FUNNEL: FunnelData = {
  opportunities: { count: 12, amount: 3500000 },
  quotes: { count: 8, amount: 2000000 },
  contracts: { count: 5, amount: 1500000 },
  payments: { count: 3, amount: 800000 },
}

describe('BusinessFunnel', () => {
  it('renders 4 stages', () => {
    render(<BusinessFunnel funnel={SAMPLE_FUNNEL} />)

    expect(screen.getByText('商机')).toBeInTheDocument()
    expect(screen.getByText('报价')).toBeInTheDocument()
    expect(screen.getByText('合同')).toBeInTheDocument()
    expect(screen.getByText('回款')).toBeInTheDocument()
  })

  it('formats large amounts with 万', () => {
    render(<BusinessFunnel funnel={SAMPLE_FUNNEL} />)
    expect(screen.getByText(/¥350\.0万/)).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<BusinessFunnel funnel={undefined} isLoading />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('handles zero values gracefully', () => {
    const emptyFunnel: FunnelData = {
      opportunities: { count: 0, amount: 0 },
      quotes: { count: 0, amount: 0 },
      contracts: { count: 0, amount: 0 },
      payments: { count: 0, amount: 0 },
    }
    render(<BusinessFunnel funnel={emptyFunnel} />)

    const zeroItems = screen.getAllByText(/0 项/)
    expect(zeroItems.length).toBe(4)
  })
})
