/**
 * 收款管理 API
 * 职责：封装收款相关接口，支持真实接口和mock模式切换
 */

import { apiClient } from "@/shared/api/client";
import { createMockAdapterCaller } from "@/shared/api/mock-adapter";
import { getApiMode } from "@/shared/config/env";
import type { Payment, PaymentStatus } from "@/entities/finance/payment-domain";
import { invoicesApi } from "./invoicesApi";
import { invoiceRequestsApi } from "./invoiceRequestsApi";
import { 
  getPaymentsStore, 
  addPaymentToStore, 
  updatePaymentInStore, 
  deletePaymentFromStore 
} from "./paymentsStorage";

// 财务模块：即使real模式也允许fallback到mock（因为后端API可能还未实现）
// 但飞书消息发送仍使用real模式
const callWithMock = createMockAdapterCaller({ 
  fallbackToMockOnError: true // 允许fallback，确保后端不可用时仍可使用mock数据
});

// ============= 后端响应类型 =============

interface PaymentResponse {
  id: number;
  payment_date: string;
  payment_amount: number;
  payment_method?: string;
  bank_account?: string;
  payment_reference?: string;
  remark?: string;
  invoice_id?: number;
  invoice_no?: string;
  project_code?: string;
  match_status: string;
  matched_amount: number;
  remaining_amount: number;
  customer_name?: string;
  sales_manager?: string;
  created_at: string;
  updated_at: string;
}

interface PaymentListResponse {
  payments: PaymentResponse[];
  total_records: number;
  total_pages: number;
  current_page: number;
}

/** Django 后端 finance._payment_to_dict（合同回款 t_payment） */
interface BackendPaymentRow {
  id: number;
  code?: string;
  invoice_id?: number;
  invoice_code?: string;
  client?: string;
  expected_amount?: string;
  actual_amount?: string;
  payment_date?: string;
  method?: string;
  status?: string;
  days_overdue?: number;
  create_time?: string;
}

interface BackendPaymentListPayload {
  items: BackendPaymentRow[];
  total: number;
  page: number;
  page_size: number;
}

function normalizeFinanceListPayload(res: { data: unknown }): BackendPaymentListPayload {
  const d = res.data as unknown;
  if (d && typeof d === "object" && "items" in (d as object)) {
    return d as BackendPaymentListPayload;
  }
  const wrapped = d as { data?: BackendPaymentListPayload };
  if (wrapped?.data) {
    return wrapped.data;
  }
  return { items: [], total: 0, page: 1, page_size: 20 };
}

function mapBackendPaymentRow(item: BackendPaymentRow): Payment {
  const expected = parseFloat(String(item.expected_amount ?? 0)) || 0;
  const rawActual = item.actual_amount;
  const actualNum =
    rawActual === "" || rawActual === null || rawActual === undefined
      ? 0
      : parseFloat(String(rawActual)) || 0;
  const statusRaw = item.status || "expected";
  const matchStatus: PaymentStatus =
    statusRaw === "full"
      ? "completed"
      : statusRaw === "partial"
        ? "partial"
        : "pending";
  return {
    id: item.id,
    payment_date: item.payment_date || "",
    payment_amount: actualNum,
    payment_method: item.method,
    invoice_id: item.invoice_id,
    invoice_no: item.invoice_code,
    match_status: matchStatus,
    matched_amount: actualNum,
    remaining_amount: Math.max(0, expected - actualNum),
    customer_name: item.client,
    created_at: item.create_time || "",
    updated_at: item.create_time || "",
  };
}

function normalizeFinanceDetailPayload(res: { data: unknown }): BackendPaymentRow | null {
  const d = res.data as unknown;
  if (d && typeof d === "object" && "id" in (d as object)) {
    const o = d as BackendPaymentRow;
    if ("expected_amount" in o || "invoice_id" in o) {
      return o;
    }
  }
  const wrapped = d as { data?: BackendPaymentRow };
  return wrapped?.data ?? null;
}

export interface CreatePaymentRequest {
  payment_date: string;
  payment_amount: number;
  payment_method?: string;
  bank_account?: string;
  payment_reference?: string;
  remark?: string;
  project_code?: string;
  project_codes?: string[];
  invoice_id?: number;
  invoice_no?: string;
  customer_name?: string;
  sales_manager?: string;
}

export interface UpdatePaymentRequest extends Partial<CreatePaymentRequest> {
  id: number;
  invoice_id?: number;
}

// ============= Mock 数据 =============

// 使用持久化存储的数据
const getMockPayments = (): Payment[] => getPaymentsStore();

/**
 * 更新开票申请的收款状态
 * 当发票完全收款时，检查该申请的所有发票是否都已完全收款
 */
