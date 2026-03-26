/**
 * AppLayout 角色化导航测试（S5-2）
 *
 * 验证不同角色的导航项过滤逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext'

const mockHasAnyPermission = vi.fn()
const mockCanSeeMenu = vi.fn()
const mockUser = { name: 'Test User', avatar: '' }

vi.mock('@cn-kis/feishu-sdk', () => ({
  createWorkstationFeishuConfig: vi.fn(() => ({})),
  FeishuAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFeishuContext: () => ({
    user: mockUser,
    logout: vi.fn(),
    login: vi.fn(),
    hasPermission: () => true,
    hasAnyPermission: mockHasAnyPermission,
    hasAllPermissions: () => true,
    hasRole: () => false,
    hasAnyRole: () => false,
    canAccessWorkbench: () => true,
    isMenuVisible: () => true,
    canSeeMenu: mockCanSeeMenu,
    getWorkstationMode: () => 'full' as const,
    profile: { visible_menu_items: {} as Record<string, string[]> },
  }),
  LoginFallback: () => <div>Login</div>,
}))

vi.mock('@cn-kis/api-client', () => ({
  workorderApi: {
    myToday: vi.fn().mockResolvedValue({ data: [] }),
    stats: vi.fn().mockResolvedValue({ data: {} }),
    crcDashboard: vi.fn().mockResolvedValue({ data: { project_progress: [], crc_workload: [], pending_decisions: [], risk_alerts: [], summary: {} } }),
    crcMyDashboard: vi.fn().mockResolvedValue({ data: { my_projects: [], today_timeline: [], my_stats: {}, recent_exceptions: [] } }),
    schedulerDashboard: vi.fn().mockResolvedValue({ data: { pending_assignment: { total: 0, items: [] }, resource_overview: { equipment: {}, personnel: {}, venue: {} }, conflict_warnings: [], weekly_capacity: { daily: [] } } }),
  },
  protocolApi: { list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }) },
  notificationApi: { alertsDashboard: vi.fn().mockResolvedValue({ data: { total_count: 0 } }) },
  resourceApi: { statusOverview: vi.fn().mockResolvedValue({ data: {} }) },
  schedulingApi: { crossProjectOverview: vi.fn().mockResolvedValue({ data: { plans: [], total_plans: 0, total_conflicts: 0 } }) },
}))

import { AppLayout } from '../layouts/AppLayout'

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          {ui}
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

function expectVisibleLabel(label: string) {
  expect(screen.getAllByText(label).length).toBeGreaterThan(0)
}

describe('AppLayout 角色化导航', () => {
  beforeEach(() => {
    mockHasAnyPermission.mockReturnValue(true)
    mockCanSeeMenu.mockImplementation((_wb: string, _menu: string, perms?: string[]) => {
      if (!perms?.length) return true
      return mockHasAnyPermission(perms)
    })
  })

  it('默认基于权限兜底显示导航项', () => {
    mockHasAnyPermission.mockReturnValue(true)

    renderWithProviders(<AppLayout />)

    expectVisibleLabel('仪表盘')
    expectVisibleLabel('项目管理')
    expectVisibleLabel('工单管理')
    expectVisibleLabel('排程管理')
    expectVisibleLabel('访视管理')
    expectVisibleLabel('受试者')
    expectVisibleLabel('知情管理')
    expectVisibleLabel('变更管理')
    expectVisibleLabel('EDC采集')
    expectVisibleLabel('LIMS')
    expectVisibleLabel('分析报表')
  })

  it('后端 visible_menu_items 优先控制可见性', () => {
    mockCanSeeMenu.mockImplementation((_wb: string, menu: string) =>
      ['dashboard', 'workorders', 'project-management', 'scheduling', 'analytics'].includes(menu),
    )

    renderWithProviders(<AppLayout />)

    expectVisibleLabel('仪表盘')
    expectVisibleLabel('工单管理')
    expectVisibleLabel('项目管理')
    expectVisibleLabel('排程管理')
    expectVisibleLabel('分析报表')
    expect(screen.queryByText('EDC采集')).not.toBeInTheDocument()
    expect(screen.queryByText('变更管理')).not.toBeInTheDocument()
    expect(screen.queryByText('受试者')).not.toBeInTheDocument()
    expect(screen.queryByText('知情管理')).not.toBeInTheDocument()
    expect(screen.queryByText('LIMS')).not.toBeInTheDocument()
  })

  it('后端未命中时回退到权限判定', () => {
    mockCanSeeMenu.mockImplementation((_wb: string, menu: string, perms?: string[]) => {
      if (['dashboard', 'workorders'].includes(menu)) return true
      if (!perms?.length) return true
      return mockHasAnyPermission(perms)
    })
    mockHasAnyPermission.mockImplementation((perms: string[]) =>
      perms.includes('visit.plan.read') || perms.includes('workorder.workorder.read'),
    )

    renderWithProviders(<AppLayout />)

    expectVisibleLabel('仪表盘')
    expectVisibleLabel('排程管理')
    expectVisibleLabel('访视管理')
    expectVisibleLabel('工单管理')
  })

  it('权限不足时隐藏受限导航项', () => {
    mockCanSeeMenu.mockReturnValue(false)
    mockHasAnyPermission.mockReturnValue(false)

    renderWithProviders(<AppLayout />)

    expect(screen.queryByText('仪表盘')).not.toBeInTheDocument()
    expect(screen.queryByText('工单管理')).not.toBeInTheDocument()
    expect(screen.queryByText('排程管理')).not.toBeInTheDocument()
    expect(screen.queryByText('LIMS')).not.toBeInTheDocument()
  })
})
