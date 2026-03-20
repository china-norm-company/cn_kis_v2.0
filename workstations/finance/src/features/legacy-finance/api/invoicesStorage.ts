/**
 * 发票数据持久化存储
 * 使用 localStorage 保存发票数据，刷新后不丢失
 */

import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";
import type { Invoice } from "@/entities/finance/domain";

const INVOICES_STORAGE_KEY = "mock_finance_invoices_store_v1";

// Seed数据（初始数据）
const SEED_INVOICES: Invoice[] = [
  {
    id: 1,
    invoice_no: '53733564',
    invoice_date: '2019-06-18',
    customer_name: '维真时代（上海）化妆品有限公司',
    invoice_content: '测试服务费',
    revenue_amount: 39412.0,
    project_code: 'C191914',
    invoice_percentage: 50,
    sales_manager: '马蓓丽',
    invoice_type: '专票',
    company_name: '复硕咨询',
    payment_date: '2021-01-15',
    payment_amount: 39412.0,
    invoice_year: '2019年',
    invoice_month: '6月',
    payment_year: '2021年',
    payment_month: '1月',
    status: 'paid',
    created_at: '2019-06-18T00:00:00Z',
    updated_at: '2021-01-15T00:00:00Z',
  },
  {
    id: 2,
    invoice_no: '53733565',
    invoice_date: '2019-06-18',
    customer_name: '维真时代（上海）化妆品有限公司',
    invoice_content: '测试服务费',
    revenue_amount: 24480.0,
    project_code: 'C191915',
    invoice_percentage: 50,
    sales_manager: '马蓓丽',
    invoice_type: '专票',
    company_name: '复硕咨询',
    payment_date: '2021-06-30',
    payment_amount: 24480.0,
    invoice_year: '2019年',
    invoice_month: '6月',
    payment_year: '2021年',
    payment_month: '6月',
    status: 'paid',
    created_at: '2019-06-18T00:00:00Z',
    updated_at: '2021-06-30T00:00:00Z',
  },
];

// 内存缓存
let invoicesStore: Invoice[] | null = null;

// 初始化数据存储
function initInvoicesStore() {
  if (invoicesStore) return;
  
  if (canUseLocalStorage()) {
    const stored = safeParseJson<Invoice[]>(
      window.localStorage.getItem(INVOICES_STORAGE_KEY)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      invoicesStore = stored;
      return;
    }
  }
  
  // localStorage为空，使用Seed数据初始化
  invoicesStore = [...SEED_INVOICES];
  persistInvoicesStore();
}

// 持久化到localStorage
function persistInvoicesStore() {
  if (!canUseLocalStorage() || !invoicesStore) return;
  try {
    window.localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoicesStore));
  } catch (error) {
    console.error("保存发票数据到localStorage失败:", error);
  }
}

// 公共API
export function getInvoicesStore(): Invoice[] {
  initInvoicesStore();
  return [...(invoicesStore || [])];
}

export function addInvoiceToStore(invoice: Invoice) {
  initInvoicesStore();
  if (!invoicesStore) invoicesStore = [];
  
  // 确保ID唯一
  const maxId = invoicesStore.length > 0 
    ? Math.max(...invoicesStore.map(inv => inv.id))
    : 0;
  invoice.id = maxId + 1;
  
  invoicesStore = [invoice, ...invoicesStore];
  persistInvoicesStore();
  return invoice;
}

export function updateInvoiceInStore(id: number, updates: Partial<Invoice>) {
  initInvoicesStore();
  if (!invoicesStore) return null;
  
  const index = invoicesStore.findIndex(inv => inv.id === id);
  if (index === -1) {
    console.warn('[发票存储] 未找到发票 ID:', id);
    return null;
  }
  
  console.log('[发票存储] 更新发票:', {
    invoice_id: id,
    updates: updates,
    updates_keys: Object.keys(updates),
    sales_manager_in_updates: 'sales_manager' in updates ? updates.sales_manager : 'NOT_INCLUDED',
    before: {
      sales_manager: invoicesStore[index].sales_manager,
      electronic_invoice_file: invoicesStore[index].electronic_invoice_file,
      electronic_invoice_file_name: invoicesStore[index].electronic_invoice_file_name,
    },
  });
  
  invoicesStore[index] = {
    ...invoicesStore[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  
  console.log('[发票存储] 更新后:', {
    invoice_id: id,
    sales_manager: invoicesStore[index].sales_manager,
    electronic_invoice_file: invoicesStore[index].electronic_invoice_file,
    electronic_invoice_file_name: invoicesStore[index].electronic_invoice_file_name,
  });
  
  persistInvoicesStore();
  return invoicesStore[index];
}

export function deleteInvoiceFromStore(id: number) {
  initInvoicesStore();
  if (!invoicesStore) return false;
  
  const index = invoicesStore.findIndex(inv => inv.id === id);
  if (index === -1) return false;
  
  invoicesStore.splice(index, 1);
  persistInvoicesStore();
  return true;
}

// 初始化
initInvoicesStore();
