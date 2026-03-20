/**
 * 物料管理工作台（度支）API 模块
 *
 * 对应后端：/api/v1/material/
 * 覆盖：仪表盘、产品台账、耗材管理、样品管理、出入库流水、效期预警、库存管理
 */
import { api } from '../client'

// ============================================================================
// 类型定义
// ============================================================================

/** 物料仪表盘 */
export interface MaterialDashboard {
  products: ProductStats
  consumables: ConsumableStats
  samples: SampleStats
  transactions: TransactionStats
  expiry: { red_count: number; orange_count: number; yellow_count: number }
  inventory: {
    cold_count: number
    cool_count: number
    room_count: number
    last_check_date: string | null
    check_result: string
  }
}

/** 产品统计 */
export interface ProductStats {
  total_products: number
  active_batches: number
  expiring_soon: number
  expired: number
}

/** 产品列表项 */
export interface ProductItem {
  id: number
  name: string
  code: string
  batch_number: string
  specification: string
  storage_condition: string
  expiry_date: string | null
  product_type: string
  product_type_display: string
  sponsor: string
  protocol_name: string
  sample_count: number
  in_stock_count: number
  distributed_count: number
  status: string
  create_time: string
}

/** 产品详情 */
export interface ProductDetail extends ProductItem {
  description: string
  batches: Array<{
    batch_number: string
    quantity: number
    received_date: string
    expiry_date: string
  }>
  sample_summary: {
    total: number
    in_stock: number
    distributed: number
    returned: number
    destroyed: number
  }
  retention_info: {
    required: boolean
    quantity: number
    location: string
    release_date: string
  } | null
}

/** 耗材统计 */
export interface ConsumableStats {
  total_types: number
  total_quantity: number
  low_stock_count: number
  expiring_count: number
}

/** 耗材列表项 */
export interface ConsumableItem {
  id: number
  name: string
  code: string
  specification: string
  unit: string
  current_stock: number
  safety_stock: number
  storage_condition: string
  expiry_date: string | null
  status: string
  status_display: string
  category: string
  last_issue_date: string | null
}

/** 样品统计 */
export interface SampleStats {
  total: number
  in_stock: number
  distributed: number
  returned: number
  consumed: number
  destroyed: number
  retention: number
}

/** 样品列表项 */
export interface SampleItem {
  id: number
  unique_code: string
  product_id: number
  product_name: string
  product_code: string
  status: string
  status_display: string
  current_holder: string | null
  protocol_name: string
  storage_location: string | null
  retention: boolean
  create_time: string
}

/** 样品详情 */
export interface SampleDetail extends SampleItem {
  transactions: Array<{
    id: number
    transaction_type: string
    transaction_type_display: string
    operator_name: string
    remarks: string
    create_time: string
    enrollment_id?: number
    subject_name?: string
  }>
}

/** 追溯结果 */
export interface TraceResult {
  sample: SampleItem
  timeline: Array<{
    step: number
    action: string
    operator: string
    date: string
    detail: string
  }>
  related_samples: Array<{
    unique_code: string
    status: string
  }>
}

/** 出入库流水统计 */
export interface TransactionStats {
  today_inbound: number
  today_outbound: number
  month_total: number
  abnormal_count: number
}

/** 出入库流水列表项 */
export interface TransactionItem {
  id: number
  transaction_type: string
  type_display: string
  material_name: string
  material_code: string
  batch_number: string
  quantity: number
  unit: string
  operator_name: string
  related_document: string
  remarks: string
  create_time: string
}

/** 效期预警项 */
export interface ExpiryAlertItem {
  id: number
  material_name: string
  material_code: string
  batch_number: string
  expiry_date: string
  days_remaining: number
  material_type: string
  status: string
  status_display: string
  location: string
}

/** 效期预警数据 */
export interface ExpiryAlerts {
  red: ExpiryAlertItem[]
  orange: ExpiryAlertItem[]
  yellow: ExpiryAlertItem[]
  stats: { red_count: number; orange_count: number; yellow_count: number }
}

/** 库存概况温区 */
export interface StorageZoneOverview {
  zone: string
  item_count: number
  capacity_usage: string
  temperature: string
  humidity: string
}

/** 库存列表项 */
export interface InventoryItem {
  id: number
  material_name: string
  material_code: string
  batch_number: string
  location: string
  zone: string
  quantity: number
  unit: string
  status: string
}

/** 盘点记录 */
export interface InventoryCheck {
  id: number
  check_date: string
  status: string
  status_display: string
  checker: string
  total_items: number
  matched_items: number
  discrepancy_items: number
  discrepancies: Array<{
    material_name: string
    expected: number
    actual: number
    difference: number
    remarks: string
  }>
}

/** 库位定义 */
export interface StorageLocation {
  id: number
  zone: string
  zone_display: string
  shelf: string
  positions: string[]
}

/** 盘点历史记录 */
export interface InventoryCheckRecord {
  id: number
  check_date: string
  checker: string
  status: string
  status_display: string
  total_items: number
  matched_items: number
  discrepancy_items: number
  create_time: string
}