async function updateInvoiceRequestPaymentStatus(invoiceId: number): Promise<void> {
  try {
    // 1. 查找包含该发票的开票申请
    const allRequests = await invoiceRequestsApi.getInvoiceRequests({ page_size: 1000 });
    const relatedRequests = allRequests.requests.filter(req => 
      req.invoice_ids && req.invoice_ids.includes(invoiceId)
    );
    
    if (relatedRequests.length === 0) {
      return; // 没有关联的开票申请
    }
    
    // 2. 对于每个关联的申请，检查所有发票是否都已完全收款
    for (const request of relatedRequests) {
      if (!request.invoice_ids || request.invoice_ids.length === 0) {
        continue;
      }
      
      // 获取该申请的所有发票
      const invoices = await Promise.all(
        request.invoice_ids.map(id => invoicesApi.getInvoiceById(id))
      );
      
      // 检查是否所有发票都已完全收款
      const allPaid = invoices.every(inv => inv && inv.status === 'paid');
      
      if (allPaid) {
        console.log(`[收款更新] 开票申请 ${request.id} 的所有发票已完全收款`);
        // 这里可以添加收款完成时间等字段，但目前InvoiceRequest没有收款相关字段
        // 如果需要，可以在InvoiceRequest中添加 payment_completed_at 字段
      }
    }
  } catch (error) {
    console.warn('[收款更新] 更新开票申请状态失败:', error);
    // 不影响收款流程，只记录警告
  }
}

