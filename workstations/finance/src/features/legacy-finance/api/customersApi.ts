import { apiClient } from "@/shared/api/client";
import { createMockAdapterCaller } from "@/shared/api/mock-adapter";
import type { FinanceCustomer } from "@/entities/finance/customer-domain";
import {
  getCustomersStore,
  addCustomerToStore,
  updateCustomerInStore,
  deleteCustomerFromStore,
  findCustomerByName,
} from "./customersStorage";

export interface CreateCustomerRequest {
  customer_code?: string; // 可选，如果不提供则自动生成
  customer_name: string;
  short_name?: string;
  payment_term_days: number;
  payment_term_description?: string;
  remark?: string;
  is_active?: boolean;
}

export interface UpdateCustomerRequest extends Partial<CreateCustomerRequest> {
  id: number;
}

export interface GetCustomersParams {
  page?: number;
  page_size?: number;
  keyword?: string;
  is_active?: boolean;
}

/** 后端 {code, msg, data} 或 {success, data} 格式下的 data 提取 */
function unwrapData<T>(res: { data: unknown }): T {
  const raw = res.data;
  if (raw && typeof raw === "object" && "data" in (raw as object)) {
    const obj = raw as { code?: number; success?: boolean; data: T };
    if ((obj.code === 200 || obj.success === true) && obj.data !== undefined) {
      return obj.data;
    }
  }
  return raw as T;
}

/** 后端客户响应 */
interface CustomerResponse {
  id: number;
  customer_code: string;
  customer_name: string;
  short_name?: string;
  payment_term_days: number;
  payment_term_description?: string;
  remark?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** 客户列表响应 */
interface CustomerListResponse {
  customers: CustomerResponse[];
  total_records: number;
  total_pages: number;
  current_page: number;
}

function mapCustomerResponse(item: CustomerResponse): FinanceCustomer {
  return {
    id: item.id,
    customer_code: item.customer_code,
    customer_name: item.customer_name,
    short_name: item.short_name,
    payment_term_days: item.payment_term_days,
    payment_term_description: item.payment_term_description,
    remark: item.remark,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

const mockCustomersApi = {
  getCustomers: async (params?: GetCustomersParams): Promise<{
    customers: FinanceCustomer[];
    total_records: number;
    total_pages: number;
    current_page: number;
  }> => {
    let customers = getCustomersStore();
    
    // 筛选
    if (params?.keyword) {
      const keyword = params.keyword.toLowerCase();
      customers = customers.filter(c =>
        c.customer_name.toLowerCase().includes(keyword) ||
        (c.short_name && c.short_name.toLowerCase().includes(keyword))
      );
    }
    
    if (params?.is_active !== undefined) {
      customers = customers.filter(c => c.is_active === params.is_active);
    }
    
    // 分页
    const page = params?.page || 1;
    const pageSize = params?.page_size || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      customers: customers.slice(start, end),
      total_records: customers.length,
      total_pages: Math.ceil(customers.length / pageSize),
      current_page: page,
    };
  },
  
  getCustomerById: async (id: number): Promise<FinanceCustomer | null> => {
    const customers = getCustomersStore();
    return customers.find(c => c.id === id) || null;
  },
  
  findCustomerByName: async (customerName: string): Promise<FinanceCustomer | null> => {
    return findCustomerByName(customerName);
  },
  
  createCustomer: async (data: CreateCustomerRequest): Promise<FinanceCustomer> => {
    return addCustomerToStore({
      ...data,
      is_active: data.is_active ?? true,
    } as Parameters<typeof addCustomerToStore>[0])
  },
  
  updateCustomer: async (data: UpdateCustomerRequest): Promise<FinanceCustomer> => {
    const { id, ...updates } = data;
    const updated = updateCustomerInStore(id, updates);
    if (!updated) {
      throw new Error('Customer not found');
    }
    return updated;
  },
  
  deleteCustomer: async (id: number): Promise<void> => {
    const success = deleteCustomerFromStore(id);
    if (!success) {
      throw new Error('Customer not found');
    }
  },
};

// 财务模块：即使real模式也允许fallback到mock（因为后端API可能还未实现）
const callWithMock = createMockAdapterCaller({ 
  fallbackToMockOnError: true // 允许fallback，确保后端不可用时仍可使用mock数据
});

export const customersApi = {
  getCustomers: (params?: GetCustomersParams) =>
    callWithMock(
      "finance.customers.getCustomers",
      async () => {
        const res = await apiClient.get<CustomerListResponse | { code: number; data: CustomerListResponse }>(
          "/finance/customers",
          { params: params as Record<string, unknown> }
        );
        const data = unwrapData<CustomerListResponse>(res);
        return {
          customers: data.customers.map(mapCustomerResponse),
          total_records: data.total_records,
          total_pages: data.total_pages,
          current_page: data.current_page,
        };
      },
      () => mockCustomersApi.getCustomers(params)
    ),
  
  getCustomerById: (id: number) =>
    callWithMock(
      "finance.customers.getCustomerById",
      async () => {
        const res = await apiClient.get<CustomerResponse | { code: number; data: CustomerResponse }>(
          `/finance/customers/${id}`
        );
        const data = unwrapData<CustomerResponse | null>(res);
        return data ? mapCustomerResponse(data) : null;
      },
      () => mockCustomersApi.getCustomerById(id)
    ),
  
  findCustomerByName: (customerName: string) =>
    callWithMock(
      "finance.customers.findCustomerByName",
      async () => {
        const res = await apiClient.get<CustomerListResponse | { code: number; data: CustomerListResponse }>(
          "/finance/customers",
          { params: { name: customerName } }
        );
        const data = unwrapData<CustomerListResponse>(res);
        const first = data.customers?.[0];
        return first ? mapCustomerResponse(first) : null;
      },
      () => mockCustomersApi.findCustomerByName(customerName)
    ),
  
  createCustomer: (data: CreateCustomerRequest) =>
    callWithMock(
      "finance.customers.createCustomer",
      async () => {
        const res = await apiClient.post<CustomerResponse | { code: number; data: CustomerResponse }>(
          "/finance/customers",
          data
        );
        const item = unwrapData<CustomerResponse>(res);
        return mapCustomerResponse(item);
      },
      () => mockCustomersApi.createCustomer(data)
    ),
  
  updateCustomer: (data: UpdateCustomerRequest) =>
    callWithMock(
      "finance.customers.updateCustomer",
      async () => {
        const { id, ...updateData } = data;
        const res = await apiClient.put<CustomerResponse | { code: number; data: CustomerResponse }>(
          `/finance/customers/${id}`,
          updateData
        );
        const item = unwrapData<CustomerResponse>(res);
        return mapCustomerResponse(item);
      },
      () => mockCustomersApi.updateCustomer(data)
    ),
  
  deleteCustomer: (id: number) =>
    callWithMock(
      "finance.customers.deleteCustomer",
      async () => {
        await apiClient.delete(`/finance/customers/${id}`);
      },
      () => mockCustomersApi.deleteCustomer(id)
    ),
};
