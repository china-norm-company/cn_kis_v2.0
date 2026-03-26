import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext'
import SchedulingPage from '../pages/SchedulingPage'

vi.mock('@cn-kis/api-client', () => ({
  schedulingApi: {
    listPlans: vi.fn().mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 20 } }),
    listSlots: vi.fn().mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 50 } }),
    listMilestones: vi.fn().mockResolvedValue({ data: { items: [] } }),
    getTimelineUpload: vi.fn().mockResolvedValue({ data: {} }),
    getTimelinePublished: vi.fn().mockResolvedValue({ data: { items: [] } }),
    getExecutionOrderPending: vi.fn().mockResolvedValue({ data: { items: [] } }),
    getLabScheduleList: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
    saveTimelineUpload: vi.fn().mockResolvedValue({ data: {} }),
    uploadLabSchedule: vi.fn().mockResolvedValue({ data: {} }),
    clearLabSchedule: vi.fn().mockResolvedValue({ data: {} }),
  },
  visitApi: {
    listResourceApprovalList: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  },
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

/** 视图切换按钮仅在「时间槽」Tab 下展示 */
function openSlotsTab() {
  fireEvent.click(screen.getByRole('button', { name: '时间槽' }))
}

describe('SchedulingPage', () => {
  it('renders page header', () => {
    renderWithProviders(<SchedulingPage />)
    expect(screen.getAllByText('排程管理').length).toBeGreaterThan(0)
  })

  it('renders view mode buttons on 时间槽 tab', () => {
    renderWithProviders(<SchedulingPage />)
    openSlotsTab()
    expect(screen.getByText('列表')).toBeInTheDocument()
    expect(screen.getByText('周视图')).toBeInTheDocument()
    expect(screen.getByText('月视图')).toBeInTheDocument()
    expect(screen.getByText('甘特图')).toBeInTheDocument()
    expect(screen.getByText('资源日历')).toBeInTheDocument()
  })

  it('renders stat cards', () => {
    renderWithProviders(<SchedulingPage />)
    expect(screen.getAllByText('排程计划').length).toBeGreaterThan(0)
    expect(screen.getByText('待执行槽位')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('冲突')).toBeInTheDocument()
  })

  it('switches views on click', () => {
    renderWithProviders(<SchedulingPage />)
    openSlotsTab()
    const weekBtn = screen.getByText('周视图')
    fireEvent.click(weekBtn)
    expect(screen.getByText('周视图')).toBeInTheDocument()
  })

  it('renders create plan button', () => {
    renderWithProviders(<SchedulingPage />)
    expect(screen.getByText('创建排程')).toBeInTheDocument()
  })

  it('renders tab navigation', () => {
    renderWithProviders(<SchedulingPage />)
    expect(screen.getByText('时间槽')).toBeInTheDocument()
    expect(screen.getAllByText('排程计划').length).toBeGreaterThan(0)
    expect(screen.getByText('里程碑')).toBeInTheDocument()
  })
})
