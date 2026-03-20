/**
 * PaymentsPage 组件测试
 *
 * 测试礼金列表、状态展示
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import PaymentsPage from '../pages/PaymentsPage'

vi.mock('@cn-kis/api-client', () => ({
  subjectApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, name: '张三', subject_no: 'SUB-001', status: 'active' },
        ],
        total: 1,
      },
    }),
  },
  executionApi: {
    listPayments: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1, payment_no: 'PAY-001', payment_type: 'visit',
            amount: '200.00', status: 'pending', paid_at: null,
          },
        ],
      },
    }),
    initiatePayment: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    confirmPayment: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    createPayment: vi.fn().mockResolvedValue({ data: { id: 2 } }),
  },
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PaymentsPage', () => {
  it('renders page header', () => {
    renderWithProviders(<PaymentsPage />)
    expect(screen.getByText('礼金管理')).toBeInTheDocument()
  })

  it('renders subject list', async () => {
    renderWithProviders(<PaymentsPage />)
    expect(await screen.findByText('张三')).toBeInTheDocument()
  })

  it('shows prompt when no subject selected', () => {
    renderWithProviders(<PaymentsPage />)
    expect(screen.getByText('请从左侧选择受试者')).toBeInTheDocument()
  })
})
