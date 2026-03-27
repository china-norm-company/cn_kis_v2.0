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
            id: 1,
            plan_no: 'RP-202601-0001',
            title: '测试招募计划',
            target_count: 50,
            enrolled_count: 10,
            screened_count: 20,
            registered_count: 30,
            completion_rate: 20,
            appointment_completion_rate: 60,
            status: 'active',
            protocol_id: 1,
            protocol_code: 'C001',
            project_code: 'C001',
            display_project_code: 'C001',
            start_date: '2026-01-01',
            end_date: '2026-06-30',
            create_time: '2026-01-01T00:00:00',
            description: '',
            sample_requirement: '',
            wei_visit_point: '',
            wei_visit_date: null,
            researcher_name: '',
            supervisor_name: '',
            recruit_start_date: null,
            recruit_end_date: null,
            planned_appointment_count: 0,
            actual_appointment_count: 0,
            recruit_specialist_names: [],
            channel_recruitment_needed: false,
            material_prep_status: 'draft',
          },
        ],
        total: 1,
      },
    }),
    transitionPlanStatus: vi.fn().mockResolvedValue({ data: { id: 1, status: 'paused' } }),
    deletePlan: vi.fn().mockResolvedValue({}),
  },
  protocolApi: {
    list: vi.fn().mockResolvedValue({ data: { items: [] } }),
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
    expect(screen.getByText('新增计划')).toBeInTheDocument()
  })

  it('renders status filter', () => {
    renderWithProviders(<PlansPage />)
    expect(screen.getByText('全部状态')).toBeInTheDocument()
  })

  it('renders table headers', async () => {
    renderWithProviders(<PlansPage />)
    expect(await screen.findByText('项目编号')).toBeInTheDocument()
    expect(screen.getByText('项目名称')).toBeInTheDocument()
  })
})
