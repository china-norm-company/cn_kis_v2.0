/**
 * ExecutePage 页面测试
 *
 * 验证：工单加载、阶段切换（接受→准备→执行→完成）、操作触发
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ExecutePage } from '../pages/ExecutePage'

vi.mock('@cn-kis/api-client', () => ({
  workorderApi: {
    get: vi.fn().mockResolvedValue({
      data: {
        id: 1,
        title: 'Corneometer 角质层含水量测试 - 李华V1',
        description: '基线访视：使用 Corneometer 测试受试者面部 T 区和 U 区',
        work_order_type: 'examination',
        status: 'assigned',
        scheduled_date: '2026-02-16',
        resources: [],
        checklist_items: [],
        enrollment_id: 1,
      },
    }),
  },
  evaluatorApi: {
    acceptWorkOrder: vi.fn().mockResolvedValue({ data: { success: true } }),
    rejectWorkOrder: vi.fn().mockResolvedValue({ data: { success: true } }),
    prepareWorkOrder: vi.fn().mockResolvedValue({ data: { success: true } }),
    initSteps: vi.fn().mockResolvedValue({ data: { success: true, step_count: 5 } }),
    getSteps: vi.fn().mockResolvedValue({ data: { items: [] } }),
    getExceptions: vi.fn().mockResolvedValue({ data: { items: [] } }),
    startStep: vi.fn().mockResolvedValue({ data: { success: true } }),
    completeStep: vi.fn().mockResolvedValue({ data: { success: true } }),
    pauseWorkOrder: vi.fn().mockResolvedValue({ data: { success: true } }),
    resumeWorkOrder: vi.fn().mockResolvedValue({ data: { success: true } }),
    reportException: vi.fn().mockResolvedValue({ data: { exception_id: 1 } }),
  },
}))

function renderExecutePage(workOrderId = '1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/execute/${workOrderId}`]}>
        <Routes>
          <Route path="/execute/:id" element={<ExecutePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ExecutePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders work order title after loading', async () => {
    renderExecutePage()
    await waitFor(() => {
      const titles = screen.getAllByText(/Corneometer 角质层含水量测试/)
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows phase tabs', async () => {
    renderExecutePage()
    await waitFor(() => {
      expect(screen.getByText('接受')).toBeInTheDocument()
      expect(screen.getByText('准备')).toBeInTheDocument()
      expect(screen.getByText('执行')).toBeInTheDocument()
      expect(screen.getByText('完成')).toBeInTheDocument()
    })
  })

  it('shows accept button for assigned order', async () => {
    renderExecutePage()
    await waitFor(() => {
      const buttons = screen.getAllByText(/接受工单/)
      expect(buttons.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows reject button for assigned order', async () => {
    renderExecutePage()
    await waitFor(() => {
      expect(screen.getByText(/拒绝/)).toBeInTheDocument()
    })
  })

  it('shows exception report button', async () => {
    renderExecutePage()
    await waitFor(() => {
      expect(screen.getByText('上报异常')).toBeInTheDocument()
    })
  })

  it('shows work order status badge', async () => {
    renderExecutePage()
    await waitFor(() => {
      expect(screen.getByText('已分配')).toBeInTheDocument()
    })
  })

  it('shows subject info section', async () => {
    renderExecutePage()
    await waitFor(() => {
      expect(screen.getByText('受试者信息')).toBeInTheDocument()
    })
  })

  it('shows detection method section', async () => {
    renderExecutePage()
    await waitFor(() => {
      expect(screen.getByText('检测方法')).toBeInTheDocument()
    })
  })
})
