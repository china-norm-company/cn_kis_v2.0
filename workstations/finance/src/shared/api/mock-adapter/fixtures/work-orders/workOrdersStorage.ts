import type { WorkOrder } from "@/entities/work-order/domain";
import { createTechnicianWorkOrdersFromSchedule } from "@/entities/work-order/domain";
import {
  SCHEDULER_NEW_SEED_PROJECT_1003,
  SCHEDULER_NEW_SEED_VISIT_SCHEDULES_1003,
} from "@/shared/api/mock-adapter/fixtures/scheduler/schedulerNew";

interface WorkOrdersStoreV1 {
  version: 1;
  workOrders: WorkOrder[];
}

const STORAGE_KEY = "scheduler_new_work_orders_v1";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const applyDemoProgress = (workOrders: WorkOrder[]): WorkOrder[] => {
  if (workOrders.length === 0) return workOrders;

  return workOrders.map((order, idx) => {
    const subjectCount = order.subjectCount ?? 0;
    const mod = idx % 5;
    if (mod === 0) {
      const completedCount = Math.min(subjectCount, Math.max(1, Math.floor(subjectCount * 0.25)));
      return { ...order, status: 'in_progress', completedCount, actualStartTime: order.scheduledTime.split('-')[0] };
    }
    if (mod === 1) {
      return { ...order, status: 'pending', completedCount: 0 };
    }
    if (mod === 2) {
      return { ...order, status: 'completed', completedCount: subjectCount, actualEndTime: order.scheduledTime.split('-')[1] };
    }
    if (mod === 3) {
      return { ...order, status: 'quality_review', completedCount: subjectCount };
    }
    return { ...order, status: 'pending', completedCount: 0 };
  });
};

const createSeedStore = (): WorkOrdersStoreV1 => {
  const createdAt = SCHEDULER_NEW_SEED_PROJECT_1003.publishedAt;
  const seeded = createTechnicianWorkOrdersFromSchedule({
    projectId: SCHEDULER_NEW_SEED_PROJECT_1003.projectCode,
    projectName: SCHEDULER_NEW_SEED_PROJECT_1003.projectName,
    priority: SCHEDULER_NEW_SEED_PROJECT_1003.priority,
    scheduleId: SCHEDULER_NEW_SEED_PROJECT_1003.planId,
    visitSchedules: SCHEDULER_NEW_SEED_VISIT_SCHEDULES_1003,
    createdAt,
  });
  return {
    version: 1,
    workOrders: applyDemoProgress(seeded),
  };
};

export const ensureWorkOrdersStore = (): WorkOrdersStoreV1 => {
  if (!isBrowser()) return createSeedStore();

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    const seed = createSeedStore();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    const parsed = JSON.parse(existing) as WorkOrdersStoreV1;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.workOrders)) {
      return parsed;
    }
  } catch {
    // fallthrough to reset
  }

  const seed = createSeedStore();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
};

const writeWorkOrdersStore = (store: WorkOrdersStoreV1): void => {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const updateWorkOrdersStore = (updater: (store: WorkOrdersStoreV1) => WorkOrdersStoreV1): WorkOrdersStoreV1 => {
  const current = ensureWorkOrdersStore();
  const next = updater(current);
  writeWorkOrdersStore(next);
  return next;
};

export const resetWorkOrdersStore = (): WorkOrdersStoreV1 => {
  const seed = createSeedStore();
  writeWorkOrdersStore(seed);
  return seed;
};
