import {
  calculateStatistics,
  generateMonitoringPoints,
  getAllDetectionMethods,
  getAllLocations,
} from "@/shared/api/mock-adapter/fixtures/workbench/resources/environmental-resources/mocks";
import type {
  MonitoringPoint,
  Statistics as EnvironmentalStatistics,
} from "@/shared/api/mock-adapter/fixtures/workbench/resources/environmental-resources/types";
import {
  generateMockStandardInfos,
  generateMockStandardMethods,
  listStandardProjects,
} from "@/shared/api/mock-adapter/fixtures/workbench/resources/standard-resources/mocks";
import type {
  StandardInfo,
  StandardMethod,
  StandardResourceProject,
} from "@/shared/api/mock-adapter/fixtures/workbench/resources/standard-resources/types";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const workbenchResourceMockHandlers: MockHandlerConfig<any, any>[] = [
  {
    key: "workbench.resources.environmental.points",
    handler: (count?: number): MonitoringPoint[] => generateMonitoringPoints(count ?? 25),
  },
  {
    key: "workbench.resources.environmental.statistics",
    handler: (): EnvironmentalStatistics => calculateStatistics(generateMonitoringPoints(25)),
  },
  {
    key: "workbench.resources.environmental.detectionMethods",
    handler: () => getAllDetectionMethods(),
  },
  {
    key: "workbench.resources.environmental.locations",
    handler: () => getAllLocations(),
  },
  {
    key: "workbench.resources.standard.methods",
    handler: (): StandardMethod[] => generateMockStandardMethods(),
  },
  {
    key: "workbench.resources.standard.infos",
    handler: (): StandardInfo[] => generateMockStandardInfos(),
  },
  {
    key: "workbench.resources.standard.projects",
    handler: (): StandardResourceProject[] => listStandardProjects(),
  },
];

let workbenchResourcesRegistered = false;
export const registerWorkbenchResourceMocks = (): void => {
  if (workbenchResourcesRegistered) return;
  registerMockHandlers(workbenchResourceMockHandlers);
  workbenchResourcesRegistered = true;
};

registerWorkbenchResourceMocks();
