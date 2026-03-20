import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WorkOrderChecklist from '../components/WorkOrderChecklist'

vi.mock('@cn-kis/api-client', () => ({
  workorderApi: {
    getChecklists: vi.fn().mockResolvedValue({
      data: [
        { id: 1, sequence: 1, item_text: '确认知情同意书', is_mandatory: true, is_checked: false, checked_at: null, checked_by: null },
        { id: 2, sequence: 2, item_text: '拍摄基线照片', is_mandatory: false, is_checked: true, checked_at: '2026-01-01T00:00:00', checked_by: 1 },
      ],
    }),
    toggleChecklist: vi.fn().mockResolvedValue({ code: 200, msg: 'OK', data: {} }),
  },
}))

function renderWithProvider(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('WorkOrderChecklist', () => {
  it('可渲染检查清单', async () => {
    renderWithProvider(<WorkOrderChecklist workOrderId={1001} />)
    expect(await screen.findByText('确认知情同意书')).toBeInTheDocument()
    expect(await screen.findByText('拍摄基线照片')).toBeInTheDocument()
  })
})
