/**
 * DashboardPage 组件测试
 *
 * 测试看板渲染、KPI 卡片展示
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'

vi.mock('@cn-kis/api-client', () => ({
  recruitmentApi: {
    listPlans: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1, plan_no: 'RP-001', title: '测试计划',
            target_count: 100, registered_count: 50, screened_count: 30, enrolled_count: 20,
            completion_rate: 0.2, status: 'active',
            start_date: '2026-01-01', end_date: '2026-06-30',
            create_time: '2026-01-01T00:00:00',
          },
        ],
        total: 1,
      },
    }),
    getMyTasks: vi.fn().mockResolvedValue({
      data: {
        pending_contact: { count: 0, items: [] },
        pending_screening: { count: 0, items: [] },
        pending_enrollment: { count: 0, items: [] },
        need_callback: { count: 0, items: [] },
        overdue_followup: { count: 0, items: [] },
      },
    }),
    listRegistrations: vi.fn().mockResolvedValue({
      data: { items: [], total: 0 },
    }),
    getFunnel: vi.fn().mockResolvedValue({
      data: {
        registered: 50,
        screened: 30,
        enrolled: 20,
        withdrawn: 5,
        conversion_rates: {
          registered_to_screened: 60,
          screened_to_enrolled: 66.7,
          overall: 40,
        },
      },
    }),
    getWithdrawalAnalysis: vi.fn().mockResolvedValue({
      data: {
        total_withdrawn: 5,
        reasons: [{ reason: '时间冲突', count: 3, percentage: 60 }],
      },
    }),
    getTrends: vi.fn().mockResolvedValue({
      data: {
        items: [
          { date: '2026-01-01', registered: 10, screened: 6, enrolled: 4 },
          { date: '2026-01-02', registered: 12, screened: 7, enrolled: 5 },
        ],
      },
    }),
  },
  preScreeningApi: {
    todaySummary: vi.fn().mockResolvedValue({
      data: {
        total: 8,
        completed: 6,
        passed: 4,
        pass_rate: 50,
      },
    }),
  },
  clawRegistryApi: {
    getByWorkstation: vi.fn().mockResolvedValue({
      data: {
        items: [],
      },
    }),
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

describe('DashboardPage', () => {
  it('renders page header', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('招募看板')).toBeInTheDocument()
  })

  it('renders 4 KPI cards', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('目标人数')).toBeInTheDocument()
    expect(screen.getByText('报名数')).toBeInTheDocument()
    expect(screen.getByText('筛选数')).toBeInTheDocument()
    expect(screen.getByText('入组数')).toBeInTheDocument()
  })

  it('renders project progress section', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByText('各项目招募进度')).toBeInTheDocument()
  })

  it('renders task panel and registration sections', async () => {
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('今日任务')).toBeInTheDocument()
    expect(screen.getByText('近期报名动态')).toBeInTheDocument()
  })
})
