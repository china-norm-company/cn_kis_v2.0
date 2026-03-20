import { projectProtocolsMockApi } from "@/features/project/api/projectProtocolsMockApi";
import { projectsMockApi } from "@/features/project/api/mockProjects";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

const projectHandlers: MockHandlerConfig<any, any>[] = [
  { key: "projectProtocols.list", handler: () => projectProtocolsMockApi.list() },
  { key: "projectProtocols.getById", handler: (id?: number) => projectProtocolsMockApi.getById(Number(id ?? 0)) },
  {
    key: "projectProtocols.upload",
    handler: () => {
      const fileLike =
        typeof File !== "undefined" ? new File([], "mock.pdf") : (new Blob([]) as unknown as File);
      return projectProtocolsMockApi.upload(fileLike, "演示方案");
    },
  },
  { key: "projectProtocols.getStatus", handler: (id?: number) => projectProtocolsMockApi.getStatus(Number(id ?? 0)) },
  { key: "projectProtocols.getResult", handler: (id?: number) => projectProtocolsMockApi.getResult(Number(id ?? 0)) },
  { key: "projectProtocols.updateResult", handler: (params?: { id: number; parsedData: Record<string, unknown> }) => projectProtocolsMockApi.updateResult(params?.id ?? 0, params?.parsedData ?? {}) },
  { key: "projectProtocols.confirm", handler: (id?: number) => projectProtocolsMockApi.confirm(Number(id ?? 0)) },
  { key: "projectProtocols.getReviews", handler: (protocolId?: number) => projectProtocolsMockApi.getReviews(Number(protocolId ?? 0)) },
  {
    key: "projectProtocols.submitReview",
    handler: (params?: { protocolId: number; reviewData: any }) =>
      projectProtocolsMockApi.submitReview(Number(params?.protocolId ?? 0), params?.reviewData ?? {}),
  },
  { key: "projects.list", handler: () => projectsMockApi.list() },
  { key: "projects.getById", handler: (id?: number) => projectsMockApi.getById(Number(id ?? 0)) },
];

let projectMocksRegistered = false;
export const registerProjectMocks = (): void => {
  if (projectMocksRegistered) return;
  registerMockHandlers(projectHandlers);
  projectMocksRegistered = true;
};

registerProjectMocks();
