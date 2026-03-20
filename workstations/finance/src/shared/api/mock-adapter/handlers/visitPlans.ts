import { visitPlanMockApi } from "@/features/visit-plan/api/visitPlanMockApi";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

const visitPlanHandlers: MockHandlerConfig<any, any>[] = [
  { key: "visitPlans.getVisitPlan", handler: (protocolId?: number) => visitPlanMockApi.getVisitPlan(Number(protocolId ?? 0)) },
  {
    key: "visitPlans.createVisitWithResources",
    handler: (params?: any) => visitPlanMockApi.createVisitWithResources(params),
  },
  {
    key: "visitPlans.getResourceOccupations",
    handler: (params?: { startDate: string; endDate: string }) =>
      visitPlanMockApi.getResourceOccupations(params?.startDate ?? "", params?.endDate ?? ""),
  },
  {
    key: "visitPlans.updateVisitNode",
    handler: (params?: { nodeId: number; data: Record<string, unknown> }) =>
      visitPlanMockApi.updateVisitNode(Number(params?.nodeId ?? 0), params?.data ?? {}),
  },
  {
    key: "visitPlans.previewParseToActivities",
    handler: (params?: { protocolId: number; visitPlanId: number }) =>
      visitPlanMockApi.previewParseToActivities(Number(params?.protocolId ?? 0), Number(params?.visitPlanId ?? 0)),
  },
  {
    key: "visitPlans.createFromParseResult",
    handler: (params?: { protocolId: number; visitPlanId: number }) =>
      visitPlanMockApi.createFromParseResult(Number(params?.protocolId ?? 0), Number(params?.visitPlanId ?? 0)),
  },
  {
    key: "visitPlans.generateResourceDemand",
    handler: (params?: { visitPlanId: number }) => visitPlanMockApi.generateResourceDemand(Number(params?.visitPlanId ?? 0)),
  },
  { key: "visitPlans.exportVisitSchedule", handler: () => visitPlanMockApi.exportVisitSchedule(0, "excel") },
  { key: "visitPlans.exportResourceList", handler: () => visitPlanMockApi.exportResourceList(0, "excel") },
  { key: "visitPlans.exportCompletenessReport", handler: () => visitPlanMockApi.exportCompletenessReport(0) },
];

let visitPlanMocksRegistered = false;
export const registerVisitPlanMocks = (): void => {
  if (visitPlanMocksRegistered) return;
  registerMockHandlers(visitPlanHandlers);
  visitPlanMocksRegistered = true;
};

registerVisitPlanMocks();
