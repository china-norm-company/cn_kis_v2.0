import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { FinanceDashboardPage } from '../pages/FinanceDashboardPage'

vi.mock('@cn-kis/api-client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: {
        kpis: { total_contract_amount: 1000000, total_invoiced: 500000, total_received: 300000, collection_rate: 60.0, total_cost: 200000, gross_margin: 30.0, overdue_amount: 50000, overdue_count: 3, dso: 45 },
        trends: [], ar_aging: {}, alerts: [], todos: [], expiring: [],
      },
    }),
  },
  clawRegistryApi: {
    getByWorkstation: vi.fn().mockResolvedValue({ data: { quick_actions: [] } }),
  },
}))

vi.mock('recharts', () => {
  const React = require('react')
  const mock = (name: string) => ({ children, ...props }: any) => React.createElement('div', { 'data-testid': name }, children)
  return {
    LineChart: mock('LineChart'), Line: mock('Line'),
    BarChart: mock('BarChart'), Bar: mock('Bar'),
    PieChart: mock('PieChart'), Pie: mock('Pie'), Cell: mock('Cell'),
    XAxis: mock('XAxis'), YAxis: mock('YAxis'),
    CartesianGrid: mock('CartesianGrid'), Tooltip: mock('Tooltip'),
    Legend: mock('Legend'), ResponsiveContainer: mock('ResponsiveContainer'),
  }
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('FinanceDashboardPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders dashboard title', async () => {
    renderWithProviders(<FinanceDashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('财务驾驶舱')).toBeInTheDocument()
    })
  })

  it('shows period toggle buttons', () => {
    renderWithProviders(<FinanceDashboardPage />)
    expect(screen.getByText('本月')).toBeInTheDocument()
    expect(screen.getByText('本季')).toBeInTheDocument()
    expect(screen.getByText('本年')).toBeInTheDocument()
  })
})
