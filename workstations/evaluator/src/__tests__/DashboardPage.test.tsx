/**
 * DashboardPage 页面测试
 *
 * 验证：数据加载、统计卡片、工单列表、快捷操作、环境/仪器状态
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '../pages/DashboardPage'

vi.mock('@cn-kis/api-client', () => ({
  evaluatorApi: {
    dashboard: vi.fn().mockResolvedValue({
      data: {
        date: '2026-02-16',
        stats: { pending: 2, in_progress: 1, completed: 0, total: 3 },
        work_orders: [
          { id: 1, title: 'Corneometer 测试', status: 'assigned', scheduled_date: '2026-02-16' },
          { id: 2, title: 'Cutometer 测试', status: 'assigned', scheduled_date: '2026-02-16' },
          { id: 3, title: 'VISIA 分析', status: 'in_progress', scheduled_date: '2026-02-16' },
        ],
        waiting_subjects: [
          { id: 10, name: '李**', checkin_time: '2026-02-16T08:30:00', queue_number: 1 },
        ],
        environment: { temperature: 21.5, humidity: 50.2, is_compliant: true },
        instruments: [
          { id: 1, name: 'Corneometer CM825', calibration_status: 'valid' },
        ],
      },
    }),
  },
  clawRegistryApi: {
    getByWorkstation: vi.fn().mockResolvedValue({ data: { quick_actions: [] } }),
  },
  digitalWorkforcePortalApi: {
    getSuggestions: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
  },
}))

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

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page title', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('工作面板')).toBeInTheDocument()
    })
  })

  it('shows stats cards after loading', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText(/待接受/)).toBeInTheDocument()
    })
  })

  it('displays work order titles', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Corneometer 测试')).toBeInTheDocument()
      expect(screen.getByText('Cutometer 测试')).toBeInTheDocument()
      expect(screen.getByText('VISIA 分析')).toBeInTheDocument()
    })
  })

  it('shows environment status', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText(/21.5/)).toBeInTheDocument()
      expect(screen.getByText(/50.2/)).toBeInTheDocument()
    })
  })

  it('shows scan shortcut', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText(/扫码/)).toBeInTheDocument()
    })
  })
})