/** 库位层级节点（树形） */
export interface StorageLocationNode {
  id: number
  location_code: string
  name: string
  description?: string
  parent_id: number | null
  temperature_zone?: string
  temperature_zone_display?: string
  temperature_min?: number
  temperature_max?: number
  capacity?: number
  current_count?: number
  capacity_usage?: string
  has_temperature_monitor?: boolean
  monitor_device_id?: string
  children?: StorageLocationNode[]
}

/** 库位详情 */
export interface StorageLocationDetail extends StorageLocationNode {
  child_locations?: StorageLocationNode[]
  monitor_status?: string
}

// ============================================================================
// API 方法
// ============================================================================

export const materialApi = {
  // ----- 仪表盘 -----
  dashboard: () =>
    api.get<MaterialDashboard>('/material/dashboard'),

  // ----- 产品台账 -----
  getProductStats: () =>
    api.get<ProductStats>('/material/products/stats'),

  listProducts: (params?: {
    keyword?: string
    product_type?: string
    storage_condition?: string
    expiry_status?: string
    page?: number
    page_size?: number
  }) =>
    api.get<{ items: ProductItem[]; total: number }>('/material/products', { params }),

  getProduct: (id: number) =>
    api.get<ProductDetail>(`/material/products/${id}`),

  createProduct: (data: {
    name: string
    code: string
    batch_number?: string
    specification?: string
    storage_condition?: string
    expiry_date?: string
    product_type?: string
    sponsor?: string
    description?: string
  }) =>
    api.post('/material/products/create', data),

  updateProduct: (id: number, data: Partial<ProductItem>) =>
    api.put(`/material/products/${id}`, data),

  // ----- 耗材管理 -----
  getConsumableStats: () =>
    api.get<ConsumableStats>('/material/consumables/stats'),

  listConsumables: (params?: {
    category?: string
    status?: string
    keyword?: string
    page?: number
    page_size?: number
  }) =>
    api.get<{ items: ConsumableItem[]; total: number }>('/material/consumables', { params }),

  createConsumable: (data: {
    name: string
    code: string
    specification?: string
    unit?: string
    safety_stock?: number
    storage_condition?: string
    category?: string
  }) =>
    api.post('/material/consumables/create', data),

  issueConsumable: (id: number, data: {
    quantity: number
    operator_name?: string
    purpose?: string
    work_order_id?: number
  }) =>
    api.post(`/material/consumables/${id}/issue`, data),

  // ----- 样品管理 -----
  getSampleStats: () =>
    api.get<SampleStats>('/material/samples/stats'),

  listSamples: (params?: {
    status?: string
    product_id?: number
    keyword?: string
    page?: number
    page_size?: number
  }) =>
    api.get<{ items: SampleItem[]; total: number }>('/material/samples', { params }),

  getSample: (id: number) =>
    api.get<SampleDetail>(`/material/samples/${id}`),

  distributeSample: (id: number, data: {
    holder?: string
    enrollment_id?: number
    remarks?: string
  }) =>
    api.post(`/material/samples/${id}/distribute`, data),

  returnSample: (id: number, data?: {
    remarks?: string
    weight?: number
  }) =>
    api.post(`/material/samples/${id}/return`, data),

  destroySample: (id: number, data?: {
    remarks?: string
    approval_id?: string
  }) =>
    api.post(`/material/samples/${id}/destroy`, data),

  traceSample: (params: {
    code?: string
    subject_id?: string
  }) =>
    api.get<TraceResult>('/material/samples/trace', { params }),

  // ----- 出入库流水 -----
  getTransactionStats: () =>
    api.get<TransactionStats>('/material/transactions/stats'),

  listTransactions: (params?: {
    transaction_type?: string
    operator?: string
    start_date?: string
    end_date?: string
    page?: number
    page_size?: number
  }) =>
    api.get<{ items: TransactionItem[]; total: number }>('/material/transactions', { params }),

  // ----- 效期预警 -----
  getExpiryAlerts: () =>
    api.get<ExpiryAlerts>('/material/expiry-alerts'),

  handleExpiryAlert: (id: number, data: {
    action: 'lock' | 'destroy_request' | 'extend_evaluate'
    remarks?: string
  }) =>
    api.post(`/material/expiry-alerts/${id}/handle`, data),

  // ----- 库存管理 -----
  getInventoryOverview: () =>
    api.get<{
      cold_storage: StorageZoneOverview
      cool_storage: StorageZoneOverview
      room_storage: StorageZoneOverview
    }>('/material/inventory/overview'),

  listInventory: (params?: {
    zone?: string
    status?: string
    keyword?: string
    page?: number
    page_size?: number
  }) =>
    api.get<{ items: InventoryItem[]; total: number }>('/material/inventory', { params }),

  startInventoryCheck: () =>
    api.post<{ id: number; status: string }>('/material/inventory/check'),

  /** Alias for startInventoryCheck; initiates a new inventory count */
  initiateInventoryCheck: () =>
    api.post<{ id: number; status: string }>('/material/inventory/check'),

  getInventoryCheck: () =>
    api.get<InventoryCheck>('/material/inventory/check'),

  submitInventoryCheck: (data: {
    items: Array<{ inventory_id: number; actual_quantity: number; notes?: string }>
  }) =>
    api.post('/material/inventory/check/submit', data),

  approveInventoryCheck: (data?: { notes?: string }) =>
    api.post('/material/inventory/check/approve', data),

  rejectInventoryCheck: (data: { reason: string }) =>
    api.post('/material/inventory/check/reject', data),

  listInventoryChecks: (params?: { page?: number; page_size?: number }) =>
    api.get<{ items: InventoryCheckRecord[]; total: number }>('/material/inventory/checks', { params }),

  getStorageLocations: () =>
    api.get<StorageLocation[]>('/material/storage-locations'),

  listStorageLocations: (params?: { parent_id?: number }) =>
    api.get<StorageLocationNode[]>('/material/storage-locations/tree', { params }),

  getStorageLocation: (id: number) =>
    api.get<StorageLocationDetail>(`/material/storage-locations/${id}`),

  createStorageLocation: (data: {
    location_code: string
    name: string
    description?: string
    parent_id?: number
    temperature_zone?: string
    temperature_min?: number
    temperature_max?: number
    capacity?: number
    has_temperature_monitor?: boolean
    monitor_device_id?: string
  }) =>
    api.post<StorageLocationDetail>('/material/storage-locations/create', data),

  updateStorageLocation: (id: number, data: Partial<{
    location_code: string
    name: string
    description: string
    temperature_zone: string
    temperature_min: number
    temperature_max: number
    capacity: number
    has_temperature_monitor: boolean
    monitor_device_id: string
  }>) =>
    api.put<StorageLocationDetail>(`/material/storage-locations/${id}`, data),

  // ===================================================================
  // 样品管理扩展 — /api/v1/sample-management/
  // ===================================================================

  // --- 样品接收 ---
  createReceipt: (data: {
    product_id: number; supplier?: string; courier?: string; tracking_no?: string
    expected_quantity: number; batch_no?: string; expiry_date?: string
  }) => api.post<SampleReceiptItem>('/sample-management/receipts/create', {
    ...data,
    expected_qty: data.expected_quantity,
  }),

  listReceipts: (params?: { status?: string; product_id?: number; keyword?: string; page?: number; page_size?: number }) =>
    api.get<{ items: SampleReceiptItem[]; total: number }>('/sample-management/receipts', { params }),

  getReceipt: (id: number) => api.get<SampleReceiptItem>(`/sample-management/receipts/${id}`),

  inspectReceipt: (id: number, data: {
    packaging_ok?: boolean; label_ok?: boolean; quantity_ok?: boolean
    document_ok?: boolean; temperature_ok?: boolean; appearance_ok?: boolean
    arrival_temperature?: number; accepted_quantity?: number; rejected_quantity?: number
    inspection_notes?: string; rejection_reason?: string; storage_location_id?: number
  }) => api.post<SampleReceiptItem>(`/sample-management/receipts/${id}/inspect`, {
    packaging_ok: data.packaging_ok,
    label_ok: data.label_ok,
    quantity_ok: data.quantity_ok,
    document_ok: data.document_ok,
    temperature_ok: data.temperature_ok,
    appearance_ok: data.appearance_ok,
    arrival_temp: data.arrival_temperature,
    accepted_qty: data.accepted_quantity ?? 0,
    rejected_qty: data.rejected_quantity ?? 0,
    inspection_notes: data.inspection_notes,
    rejection_reason: data.rejection_reason,
    storage_location_id: data.storage_location_id,
  }),

  // --- 样品存储 ---
  storeSample: (data: {
    sample_id: number; location_id: number; temperature?: string; conditions?: string
  }) => api.post('/sample-management/storage/store', data),

  retrieveStorage: (id: number, data?: { reason?: string }) =>
    api.post(`/sample-management/storage/${id}/retrieve`, data),

  listStorageRecords: (params?: {
    sample_id?: number; location_id?: number; status?: string; page?: number; page_size?: number
  }) => api.get<{ items: SampleStorageItem[]; total: number }>('/sample-management/storage', { params }),

  // --- 样品分发 ---
  createDistribution: (data: {
    product_id: number; distribution_type: string; quantity: number
    recipient_name?: string; recipient_type?: string; recipient_id?: number
    is_randomized?: boolean; randomization_code?: string; kit_number?: string
    planned_date?: string
  }) => api.post<SampleDistributionItem>('/sample-management/distributions/create', data),

  listDistributions: (params?: { status?: string; product_id?: number; page?: number; page_size?: number }) =>
    api.get<{ items: SampleDistributionItem[]; total: number }>('/sample-management/distributions', { params }),

  approveDistribution: (id: number) =>
    api.post<SampleDistributionItem>(`/sample-management/distributions/${id}/approve`),

  executeDistribution: (id: number, data?: { sample_codes?: string[] }) =>
    api.post<SampleDistributionItem>(`/sample-management/distributions/${id}/execute`, data),

  confirmDistribution: (id: number) =>
    api.post<SampleDistributionItem>(`/sample-management/distributions/${id}/confirm`),

  // --- 样品检测 ---
  createSampleTest: (data: {
    sample_id: number; test_type: string; test_method?: string
    test_standard?: string; planned_date?: string
  }) => api.post<SampleTestItem>('/sample-management/tests/create', data),

  listSampleTests: (params?: { sample_id?: number; status?: string; page?: number; page_size?: number }) =>
    api.get<{ items: SampleTestItem[]; total: number }>('/sample-management/tests', { params }),

  startSampleTest: (id: number) => api.post<SampleTestItem>(`/sample-management/tests/${id}/start`),

  completeSampleTest: (id: number, data: {
    result_status: string; result_data?: Record<string, unknown>; result_summary?: string
    deviation_found?: boolean; deviation_description?: string
  }) => api.post<SampleTestItem>(`/sample-management/tests/${id}/complete`, data),

  reviewSampleTest: (id: number, data?: { review_notes?: string }) =>
    api.post<SampleTestItem>(`/sample-management/tests/${id}/review`, data),

  // --- 样品回收 ---
  createSampleReturn: (data: {
    sample_id: number; return_reason: string; return_reason_detail?: string
    return_from_type?: string; return_from_id?: number; return_from_name?: string
  }) => api.post<SampleReturnItem>('/sample-management/returns/create', data),

  listSampleReturns: (params?: { status?: string; page?: number; page_size?: number }) =>
    api.get<{ items: SampleReturnItem[]; total: number }>('/sample-management/returns', { params }),

  executeSampleReturn: (id: number, data?: { condition_on_return?: string; remaining_quantity?: string }) =>
    api.post<SampleReturnItem>(`/sample-management/returns/${id}/execute`, data),

  inspectSampleReturn: (id: number, data?: { inspection_notes?: string }) =>
    api.post<SampleReturnItem>(`/sample-management/returns/${id}/inspect`, data),

  processSampleReturn: (id: number, data: { disposal_method: string; storage_location_id?: number }) =>
    api.post<SampleReturnItem>(`/sample-management/returns/${id}/process`, data),

  // --- 样品销毁 ---
  createDestruction: (data: {
    sample_ids: number[]; destruction_reason: string
    destruction_method: string; destruction_location?: string
  }) => api.post<SampleDestructionItem>('/sample-management/destructions/create', data),

  listDestructions: (params?: { status?: string; page?: number; page_size?: number }) =>
    api.get<{ items: SampleDestructionItem[]; total: number }>('/sample-management/destructions', { params }),

  approveDestruction: (id: number, data?: { approval_notes?: string }) =>
    api.post<SampleDestructionItem>(`/sample-management/destructions/${id}/approve`, data),

  rejectDestruction: (id: number, data?: { approval_notes?: string }) =>
    api.post<SampleDestructionItem>(`/sample-management/destructions/${id}/reject`, data),

  executeDestruction: (id: number, data: {
    witness?: string; destruction_photos?: string[]; destruction_certificate?: string
  }) => api.post<SampleDestructionItem>(`/sample-management/destructions/${id}/execute`, data),

  // --- 盘点 ---
  createInventoryCount: (data: {
    count_type: string; planned_date: string
    location_id?: number; product_id?: number
  }) => api.post<InventoryCountItem>('/sample-management/counts/create', data),

  listInventoryCounts: (params?: { status?: string; page?: number; page_size?: number }) =>
    api.get<{ items: InventoryCountItem[]; total: number }>('/sample-management/counts', { params }),

  startInventoryCount: (id: number) =>
    api.post<InventoryCountItem>(`/sample-management/counts/${id}/start`),

  submitInventoryCount: (id: number, data: {
    actual_quantity: number; variance_details?: Array<Record<string, unknown>>
  }) => api.post<InventoryCountItem>(`/sample-management/counts/${id}/submit`, data),

  reviewInventoryCount: (id: number, data?: {
    review_notes?: string; adjustment_made?: boolean; adjustment_reason?: string
  }) => api.post<InventoryCountItem>(`/sample-management/counts/${id}/review`, data),

  // --- 温度监控 ---
  recordTemperature: (data: {
    location_id: number; temperature: number; humidity?: number
    source?: string; device_id?: string
  }) => api.post('/sample-management/temperature/record', data),

  listTemperatureLogs: (params?: {
    location_id?: number; start_date?: string; end_date?: string; page?: number; page_size?: number
  }) => api.get<{ items: TemperatureLogItem[]; total: number }>('/sample-management/temperature/logs', { params }),

  handleTemperatureAlarm: (id: number, data?: { handling_notes?: string }) =>
    api.post(`/sample-management/temperature/${id}/handle-alarm`, data),

  // ===================================================================
  // 产品管理扩展 — /api/v1/product-management/
  // ===================================================================

  // --- 产品批次 ---
  createBatch: (data: {
    product_id: number; batch_no: string; manufacture_date?: string
    expiry_date?: string; quantity: number; unit?: string
    supplier?: string; coa_number?: string; storage_location_id?: number
  }) => api.post<ProductBatchItem>('/product-management/batches/create', data),

  listBatches: (params?: { product_id?: number; status?: string; keyword?: string; page?: number; page_size?: number }) =>
    api.get<{ items: ProductBatchItem[]; total: number }>('/product-management/batches', { params }),

  getBatch: (id: number) => api.get<ProductBatchItem>(`/product-management/batches/${id}`),
  receiveBatch: (id: number) => api.post<ProductBatchItem>(`/product-management/batches/${id}/receive`),

  releaseBatch: (id: number, data?: { release_notes?: string }) =>
    api.post<ProductBatchItem>(`/product-management/batches/${id}/release`, data),

  // --- 产品入库 ---
  createProductReceipt: (data: {
    product_id: number; batch_id?: number; expected_quantity: number
    source_type?: string; supplier?: string; po_number?: string; delivery_note?: string
  }) => api.post<ProductReceiptItem>('/product-management/product-receipts/create', data),

  listProductReceipts: (params?: { product_id?: number; status?: string; page?: number; page_size?: number }) =>
    api.get<{ items: ProductReceiptItem[]; total: number }>('/product-management/product-receipts', { params }),

  inspectProductReceipt: (id: number, data: {
    packaging_intact?: boolean; label_correct?: boolean; quantity_match?: boolean
    documents_complete?: boolean; temperature_compliant?: boolean; appearance_normal?: boolean
    arrival_temperature?: number; accepted_quantity?: number; rejected_quantity?: number
    inspection_notes?: string; rejection_reason?: string; storage_location_id?: number
  }) => api.post<ProductReceiptItem>(`/product-management/product-receipts/${id}/inspect`, data),

  // --- 产品库存 ---
  getProductInventorySummary: (productId: number) =>
    api.get(`/product-management/product-inventory/${productId}`),

  listProductInventories: (params?: { product_id?: number; page?: number; page_size?: number }) =>
    api.get<{ items: ProductInventoryItem[]; total: number }>('/product-management/product-inventory', { params }),

  // --- 产品套件 ---
  createKit: (data: {
    product_id: number; batch_id?: number; randomization_code?: string
    treatment_group?: string; blinding_code?: string; quantity?: number
    storage_location_id?: number
  }) => api.post<ProductKitItem>('/product-management/kits/create', data),

  listKits: (params?: {
    product_id?: number; status?: string; subject_id?: number; page?: number; page_size?: number
  }) => api.get<{ items: ProductKitItem[]; total: number }>('/product-management/kits', { params }),

  getKit: (id: number) => api.get<ProductKitItem>(`/product-management/kits/${id}`),

  assignKit: (id: number, data: { subject_id: number; subject_code: string }) =>
    api.post<ProductKitItem>(`/product-management/kits/${id}/assign`, data),

  distributeKit: (id: number, data?: { distribution_visit?: string }) =>
    api.post<ProductKitItem>(`/product-management/kits/${id}/distribute`, data),

  // --- 产品分发 ---
  createDispensing: (data: {
    subject_id: number; subject_code: string; visit_code?: string
    visit_date?: string; kit_id?: number; product_id: number
    batch_id?: number; quantity: number; work_order_id?: number
  }) => api.post<ProductDispensingItem>('/product-management/dispensings/create', data),

  listDispensings: (params?: {
    subject_id?: number; status?: string; page?: number; page_size?: number
  }) => api.get<{ items: ProductDispensingItem[]; total: number }>('/product-management/dispensings', { params }),

  prepareDispensing: (id: number) =>
    api.post<ProductDispensingItem>(`/product-management/dispensings/${id}/prepare`),

  executeDispensing: (id: number) =>
    api.post<ProductDispensingItem>(`/product-management/dispensings/${id}/execute`),

  confirmDispensing: (id: number) =>
    api.post<ProductDispensingItem>(`/product-management/dispensings/${id}/confirm`),

  // --- 使用记录 ---
  createUsage: (data: {
    dispensing_id: number; period_start: string; period_end: string
    expected_usage: number; actual_usage?: number; remaining_quantity?: number
    compliance_status?: string; compliance_rate?: number
    usage_log?: Array<Record<string, unknown>>
    deviation_reported?: boolean; deviation_description?: string
    adverse_event_reported?: boolean; adverse_event_description?: string
  }) => api.post<ProductUsageItem>('/product-management/usages/create', data),

  listUsages: (params?: {
    dispensing_id?: number; compliance_status?: string; product_id?: number; subject_id?: number
    start_date?: string; end_date?: string; page?: number; page_size?: number
  }) => api.get<{ items: ProductUsageItem[]; total: number }>('/product-management/usages', { params }),

  updateUsage: (id: number, data: {
    deviation_reported?: boolean; deviation_description?: string
    deviation_type?: string; severity?: string; compliance_status?: string
  }) => api.patch<ProductUsageItem>(`/product-management/usages/${id}`, data),

  // --- 产品回收 ---
  createProductReturn: (data: {
    dispensing_id?: number; subject_id: number; subject_code: string
    product_id: number; kit_id?: number; return_reason: string
    return_reason_detail?: string; returned_quantity: number
    unused_quantity?: number; used_quantity?: number
  }) => api.post<ProductReturnItem>('/product-management/product-returns/create', data),

  listProductReturns: (params?: {
    subject_id?: number; product_id?: number; status?: string; page?: number; page_size?: number
  }) => api.get<{ items: ProductReturnItem[]; total: number }>('/product-management/product-returns', { params }),

  executeProductReturn: (id: number, data?: { condition_on_return?: string }) =>
    api.post<ProductReturnItem>(`/product-management/product-returns/${id}/execute`, data),

  inspectProductReturn: (id: number, data?: { inspection_notes?: string }) =>
    api.post<ProductReturnItem>(`/product-management/product-returns/${id}/inspect`, data),

  processProductReturn: (id: number, data: { disposal_method: string }) =>
    api.post<ProductReturnItem>(`/product-management/product-returns/${id}/process`, data),

  // --- 产品销毁 ---
  createProductDestruction: (data: {
    items: Array<{ product_id: number; batch_id?: number; kit_id?: number; quantity: number }>
    destruction_reason: string; destruction_method: string; destruction_location?: string
  }) => api.post<ProductDestructionItemDetail>('/product-management/product-destructions/create', data),

  listProductDestructions: (params?: { status?: string; page?: number; page_size?: number }) =>
    api.get<{ items: ProductDestructionItemDetail[]; total: number }>('/product-management/product-destructions', { params }),

  approveProductDestruction: (id: number, data?: { approval_notes?: string }) =>
    api.post<ProductDestructionItemDetail>(`/product-management/product-destructions/${id}/approve`, data),

  executeProductDestruction: (id: number, data: {
    witness?: string; destruction_photos?: string[]; destruction_certificate?: string
  }) => api.post<ProductDestructionItemDetail>(`/product-management/product-destructions/${id}/execute`, data),

  // --- 产品召回 ---
  createRecall: (data: {
    product_id: number; batch_ids?: number[]; recall_level: string
    recall_reason: string; recall_description: string; health_hazard?: string
    recall_strategy?: string; notification_method?: string
  }) => api.post<ProductRecallItem>('/product-management/recalls/create', data),

  listRecalls: (params?: { product_id?: number; status?: string; page?: number; page_size?: number }) =>
    api.get<{ items: ProductRecallItem[]; total: number }>('/product-management/recalls', { params }),

  createRecallAction: (recallId: number, data: {
    action_type: string; action_description: string
    target_subject_id?: number; target_subject_code?: string
    target_kit_id?: number; planned_date?: string
  }) => api.post(`/product-management/recalls/${recallId}/actions/create`, data),

  executeRecallAction: (actionId: number, data?: { result?: string }) =>
    api.post(`/product-management/recalls/actions/${actionId}/execute`, data),

  completeRecall: (id: number, data?: { completion_notes?: string; effectiveness_assessment?: string }) =>
    api.post<ProductRecallItem>(`/product-management/recalls/${id}/complete`, data),

  // ===================================================================
  // 耗材管理扩展 — /api/v1/material/
  // ===================================================================

  // --- 耗材CRUD ---
  createConsumableItem: (data: {
    name: string; code: string; category: string; specification?: string
    unit?: string; safety_stock?: number; storage_condition?: string
    supplier?: string; manufacturer?: string; unit_price?: number
    has_expiry?: boolean; default_shelf_life_days?: number
  }) => api.post('/material/consumable-items/create', data),

  listConsumableItems: (params?: {
    category?: string; status?: string; keyword?: string; page?: number; page_size?: number
  }) => api.get<{ items: ConsumableItemDetail[]; total: number }>('/material/consumable-items', { params }),

  getConsumableItem: (id: number) => api.get<ConsumableItemDetail>(`/material/consumable-items/${id}`),
  updateConsumableItem: (id: number, data: Partial<ConsumableItemDetail>) =>
    api.put(`/material/consumable-items/${id}`, data),
  deleteConsumableItem: (id: number) => api.delete(`/material/consumable-items/${id}`),

  // --- 耗材批次 ---
  createConsumableBatch: (data: {
    consumable_id: number; batch_number?: string; production_date?: string
    expiry_date?: string; inbound_date: string; inbound_quantity: number
    inbound_price?: number; storage_location_text?: string
  }) => api.post<ConsumableBatchItem>('/material/consumable-batches/create', data),

  listConsumableBatches: (params?: {
    consumable_id?: number; status?: string; page?: number; page_size?: number
  }) => api.get<{ items: ConsumableBatchItem[]; total: number }>('/material/consumable-batches', { params }),

  getConsumableBatch: (id: number) => api.get<ConsumableBatchItem>(`/material/consumable-batches/${id}`),

  // --- 耗材出入库 ---
  inboundConsumable: (data: {
    consumable_id: number; batch_id?: number; quantity: number; remarks?: string
  }) => api.post('/material/consumable-transactions/inbound', data),

  issueConsumableFromBatch: (data: {
    consumable_id: number; batch_id?: number; quantity: number
    purpose?: string; project_code?: string; work_order_id?: number; remarks?: string
  }) => api.post('/material/consumable-transactions/issue', data),

  returnConsumable: (data: {
    consumable_id: number; batch_id?: number; quantity: number; remarks?: string
  }) => api.post('/material/consumable-transactions/return', data),

  scrapConsumable: (data: {
    consumable_id: number; batch_id?: number; quantity: number; remarks?: string
  }) => api.post('/material/consumable-transactions/scrap', data),

  listConsumableTransactions: (params?: {
    consumable_id?: number; transaction_type?: string
    start_date?: string; end_date?: string; page?: number; page_size?: number
  }) => api.get<{ items: ConsumableTransactionItem[]; total: number }>('/material/consumable-transactions', { params }),

  // --- 耗材预警 ---
  listConsumableAlerts: (params?: {
    consumable_id?: number; alert_type?: string; status?: string; page?: number; page_size?: number
  }) => api.get<{ items: ConsumableAlertItem[]; total: number }>('/material/consumable-alerts', { params }),

  acknowledgeConsumableAlert: (id: number) => api.post(`/material/consumable-alerts/${id}/acknowledge`),
  resolveConsumableAlert: (id: number, data?: { resolution_note?: string }) =>
    api.post(`/material/consumable-alerts/${id}/resolve`, data),
  checkConsumableAlerts: () => api.post('/material/consumable-alerts/check'),

  getConsumableFullStats: () => api.get<ConsumableStats>('/material/consumable-stats'),

  // ----- 导出 / 审计 / 签名 -----
  exportTransactions: (params: {
    transaction_type?: string
    start_date?: string
    end_date?: string
    consumable_id?: number
    format?: string
  }) => api.post<ExportResult>('/material/export/transactions', params),

  exportEvidencePackage: (params?: { start_date?: string; end_date?: string }) =>
    api.post<ExportResult>('/material/export/evidence-package', params || {}),

  getAuditTrail: (params?: { target_type?: string; target_id?: number; limit?: number }) =>
    api.get<{ items: AuditTrailItem[]; total: number }>('/material/audit/trail', { params }),

  signOperation: (params: { operation_type: string; operation_id: number; password: string }) =>
    api.post<SignatureResult>('/material/signature/sign', params),

  verifySignature: (params: { signature_id: string; password: string }) =>
    api.post('/material/signature/verify', params),

  getSignatureHistory: (params: { operation_type: string; operation_id: number }) =>
    api.get('/material/signature/history', { params }),

  // ===================================================================
  // 飞书集成 — 预警推送 + 审批流程
  // ===================================================================

  pushExpiryAlert: (params: {
    product_name: string
    batch_no: string
    expiry_date: string
    days_remaining: number
    webhook_url?: string
  }) => api.post<FeishuAlertResult>('/material/feishu/alerts/expiry', params),

  pushLowStockAlert: (params: {
    consumable_name: string
    current_stock: number
    min_stock: number
    unit?: string
    webhook_url?: string
  }) => api.post<FeishuAlertResult>('/material/feishu/alerts/low-stock', params),

  pushTemperatureAlert: (params: {
    location_name: string
    temperature: number
    upper_limit: number
    lower_limit: number
    webhook_url?: string
  }) => api.post<FeishuAlertResult>('/material/feishu/alerts/temperature', params),

  checkAndPushAlerts: (params?: { webhook_url?: string }) =>
    api.post<AlertCheckResult>('/material/feishu/alerts/check-and-push', params || {}),

  createDestructionApproval: (params: {
    destruction_id: number
    destruction_no: string
    applicant_name: string
    destruction_reason: string
    destruction_method: string
    sample_count: number
  }) => api.post<FeishuApprovalResult>('/material/feishu/approval/destruction/create', params),

  handleApprovalCallback: (params: {
    instance_code: string
    approval_status: string
    approver_name: string
    comments?: string
  }) => api.post('/material/feishu/approval/callback', params),

  getApprovalStatus: (destructionId: number) =>
    api.get('/material/feishu/approval/status', { params: { destruction_id: destructionId } }),
}

