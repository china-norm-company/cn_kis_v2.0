/**
 * 发票管理 API
 * 职责：封装发票相关接口，支持真实接口和mock模式切换
 * 主要导出：invoicesApi
 * 依赖：@/shared/api/client、@/shared/api/mock-adapter、@/shared/config/env
 */

import { apiClient } from "@/shared/api/client";
import { createMockAdapterCaller } from "@/shared/api/mock-adapter";
import { getApiMode } from "@/shared/config/env";
import type { Invoice, InvoiceStatus } from "@/entities/finance/domain";

// 开发：后端不可用时可回落 mock。生产：禁止回落，否则每人仍只看到本机 localStorage，团队共享失效
const callWithMock = createMockAdapterCaller({
  fallbackToMockOnError: import.meta.env.DEV,
});

// ============= 后端响应类型 =============

/** 后端发票响应 */
interface InvoiceResponse {
  id: number;
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  invoice_content: string;
  invoice_currency?: string;
  invoice_amount_tax_included?: number;
  revenue_amount: number;
  invoice_type: string;
  company_name: string;
  project_code: string;
  project_id?: number;
  po?: string;
  payment_date?: string;
  payment_amount?: number;
  payment_term?: number;
  expected_payment_date?: string;
  receivable_date?: string;
  sales_manager: string;
  invoice_year?: string;
  invoice_month?: string;
  payment_year?: string;
  payment_month?: string;
  status: string;
  lims_report_submitted_at?: string;
  electronic_invoice_file?: string;
  electronic_invoice_file_name?: string;
  created_at: string;
  updated_at: string;
}

/** 发票列表响应 */
interface InvoiceListResponse {
  invoices: InvoiceResponse[];
  total_records: number;
  total_pages: number;
  current_page: number;
}

/** 创建发票请求 */
export interface CreateInvoiceRequest {
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  invoice_content: string;
  invoice_currency?: string;
  invoice_amount_tax_included?: number;
  revenue_amount: number;
  invoice_type: '全电专票' | '全电普票' | '形式发票';
  company_name: string;
  project_code: string;              // 主项目编号（兼容字段）
  project_id?: number;
  po?: string;
  payment_term?: number;
  sales_manager: string;
  
  // 多项目支持（一个发票最多20个项目编号）
  invoice_items?: Array<{            // 发票明细
    project_code: string;            // 项目编号
    project_id?: number;             // 关联项目ID
    amount: number;                  // 该项目对应的金额
    service_content?: string;        // 服务内容
  }>;
  
  // 开票申请关联
  invoice_request_id?: number;       // 关联的开票申请ID
  
  // 电子发票管理
  electronic_invoice_file?: string;        // 电子发票文件路径/URL
  electronic_invoice_file_name?: string;   // 电子发票文件名
}

/** 更新发票请求 */
export interface UpdateInvoiceRequest extends Partial<CreateInvoiceRequest> {
  id: number;
  payment_date?: string;
  payment_amount?: number;
  status?: InvoiceStatus;
}

// ============= Mock 数据 =============

import { 
  getInvoicesStore, 
  addInvoiceToStore, 
  updateInvoiceInStore, 
  deleteInvoiceFromStore 
} from "./invoicesStorage";

// 使用持久化存储的数据
const getMockInvoices = (): Invoice[] => getInvoicesStore();

