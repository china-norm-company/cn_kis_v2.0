import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";
import type { Lead } from "@/schemas/lead";
import { LEADS as LEADS_SEED } from "@/features/sales/api/salesMocks";

export const MOCK_CRM_LEADS_STORAGE_KEY = "mock_crm_leads_store_v1";

let mockCrmLeadsStore: Lead[] | null = null;

function initMockCrmLeadsStore() {
  if (mockCrmLeadsStore) return;
  if (canUseLocalStorage()) {
    const parsed = safeParseJson<Lead[]>(window.localStorage.getItem(MOCK_CRM_LEADS_STORAGE_KEY));
    if (Array.isArray(parsed)) {
      mockCrmLeadsStore = parsed;
      return;
    }
  }
  mockCrmLeadsStore = [...LEADS_SEED];
}

function persistMockCrmLeadsStore() {
  if (!canUseLocalStorage() || !mockCrmLeadsStore) return;
  window.localStorage.setItem(MOCK_CRM_LEADS_STORAGE_KEY, JSON.stringify(mockCrmLeadsStore));
}

export function listMockCrmLeads(): Lead[] {
  initMockCrmLeadsStore();
  return [...(mockCrmLeadsStore || [])];
}

export function getMockCrmLeadById(id: number): Lead | undefined {
  initMockCrmLeadsStore();
  return (mockCrmLeadsStore || []).find((l) => l.id === id);
}

export function addMockCrmLead(lead: Lead) {
  initMockCrmLeadsStore();
  mockCrmLeadsStore = [lead, ...(mockCrmLeadsStore || [])];
  persistMockCrmLeadsStore();
}

export function updateMockCrmLead(id: number, patch: Partial<Lead>): Lead | undefined {
  initMockCrmLeadsStore();
  const list = mockCrmLeadsStore || [];
  const idx = list.findIndex((l) => l.id === id);
  if (idx < 0) return undefined;
  const next = [...list];
  next[idx] = { ...next[idx], ...patch, updated_at: new Date().toISOString() };
  mockCrmLeadsStore = next;
  persistMockCrmLeadsStore();
  return next[idx];
}

export function deleteMockCrmLead(id: number): boolean {
  initMockCrmLeadsStore();
  const before = mockCrmLeadsStore || [];
  const next = before.filter((l) => l.id !== id);
  if (next.length === before.length) return false;
  mockCrmLeadsStore = next;
  persistMockCrmLeadsStore();
  return true;
}