// ============================================================================
// 扩展类型定义
// ============================================================================

export interface SampleReceiptItem {
  id: number; receipt_no: string; status: string
  supplier: string; courier: string; tracking_no: string
  product_id: number; product_name: string
  expected_quantity: number; received_quantity: number
  accepted_quantity: number; rejected_quantity: number
  batch_no: string; expiry_date: string | null
  arrival_temperature: number | null
  packaging_ok: boolean | null; label_ok: boolean | null
  quantity_ok: boolean | null; document_ok: boolean | null
  temperature_ok: boolean | null; appearance_ok: boolean | null
  create_time: string
}

export interface SampleStorageItem {
  id: number; sample_id: number; sample_code: string
  location_id: number | null; location_name: string
  status: string; stored_at: string; stored_by_name: string
  retrieved_at: string | null; retrieve_reason: string
}

export interface SampleDistributionItem {
  id: number; distribution_no: string; distribution_type: string; status: string
  product_id: number; product_name: string; quantity: number
  recipient_name: string; is_randomized: boolean
  randomization_code: string; kit_number: string
  planned_date: string | null; distributed_at: string | null
  create_time: string
}

export interface SampleTestItem {
  id: number; test_no: string; status: string
  sample_id: number; sample_code: string
  test_type: string; test_method: string
  result_status: string; result_summary: string
  deviation_found: boolean
  create_time: string
}

