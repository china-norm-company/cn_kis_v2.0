/**
 * 开票申请数据持久化存储
 */

import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";
import type { InvoiceRequest } from "@/entities/finance/invoice-request-domain";

const INVOICE_REQUESTS_STORAGE_KEY = "mock_finance_invoice_requests_store_v1";

const SEED_INVOICE_REQUESTS: InvoiceRequest[] = [];

let invoiceRequestsStore: InvoiceRequest[] | null = null;

function initInvoiceRequestsStore() {
  if (invoiceRequestsStore) return;
  
  if (canUseLocalStorage()) {
    const stored = safeParseJson<InvoiceRequest[]>(
      window.localStorage.getItem(INVOICE_REQUESTS_STORAGE_KEY)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      invoiceRequestsStore = stored;
      return;
    }
  }
  
  invoiceRequestsStore = [...SEED_INVOICE_REQUESTS];
  persistInvoiceRequestsStore();
}

function persistInvoiceRequestsStore() {
  if (!canUseLocalStorage() || !invoiceRequestsStore) return;
  try {
    window.localStorage.setItem(INVOICE_REQUESTS_STORAGE_KEY, JSON.stringify(invoiceRequestsStore));
  } catch (error) {
    console.error("保存开票申请数据到localStorage失败:", error);
  }
}

/**
 * 获取开票申请列表。每次读取前先从 localStorage 同步，确保创建后列表能立即看到新数据。
 */
export function getInvoiceRequestsStore(): InvoiceRequest[] {
  initInvoiceRequestsStore();
  if (canUseLocalStorage()) {
    const raw = window.localStorage.getItem(INVOICE_REQUESTS_STORAGE_KEY);
    if (raw) {
      const parsed = safeParseJson<InvoiceRequest[]>(raw);
      if (Array.isArray(parsed)) {
        invoiceRequestsStore = parsed;
      }
    }
  }
  return [...(invoiceRequestsStore || [])];
}

export function addInvoiceRequestToStore(request: InvoiceRequest) {
  initInvoiceRequestsStore();
  if (!invoiceRequestsStore) invoiceRequestsStore = [];
  
  const maxId = invoiceRequestsStore.length > 0 
    ? Math.max(...invoiceRequestsStore.map(r => r.id))
    : 0;
  request.id = maxId + 1;
  
  // 自动计算总金额
  if (!request.total_amount && request.items) {
    request.total_amount = request.items.reduce((sum, item) => sum + item.amount, 0);
  }
  
  invoiceRequestsStore = [request, ...invoiceRequestsStore];
  persistInvoiceRequestsStore();
  return request;
}

export function updateInvoiceRequestInStore(id: number, updates: Partial<InvoiceRequest>) {
  initInvoiceRequestsStore();
  if (!invoiceRequestsStore) return null;
  
  const index = invoiceRequestsStore.findIndex(r => r.id === id);
  if (index === -1) return null;
  
  // 如果更新了items，重新计算总金额
  if (updates.items) {
    updates.total_amount = updates.items.reduce((sum, item) => sum + item.amount, 0);
  }
  
  invoiceRequestsStore[index] = {
    ...invoiceRequestsStore[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  persistInvoiceRequestsStore();
  return invoiceRequestsStore[index];
}

export function deleteInvoiceRequestFromStore(id: number) {
  initInvoiceRequestsStore();
  if (!invoiceRequestsStore) return false;
  
  const index = invoiceRequestsStore.findIndex(r => r.id === id);
  if (index === -1) return false;
  
  invoiceRequestsStore.splice(index, 1);
  persistInvoiceRequestsStore();
  return true;
}

initInvoiceRequestsStore();
