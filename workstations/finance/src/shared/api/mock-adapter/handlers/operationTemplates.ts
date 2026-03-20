import { activityConfigsMockApi, operationTemplatesMockApi } from "@/features/operation-templates/api/operationTemplatesMockApi";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

const operationTemplateHandlers: MockHandlerConfig<any, any>[] = [
  { key: "operationTemplates.list", handler: (params?: any) => operationTemplatesMockApi.list(params) },
  { key: "operationTemplates.listByCategory", handler: (category?: string) => operationTemplatesMockApi.listByCategory(String(category ?? "")) },
  { key: "operationTemplates.get", handler: (id?: number) => operationTemplatesMockApi.get(Number(id ?? 0)) },
  { key: "operationTemplates.create", handler: (params?: any) => operationTemplatesMockApi.create(params) },
  { key: "operationTemplates.update", handler: (params?: { templateId: number; data: any }) => operationTemplatesMockApi.update(Number(params?.templateId ?? 0), params?.data ?? {}) },
  { key: "operationTemplates.delete", handler: (id?: number) => operationTemplatesMockApi.delete(Number(id ?? 0)) },
  { key: "activityConfigs.listByNode", handler: (nodeId?: number) => activityConfigsMockApi.listByNode(Number(nodeId ?? 0)) },
  { key: "activityConfigs.get", handler: (id?: number) => activityConfigsMockApi.get(Number(id ?? 0)) },
  {
    key: "activityConfigs.create",
    handler: (params?: { visitNodeId: number; data: any }) =>
      activityConfigsMockApi.create(Number(params?.visitNodeId ?? 0), params?.data ?? {}),
  },
  {
    key: "activityConfigs.update",
    handler: (params?: { id: number; data: any; updateAllSimilar?: boolean }) =>
      activityConfigsMockApi.update(Number(params?.id ?? 0), params?.data ?? {}, params?.updateAllSimilar),
  },
  { key: "activityConfigs.delete", handler: (id?: number) => activityConfigsMockApi.delete(Number(id ?? 0)) },
  { key: "activityConfigs.batchCreateFromTemplates", handler: (params?: any) => activityConfigsMockApi.batchCreateFromTemplates(params) },
  { key: "activityConfigs.copyToNodes", handler: (params?: any) => activityConfigsMockApi.copyToNodes(params) },
  { key: "activityConfigs.reorder", handler: (params?: any) => activityConfigsMockApi.reorder(params) },
  { key: "activityConfigs.checkConfigCompleteness", handler: (id?: number) => activityConfigsMockApi.checkConfigCompleteness(Number(id ?? 0)) },
  { key: "activityConfigs.checkNodeCompleteness", handler: (nodeId?: number) => activityConfigsMockApi.checkNodeCompleteness(Number(nodeId ?? 0)) },
  { key: "activityConfigs.checkPlanCompleteness", handler: (planId?: number) => activityConfigsMockApi.checkPlanCompleteness(Number(planId ?? 0)) },
  { key: "activityConfigs.getChangelog", handler: (params?: any) => activityConfigsMockApi.getChangelog(params?.configId ?? params?.id ?? 0, params?.limit) },
  { key: "activityConfigs.getParameterSuggestions", handler: (configId?: number) => activityConfigsMockApi.getParameterSuggestions(Number(configId ?? 0)) },
  { key: "activityConfigs.getCompletenessReminder", handler: (planId?: number) => activityConfigsMockApi.getCompletenessReminder(Number(planId ?? 0)) },
  { key: "activityConfigs.getChangeImpact", handler: (configId?: number) => activityConfigsMockApi.getChangeImpact(Number(configId ?? 0)) },
];

let operationTemplateMocksRegistered = false;
export const registerOperationTemplateMocks = (): void => {
  if (operationTemplateMocksRegistered) return;
  registerMockHandlers(operationTemplateHandlers);
  operationTemplateMocksRegistered = true;
};

registerOperationTemplateMocks();