export interface SampleReturnItem {
  id: number; return_no: string; status: string
  sample_id: number; sample_code: string
  return_reason: string; return_reason_detail: string
  condition_on_return: string; remaining_quantity: string
  create_time: string
}

export interface SampleDestructionItem {
  id: number; destruction_no: string; status: string
  destruction_reason: string; destruction_method: string
  destruction_location: string; sample_count: number
  witness: string; destruction_certificate: string
  feishu_approval_status: string
  applicant_name?: string
  create_time: string
}

export interface InventoryCountItem {
  id: number; count_no: string; count_type: string; status: string
  planned_date: string; system_quantity: number; actual_quantity: number
  variance: number; variance_rate: number | null
  variance_details: Array<Record<string, unknown>>
  adjustment_made: boolean
  create_time: string
}

export interface TemperatureLogItem {
  id: number; location_id: number; location_name: string
  temperature: number; humidity: number | null
  status: string; recorded_at: string; source: string
  alarm_triggered: boolean; alarm_handled: boolean
}

export interface ProductBatchItem {
  id: number; batch_no: string; product_id: number; product_name: string
  status: string; manufacture_date: string | null; expiry_date: string | null
  quantity: number; unit: string; supplier: string
  coa_number: string; quality_status: string
  released_at: string | null; release_notes: string
  create_time: string
}

