/**
 * 开票申请管理 API
 */

import { apiClient } from "@/shared/api/client";
import { createMockAdapterCaller } from "@/shared/api/mock-adapter";
import { getApiMode } from "@/shared/config/env";
import type { 
  InvoiceRequest, 
  InvoiceRequestStatus,
  CreateInvoiceRequestRequest,
  UpdateInvoiceRequestRequest 
} from "@/entities/finance/invoice-request-domain";
import { 
  getInvoiceRequestsStore, 
  addInvoiceRequestToStore, 
  updateInvoiceRequestInStore, 
  deleteInvoiceRequestFromStore 
} from "./invoiceRequestsStorage";

const callWithMock = createMockAdapterCaller({ 
  fallbackToMockOnError: true // 允许fallback，确保后端不可用时仍可使用mock数据 
});

// ============= 后端响应类型 =============

interface InvoiceRequestResponse {
  id: number;
  request_date: string;
  customer_name: string;
  invoice_type?: string;
  amount_type?: string;
  tax_rate?: number;
  items: Array<{
    id?: number;
    project_code: string;
    project_id?: number;
    amount: number;
    amount_inclusive_of_tax?: number;
    service_content: string;
  }>;
  po?: string;
  total_amount: number;
  request_by: string;
  request_by_id?: number;
  status: string;
  invoice_ids?: number[];
  notes?: string;
  processed_by?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

interface InvoiceRequestListResponse {
  requests: InvoiceRequestResponse[];
  total_records: number;
  total_pages: number;
  current_page: number;
}

type WrappedResponse<T> = { code?: number; data?: T };

const unwrapPayload = <T>(payload: T | WrappedResponse<T> | undefined): T | undefined => {
  if (!payload) return undefined;
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as WrappedResponse<T>).data;
  }
  return payload as T;
};

// ============= Mock 数据 =============

const getMockInvoiceRequests = (): InvoiceRequest[] => getInvoiceRequestsStore();

/** 取日期部分用于比较，兼容 YYYY-MM-DD 与 ISO 字符串 */
const toDateOnly = (d: string | undefined): string => {
  if (!d) return "";
  return d.slice(0, 10);
};

const mockInvoiceRequestsApi = {
  getInvoiceRequests: async (params?: {
    page?: number;
    page_size?: number;
    status?: InvoiceRequestStatus;
    request_by?: string;
    customer_name?: string;
    start_date?: string;
    end_date?: string;
  }) => {
    const allRequests = getMockInvoiceRequests();
    let filtered = [...allRequests];
    
    if (params?.status) {
      filtered = filtered.filter(r => r.status === params.status);
    }
    if (params?.request_by) {
      filtered = filtered.filter(r => r.request_by.includes(params.request_by!));
    }
    if (params?.customer_name) {
      filtered = filtered.filter(r => r.customer_name.includes(params.customer_name!));
    }
    if (params?.start_date) {
      const start = toDateOnly(params.start_date);
      filtered = filtered.filter(r => toDateOnly(r.request_date) >= start);
    }
    if (params?.end_date) {
      const end = toDateOnly(params.end_date);
      filtered = filtered.filter(r => toDateOnly(r.request_date) <= end);
    }
    
    const page = params?.page || 1;
    const pageSize = params?.page_size || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      requests: filtered.slice(start, end),
      total_records: filtered.length,
      total_pages: Math.ceil(filtered.length / pageSize),
      current_page: page,
    };
  },
  
  getInvoiceRequestById: async (id: number): Promise<InvoiceRequest | null> => {
    return getMockInvoiceRequests().find(r => r.id === id) || null;
  },
  
  createInvoiceRequest: async (data: CreateInvoiceRequestRequest): Promise<InvoiceRequest> => {
    const amountType = data.amount_type ?? 'inclusive_of_tax';
    const taxRate = data.tax_rate ?? 0.06;
    const totalAmount = data.items.reduce((sum, item) => {
      const inc = amountType === 'inclusive_of_tax' ? item.amount : item.amount * (1 + taxRate);
      return sum + inc;
    }, 0);
    const itemsWithInclusive = data.items.map((it) => ({
      ...it,
      amount_inclusive_of_tax: amountType === 'inclusive_of_tax' ? it.amount : Math.round(it.amount * (1 + taxRate) * 100) / 100,
    }));

    const newRequest: InvoiceRequest = {
      id: 0, // 会在addInvoiceRequestToStore中自动生成
      request_date: data.request_date,
      customer_name: data.customer_name,
      invoice_type: data.invoice_type ?? 'vat_special',
      amount_type: amountType,
      tax_rate: taxRate,
      items: itemsWithInclusive,
      po: data.po,
      total_amount: Math.round(totalAmount * 100) / 100,
      request_by: data.request_by,
      status: 'pending',
      notes: data.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    return addInvoiceRequestToStore(newRequest);
  },
  
  updateInvoiceRequest: async (data: UpdateInvoiceRequestRequest): Promise<InvoiceRequest> => {
    const { id, ...updates } = data;
    
    if (updates.status === 'completed' && !updates.processed_at) {
      updates.processed_at = new Date().toISOString();
    }
    
    const updated = updateInvoiceRequestInStore(id, updates);
    if (!updated) {
      throw new Error('InvoiceRequest not found');
    }
    return updated;
  },
  
  deleteInvoiceRequest: async (id: number): Promise<void> => {
    const success = deleteInvoiceRequestFromStore(id);
    if (!success) {
      throw new Error('InvoiceRequest not found');
    }
  },
};

