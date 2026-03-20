import { salesMockApi } from "@/features/sales/api/salesMocks";
import { ordersMockApi } from "@/features/sales/api/mocks/orders";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const salesMockHandlers: MockHandlerConfig<any, any>[] = [
  { key: "sales.opportunities.list", handler: () => salesMockApi.listOpportunities() },
  { key: "sales.opportunities.getById", handler: (id?: string) => salesMockApi.getOpportunity(String(id ?? "")) },
  { key: "sales.opportunities.create", handler: (payload) => salesMockApi.createOpportunity(payload as any) },
  {
    key: "sales.opportunities.update",
    handler: (params?: { id: string; patch: any }) =>
      salesMockApi.updateOpportunity(params?.id || "", (params?.patch || {}) as any),
  },
  { key: "sales.opportunities.delete", handler: (id?: string) => salesMockApi.deleteOpportunity(String(id ?? "")) },
  { key: "sales.leads.list", handler: () => salesMockApi.listLeads() },
  { key: "sales.leads.getById", handler: (id?: number) => salesMockApi.getLead(Number(id)) },
  { key: "sales.leads.create", handler: (payload) => salesMockApi.createLead(payload as any) },
  {
    key: "sales.leads.update",
    handler: (params?: { id: number; patch: any }) =>
      salesMockApi.updateLead(Number(params?.id ?? 0), (params?.patch || {}) as any),
  },
  { key: "sales.leads.delete", handler: (id?: number) => salesMockApi.deleteLead(Number(id)) },
  { key: "sales.orders.list", handler: () => ordersMockApi.list() },
  { key: "sales.orders.create", handler: (payload) => ordersMockApi.create(payload as any) },
  {
    key: "sales.orders.update",
    handler: (params?: { id: number; patch: any }) => ordersMockApi.update(Number(params?.id ?? 0), (params?.patch || {}) as any),
  },
];

let salesMocksRegistered = false;
export const registerSalesMocks = (): void => {
  if (salesMocksRegistered) return;
  registerMockHandlers(salesMockHandlers);
  salesMocksRegistered = true;
};

registerSalesMocks();

export { salesMockApi };
