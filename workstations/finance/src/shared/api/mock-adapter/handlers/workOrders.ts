import type { WorkOrder, WorkOrderListFilters, WorkOrderStatus } from "@/entities/work-order/domain";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import {
  ensureWorkOrdersStore,
  updateWorkOrdersStore,
} from "@/shared/api/mock-adapter/fixtures/work-orders/workOrdersStorage";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

const matchesFilters = (order: WorkOrder, filters?: WorkOrderListFilters): boolean => {
  if (!filters) return true;
  if (filters.assignedToId && order.assignedToId !== filters.assignedToId) return false;
  if (filters.projectId && order.projectId !== filters.projectId) return false;
  if (filters.status && order.status !== filters.status) return false;
  if (filters.scheduledDate && order.scheduledDate !== filters.scheduledDate) return false;
  return true;
};

export const workOrdersMockApi = {
  list: async (filters?: WorkOrderListFilters): Promise<WorkOrder[]> => {
    const store = ensureWorkOrdersStore();
    return store.workOrders.filter((o) => matchesFilters(o, filters));
  },

  getById: async (id: string): Promise<WorkOrder | null> => {
    const store = ensureWorkOrdersStore();
    return store.workOrders.find((o) => o.id === id) ?? null;
  },

  upsertMany: async (orders: WorkOrder[]): Promise<{ upserted: number }> => {
    if (orders.length === 0) return { upserted: 0 };

    const now = new Date().toISOString();

    const next = updateWorkOrdersStore((store) => {
      const byId = new Map(store.workOrders.map((o) => [o.id, o]));
      orders.forEach((incoming) => {
        const existing = byId.get(incoming.id);
        if (!existing) {
          byId.set(incoming.id, {
            ...incoming,
            subjectCount: incoming.subjectCount ?? 0,
            completedCount: incoming.completedCount ?? 0,
          });
          return;
        }
        const nextStatus =
          existing.status !== "pending" && incoming.status === "pending" ? existing.status : incoming.status;
        const nextCompletedCount =
          (incoming.completedCount ?? 0) === 0 && (existing.completedCount ?? 0) > 0
            ? existing.completedCount
            : incoming.completedCount ?? existing.completedCount;
        byId.set(incoming.id, {
          ...existing,
          ...incoming,
          status: nextStatus,
          completedCount: nextCompletedCount,
          subjectCount: incoming.subjectCount ?? existing.subjectCount,
          // preserve user-generated fields if incoming doesn't include them
          qualityAuditRemark: incoming.qualityAuditRemark ?? existing.qualityAuditRemark,
          dataValues: incoming.dataValues ?? existing.dataValues,
          updatedAt: now,
        });
      });
      return { ...store, workOrders: Array.from(byId.values()) };
    });

    return { upserted: next.workOrders.length };
  },

  updateStatus: async (
    id: string,
    status: WorkOrderStatus,
    patch?: Partial<WorkOrder>
  ): Promise<WorkOrder | null> => {
    let updated: WorkOrder | null = null;
    const now = new Date().toISOString();

    updateWorkOrdersStore((store) => {
      const workOrders = store.workOrders.map((o) => {
        if (o.id !== id) return o;
        updated = { ...o, ...patch, status, updatedAt: now };
        return updated;
      });
      return { ...store, workOrders };
    });

    return updated;
  },
};

export const workOrdersMockHandlers: Array<MockHandlerConfig<any, any>> = [
  { key: "workOrders.list", handler: (filters?: WorkOrderListFilters) => workOrdersMockApi.list(filters) },
  { key: "workOrders.getById", handler: (id: string) => workOrdersMockApi.getById(id) },
  { key: "workOrders.upsertMany", handler: (orders: WorkOrder[]) => workOrdersMockApi.upsertMany(orders) },
  {
    key: "workOrders.updateStatus",
    handler: (input: { id: string; status: WorkOrderStatus; patch?: Partial<WorkOrder> }) =>
      workOrdersMockApi.updateStatus(input.id, input.status, input.patch),
  },
];

let workOrderMocksRegistered = false;
export const registerWorkOrderMocks = (): void => {
  if (workOrderMocksRegistered) return;
  registerMockHandlers(workOrdersMockHandlers);
  workOrderMocksRegistered = true;
};

registerWorkOrderMocks();
