import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ReceptionDashboardPage from '../pages/ReceptionDashboardPage'

vi.mock('@cn-kis/feishu-sdk', () => ({
  useFeishuContext: () => ({
    user: { name: 'Test', avatar: '' },
    hasPermission: () => true,
    profile: {},
    getWorkstationMode: () => 'full' as const,
  }),
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getWorkstationUrl: () => 'http://localhost/',
}))

vi.mock('@cn-kis/api-client', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: {} }) },
  clawRegistryApi: { getByWorkstation: vi.fn().mockResolvedValue({ data: { quick_actions: [] } }) },
  receptionApi: {
    todayQueue: vi.fn().mockResolvedValue({ data: { items: [], date: '', total: 0, page: 1, page_size: 10 } }),
    todayQueueExport: vi.fn().mockResolvedValue({ data: { items: [], date: '', total: 0 } }),
    todayStats: vi.fn().mockResolvedValue({ data: {} }),
    boardCheckin: vi.fn(),
    boardCheckout: vi.fn(),
    pendingAlerts: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  },
  workorderApi: { create: vi.fn() },
  qualityApi: {},
  safetyApi: {},
  qrcodeApi: {},
  executionApi: {},
  digitalWorkforcePortalApi: {},
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('ReceptionDashboardPage', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('renders page title', async () => {
    renderWithProviders(<ReceptionDashboardPage />)
    await waitFor(() => { expect(screen.getByText('前台接待')).toBeInTheDocument() })
  })
})
