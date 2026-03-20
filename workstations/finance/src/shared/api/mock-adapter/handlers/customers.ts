import { customersMockApi } from "@/features/customer/api/mockCustomers";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const customersMockHandlers: MockHandlerConfig<any, any>[] = [
  { key: "customers.list", handler: () => customersMockApi.listCustomers() },
  { key: "customers.getById", handler: (id?: string) => customersMockApi.getCustomer(String(id ?? "")) ?? null },
  { key: "customers.create", handler: (payload) => customersMockApi.createCustomer(payload as any) },
  {
    key: "customers.updateTags",
    handler: (params?: { clientId: string; tags: string[] }) =>
      customersMockApi.updateTags(params?.clientId || "", params?.tags || []),
  },
  {
    key: "customers.updateCompetitors",
    handler: (params?: { clientId: string; competitors: unknown[] }) =>
      customersMockApi.updateCompetitors(params?.clientId || "", (params?.competitors || []) as any[]),
  },
];

let customersMocksRegistered = false;
export const registerCustomerMocks = (): void => {
  if (customersMocksRegistered) return;
  registerMockHandlers(customersMockHandlers);
  customersMocksRegistered = true;
};

registerCustomerMocks();

export { customersMockApi };
