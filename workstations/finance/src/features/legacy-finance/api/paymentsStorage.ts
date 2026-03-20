/**
 * 收款数据持久化存储
 */

import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";
import type { Payment } from "@/entities/finance/payment-domain";

const PAYMENTS_STORAGE_KEY = "mock_finance_payments_store_v1";

const SEED_PAYMENTS: Payment[] = [];

let paymentsStore: Payment[] | null = null;

function initPaymentsStore() {
  if (paymentsStore) return;
  
  if (canUseLocalStorage()) {
    const stored = safeParseJson<Payment[]>(
      window.localStorage.getItem(PAYMENTS_STORAGE_KEY)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      paymentsStore = stored;
      return;
    }
  }
  
  paymentsStore = [...SEED_PAYMENTS];
  persistPaymentsStore();
}

function persistPaymentsStore() {
  if (!canUseLocalStorage() || !paymentsStore) return;
  try {
    window.localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(paymentsStore));
  } catch (error) {
    console.error("保存收款数据到localStorage失败:", error);
  }
}

export function getPaymentsStore(): Payment[] {
  initPaymentsStore();
  return [...(paymentsStore || [])];
}

export function addPaymentToStore(payment: Payment) {
  initPaymentsStore();
  if (!paymentsStore) paymentsStore = [];
  
  const maxId = paymentsStore.length > 0 
    ? Math.max(...paymentsStore.map(p => p.id))
    : 0;
  payment.id = maxId + 1;
  
  paymentsStore = [payment, ...paymentsStore];
  persistPaymentsStore();
  return payment;
}

export function updatePaymentInStore(id: number, updates: Partial<Payment>) {
  initPaymentsStore();
  if (!paymentsStore) return null;
  
  const index = paymentsStore.findIndex(p => p.id === id);
  if (index === -1) return null;
  
  paymentsStore[index] = {
    ...paymentsStore[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  persistPaymentsStore();
  return paymentsStore[index];
}

export function deletePaymentFromStore(id: number) {
  initPaymentsStore();
  if (!paymentsStore) return false;
  
  const index = paymentsStore.findIndex(p => p.id === id);
  if (index === -1) return false;
  
  paymentsStore.splice(index, 1);
  persistPaymentsStore();
  return true;
}

initPaymentsStore();
