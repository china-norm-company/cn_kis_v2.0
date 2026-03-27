/**
 * 样品发放（产品发放）API
 * 与 cn_kis 后端 /api/v1/product/* 联调，响应格式：{ success, data, message }
 */
import { api } from '../client'

type KisBody<T> = { success?: boolean; data?: T; message?: string }

/** 工单执行记录分页接口 data 载荷 */
export type WorkOrderExecutionsPage = {
  list: unknown[]
  total: number
  page: number
  pageSize: number
}

async function unwrap<T>(promise: Promise<KisBody<T>>): Promise<T> {
  const res = await promise as KisBody<T>
  if (res && res.success !== false && res.data !== undefined) return res.data
  throw new Error((res as KisBody<T>)?.message || '请求失败')
}

export const productDistributionApi = {
  // 工单
  getWorkOrders: (params?: {
    keyword?: string
    project_no?: string
    project_start_date?: string
    project_end_date?: string
    page?: number
    pageSize?: number
  }) => unwrap(api.get<KisBody<any>>('/product/workorders', { params })),

  getWorkOrder: (id: number, params?: { include_executions?: boolean }) =>
    unwrap(
      api.get<KisBody<any>>(`/product/workorders/${id}`, {
        params:
          params?.include_executions === false ? { include_executions: false } : undefined,
      }),
    ),

  /** 工单下执行记录分页（摘要列表） */
  getWorkOrderExecutions: (id: number, params?: { page?: number; pageSize?: number }): Promise<WorkOrderExecutionsPage> =>
    unwrap<WorkOrderExecutionsPage>(
      api.get(`/product/workorders/${id}/executions`, {
        params: {
          page: params?.page ?? 1,
          pageSize: params?.pageSize ?? 10,
        },
      }) as Promise<KisBody<WorkOrderExecutionsPage>>,
    ),

  createWorkOrder: (data: {
    project_no: string
    project_name: string
    project_start_date: string
    project_end_date: string
    visit_count?: number
    researcher?: string | null
    supervisor?: string | null
    usage_method?: string | null
    usage_frequency?: string | null
    precautions?: string | null
    project_requirements?: string | null
  }) => unwrap(api.post<KisBody<any>>('/product/workorders', data)),

  updateWorkOrder: (id: number, data: Record<string, unknown>) =>
    unwrap(api.put<KisBody<any>>(`/product/workorders/${id}`, data)),

  // 枚举
  getExecutionStageEnums: () =>
    unwrap(api.get<KisBody<{ options: { value: string; label: string }[] }>>('/product/enums/execution-stage')),

  getExceptionTypeEnums: () =>
    unwrap(api.get<KisBody<{ options: { value: string; label: string }[] }>>('/product/enums/exception-type')),

  // 样品台账
  getOrdersLedger: (params?: {
    related_project_no?: string
    product_code?: string
    keyword?: string
    page?: number
    pageSize?: number
  }) => unwrap(api.get<KisBody<any>>('/product/orders-ledger', { params })),

  // 样品记录
  getSampleOrders: (params?: {
    keyword?: string
    related_project_no?: string
    product_code?: string
    operation_type?: string
    operation_date_from?: string
    operation_date_to?: string
    purpose?: string
    page?: number
    pageSize?: number
  }) => unwrap(api.get<KisBody<any>>('/product/orders', { params })),

  getSampleOrder: (id: number) =>
    unwrap(api.get<KisBody<any>>(`/product/orders/${id}`)),

  createSampleOrder: (data: Record<string, unknown>) =>
    unwrap(api.post<KisBody<any>>('/product/orders', data)),

  updateSampleOrder: (id: number, data: Record<string, unknown>) =>
    unwrap(api.put<KisBody<any>>(`/product/orders/${id}`, data)),

  // 项目下产品（工单执行表单产品下拉）
  getProjectProducts: (related_project_no: string) =>
    unwrap(api.get<KisBody<{ list: { product_code: string; product_name: string }[] }>>('/product/project-products', {
      params: { related_project_no },
    })),

  // 执行记录
  getExecutionOrders: (params?: {
    work_order_id?: number
    subject_rd?: string
    keyword?: string
    execution_date_from?: string
    execution_date_to?: string
    page?: number
    pageSize?: number
  }) => unwrap(api.get<KisBody<any>>('/product/execution-orders', { params })),

  getExecutionOrder: (id: number) =>
    unwrap(api.get<KisBody<any>>(`/product/execution-orders/${id}`)),

  /** 某日队列已「无需执行」结案项，用于待执行列表排除 */
  getExecutionPendingSkips: (queueDate: string) =>
    unwrap(
      api.get<
        KisBody<{
          items: Array<{
            work_order_id: number
            subject_id: number
            checkin_id: number | null
            queue_date: string
          }>
        }>
      >('/product/execution-orders/pending-skips', { params: { queue_date: queueDate.slice(0, 10) } }),
    ),

  createExecutionOrder: (data: Record<string, unknown>) =>
    unwrap(api.post<KisBody<any>>('/product/execution-orders', data)),

  updateExecutionOrder: (id: number, data: Record<string, unknown>) =>
    unwrap(api.put<KisBody<any>>(`/product/execution-orders/${id}`, data)),

  deleteExecutionOrder: (id: number) =>
    unwrap(api.delete<KisBody<null>>(`/product/execution-orders/${id}`)),

  /** 获取全部工单（用于下拉/参考），后端单页最大 100 条 */
  getAllWorkOrders: () =>
    unwrap(api.get<KisBody<any>>('/product/workorders', { params: { page: 1, pageSize: 100 } })),

  /** 项目执行概览：按日期返回当日项目执行项 */
  getExecutionOverview: (date: string) =>
    unwrap(
      api.get<KisBody<{ items: Array<Record<string, unknown>> }>>('/product/execution-overview', {
        params: { date: date.slice(0, 10) },
      }),
    ),

  /** 项目执行概览：按月份返回每日项目数量，用于月历角标 */
  getExecutionOverviewCounts: (month: string) =>
    unwrap(api.get<KisBody<Record<string, number>>>('/product/execution-overview/counts', { params: { month: month.slice(0, 7) } })),

  /** 导出 Excel：POST 表头与行数据，触发浏览器下载 */
  exportExcel: async (params: {
    sheet_name: string
    filename: string
    headers: string[]
    rows: (string | number)[][]
  }): Promise<void> => {
    const { getAxiosInstance } = await import('../client')
    const res = await getAxiosInstance().post<Blob>(
      '/product/export-excel',
      {
        sheet_name: params.sheet_name,
        filename: params.filename,
        headers: params.headers,
        rows: params.rows,
      },
      { responseType: 'blob' }
    )
    const blob = res.data
    const disposition = res.headers?.['content-disposition']
    let filename = params.filename
    if (disposition) {
      const m = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/)
      if (m) filename = decodeURIComponent(m[1].trim())
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  },
}
