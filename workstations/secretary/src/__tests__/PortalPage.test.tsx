import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PortalPage } from '../pages/PortalPage'

vi.mock('@cn-kis/feishu-sdk', () => ({
  useFeishuContext: () => ({
    canAccessWorkbench: () => true,
  }),
}))

vi.mock('@cn-kis/api-client', () => ({
  clawRegistryApi: {
    getByWorkstation: vi.fn().mockResolvedValue({
      data: { quick_actions: [] },
    }),
  },
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

describe('PortalPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders portal title', () => {
    renderWithProviders(<PortalPage />)
    expect(screen.getByText('工作台门户')).toBeInTheDocument()
  })

  it('shows workstation cards', () => {
    renderWithProviders(<PortalPage />)
    expect(screen.getByText(/子衿·秘书台/)).toBeInTheDocument()
    expect(screen.getByText(/管仲·财务台/)).toBeInTheDocument()
  })

  it('renders AI quick panel section', () => {
    renderWithProviders(<PortalPage />)
    expect(screen.getByText('AI 快捷操作')).toBeInTheDocument()
  })
})
