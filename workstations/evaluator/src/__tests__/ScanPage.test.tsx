/**
 * ScanPage 页面测试
 *
 * 验证：手动输入、二维码解析、结果显示、导航跳转
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ScanPage } from '../pages/ScanPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@cn-kis/api-client', () => ({
  qrcodeApi: {
    /** ScanPage 经 SmartQRScanner 调用 smartResolve，非旧版 resolve */
    smartResolve: vi.fn().mockResolvedValue({
      data: {
        entity: {
          id: 1,
          entity_type: 'subject',
          entity_id: 1,
          qr_data: '',
          qr_hash: 'mock',
          label: 'S001',
          is_active: true,
          create_time: '',
        },
        recommended_action: 'jump_to_workorder',
        action_data: { work_order_id: 10 },
        alternative_actions: [],
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
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ScanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders scan page with input field', () => {
    renderWithProviders(<ScanPage />)

    expect(screen.getByPlaceholderText(/手动输入受试者编号/)).toBeInTheDocument()
  })

  it('renders scan title', () => {
    renderWithProviders(<ScanPage />)

    expect(screen.getByText('扫码快捷执行')).toBeInTheDocument()
  })

  it('has a manual input field for entering codes', () => {
    renderWithProviders(<ScanPage />)

    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('navigates to execute page when single work order found', async () => {
    renderWithProviders(<ScanPage />)

    const input = screen.getAllByRole('textbox')[0]
    fireEvent.change(input, { target: { value: 'S001' } })

    const submitBtn = screen.getByText('查询')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/execute/10')
    })
  })
})
