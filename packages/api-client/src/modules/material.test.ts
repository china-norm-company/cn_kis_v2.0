import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('../client', () => ({
  api: {
    post: postMock,
    get: getMock,
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { materialApi } from './material'

describe('materialApi product receipt payload mapping', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('maps expected_quantity to expected_qty when creating product receipts', () => {
    materialApi.createProductReceipt({
      product_id: 1,
      batch_id: 2,
      expected_quantity: 3,
      source_type: 'purchase',
      supplier: '供应商A',
      po_number: 'PO-001',
      delivery_note: 'DN-001',
    })

    expect(postMock).toHaveBeenCalledWith('/product-management/product-receipts/create', {
      product_id: 1,
      batch_id: 2,
      expected_qty: 3,
      source_type: 'purchase',
      supplier: '供应商A',
      po_number: 'PO-001',
      delivery_note: 'DN-001',
    })
  })

  it('maps inspect payload field names to backend schema names', () => {
    materialApi.inspectProductReceipt(9, {
      packaging_intact: true,
      label_correct: true,
      quantity_match: false,
      documents_complete: true,
      temperature_compliant: true,
      appearance_normal: true,
      arrival_temperature: 5.2,
      accepted_quantity: 8,
      rejected_quantity: 1,
      inspection_notes: '外箱轻微破损',
      storage_location_id: 12,
    })

    expect(postMock).toHaveBeenCalledWith('/product-management/product-receipts/9/inspect', {
      packaging_intact: true,
      label_correct: true,
      quantity_match: false,
      documents_complete: true,
      temperature_compliant: true,
      appearance_normal: true,
      arrival_temp: 5.2,
      accepted_qty: 8,
      rejected_qty: 1,
      notes: '外箱轻微破损',
      location_id: 12,
    })
  })

  it('passes project linkage fields when creating a material product', () => {
    materialApi.createProduct({
      name: '修护精华',
      code: 'PRD-1001',
      protocol_id: 88,
      protocol_name: '清透修护项目',
      study_project_type: 'consumer_clt',
    })

    expect(postMock).toHaveBeenCalledWith('/material/products/create', {
      name: '修护精华',
      code: 'PRD-1001',
      protocol_id: 88,
      protocol_name: '清透修护项目',
      study_project_type: 'consumer_clt',
    })
  })

  it('passes project linkage list filters to the products endpoint', () => {
    materialApi.listProducts({
      protocol_bound: 'yes',
      stock_kind: 'has_in_stock',
      study_project_type: 'clinical',
      page: 2,
      page_size: 10,
    })

    expect(getMock).toHaveBeenCalledWith('/material/products', {
      params: {
        protocol_bound: 'yes',
        stock_kind: 'has_in_stock',
        study_project_type: 'clinical',
        page: 2,
        page_size: 10,
      },
    })
  })

  it('posts phone binding payload to product subject linkage endpoint', () => {
    materialApi.linkProductSubject(15, {
      phone: '13800138000',
      name: '张三',
    })

    expect(postMock).toHaveBeenCalledWith('/material/products/15/link-subject', {
      phone: '13800138000',
      name: '张三',
    })
  })
})
