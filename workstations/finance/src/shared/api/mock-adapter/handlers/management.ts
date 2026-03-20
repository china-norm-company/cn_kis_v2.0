import { managementMockApi } from "@/features/management/api/mocks/managementMocks";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const managementMockHandlers: MockHandlerConfig<any, any>[] = [
  { key: "management.stats", handler: () => managementMockApi.getStats() },
  { key: "management.projects", handler: (status?: string) => managementMockApi.getProjects(status) },
  { key: "management.approvals", handler: () => managementMockApi.getPendingApprovals() },
  { key: "management.approve", handler: (payload?: { id: number; approved: boolean; comments?: string }) => managementMockApi.approve(payload?.id || 0, Boolean(payload?.approved)) },
  { key: "management.qualityIssues", handler: () => managementMockApi.getQualityIssues() },
];

let managementMocksRegistered = false;
export const registerManagementMocks = (): void => {
  if (managementMocksRegistered) return;
  registerMockHandlers(managementMockHandlers);
  managementMocksRegistered = true;
};

registerManagementMocks();

export { managementMockApi };
