import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '../pages/DashboardPage'

vi.mock('@cn-kis/api-client', () => ({
  materialApi: {
    dashboard: vi.fn().mockResolvedValue({ data: {} }),
    getProductStats: vi.fn().mockResolvedValue({ data: {} }),
    getExpiryAlerts: vi.fn().mockResolvedValue({ data: {} }),
    getTransactionStats: vi.fn().mockResolvedValue({ data: {} }),
    listProducts: vi.fn().mockResolvedValue({ data: {} }),
    listConsumables: vi.fn().mockResolvedValue({ data: {} }),
    getConsumableStats: vi.fn().mockResolvedValue({ data: {} }),
  },
  clawRegistryApi: { getByWorkstation: vi.fn().mockResolvedValue({ data: { quick_actions: [] } }) },
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('DashboardPage', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('renders page title', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => { expect(screen.getByText('物料管理概览')).toBeInTheDocument() })
  })
})
