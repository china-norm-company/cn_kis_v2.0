import type { Opportunity } from "@/entities/sales/domain";
import {
  addMockOrder,
  createAndStoreMockOrder,
  createMockOrderFromOpportunity,
  listMockOrders,
  nextOrderCode,
  type MockOrder,
} from "@/shared/api/mock-adapter/fixtures/workbench/orders/mocks/mockOrders";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const workbenchOrderMockHandlers: MockHandlerConfig<any, any>[] = [
  { key: "workbench.orders.list", handler: (): MockOrder[] => listMockOrders() },
  {
    key: "workbench.orders.createFromOpportunity",
    handler: (opportunity?: Opportunity) => {
      if (!opportunity) {
        throw new Error("Missing opportunity for workbench.orders.createFromOpportunity");
      }
      return createMockOrderFromOpportunity(opportunity);
    },
  },
  {
    key: "workbench.orders.create",
    handler: (draft: Omit<MockOrder, "id" | "created_at" | "updated_at">) => createAndStoreMockOrder(draft),
  },
  {
    key: "workbench.orders.nextId",
    handler: () => nextOrderCode(),
  },
  { key: "workbench.orders.add", handler: (order: MockOrder) => addMockOrder(order) },
];

let workbenchOrdersRegistered = false;
export const registerWorkbenchOrderMocks = (): void => {
  if (workbenchOrdersRegistered) return;
  registerMockHandlers(workbenchOrderMockHandlers);
  workbenchOrdersRegistered = true;
};

registerWorkbenchOrderMocks();
