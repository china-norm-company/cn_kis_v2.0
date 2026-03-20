/**
 * RegistrationsPage 组件测试
 *
 * 测试报名列表渲染、创建按钮
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import RegistrationsPage from '../pages/RegistrationsPage'

vi.mock('@cn-kis/api-client', () => ({
  recruitmentApi: {
    listRegistrations: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1, registration_no: 'REG-001', name: '张三', phone: '13800138000',
            gender: 'male', age: 25, status: 'registered',
            create_time: '2026-01-15T10:00:00',
          },
        ],
        total: 1,
      },
    }),
    createScreening: vi.fn().mockResolvedValue({ data: { id: 1, screening_no: 'SCR-001' } }),
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

describe('RegistrationsPage', () => {
  it('renders page header', () => {
    renderWithProviders(<RegistrationsPage />)
    expect(screen.getByText('报名管理')).toBeInTheDocument()
  })

  it('renders create button', () => {
    renderWithProviders(<RegistrationsPage />)
    expect(screen.getByText('新建报名')).toBeInTheDocument()
  })

  it('renders status filter', () => {
    renderWithProviders(<RegistrationsPage />)
    expect(screen.getByText('全部状态')).toBeInTheDocument()
  })

  it('renders table with data', async () => {
    renderWithProviders(<RegistrationsPage />)
    expect(await screen.findByText('张三')).toBeInTheDocument()
    expect(screen.getByText('REG-001')).toBeInTheDocument()
  })

  it('renders screening action for pending registration', async () => {
    renderWithProviders(<RegistrationsPage />)
    expect(await screen.findByText('筛选')).toBeInTheDocument()
  })
})
