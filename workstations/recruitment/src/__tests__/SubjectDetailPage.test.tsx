/**
 * SubjectDetailPage 组件测试
 *
 * 测试档案 Tab 切换、数据加载
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SubjectDetailPage from '../pages/SubjectDetailPage'

vi.mock('@cn-kis/api-client', () => ({
  subjectApi: {
    get: vi.fn().mockResolvedValue({
      data: {
        id: 1, subject_no: 'SUB-202601-0001', name: '张三',
        gender: 'male', age: 25, phone: '13800138000',
        source_channel: 'online', risk_level: 'low', status: 'active',
        create_time: '2026-01-01T00:00:00',
      },
    }),
    listEnrollments: vi.fn().mockResolvedValue({
      data: { items: [], total: 0 },
    }),
  },
  executionApi: {
    getSubjectProfile: vi.fn().mockResolvedValue({
      data: {
        birth_date: '1990-01-01', ethnicity: '汉族', education: '本科',
        occupation: '工程师', marital_status: 'single',
        province: '广东', city: '深圳', district: '南山',
        consent_data_sharing: true, consent_rwe_usage: false,
        consent_biobank: false, consent_follow_up: true,
        total_enrollments: 2, total_completed: 1,
      },
    }),
    getSubjectTimeline: vi.fn().mockResolvedValue({
      data: { items: [] },
    }),
    getDomainProfile: vi.fn().mockResolvedValue({
      data: {},
    }),
    listMedicalHistory: vi.fn().mockResolvedValue({
      data: { items: [] },
    }),
    listAllergies: vi.fn().mockResolvedValue({
      data: { items: [] },
    }),
    listMedications: vi.fn().mockResolvedValue({
      data: { items: [] },
    }),
  },
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/subjects/1']}>
        <Routes>
          <Route path="/subjects/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SubjectDetailPage', () => {
  it('renders subject name after loading', async () => {
    renderWithProviders(<SubjectDetailPage />)
    expect(await screen.findByText('张三')).toBeInTheDocument()
  })

  it('renders subject number', async () => {
    renderWithProviders(<SubjectDetailPage />)
    expect(await screen.findByText('SUB-202601-0001')).toBeInTheDocument()
  })

  it('renders all 5 tabs', async () => {
    renderWithProviders(<SubjectDetailPage />)
    await screen.findByText('张三')
    expect(screen.getByText('主档案')).toBeInTheDocument()
    expect(screen.getByText('医学史/过敏/用药')).toBeInTheDocument()
    expect(screen.getByText('领域档案')).toBeInTheDocument()
    expect(screen.getByText('入组记录')).toBeInTheDocument()
    expect(screen.getByText('时间线')).toBeInTheDocument()
  })

  it('switches to medical tab', async () => {
    renderWithProviders(<SubjectDetailPage />)
    await screen.findByText('张三')
    fireEvent.click(screen.getByText('医学史/过敏/用药'))
    expect(await screen.findByText('既往病史')).toBeInTheDocument()
    expect(screen.getByText('过敏记录')).toBeInTheDocument()
    expect(screen.getByText('合并用药')).toBeInTheDocument()
  })

  it('switches to domain tab', async () => {
    renderWithProviders(<SubjectDetailPage />)
    await screen.findByText('张三')
    fireEvent.click(screen.getByText('领域档案'))
    expect(await screen.findByText('皮肤')).toBeInTheDocument()
    expect(screen.getByText('口腔')).toBeInTheDocument()
    expect(screen.getByText('营养')).toBeInTheDocument()
  })
})