export interface ProductReceiptItem {
  id: number; receipt_no: string; status: string
  product_id: number; product_name: string; batch_id: number | null
  expected_quantity: number; received_quantity: number
  accepted_quantity: number; rejected_quantity: number
  arrival_temperature: number | null
  create_time: string
}

export interface ProductInventoryItem {
  id: number; product_id: number; product_name: string
  batch_id: number | null; batch_no: string
  location_id: number | null; location_name: string
  quantity: number; reserved_quantity: number; available_quantity: number
}

export interface ProductKitItem {
  id: number; kit_number: string; status: string
  randomization_code: string; treatment_group: string; blinding_code: string
  product_id: number; product_name: string; quantity: number
  subject_id: number | null; subject_code: string
  assigned_at: string | null; distributed_at: string | null
  distribution_visit: string
  create_time: string
}

export interface ProductDispensingItem {
  id: number; dispensing_no: string; status: string
  subject_id: number; subject_code: string
  visit_code: string; visit_date: string | null
  product_id: number; product_name: string
  quantity_dispensed: number
  prepared_at: string | null; dispensed_at: string | null; confirmed_at: string | null
  create_time: string
}

export interface ProductUsageItem {
  id: number; dispensing_id: number; subject_code: string
  period_start: string; period_end: string
  expected_usage: number; actual_usage: number | null; remaining_quantity: number | null
  compliance_status: string; compliance_rate: number | null
  deviation_reported: boolean; adverse_event_reported: boolean
  create_time: string
}

