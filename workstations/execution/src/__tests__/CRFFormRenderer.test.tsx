import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CRFFormRenderer from '../components/CRFFormRenderer'

function renderWithProvider(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const template = {
  id: 1,
  template_name: '体征检查表',
  category: 'baseline',
  schema: {
    title: '体征检查表',
    questions: [
      { id: 'temperature', type: 'number', title: '体温', required: true, unit: '°C' },
      { id: 'blood_pressure', type: 'text', title: '血压', required: false },
    ],
  },
} as any

describe('CRFFormRenderer', () => {
  it('可渲染模板标题与字段', () => {
    renderWithProvider(<CRFFormRenderer template={template} workOrderId={1001} />)
    expect(screen.getByText('体征检查表')).toBeInTheDocument()
    expect(screen.getByText('体温')).toBeInTheDocument()
    expect(screen.getByText('血压')).toBeInTheDocument()
  })
})