const mockInvoicesApi = {
  getInvoices: async (params?: {
    page?: number;
    page_size?: number;
    project_code?: string;
    customer_name?: string;
    status?: InvoiceStatus;
    start_date?: string;
    end_date?: string;
    revenue_amount?: number; // 支持按金额搜索
  }): Promise<{
    invoices: Invoice[];
    total_records: number;
    total_pages: number;
    current_page: number;
  }> => {
    // 从持久化存储获取数据
    const allInvoices = getMockInvoices();
    let filtered = [...allInvoices];
    
    if (params?.project_code) {
      // 提取纯项目编号进行匹配（支持带百分比的格式）
      const cleanProjectCode = params.project_code.split('-')[0].trim();
      filtered = filtered.filter(inv => {
        const invCleanCode = inv.project_code.split('-')[0].trim();
        return invCleanCode === cleanProjectCode || inv.project_code.includes(cleanProjectCode);
      });
    }
    if (params?.customer_name) {
      filtered = filtered.filter(inv => inv.customer_name.includes(params.customer_name!));
    }
    if (params?.status) {
      filtered = filtered.filter(inv => inv.status === params.status);
    }
    if (params?.start_date) {
      filtered = filtered.filter(inv => inv.invoice_date >= params.start_date!);
    }
    if (params?.end_date) {
      filtered = filtered.filter(inv => inv.invoice_date <= params.end_date!);
    }
    // 支持按金额搜索（精确匹配或模糊匹配）
    if (params && 'revenue_amount' in params && params.revenue_amount) {
      const searchAmount = params.revenue_amount as number;
      console.log('[发票搜索] 按金额搜索:', searchAmount);
      filtered = filtered.filter(inv => {
        // 精确匹配（允许0.01的误差）
        if (Math.abs(inv.revenue_amount - searchAmount) < 0.01) {
          console.log('[发票搜索] 精确匹配:', inv.invoice_no, inv.revenue_amount);
          return true;
        }
        // 模糊匹配（金额包含搜索的数字，例如搜索2000，可以匹配20000、12000等）
        const match = inv.revenue_amount.toString().includes(searchAmount.toString());
        if (match) {
          console.log('[发票搜索] 模糊匹配:', inv.invoice_no, inv.revenue_amount);
        }
        return match;
      });
      console.log('[发票搜索] 匹配结果数量:', filtered.length);
    }
    
    const page = params?.page || 1;
    const pageSize = params?.page_size || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      invoices: filtered.slice(start, end),
      total_records: filtered.length,
      total_pages: Math.ceil(filtered.length / pageSize),
      current_page: page,
    };
  },
  
  getInvoiceById: async (id: number): Promise<Invoice | null> => {
    return getMockInvoices().find(inv => inv.id === id) || null;
  },
  
  createInvoice: async (data: CreateInvoiceRequest): Promise<Invoice> => {
    // 统一开票日期为 YYYY-MM-DD，便于时间筛选（本月/本季/本年）正确匹配
    const parsedDate = new Date(data.invoice_date);
    const invoiceDateNormalized = isNaN(parsedDate.getTime())
      ? data.invoice_date
      : parsedDate.getFullYear() +
        '-' +
        String(parsedDate.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(parsedDate.getDate()).padStart(2, '0');
    // 如果提供了invoice_items，使用第一个项目作为主项目编号（兼容旧数据）
    const mainProjectCode = data.invoice_items && data.invoice_items.length > 0
      ? data.invoice_items[0].project_code
      : data.project_code;
    
    const newInvoice: Invoice = {
      id: 0, // 会在addInvoiceToStore中自动生成
      ...data,
      invoice_date: invoiceDateNormalized,
      project_code: mainProjectCode, // 主项目编号（用于搜索和显示）
      invoice_items: data.invoice_items, // 发票明细（支持多个项目，最多20个）
      status: 'issued',
      invoice_year: isNaN(parsedDate.getTime()) ? undefined : parsedDate.getFullYear() + '年',
      invoice_month: isNaN(parsedDate.getTime()) ? undefined : (parsedDate.getMonth() + 1) + '月',
      // 电子发票字段
      electronic_invoice_file: data.electronic_invoice_file,
      electronic_invoice_file_name: data.electronic_invoice_file_name,
      electronic_invoice_uploaded_at: data.electronic_invoice_file_name ? new Date().toISOString() : undefined,
      electronic_invoice_download_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    console.log('[创建发票] 保存发票数据:', {
      id: newInvoice.id,
      invoice_no: newInvoice.invoice_no,
      electronic_invoice_file_name: newInvoice.electronic_invoice_file_name,
    });
    
    // 如果有关联的开票申请，更新申请状态
    if (data.invoice_request_id) {
      // 这里可以调用invoiceRequestsApi更新申请状态
      // 暂时先记录，后续实现
      console.log('[创建发票] 关联开票申请:', data.invoice_request_id);
    }
    
    return addInvoiceToStore(newInvoice);
  },
  
  updateInvoice: async (data: UpdateInvoiceRequest): Promise<Invoice> => {
    const { id, ...updates } = data;
    const existing = getMockInvoices().find(inv => inv.id === id);
    if (!existing) {
      throw new Error('Invoice not found');
    }
    
    console.log('[发票API] 更新发票请求:', {
      invoice_id: id,
      updates: updates,
      existing_electronic_invoice_file: existing.electronic_invoice_file,
    });
    
    // 更新收款相关字段时，自动更新年份月份
    if (updates.payment_date) {
      // 年份月份字段通过派生计算，无需存储
    }
    
    // 如果更新了收款金额或收款日期，自动计算状态（如果没有明确指定状态）
    if (updates.payment_amount !== undefined && updates.status === undefined) {
      const paymentAmount = updates.payment_amount;
      const revenueAmount = updates.revenue_amount ?? existing.revenue_amount;
      
      if (paymentAmount >= revenueAmount) {
        updates.status = 'paid';
      } else if (paymentAmount > 0) {
        updates.status = 'partial';
      } else {
        // 如果收款金额为0，但之前有状态，保持原状态或设为已开票
        updates.status = existing.status === 'draft' ? 'issued' : existing.status;
      }
    } else if (updates.payment_date && updates.payment_amount === undefined && updates.status === undefined) {
      // 如果只更新了收款日期但没有收款金额，且没有明确指定状态，保持原状态
      // 但如果原状态是草稿，则设为已开票
      if (existing.status === 'draft') {
        updates.status = 'issued';
      }
    }
    
    // 如果更新电子发票相关字段，确保正确保存
    if (updates.electronic_invoice_file !== undefined || updates.electronic_invoice_file_name !== undefined) {
      console.log('[发票API] 更新电子发票字段:', {
        electronic_invoice_file: updates.electronic_invoice_file,
        electronic_invoice_file_name: updates.electronic_invoice_file_name,
      });
    }
    
    const updated = updateInvoiceInStore(id, updates);
    if (!updated) {
      throw new Error('Invoice not found');
    }
    
    console.log('[发票API] 发票更新完成:', {
      invoice_id: id,
      electronic_invoice_file: updated.electronic_invoice_file,
      electronic_invoice_file_name: updated.electronic_invoice_file_name,
    });
    
    return updated;
  },
  
  deleteInvoice: async (id: number): Promise<void> => {
    const success = deleteInvoiceFromStore(id);
    if (!success) {
      throw new Error('Invoice not found');
    }
  },
};

// ============= API 实现 =============

export const invoicesApi = {
  /**
   * 获取发票列表
   */
  getInvoices: (params?: {
    page?: number;
    page_size?: number;
    project_code?: string;
    customer_name?: string;
    status?: InvoiceStatus;
    start_date?: string;
    end_date?: string;
    revenue_amount?: number; // 支持按金额搜索
  }) =>
    callWithMock(
      "finance.invoices.list",
      async () => {
        const response = await apiClient.get<InvoiceListResponse>("/finance/invoices", {
          params: params as Record<string, unknown>,
        });
        
        // 映射后端响应到前端实体
        const invoices: Invoice[] = response.data.invoices.map((item) => ({
          id: item.id,
          invoice_no: item.invoice_no,
          invoice_date: item.invoice_date,
          customer_name: item.customer_name,
          invoice_content: item.invoice_content,
          invoice_currency: item.invoice_currency,
          invoice_amount_tax_included: item.invoice_amount_tax_included,
          revenue_amount: item.revenue_amount,
          invoice_type: item.invoice_type as '全电专票' | '全电普票' | '形式发票',
          company_name: item.company_name,
          project_code: item.project_code,
          project_id: item.project_id,
          po: item.po,
          payment_date: item.payment_date,
          payment_amount: item.payment_amount,
          payment_term: item.payment_term,
          expected_payment_date: item.expected_payment_date,
          receivable_date: item.receivable_date,
          sales_manager: item.sales_manager,
          invoice_year: item.invoice_year,
          invoice_month: item.invoice_month,
          payment_year: item.payment_year,
          payment_month: item.payment_month,
          status: item.status as InvoiceStatus,
          lims_report_submitted_at: item.lims_report_submitted_at,
          electronic_invoice_file: item.electronic_invoice_file,
          electronic_invoice_file_name: item.electronic_invoice_file_name,
          created_at: item.created_at,
          updated_at: item.updated_at,
        }));
        
        return {
          invoices,
          total_records: response.data.total_records,
          total_pages: response.data.total_pages,
          current_page: response.data.current_page,
        };
      },
      () => mockInvoicesApi.getInvoices(params)
    ),
  
  /**
   * 获取发票详情
   */
  getInvoiceById: (id: number) =>
    callWithMock(
      "finance.invoices.getById",
      async () => {
        const response = await apiClient.get<InvoiceResponse>(`/finance/invoices/${id}`);
        
        const item = response.data;
        return {
          id: item.id,
          invoice_no: item.invoice_no,
          invoice_date: item.invoice_date,
          customer_name: item.customer_name,
          invoice_content: item.invoice_content,
          invoice_currency: item.invoice_currency,
          invoice_amount_tax_included: item.invoice_amount_tax_included,
          revenue_amount: item.revenue_amount,
          invoice_type: item.invoice_type as '全电专票' | '全电普票' | '形式发票',
          company_name: item.company_name,
          project_code: item.project_code,
          project_id: item.project_id,
          po: item.po,
          payment_date: item.payment_date,
          payment_amount: item.payment_amount,
          payment_term: item.payment_term,
          expected_payment_date: item.expected_payment_date,
          receivable_date: item.receivable_date,
          sales_manager: item.sales_manager,
          invoice_year: item.invoice_year,
          invoice_month: item.invoice_month,
          payment_year: item.payment_year,
          payment_month: item.payment_month,
          status: item.status as InvoiceStatus,
          lims_report_submitted_at: item.lims_report_submitted_at,
          electronic_invoice_file: item.electronic_invoice_file,
          electronic_invoice_file_name: item.electronic_invoice_file_name,
          created_at: item.created_at,
          updated_at: item.updated_at,
        } as Invoice;
      },
      () => mockInvoicesApi.getInvoiceById(id)
    ),
  
  /**
   * 创建发票
   */
  createInvoice: (data: CreateInvoiceRequest) =>
    callWithMock(
      "finance.invoices.create",
      async () => {
        const response = await apiClient.post<InvoiceResponse>("/finance/invoices", data);
        // 映射逻辑同 getInvoiceById
        return response.data as unknown as Invoice;
      },
      () => mockInvoicesApi.createInvoice(data)
    ),
  
  /**
   * 更新发票
   */
  updateInvoice: (data: UpdateInvoiceRequest) =>
    callWithMock(
      "finance.invoices.update",
      async () => {
        const { id, ...updateData } = data;
        const response = await apiClient.put<InvoiceResponse>(`/finance/invoices/${id}`, updateData);
        // 映射逻辑同 getInvoiceById
        return response.data as unknown as Invoice;
      },
      () => mockInvoicesApi.updateInvoice(data)
    ),
  
  /**
   * 删除发票
   */
  deleteInvoice: (id: number) =>
    callWithMock(
      "finance.invoices.delete",
      async () => {
        await apiClient.delete(`/finance/invoices/${id}`);
      },
      () => mockInvoicesApi.deleteInvoice(id)
    ),
};
