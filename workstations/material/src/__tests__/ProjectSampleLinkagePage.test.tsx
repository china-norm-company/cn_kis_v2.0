import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const {
  createProductMock,
  linkProductSubjectMock,
  listProductsMock,
} = vi.hoisted(() => ({
  createProductMock: vi.fn(),
  linkProductSubjectMock: vi.fn(),
  listProductsMock: vi.fn(),
}))

vi.mock('@cn-kis/api-client', () => ({
  materialApi: {
    createProduct: createProductMock,
    linkProductSubject: linkProductSubjectMock,
    listProducts: listProductsMock,
  },
}))

import { ProjectSampleLinkagePage } from '../pages/ProjectSampleLinkagePage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectSampleLinkagePage />
    </QueryClientProvider>,
  )
}

describe('ProjectSampleLinkagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('alert', vi.fn())
    listProductsMock.mockResolvedValue({ data: { items: [], total: 0 } })
    createProductMock.mockResolvedValue({ data: { id: 1 } })
    linkProductSubjectMock.mockResolvedValue({ data: { dispensing_no: 'PD-1', phone: '13800138000' } })
  })

  it('requests project linkage product list with dedicated pagination', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('项目样品关联')).toBeInTheDocument()
      expect(listProductsMock).toHaveBeenCalledWith({
        keyword: undefined,
        product_type: undefined,
        storage_condition: undefined,
        expiry_status: undefined,
        protocol_bound: undefined,
        stock_kind: undefined,
        study_project_type: undefined,
        page: 1,
        page_size: 10,
      })
    })
  })

  it('opens the project create modal from the list tab', async () => {
    renderPage()

    await screen.findByText('暂无数据，请调整筛选或新建产品')
    fireEvent.click(screen.getByRole('button', { name: '新建' }))

    expect(await screen.findByText('新建项目样品关联')).toBeInTheDocument()
    expect(screen.getByText('项目类型 *')).toBeInTheDocument()
  })
})