const mockPaymentsApi = {
  getPayments: async (params?: {
    page?: number;
    page_size?: number;
    project_code?: string;
    customer_name?: string;
    match_status?: PaymentStatus;
    start_date?: string;
    end_date?: string;
  }) => {
    let allPayments = getMockPayments();
    
    // 自动补充缺失的客户信息和项目编号，并修复匹配状态（从关联的发票中获取）
    const paymentsToUpdate: Array<{ 
      id: number;
      customer_name?: string;
      sales_manager?: string;
      project_code?: string;
      project_codes?: string[];
      match_status?: PaymentStatus;
      matched_amount?: number;
      remaining_amount?: number;
      invoice_no?: string;
    }> = [];
    
    for (const payment of allPayments) {
      let needsUpdate = false;
      const updates: Partial<Payment> = {};
      
      // 如果收款记录有发票ID，尝试从发票获取信息并修复匹配状态
      if (payment.invoice_id) {
        try {
          const invoice = await invoicesApi.getInvoiceById(payment.invoice_id);
          if (invoice) {
            // 补充客户信息
            if (!payment.customer_name && invoice.customer_name) {
              updates.customer_name = invoice.customer_name;
              needsUpdate = true;
            }
            if (!payment.sales_manager && invoice.sales_manager) {
              updates.sales_manager = invoice.sales_manager;
              needsUpdate = true;
            }
            // 处理项目编号：优先使用invoice_items，否则使用主项目编号
            // 如果发票有多个项目编号（invoice_items），总是更新project_codes
            if (invoice.invoice_items && invoice.invoice_items.length > 0) {
              // 如果有多个项目编号，提取所有
              const codes = invoice.invoice_items.map(item => {
                return item.project_code.split('-')[0].trim();
              });
              const uniqueCodes = Array.from(new Set(codes)); // 去重
              
              // 只有当project_codes不存在或与发票不一致时才更新
              const currentCodes = payment.project_codes || (payment.project_code ? [payment.project_code] : []);
              const codesChanged = uniqueCodes.length !== currentCodes.length || 
                !uniqueCodes.every(code => currentCodes.includes(code));
              
              if (codesChanged) {
                updates.project_codes = uniqueCodes;
                updates.project_code = uniqueCodes[0]; // 主项目编号设为第一个
                needsUpdate = true;
                console.log(`[收款列表] 更新收款记录 ${payment.id} 的项目编号:`, {
                  old_codes: currentCodes,
                  new_codes: uniqueCodes,
                });
              }
            } else if (invoice.project_code && (!payment.project_codes || payment.project_codes.length === 0)) {
              // 如果只有一个项目编号，且收款记录没有project_codes，则设置
              const cleanProjectCode = invoice.project_code.split('-')[0].trim();
              if (!payment.project_code || payment.project_code !== cleanProjectCode) {
                updates.project_code = cleanProjectCode;
                updates.project_codes = [cleanProjectCode];
                needsUpdate = true;
              }
            }
            if (!payment.invoice_no && invoice.invoice_no) {
              updates.invoice_no = invoice.invoice_no;
              needsUpdate = true;
            }
            
            // 修复匹配状态：如果有发票ID，说明已经匹配了
            // 如果匹配状态不对，需要修复
            if (payment.match_status === 'pending' || 
                payment.matched_amount === 0 || 
                payment.matched_amount === undefined ||
                (payment.remaining_amount !== undefined && payment.remaining_amount === payment.payment_amount)) {
              // 重新计算匹配金额（应该是收款金额，因为是从发票列表记录的）
              const matchAmount = payment.payment_amount;
              updates.matched_amount = matchAmount;
              updates.remaining_amount = 0;
              updates.match_status = 'completed';
              needsUpdate = true;
              console.log(`[收款列表] 修复收款记录 ${payment.id} 的匹配状态:`, {
                old_status: payment.match_status,
                old_matched: payment.matched_amount,
                old_remaining: payment.remaining_amount,
                new_status: 'completed',
                new_matched: matchAmount,
                new_remaining: 0,
              });
            }
          }
        } catch (error) {
          console.warn(`[收款列表] 获取发票 ${payment.invoice_id} 信息失败:`, error);
        }
      }
      
      if (needsUpdate) {
        paymentsToUpdate.push({ id: payment.id, ...updates });
      }
    }
    
    // 批量更新
    for (const update of paymentsToUpdate) {
      const updatesToApply: Partial<Payment> = {};
      if (update.customer_name !== undefined) updatesToApply.customer_name = update.customer_name;
      if (update.sales_manager !== undefined) updatesToApply.sales_manager = update.sales_manager;
      if (update.project_code !== undefined) updatesToApply.project_code = update.project_code;
      if (update.project_codes !== undefined) updatesToApply.project_codes = update.project_codes;
      if (update.invoice_no !== undefined) updatesToApply.invoice_no = update.invoice_no;
      if (update.match_status !== undefined) updatesToApply.match_status = update.match_status;
      if (update.matched_amount !== undefined) updatesToApply.matched_amount = update.matched_amount;
      if (update.remaining_amount !== undefined) updatesToApply.remaining_amount = update.remaining_amount;
      
      if (Object.keys(updatesToApply).length > 0) {
        updatePaymentInStore(update.id, updatesToApply);
      }
    }
    
    // 重新获取更新后的数据
    if (paymentsToUpdate.length > 0) {
      allPayments = getMockPayments();
      console.log(`[收款列表] 已自动修复 ${paymentsToUpdate.length} 条收款记录的匹配状态和客户信息`);
    }
    
    let filtered = [...allPayments];
    
    if (params?.project_code) {
      filtered = filtered.filter(p => p.project_code?.includes(params.project_code!));
    }
    if (params?.match_status) {
      filtered = filtered.filter(p => p.match_status === params.match_status);
    }
    if (params?.customer_name) {
      filtered = filtered.filter(p => p.customer_name?.includes(params.customer_name!));
    }
    if (params?.start_date) {
      filtered = filtered.filter(p => p.payment_date >= params.start_date!);
    }
    if (params?.end_date) {
      filtered = filtered.filter(p => p.payment_date <= params.end_date!);
    }
    
    const page = params?.page || 1;
    const pageSize = params?.page_size || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      payments: filtered.slice(start, end),
      total_records: filtered.length,
      total_pages: Math.ceil(filtered.length / pageSize),
      current_page: page,
    };
  },
  
  getPaymentById: async (id: number): Promise<Payment | null> => {
    return getMockPayments().find(p => p.id === id) || null;
  },
  
  createPayment: async (data: CreatePaymentRequest): Promise<Payment> => {
    // 自动匹配发票逻辑
    let matchedInvoices: Array<{ invoice_id: number; invoice_no: string; matched_amount: number }> = [];
    let totalMatched = 0;
    let matchStatus: PaymentStatus = 'pending';
    let invoiceId: number | undefined;
    let invoiceNo: string | undefined = data.invoice_no; // 优先使用直接传递的发票号
    let customerName: string | undefined = data.customer_name; // 从请求中获取，或从匹配的发票中获取
    let salesManager: string | undefined = data.sales_manager; // 从请求中获取，或从匹配的发票中获取
    let projectCode: string | undefined = data.project_code; // 从请求中获取，或从匹配的发票中获取
    let projectCodes: string[] | undefined = data.project_codes; // 项目编号列表（支持多个项目）
    
    console.log('[创建收款] 初始数据:', {
      invoice_id: data.invoice_id,
      invoice_no: data.invoice_no,
      project_code: data.project_code,
    });
    
    // 优先级1: 如果直接提供了invoice_id，优先使用（从发票列表记录收款）
    if (data.invoice_id) {
      try {
        // 重新获取发票信息，确保获取到最新的payment_amount（RecordPaymentDialog可能已经更新了）
        const invoice = await invoicesApi.getInvoiceById(data.invoice_id);
        if (invoice) {
          console.log(`[收款匹配] 手动指定发票: ${invoice.invoice_no}, ID: ${invoice.id}`);
          console.log(`[收款匹配] 发票当前收款金额: ${invoice.payment_amount || 0}, 发票总金额: ${invoice.revenue_amount}`);
          
          // 从发票列表记录收款，收款金额应该完全匹配
          const matchAmount = data.payment_amount;
          
          matchedInvoices.push({
            invoice_id: invoice.id,
            invoice_no: invoice.invoice_no,
            matched_amount: matchAmount,
          });
          totalMatched = matchAmount;
          
          // 从发票列表记录收款，应该总是完全匹配
          matchStatus = 'completed';
          invoiceId = invoice.id;
          invoiceNo = invoice.invoice_no;
          
          // 从发票获取客户信息和项目编号
          customerName = invoice.customer_name;
          salesManager = invoice.sales_manager;
          
          // 如果发票有多个项目编号（invoice_items），提取所有项目编号
          if (invoice.invoice_items && invoice.invoice_items.length > 0) {
            projectCodes = invoice.invoice_items.map(item => {
              // 提取纯项目编号（去掉百分比部分）
              return item.project_code.split('-')[0].trim();
            });
            // 去重
            projectCodes = Array.from(new Set(projectCodes));
            // 主项目编号设为第一个
            projectCode = projectCodes[0];
            console.log(`[收款匹配] 发票包含多个项目编号:`, projectCodes);
          } else if (invoice.project_code) {
            // 如果没有invoice_items，使用主项目编号
            projectCode = invoice.project_code.split('-')[0].trim();
            projectCodes = [projectCode];
          }
          
          console.log(`[收款匹配] ✅ 已匹配发票: ${invoiceNo}, 匹配金额: ${matchAmount}, 状态: ${matchStatus}, 剩余金额: ${data.payment_amount - totalMatched}`);
        } else {
          console.warn(`[收款匹配] ⚠️ 未找到发票 ID: ${data.invoice_id}`);
        }
      } catch (error) {
        console.error("[收款匹配] 匹配指定发票失败:", error);
      }
    } else if (data.project_code) {
      try {
        // 提取纯项目编号（去掉百分比部分）
        const cleanProjectCode = data.project_code.split('-')[0].trim();
        
        // 查找该项目的发票（不限制状态，因为可能已经有部分收款的发票）
        const invoices = await invoicesApi.getInvoices({ 
          project_code: cleanProjectCode, 
          page_size: 100 
        });
        
        console.log(`[收款匹配] 项目编号: ${cleanProjectCode}, 找到发票数量: ${invoices.invoices.length}`);
        
        let remainingAmount = data.payment_amount;
        
        // 按发票金额匹配（只匹配未收款或部分收款的发票）
        const unmatchedInvoices = invoices.invoices.filter((inv) => {
          const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
          const isMatchable = unpaidAmount > 0 && (inv.status === "issued" || inv.status === "partial" || inv.status === "draft");
          if (isMatchable) {
            console.log(`[收款匹配] 找到可匹配发票: ${inv.invoice_no}, 未收款金额: ${unpaidAmount}, 状态: ${inv.status}`);
          }
          return isMatchable;
        });
        
        console.log(`[收款匹配] 可匹配发票数量: ${unmatchedInvoices.length}, 收款金额: ${data.payment_amount}`);
        
        for (const invoice of unmatchedInvoices) {
          if (remainingAmount <= 0) break;
          
          const unpaidAmount = invoice.revenue_amount - (invoice.payment_amount || 0);
          if (unpaidAmount > 0) {
            const matchAmount = Math.min(remainingAmount, unpaidAmount);
            matchedInvoices.push({
              invoice_id: invoice.id,
              invoice_no: invoice.invoice_no,
              matched_amount: matchAmount,
            });
            totalMatched += matchAmount;
            remainingAmount -= matchAmount;
            
            // 更新发票状态
            const newPaymentAmount = (invoice.payment_amount || 0) + matchAmount;
            const newStatus = newPaymentAmount >= invoice.revenue_amount ? 'paid' : 'partial';
            
            await invoicesApi.updateInvoice({
              id: invoice.id,
              payment_date: data.payment_date,
              payment_amount: newPaymentAmount,
              status: newStatus,
            });
            
            // 如果发票完全收款，检查并更新关联的开票申请状态
            if (newStatus === 'paid') {
              await updateInvoiceRequestPaymentStatus(invoice.id);
            }
            
            // 记录第一个匹配的发票，并获取客户信息和项目编号
            if (!invoiceId) {
              invoiceId = invoice.id;
              invoiceNo = invoice.invoice_no;
              // 从第一个匹配的发票获取客户信息和项目编号
              if (!customerName) customerName = invoice.customer_name;
              if (!salesManager) salesManager = invoice.sales_manager;
              if (!projectCode && invoice.project_code) {
                // 提取纯项目编号（去掉百分比部分）
                projectCode = invoice.project_code.split('-')[0].trim();
              }
              // 设置项目编号列表
              if (invoice.invoice_items && invoice.invoice_items.length > 0) {
                projectCodes = invoice.invoice_items.map(item => {
                  return item.project_code.split('-')[0].trim();
                });
                projectCodes = Array.from(new Set(projectCodes));
              } else if (invoice.project_code && !projectCodes) {
                projectCodes = [invoice.project_code.split('-')[0].trim()];
              }
            }
          }
        }
        
        if (totalMatched > 0) {
          matchStatus = totalMatched >= data.payment_amount ? 'completed' : 'partial';
        }
      } catch (error) {
        console.warn("自动匹配发票失败:", error);
        // 继续创建收款记录，但不匹配发票
      }
    } else if (!data.project_code && data.payment_amount) {
      // 如果没有项目编号，尝试通过金额匹配（模糊匹配）
      try {
        console.log(`[收款匹配] 未提供项目编号，尝试通过金额匹配: ${data.payment_amount}`);
        
        // 查找所有未收款或部分收款的发票
        const allInvoices = await invoicesApi.getInvoices({ page_size: 200 });
        console.log(`[收款匹配] 找到所有发票数量: ${allInvoices.invoices.length}`);
        
        // 筛选出可匹配的发票（未收款或部分收款）
        const matchableInvoices = allInvoices.invoices.filter(inv => {
          const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
          const isMatchable = unpaidAmount > 0 && (inv.status === "issued" || inv.status === "partial" || inv.status === "draft");
          if (isMatchable) {
            console.log(`[收款匹配] 可匹配发票: ${inv.invoice_no}, 未收款金额: ${unpaidAmount}, 状态: ${inv.status}`);
          }
          return isMatchable;
        });
        
        console.log(`[收款匹配] 可匹配发票数量: ${matchableInvoices.length}`);
        
        // 按金额匹配（优先匹配金额完全相等的发票）
        const exactMatch = matchableInvoices.find(inv => {
          const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
          return Math.abs(unpaidAmount - data.payment_amount) < 0.01; // 金额完全相等
        });
        
        if (exactMatch) {
          console.log(`[收款匹配] ✅ 通过金额找到完全匹配发票: ${exactMatch.invoice_no}, 金额: ${exactMatch.revenue_amount}`);
          const matchAmount = data.payment_amount;
          matchedInvoices.push({
            invoice_id: exactMatch.id,
            invoice_no: exactMatch.invoice_no,
            matched_amount: matchAmount,
          });
          totalMatched = matchAmount;
          matchStatus = 'completed';
          invoiceId = exactMatch.id;
          invoiceNo = exactMatch.invoice_no;
          // 从匹配的发票获取客户信息和项目编号
          if (!customerName) customerName = exactMatch.customer_name;
          if (!salesManager) salesManager = exactMatch.sales_manager;
          if (!projectCode && exactMatch.project_code) {
            // 提取纯项目编号（去掉百分比部分）
            projectCode = exactMatch.project_code.split('-')[0].trim();
          }
          // 设置项目编号列表
          if (exactMatch.invoice_items && exactMatch.invoice_items.length > 0) {
            projectCodes = exactMatch.invoice_items.map(item => {
              return item.project_code.split('-')[0].trim();
            });
            projectCodes = Array.from(new Set(projectCodes));
          } else if (exactMatch.project_code && !projectCodes) {
            projectCodes = [exactMatch.project_code.split('-')[0].trim()];
          }
          
          // 更新发票状态
          const newPaymentAmount = (exactMatch.payment_amount || 0) + matchAmount;
          await invoicesApi.updateInvoice({
            id: exactMatch.id,
            payment_date: data.payment_date,
            payment_amount: newPaymentAmount,
            status: 'paid',
          });
          
          // 发票完全收款，检查并更新关联的开票申请状态
          await updateInvoiceRequestPaymentStatus(exactMatch.id);
        } else {
          // 如果没有完全匹配，尝试部分匹配（按发票创建时间顺序）
          console.log(`[收款匹配] 未找到完全匹配，尝试部分匹配`);
          let remainingAmount = data.payment_amount;
          for (const invoice of matchableInvoices) {
            if (remainingAmount <= 0) break;
            
            const unpaidAmount = invoice.revenue_amount - (invoice.payment_amount || 0);
            if (unpaidAmount > 0) {
              const matchAmount = Math.min(remainingAmount, unpaidAmount);
              console.log(`[收款匹配] 部分匹配发票: ${invoice.invoice_no}, 匹配金额: ${matchAmount}`);
              matchedInvoices.push({
                invoice_id: invoice.id,
                invoice_no: invoice.invoice_no,
                matched_amount: matchAmount,
              });
              totalMatched += matchAmount;
              remainingAmount -= matchAmount;
              
              if (!invoiceId) {
                invoiceId = invoice.id;
                invoiceNo = invoice.invoice_no;
                // 从第一个匹配的发票获取客户信息和项目编号
                if (!customerName) customerName = invoice.customer_name;
                if (!salesManager) salesManager = invoice.sales_manager;
                if (!projectCode && invoice.project_code) {
                  // 提取纯项目编号（去掉百分比部分）
                  projectCode = invoice.project_code.split('-')[0].trim();
                }
                // 设置项目编号列表
                if (invoice.invoice_items && invoice.invoice_items.length > 0) {
                  projectCodes = invoice.invoice_items.map(item => {
                    return item.project_code.split('-')[0].trim();
                  });
                  projectCodes = Array.from(new Set(projectCodes));
                } else if (invoice.project_code && !projectCodes) {
                  projectCodes = [invoice.project_code.split('-')[0].trim()];
                }
              }
              
              // 更新发票状态
              const newPaymentAmount = (invoice.payment_amount || 0) + matchAmount;
              const newStatus = newPaymentAmount >= invoice.revenue_amount ? 'paid' : 'partial';
              
              await invoicesApi.updateInvoice({
                id: invoice.id,
                payment_date: data.payment_date,
                payment_amount: newPaymentAmount,
                status: newStatus,
              });
              
              // 如果发票完全收款，检查并更新关联的开票申请状态
              if (newStatus === 'paid') {
                await updateInvoiceRequestPaymentStatus(invoice.id);
              }
            }
          }
          
          if (totalMatched > 0) {
            matchStatus = totalMatched >= data.payment_amount ? 'completed' : 'partial';
            console.log(`[收款匹配] ✅ 部分匹配完成，匹配金额: ${totalMatched}, 状态: ${matchStatus}`);
          } else {
            console.log(`[收款匹配] ⚠️ 未找到任何匹配的发票`);
          }
        }
      } catch (error) {
        console.error("通过金额匹配发票失败:", error);
      }
    }
    
    // 确保发票号被正确设置（如果通过invoice_id匹配，应该已经有发票号）
    if (!invoiceNo && invoiceId) {
      // 如果还没有发票号，尝试从匹配的发票中获取
      if (matchedInvoices.length > 0) {
        invoiceNo = matchedInvoices[0].invoice_no;
        console.log(`[创建收款] 从匹配发票中获取发票号: ${invoiceNo}`);
      } else if (invoiceId) {
        // 如果还是没有，尝试重新获取发票信息
        try {
          const invoice = await invoicesApi.getInvoiceById(invoiceId);
          if (invoice) {
            invoiceNo = invoice.invoice_no;
            console.log(`[创建收款] 重新获取发票号: ${invoiceNo}`);
          }
        } catch (error) {
          console.warn(`[创建收款] 无法获取发票号:`, error);
        }
      }
    }
    
    // 计算剩余金额：收款金额 - 已匹配金额
    const remainingAmount = data.payment_amount - totalMatched;
    
    // 确保匹配状态正确：如果完全匹配，状态应该是 completed，剩余金额为 0
    let finalMatchStatus = matchStatus;
    let finalRemainingAmount = remainingAmount;
    
    if (totalMatched >= data.payment_amount) {
      finalMatchStatus = 'completed';
      finalRemainingAmount = 0; // 完全匹配时，剩余金额应该为 0
    } else if (totalMatched > 0) {
      finalMatchStatus = 'partial';
      finalRemainingAmount = remainingAmount;
    } else {
      finalMatchStatus = 'pending';
      finalRemainingAmount = data.payment_amount;
    }
    
    const newPayment: Payment = {
      id: 0, // 会在addPaymentToStore中自动生成
      payment_date: data.payment_date,
      payment_amount: data.payment_amount,
      payment_method: data.payment_method,
      bank_account: data.bank_account,
      payment_reference: data.payment_reference,
      remark: data.remark,
      project_code: projectCode || data.project_code, // 优先使用从发票获取的项目编号（主项目编号，兼容字段）
      project_codes: projectCodes || data.project_codes || (projectCode ? [projectCode] : undefined), // 项目编号列表（支持多个项目）
      invoice_id: invoiceId || data.invoice_id,
      invoice_no: invoiceNo || undefined, // 确保发票号被设置
      match_status: finalMatchStatus,
      matched_amount: totalMatched,
      remaining_amount: finalRemainingAmount,
      auto_matched_invoices: matchedInvoices.length > 0 ? matchedInvoices : undefined,
      customer_name: customerName, // 客户名称（从发票同步）
      sales_manager: salesManager, // 客户经理（从发票同步）
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    console.log('[创建收款] 最终收款记录:', {
      invoice_id: newPayment.invoice_id,
      invoice_no: newPayment.invoice_no,
      match_status: newPayment.match_status,
      matched_amount: newPayment.matched_amount,
      remaining_amount: newPayment.remaining_amount,
      payment_amount: newPayment.payment_amount,
      matched_invoices_count: matchedInvoices.length,
      calculation: `收款金额(${data.payment_amount}) - 已匹配金额(${totalMatched}) = 剩余金额(${finalRemainingAmount})`,
      status_logic: `totalMatched(${totalMatched}) >= payment_amount(${data.payment_amount}) ? completed : partial`,
    });
    
    const savedPayment = addPaymentToStore(newPayment);
    
    // 发送收款通知（如果匹配成功且有发票）
    if (matchedInvoices.length > 0 && invoiceId) {
      try {
        // 重新获取匹配的发票信息（确保获取到最新的 sales_manager 等字段）
        // 直接从存储中读取，避免 React Query 缓存问题
        const { getInvoicesStore } = await import("../api/invoicesStorage");
        const allInvoices = getInvoicesStore();
        let matchedInvoice = allInvoices.find(inv => inv.id === invoiceId);
        
        if (!matchedInvoice) {
          // 如果直接从存储中找不到，再尝试通过 API 获取
          matchedInvoice = await invoicesApi.getInvoiceById(invoiceId);
        }
        
        if (matchedInvoice) {
          const { sendPaymentReceivedNotification } = await import("../services/notificationService");
          // 优先使用发票中的 sales_manager（可能是最新更新的），如果没有则使用匹配时获取的
          const recipient = matchedInvoice.sales_manager || salesManager;
          console.log('[创建收款] 准备发送收款通知:', {
            invoice_id: matchedInvoice.id,
            sales_manager_from_invoice: matchedInvoice.sales_manager,
            sales_manager_from_match: salesManager,
            final_recipient: recipient,
          });
          await sendPaymentReceivedNotification(savedPayment, matchedInvoice, {
            recipient: recipient,
            channels: ['feishu', 'system'],
          });
          console.log('[创建收款] ✅ 收款通知已发送，接收人:', recipient);
        }
      } catch (error) {
        console.error('[创建收款] ❌ 收款通知发送失败:', error);
        // 不影响收款记录，只记录错误
      }
    }
    
    return savedPayment;
  },
  
  updatePayment: async (data: UpdatePaymentRequest): Promise<Payment> => {
    const { id, ...updates } = data;
    const updated = updatePaymentInStore(id, updates);
    if (!updated) {
      throw new Error('Payment not found');
    }
    return updated;
  },
  
  deletePayment: async (id: number): Promise<void> => {
    const success = deletePaymentFromStore(id);
    if (!success) {
      throw new Error('Payment not found');
    }
  },
  
  // 自动匹配发票（用于手动触发匹配）
  autoMatchInvoice: async (paymentId: number, projectCode?: string): Promise<{
    matched_invoices: Array<{ invoice_id: number; invoice_no: string; matched_amount: number }>;
    total_matched: number;
  }> => {
    const payment = getMockPayments().find(p => p.id === paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }
    
    if (!projectCode && !payment.project_code) {
      return {
        matched_invoices: [],
        total_matched: 0,
      };
    }
    
    const code = projectCode || payment.project_code || '';
    const cleanProjectCode = code.split('-')[0].trim();
    
    try {
      const invoices = await invoicesApi.getInvoices({ 
        project_code: cleanProjectCode, 
        page_size: 100 
      });
      
      const unmatchedInvoices = invoices.invoices.filter(
        (inv) => inv.status === "issued" || inv.status === "partial"
      );
      
      let remainingAmount = payment.remaining_amount || payment.payment_amount;
      const matchedInvoices: Array<{ invoice_id: number; invoice_no: string; matched_amount: number }> = [];
      let totalMatched = 0;
      
      for (const invoice of unmatchedInvoices) {
        if (remainingAmount <= 0) break;
        
        const unpaidAmount = invoice.revenue_amount - (invoice.payment_amount || 0);
        if (unpaidAmount > 0) {
          const matchAmount = Math.min(remainingAmount, unpaidAmount);
          matchedInvoices.push({
            invoice_id: invoice.id,
            invoice_no: invoice.invoice_no,
            matched_amount: matchAmount,
          });
          totalMatched += matchAmount;
          remainingAmount -= matchAmount;
          
          // 更新发票状态
          const newPaymentAmount = (invoice.payment_amount || 0) + matchAmount;
          const newStatus = newPaymentAmount >= invoice.revenue_amount ? 'paid' : 'partial';
          
          await invoicesApi.updateInvoice({
            id: invoice.id,
            payment_date: payment.payment_date,
            payment_amount: newPaymentAmount,
            status: newStatus,
          });
          
          // 如果发票完全收款，检查并更新关联的开票申请状态
          if (newStatus === 'paid') {
            await updateInvoiceRequestPaymentStatus(invoice.id);
          }
        }
      }
      
      // 更新收款记录
      if (matchedInvoices.length > 0) {
        const newMatchedAmount = (payment.matched_amount || 0) + totalMatched;
        const newRemainingAmount = payment.payment_amount - newMatchedAmount;
        const newMatchStatus = newRemainingAmount <= 0.01 ? 'completed' : (newMatchedAmount > 0 ? 'partial' : 'pending');
        
        console.log('[自动匹配] 更新收款记录:', {
          payment_id: paymentId,
          old_matched: payment.matched_amount || 0,
          new_matched: newMatchedAmount,
          old_remaining: payment.remaining_amount || payment.payment_amount,
          new_remaining: newRemainingAmount,
          old_status: payment.match_status,
          new_status: newMatchStatus,
        });
        
        // 获取第一个匹配发票的详细信息（用于同步客户信息）
        let customerName = payment.customer_name;
        let salesManager = payment.sales_manager;
        let invoiceId = matchedInvoices[0]?.invoice_id || payment.invoice_id;
        let invoiceNo = matchedInvoices[0]?.invoice_no || payment.invoice_no;
        let firstInvoice: any = null; // 保存第一个发票，用于发送通知
        
        if (matchedInvoices.length > 0) {
          try {
            firstInvoice = await invoicesApi.getInvoiceById(matchedInvoices[0].invoice_id);
            if (firstInvoice) {
              customerName = firstInvoice.customer_name || customerName;
              salesManager = firstInvoice.sales_manager || salesManager;
              invoiceId = firstInvoice.id;
              invoiceNo = firstInvoice.invoice_no;
            }
          } catch (error) {
            console.warn('[自动匹配] 获取发票信息失败:', error);
          }
        }
        
        const updatedPayment = updatePaymentInStore(paymentId, {
          matched_amount: newMatchedAmount,
          remaining_amount: Math.max(0, newRemainingAmount), // 确保不为负数
          match_status: newMatchStatus,
          invoice_id: invoiceId,
          invoice_no: invoiceNo,
          auto_matched_invoices: matchedInvoices,
          customer_name: customerName,
          sales_manager: salesManager,
        });
        
        console.log('[自动匹配] ✅ 收款记录已更新');
        
        // 发送收款通知（如果匹配成功且有发票）
        if (updatedPayment && matchedInvoices.length > 0 && firstInvoice) {
          try {
            const { sendPaymentReceivedNotification } = await import("../services/notificationService");
            await sendPaymentReceivedNotification(updatedPayment, firstInvoice, {
              recipient: salesManager || firstInvoice.sales_manager,
              channels: ['feishu', 'system'],
            });
            console.log('[自动匹配] ✅ 收款通知已发送');
          } catch (error) {
            console.error('[自动匹配] ❌ 收款通知发送失败:', error);
            // 不影响匹配流程，只记录错误
          }
        }
      } else {
        console.log('[自动匹配] ⚠️ 未找到匹配的发票');
      }
      
      return {
        matched_invoices: matchedInvoices,
        total_matched: totalMatched,
      };
    } catch (error) {
      console.error("自动匹配发票失败:", error);
      return {
        matched_invoices: [],
        total_matched: 0,
      };
    }
  },
};

