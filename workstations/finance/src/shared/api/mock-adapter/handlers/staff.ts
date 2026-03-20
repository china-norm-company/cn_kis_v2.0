import { staffMockApi } from "@/features/hr/api/mocks/staffMocks";
import { registerMockHandlers } from "@/shared/api/mock-adapter/registry";
import type { MockHandlerConfig } from "@/shared/api/mock-adapter/types";

export const staffMockHandlers: MockHandlerConfig<any, any>[] = [
  { key: "staff.stats", handler: () => staffMockApi.getStats() },
  { key: "staff.list", handler: (filters?: any) => staffMockApi.getStaffList((filters || {}) as any) },
  { key: "staff.detail", handler: (id?: number) => staffMockApi.getStaffDetail(Number(id)) },
  { key: "staff.trainings", handler: (id?: number) => staffMockApi.getStaffTrainings(id) },
  { key: "staff.expiringQualifications", handler: (days?: number) => staffMockApi.getExpiringQualifications(days ?? 30) },
  { key: "staff.departments", handler: () => staffMockApi.getDepartments() },
];

let staffMocksRegistered = false;
export const registerStaffMocks = (): void => {
  if (staffMocksRegistered) return;
  registerMockHandlers(staffMockHandlers);
  staffMocksRegistered = true;
};

registerStaffMocks();

export { staffMockApi };
