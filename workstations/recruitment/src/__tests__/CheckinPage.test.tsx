/**
 * CheckinPage 组件测试
 *
 * 测试签到操作、签到记录列表
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import CheckinPage from '../pages/CheckinPage'

vi.mock('@cn-kis/api-client', () => ({
  subjectApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, name: '张三', subject_no: 'SUB-001', status: 'active' },
          { id: 2, name: '李四', subject_no: 'SUB-002', status: 'active' },
        ],
        total: 2,
      },
    }),
  },
  executionApi: {
    listCheckins: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1, checkin_date: '2026-01-15',
            checkin_time: '09:00:00', checkout_time: null,
            status: 'checked_in',
          },
        ],
      },
    }),
    checkin: vi.fn().mockResolvedValue({ data: { id: 2 } }),
    checkout: vi.fn().mockResolvedValue({ data: { id: 1 } }),
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

describe('CheckinPage', () => {
  it('renders page header', () => {
    renderWithProviders(<CheckinPage />)
    expect(screen.getByText('签到管理')).toBeInTheDocument()
  })

  it('renders subject list', async () => {
    renderWithProviders(<CheckinPage />)
    expect(await screen.findByText('张三')).toBeInTheDocument()
    expect(screen.getByText('李四')).toBeInTheDocument()
  })

  it('shows prompt when no subject selected', () => {
    renderWithProviders(<CheckinPage />)
    expect(screen.getByText('请从左侧选择受试者')).toBeInTheDocument()
  })
})