export interface ProductReturnItem {
  id: number; return_no: string; status: string
  subject_id: number; subject_code: string
  product_id: number; product_name: string
  return_reason: string; returned_quantity: number
  unused_quantity: number | null; used_quantity: number | null
  condition_on_return: string; disposal_method: string
  create_time: string
}

export interface ProductDestructionItemDetail {
  id: number; destruction_no: string; status: string
  destruction_reason: string; destruction_method: string
  destruction_location: string; total_quantity: number
  witness: string; destruction_certificate: string
  feishu_approval_status: string
  create_time: string
}

export interface ProductRecallItem {
  id: number; recall_no: string; recall_title: string
  status: string; recall_level: string
  product_id: number; product_name: string
  recall_reason: string; recall_description: string
  total_distributed: number; target_recall_quantity: number; actual_recalled_quantity: number
  subjects_notified: number; regulatory_notified: boolean
  create_time: string
}

export interface ConsumableItemDetail {
  id: number; name: string; code: string; category: string
  specification: string; unit: string
  current_stock: number; safety_stock: number
  storage_condition: string; expiry_date: string | null
  supplier: string; manufacturer: string; unit_price: number | null
  has_expiry: boolean; status: string; status_display: string
  create_time: string
}

export interface ConsumableBatchItem {
  id: number; consumable_id: number; consumable_name: string
  batch_number: string; production_date: string | null; expiry_date: string | null
  inbound_date: string; inbound_quantity: number; inbound_price: number | null
  remaining_quantity: number; status: string
  storage_location_text: string
  create_time: string
}

