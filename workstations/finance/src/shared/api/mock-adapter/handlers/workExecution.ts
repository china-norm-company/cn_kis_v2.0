import { workExecutionMockApi } from "@/features/work-execution/api/mocks/workOrdersMock";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const workExecutionMockHandlers: MockHandlerConfig<any, any>[] = [
  { key: "workExecution.list", handler: (params?: { enrollmentId?: number; status?: string; scheduledDate?: string }) => workExecutionMockApi.list(params?.enrollmentId, params?.status, params?.scheduledDate) },
  { key: "workExecution.myTodo", handler: () => workExecutionMockApi.getMyTodo() },
  { key: "workExecution.getById", handler: (id?: number) => workExecutionMockApi.getById(Number(id)) },
  { key: "workExecution.start", handler: (id?: number) => workExecutionMockApi.start(Number(id)) },
  { key: "workExecution.complete", handler: (payload?: { id: number; data: any }) => workExecutionMockApi.complete(Number(payload?.id ?? 0), (payload?.data || {}) as any) },
  { key: "workExecution.approve", handler: (payload?: { id: number; comments?: string }) => workExecutionMockApi.approve(Number(payload?.id ?? 0), payload?.comments) },
  { key: "workExecution.reject", handler: (payload?: { id: number; comments: string }) => workExecutionMockApi.reject(Number(payload?.id ?? 0), payload?.comments || "") },
  { key: "workExecution.reopen", handler: (payload?: { id: number; reason?: string }) => workExecutionMockApi.reopen(Number(payload?.id ?? 0), payload?.reason) },
  { key: "workExecution.saveCRF", handler: (payload?: { workOrderId: number; data: any }) => workExecutionMockApi.saveCRF(Number(payload?.workOrderId ?? 0), (payload?.data || {}) as any) },
  { key: "workExecution.getCRFRecord", handler: (id?: number) => workExecutionMockApi.getCRFRecord(Number(id)) },
  { key: "workExecution.getCRFTemplate", handler: (id?: number) => workExecutionMockApi.getCRFTemplate(Number(id ?? 1)) },
];

let workExecutionMocksRegistered = false;
export const registerWorkExecutionMocks = (): void => {
  if (workExecutionMocksRegistered) return;
  registerMockHandlers(workExecutionMockHandlers);
  workExecutionMocksRegistered = true;
};

registerWorkExecutionMocks();

export { workExecutionMockApi };
