import {
  mockDailyScheduleTasks,
  mockVisitPlanProject,
} from "@/shared/api/mock-adapter/fixtures/workbench/scheduler/mocks/visitPlanFlowData";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const workbenchSchedulerHandlers: MockHandlerConfig<any, any>[] = [
  {
    key: "workbench.scheduler.visitPlan.project",
    handler: (projectId?: string) => ({ ...mockVisitPlanProject, id: projectId || mockVisitPlanProject.id }),
  },
  {
    key: "workbench.scheduler.visitPlan.dailyTasks",
    handler: () => mockDailyScheduleTasks,
  },
];

let workbenchSchedulerRegistered = false;
export const registerWorkbenchSchedulerMocks = (): void => {
  if (workbenchSchedulerRegistered) return;
  registerMockHandlers(workbenchSchedulerHandlers);
  workbenchSchedulerRegistered = true;
};

registerWorkbenchSchedulerMocks();
