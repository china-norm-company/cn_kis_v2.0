import {
  addQueryUrlConfig,
  batchDeleteQueryUrlConfigs,
  deleteQueryUrlConfig,
  generateRecordNo,
  getApprovalRecordsByConfigId,
  getCurrentUser,
  getModificationHistoryByConfigId,
  getQueryUrlConfigById,
  listQueryUrlConfigs,
  updateQueryUrlConfig,
} from "@/shared/api/mock-adapter/fixtures/workbench/query-url-config/mocks/queryUrlConfigMocks";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const workbenchQueryUrlConfigHandlers: MockHandlerConfig<any, any>[] = [
  { key: "workbench.queryUrlConfig.list", handler: () => listQueryUrlConfigs() },
  { key: "workbench.queryUrlConfig.get", handler: (id?: string) => (id ? getQueryUrlConfigById(id) ?? null : null) },
  { key: "workbench.queryUrlConfig.generateNo", handler: () => generateRecordNo() },
  { key: "workbench.queryUrlConfig.currentUser", handler: () => getCurrentUser() },
  {
    key: "workbench.queryUrlConfig.add",
    handler: (payload) => addQueryUrlConfig(payload as any),
  },
  {
    key: "workbench.queryUrlConfig.update",
    handler: (params?: { id: string; patch: any }) =>
      params?.id ? updateQueryUrlConfig(params.id, params.patch as any) ?? null : null,
  },
  {
    key: "workbench.queryUrlConfig.delete",
    handler: (id?: string) => (id ? deleteQueryUrlConfig(id) ?? null : null),
  },
  {
    key: "workbench.queryUrlConfig.batchDelete",
    handler: (ids?: string[]) => (Array.isArray(ids) ? batchDeleteQueryUrlConfigs(ids) : 0),
  },
  {
    key: "workbench.queryUrlConfig.history",
    handler: (id?: string) => (id ? getModificationHistoryByConfigId(id) : []),
  },
  {
    key: "workbench.queryUrlConfig.approvalRecords",
    handler: (id?: string) => (id ? getApprovalRecordsByConfigId(id) : []),
  },
];

let workbenchQueryUrlConfigRegistered = false;
export const registerWorkbenchQueryUrlConfigMocks = (): void => {
  if (workbenchQueryUrlConfigRegistered) return;
  registerMockHandlers(workbenchQueryUrlConfigHandlers);
  workbenchQueryUrlConfigRegistered = true;
};

registerWorkbenchQueryUrlConfigMocks();
