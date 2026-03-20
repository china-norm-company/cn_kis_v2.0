/**
 * PlansPage 组件测试
 *
 * 测试计划列表渲染、创建按钮、状态筛选
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import PlansPage from '../pages/PlansPage'

vi.mock('@cn-kis/api-client', () => ({
  recruitmentApi: {
    listPlans: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1, plan_no: 'RP-202601-0001', title: '测试招募计划',
            target_count: 50, enrolled_count: 10, screened_count: 20, registered_count: 30,
            completion_rate: 0.2, status: 'active', protocol_id: 1,
            start_date: '2026-01-01', end_date: '2026-06-30',
            create_time: '2026-01-01T00:00:00',
          },
        ],
        total: 1,
      },
    }),
    transitionPlanStatus: vi.fn().mockResolvedValue({ data: { id: 1, status: 'paused' } }),
  },
}))

vi.mock('@cn-kis/feishu-sdk', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => children,
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

describe('PlansPage', () => {
  it('renders page header', () => {
    renderWithProviders(<PlansPage />)
    expect(screen.getByText('招募计划管理')).toBeInTheDocument()
  })

  it('renders create button', () => {
    renderWithProviders(<PlansPage />)
    expect(screen.getByText('新建计划')).toBeInTheDocument()
  })

  it('renders status filter', () => {
    renderWithProviders(<PlansPage />)
    expect(screen.getByText('全部状态')).toBeInTheDocument()
  })

  it('renders table headers', async () => {
    renderWithProviders(<PlansPage />)
    expect(await screen.findByText('计划编号')).toBeInTheDocument()
    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('完成率')).toBeInTheDocument()
  })
})