export interface ConsumableTransactionItem {
  id: number; consumable_id: number; consumable_name: string
  batch_id: number | null; batch_number: string
  transaction_type: string; quantity: number
  operator_name: string; purpose: string; project_code: string
  work_order_id: number | null
  unit_cost: number | null; total_cost: number | null
  remarks: string; create_time: string
}

export interface ConsumableAlertItem {
  id: number; consumable_id: number; consumable_name: string
  batch_id: number | null; alert_type: string; alert_message: string
  severity: string; status: string
  acknowledged_at: string | null; resolution_note: string
  create_time: string
}

/** 导出结果（PDF/证据包） */
export interface ExportResult {
  status: string
  filename: string
  record_count?: number
  message: string
  contents?: Record<string, number>
}

/** 审计日志项 */
export interface AuditTrailItem {
  id: number
  action: string
  operator_name: string
  target_type: string
  target_id: string
  target_code: string
  details: string
  create_time: string
}

/** 电子签名结果 */
export interface SignatureResult {
  signature_id: string
  operation_type: string
  operation_id: number
  operator_name: string
  content_hash: string
  status: string
  signed_at?: string
}

/** 飞书预警推送结果 */
export interface FeishuAlertResult {
  status: string
  alert_type: string
  message?: string
  timestamp: string
}

/** 飞书审批结果 */
export interface FeishuApprovalResult {
  status: string
  instance_code?: string
  destruction_id?: number
  message: string
  created_at?: string
}

/** 预警检查汇总结果 */
export interface AlertCheckResult {
  checked_at: string
  expiry_alerts: number
  low_stock_alerts: number
  temperature_alerts: number
}
