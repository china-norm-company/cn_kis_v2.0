/**
 * Dashboard 角色路由器测试（S5-1）
 *
 * 验证不同角色登录后渲染对应的Dashboard组件。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// Mock useFeishuContext
const mockHasRole = vi.fn()
vi.mock('@cn-kis/feishu-sdk', () => ({
  useFeishuContext: () => ({
    hasRole: mockHasRole,
    hasAnyPermission: () => true,
    hasAnyRole: () => true,
  }),
}))

// Mock API calls
vi.mock('@cn-kis/api-client', () => ({
  workorderApi: {
    myToday: vi.fn().mockResolvedValue({ data: [] }),
    stats: vi.fn().mockResolvedValue({ data: { total: 0 } }),
    crcDashboard: vi.fn().mockResolvedValue({
      data: {
        project_progress: [],
        crc_workload: [],
        pending_decisions: [],
        risk_alerts: [],
        summary: { total_work_orders: 0, today_scheduled: 0, active_work_orders: 0, completed_today: 0 },
      },
    }),
    crcMyDashboard: vi.fn().mockResolvedValue({
      data: {
        my_projects: [],
        today_timeline: [],
        my_stats: { total_active: 0, today_scheduled: 0, today_completed: 0, week_completed: 0, overdue: 0 },
        recent_exceptions: [],
      },
    }),
    schedulerDashboard: vi.fn().mockResolvedValue({
      data: {
        pending_assignment: { total: 0, items: [] },
        resource_overview: {
          equipment: { total: 0, active: 0, calibration_due: 0 },
          personnel: { total: 0, on_duty: 0 },
          venue: { total: 0, available: 0 },
        },
        conflict_warnings: [],
        weekly_capacity: { week_start: '', week_end: '', total_scheduled: 0, total_completed: 0, daily: [] },
      },
    }),
  },
  schedulingApi: {
    crossProjectOverview: vi.fn().mockResolvedValue({ data: { plans: [], total_plans: 0, total_conflicts: 0 } }),
  },
  protocolApi: {
    list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  },
  notificationApi: {
    alertsDashboard: vi.fn().mockResolvedValue({ data: { total_count: 0 } }),
  },
  resourceApi: {
    statusOverview: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

import DashboardPage from '../pages/DashboardPage'

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage 角色路由器', () => {
  beforeEach(() => {
    mockHasRole.mockReset()
  })

  it('CRC主管看到多项目交付指挥中心', async () => {
    mockHasRole.mockImplementation((role: string) => role === 'crc_supervisor')
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('多项目交付指挥中心')).toBeInTheDocument()
  })

  it('CRC协调员看到我的项目工作台', async () => {
    mockHasRole.mockImplementation((role: string) => role === 'crc')
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('我的项目工作台')).toBeInTheDocument()
  })

  it('排程专员看到资源调度中心', async () => {
    mockHasRole.mockImplementation((role: string) => role === 'scheduler')
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('资源调度中心')).toBeInTheDocument()
  })

  it('其他角色看到默认执行仪表盘', async () => {
    mockHasRole.mockReturnValue(false)
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('执行仪表盘')).toBeInTheDocument()
  })
})