// ============= API 实现 =============

export const paymentsApi = {
  getPayments: (params?: {
    page?: number;
    page_size?: number;
    project_code?: string;
    customer_name?: string;
    match_status?: PaymentStatus;
    start_date?: string;
    end_date?: string;
  }) =>
    callWithMock(
      "finance.payments.list",
      async () => {
        const response = await apiClient.get<BackendPaymentListPayload>("/finance/payments/list", {
          params: params as Record<string, unknown>,
        });
        const inner = normalizeFinanceListPayload(response);
        const pageSize = inner.page_size || 20;
        const totalPages = Math.max(1, Math.ceil((inner.total || 0) / pageSize));
        const payments: Payment[] = (inner.items || []).map(mapBackendPaymentRow);
        return {
          payments,
          total_records: inner.total,
          total_pages: totalPages,
          current_page: inner.page,
        };
      },
      () => mockPaymentsApi.getPayments(params)
    ),
  
  getPaymentById: (id: number) =>
    callWithMock(
      "finance.payments.getById",
      async () => {
        const response = await apiClient.get<BackendPaymentRow>(`/finance/payments/${id}`);
        const row = normalizeFinanceDetailPayload(response);
        if (!row) {
          throw new Error("回款不存在");
        }
        return mapBackendPaymentRow(row);
      },
      () => mockPaymentsApi.getPaymentById(id)
    ),
  
  createPayment: (data: CreatePaymentRequest) =>
    callWithMock(
      "finance.payments.create",
      async () => {
        const response = await apiClient.post<BackendPaymentRow>("/finance/payments/create", data);
        const row = normalizeFinanceDetailPayload(response);
        if (!row) {
          throw new Error("创建回款失败");
        }
        return mapBackendPaymentRow(row);
      },
      () => mockPaymentsApi.createPayment(data)
    ),
  
  updatePayment: (data: UpdatePaymentRequest) =>
    callWithMock(
      "finance.payments.update",
      async () => {
        const { id, ...updateData } = data;
        const response = await apiClient.put<BackendPaymentRow>(`/finance/payments/${id}`, updateData);
        const row = normalizeFinanceDetailPayload(response);
        if (!row) {
          throw new Error("更新回款失败");
        }
        return mapBackendPaymentRow(row);
      },
      () => mockPaymentsApi.updatePayment(data)
    ),
  
  deletePayment: (id: number) =>
    callWithMock(
      "finance.payments.delete",
      async () => {
        await apiClient.delete(`/finance/payments/${id}`);
      },
      () => mockPaymentsApi.deletePayment(id)
    ),
  
  autoMatchInvoice: (paymentId: number, projectCode?: string) =>
    callWithMock(
      "finance.payments.autoMatch",
      async () => {
        const response = await apiClient.post<{
          matched_invoices: Array<{ invoice_id: number; invoice_no: string; matched_amount: number }>;
          total_matched: number;
        }>(`/finance/payments/${paymentId}/auto-match`, { project_code: projectCode });
        return response.data;
      },
      () => mockPaymentsApi.autoMatchInvoice(paymentId, projectCode)
    ),
};
