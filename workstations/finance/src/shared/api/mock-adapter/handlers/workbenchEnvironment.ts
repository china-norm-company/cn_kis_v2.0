import {
  batchDeleteEnvironmentMonitoringConfigs,
  deleteEnvironmentMonitoringConfig,
  getEnvironmentMonitoringConfigById,
  listEnvironmentMonitoringConfigs,
  generateEnvironmentConfigNo,
  getCurrentUser as getEnvCurrentUser,
  addEnvironmentMonitoringConfig,
  updateEnvironmentMonitoringConfig,
} from "@/shared/api/mock-adapter/fixtures/workbench/environment/mocks/environmentMonitoringConfigMocks";
import {
  addApprovalRecord,
  addModificationHistory,
  deleteApprovalRecordsByConfigId,
  deleteModificationHistoryByConfigId,
  getApprovalRecordsByConfigId,
  getModificationHistoryByConfigId,
} from "@/shared/api/mock-adapter/fixtures/workbench/environment/mocks/environmentMonitoringConfigHistoryMocks";
import { listEnvironmentAnomalyEvents } from "@/shared/api/mock-adapter/fixtures/workbench/environment/mocks/environmentAnomalyEventsMocks";
import {
  listExternalWeather,
  getExternalWeatherById,
} from "@/shared/api/mock-adapter/fixtures/workbench/environment/mocks/externalWeatherMocks";
import {
  listInternalMonitoringRecords,
  getInternalMonitoringRecordById,
} from "@/shared/api/mock-adapter/fixtures/workbench/environment/mocks/internalMonitoringMocks";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const workbenchEnvironmentHandlers: MockHandlerConfig<any, any>[] = [
  { key: "workbench.environment.anomalyEvents.list", handler: () => listEnvironmentAnomalyEvents() },
  { key: "workbench.environment.monitoringConfigs.list", handler: () => listEnvironmentMonitoringConfigs() },
  {
    key: "workbench.environment.monitoringConfigs.get",
    handler: (id?: string) => (id ? getEnvironmentMonitoringConfigById(id) ?? null : null),
  },
  {
    key: "workbench.environment.monitoringConfigs.add",
    handler: (payload) => addEnvironmentMonitoringConfig(payload as any),
  },
  {
    key: "workbench.environment.monitoringConfigs.update",
    handler: (params?: { id: string; patch: any }) =>
      params?.id ? updateEnvironmentMonitoringConfig(params.id, params.patch as any) ?? null : null,
  },
  {
    key: "workbench.environment.monitoringConfigs.delete",
    handler: (id?: string) => (id ? deleteEnvironmentMonitoringConfig(id) ?? null : null),
  },
  {
    key: "workbench.environment.monitoringConfigs.batchDelete",
    handler: (ids?: string[]) => (Array.isArray(ids) ? batchDeleteEnvironmentMonitoringConfigs(ids) : 0),
  },
  { key: "workbench.environment.monitoringConfigs.generateNo", handler: () => generateEnvironmentConfigNo() },
  { key: "workbench.environment.monitoringConfigs.currentUser", handler: () => getEnvCurrentUser() },
  {
    key: "workbench.environment.monitoringConfigs.history.list",
    handler: (id?: string) => (id ? getModificationHistoryByConfigId(id) : []),
  },
  {
    key: "workbench.environment.monitoringConfigs.history.add",
    handler: (payload) => addModificationHistory(payload as any),
  },
  {
    key: "workbench.environment.monitoringConfigs.history.delete",
    handler: (id?: string) => (id ? deleteModificationHistoryByConfigId(id) : undefined),
  },
  {
    key: "workbench.environment.monitoringConfigs.approval.list",
    handler: (id?: string) => (id ? getApprovalRecordsByConfigId(id) : []),
  },
  {
    key: "workbench.environment.monitoringConfigs.approval.add",
    handler: (payload) => addApprovalRecord(payload as any),
  },
  {
    key: "workbench.environment.monitoringConfigs.approval.delete",
    handler: (id?: string) => (id ? deleteApprovalRecordsByConfigId(id) : undefined),
  },
  { key: "workbench.environment.internalMonitoring.list", handler: () => listInternalMonitoringRecords() },
  {
    key: "workbench.environment.internalMonitoring.get",
    handler: (id?: string) => (id ? getInternalMonitoringRecordById(id) ?? null : null),
  },
  { key: "workbench.environment.externalWeather.list", handler: () => listExternalWeather() },
  {
    key: "workbench.environment.externalWeather.get",
    handler: (id?: string) => (id ? getExternalWeatherById(id) ?? null : null),
  },
];

let workbenchEnvironmentRegistered = false;
export const registerWorkbenchEnvironmentMocks = (): void => {
  if (workbenchEnvironmentRegistered) return;
  registerMockHandlers(workbenchEnvironmentHandlers);
  workbenchEnvironmentRegistered = true;
};

registerWorkbenchEnvironmentMocks();
