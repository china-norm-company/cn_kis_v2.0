import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '../pages/DashboardPage'

vi.mock('@cn-kis/api-client', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: {} }) },
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
    await waitFor(() => { expect(screen.getByText('管理看板')).toBeInTheDocument() })
  })
})