// ============= API 实现 =============

export const invoiceRequestsApi = {
  /**
   * 获取开票申请列表
   */
  getInvoiceRequests: (params?: {
    page?: number;
    page_size?: number;
    status?: InvoiceRequestStatus;
    request_by?: string;
    customer_name?: string;
    start_date?: string;
    end_date?: string;
  }) =>
    callWithMock(
      "finance.invoice_requests.list",
      async () => {
        const response = await apiClient.get<WrappedResponse<InvoiceRequestListResponse> | InvoiceRequestListResponse>("/finance/invoice-requests", {
          params: params as Record<string, unknown>,
        });
        const payload = unwrapPayload<InvoiceRequestListResponse>(response?.data);
        if (!payload || !Array.isArray(payload.requests)) {
          throw new Error("开票申请列表接口返回格式异常，使用本地数据");
        }
        
        const requests: InvoiceRequest[] = payload.requests.map((item) => ({
          id: item.id,
          request_date: item.request_date,
          customer_name: item.customer_name,
          invoice_type: (item.invoice_type as InvoiceRequest['invoice_type']) || 'vat_special',
          amount_type: (item.amount_type as InvoiceRequest['amount_type']) || 'inclusive_of_tax',
          tax_rate: item.tax_rate ?? 0.06,
          items: item.items,
          po: item.po,
          total_amount: item.total_amount,
          request_by: item.request_by,
          request_by_id: item.request_by_id,
          status: item.status as InvoiceRequestStatus,
          invoice_ids: item.invoice_ids,
          notes: item.notes,
          processed_by: item.processed_by,
          processed_at: item.processed_at,
          created_at: item.created_at,
          updated_at: item.updated_at,
        }));
        
        return {
          requests,
          total_records: payload.total_records,
          total_pages: payload.total_pages,
          current_page: payload.current_page,
        };
      },
      () => mockInvoiceRequestsApi.getInvoiceRequests(params)
    ),
  
  /**
   * 获取开票申请详情
   */
  getInvoiceRequestById: (id: number) =>
    callWithMock(
      "finance.invoice_requests.getById",
      async () => {
        const response = await apiClient.get<WrappedResponse<InvoiceRequestResponse> | InvoiceRequestResponse>(`/finance/invoice-requests/${id}`);
        const d = unwrapPayload<InvoiceRequestResponse>(response?.data);
        if (!d) throw new Error("开票申请详情接口返回格式异常");
        return {
          id: d.id,
          request_date: d.request_date,
          customer_name: d.customer_name,
          invoice_type: (d.invoice_type as InvoiceRequest['invoice_type']) || 'vat_special',
          amount_type: (d.amount_type as InvoiceRequest['amount_type']) || 'inclusive_of_tax',
          tax_rate: d.tax_rate ?? 0.06,
          items: d.items,
          po: d.po,
          total_amount: d.total_amount,
          request_by: d.request_by,
          request_by_id: d.request_by_id,
          status: d.status as InvoiceRequestStatus,
          invoice_ids: d.invoice_ids,
          notes: d.notes,
          processed_by: d.processed_by,
          processed_at: d.processed_at,
          created_at: d.created_at,
          updated_at: d.updated_at,
        } as InvoiceRequest;
      },
      () => mockInvoiceRequestsApi.getInvoiceRequestById(id)
    ),
  
  /**
   * 创建开票申请
   */
  createInvoiceRequest: (data: CreateInvoiceRequestRequest) =>
    callWithMock(
      "finance.invoice_requests.create",
      async () => {
        const response = await apiClient.post<WrappedResponse<InvoiceRequestResponse> | InvoiceRequestResponse>("/finance/invoice-requests", data);
        const d = unwrapPayload<InvoiceRequestResponse>(response?.data);
        if (!d) throw new Error("创建开票申请返回格式异常");
        return {
          id: d.id,
          request_date: d.request_date,
          customer_name: d.customer_name,
          invoice_type: (d.invoice_type as InvoiceRequest['invoice_type']) || 'vat_special',
          amount_type: (d.amount_type as InvoiceRequest['amount_type']) || 'inclusive_of_tax',
          tax_rate: d.tax_rate ?? 0.06,
          items: d.items,
          po: d.po,
          total_amount: d.total_amount,
          request_by: d.request_by,
          request_by_id: d.request_by_id,
          status: d.status as InvoiceRequestStatus,
          invoice_ids: d.invoice_ids,
          notes: d.notes,
          processed_by: d.processed_by,
          processed_at: d.processed_at,
          created_at: d.created_at,
          updated_at: d.updated_at,
        } as InvoiceRequest;
      },
      () => mockInvoiceRequestsApi.createInvoiceRequest(data)
    ),
  
  /**
   * 更新开票申请
   */
  updateInvoiceRequest: (data: UpdateInvoiceRequestRequest) =>
    callWithMock(
      "finance.invoice_requests.update",
      async () => {
        const { id, ...updateData } = data;
        const response = await apiClient.put<WrappedResponse<InvoiceRequestResponse> | InvoiceRequestResponse>(
          `/finance/invoice-requests/${id}`,
          updateData
        );
        const d = unwrapPayload<InvoiceRequestResponse>(response?.data);
        if (!d) throw new Error("更新开票申请返回格式异常");
        return {
          id: d.id,
          request_date: d.request_date,
          customer_name: d.customer_name,
          invoice_type: (d.invoice_type as InvoiceRequest['invoice_type']) || 'vat_special',
          amount_type: (d.amount_type as InvoiceRequest['amount_type']) || 'inclusive_of_tax',
          tax_rate: d.tax_rate ?? 0.06,
          items: d.items,
          po: d.po,
          total_amount: d.total_amount,
          request_by: d.request_by,
          request_by_id: d.request_by_id,
          status: d.status as InvoiceRequestStatus,
          invoice_ids: d.invoice_ids,
          notes: d.notes,
          processed_by: d.processed_by,
          processed_at: d.processed_at,
          created_at: d.created_at,
          updated_at: d.updated_at,
        } as InvoiceRequest;
      },
      () => mockInvoiceRequestsApi.updateInvoiceRequest(data)
    ),
  
  /**
   * 删除开票申请
   */
  deleteInvoiceRequest: (id: number) =>
    callWithMock(
      "finance.invoice_requests.delete",
      async () => {
        await apiClient.delete(`/finance/invoice-requests/${id}`);
      },
      () => mockInvoiceRequestsApi.deleteInvoiceRequest(id)
    ),
};
