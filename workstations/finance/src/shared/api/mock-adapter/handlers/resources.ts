import { mockDeviceEvents, mockDevices } from "@/shared/api/mock-adapter/fixtures/resources/devices";
import { getMockMaterials, Material } from "@/shared/api/mock-adapter/fixtures/resources/materials";
import { mockPersonnel, Personnel } from "@/shared/api/mock-adapter/fixtures/resources/personnel";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const resourcesMockApi = {
  listDevices: async () => mockDevices.map((device) => ({ ...device })),
  getDeviceEvents: async (params?: { deviceId?: string }) => {
    if (!params?.deviceId) return mockDeviceEvents.map((event) => ({ ...event }));
    return mockDeviceEvents.filter((event) => event.deviceId === params.deviceId).map((event) => ({ ...event }));
  },
  listPersonnel: async (): Promise<Personnel[]> => mockPersonnel.map((person) => ({ ...person })),
  listMaterials: async (): Promise<Material[]> => getMockMaterials(),
};

export const resourcesMockHandlers: Array<MockHandlerConfig<any, any>> = [
  { key: "resources.devices.list", handler: resourcesMockApi.listDevices },
  { key: "resources.devices.events", handler: resourcesMockApi.getDeviceEvents },
  { key: "resources.personnel.list", handler: resourcesMockApi.listPersonnel },
  { key: "resources.materials.list", handler: resourcesMockApi.listMaterials },
];

let resourcesMocksRegistered = false;
export const registerResourceMocks = (): void => {
  if (resourcesMocksRegistered) return;
  registerMockHandlers(resourcesMockHandlers);
  resourcesMocksRegistered = true;
};

registerResourceMocks();
