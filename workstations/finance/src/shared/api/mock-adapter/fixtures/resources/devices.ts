export type DeviceStatus = "IDLE" | "IN_USE" | "CALIBRATING" | "FAULTED";

export type CalibrationStatus = "normal" | "dueSoon" | "overdue";

export type DeviceEventType =
  | "use"
  | "fault"
  | "resolve"
  | "calibration"
  | "maintenance"
  | "traceability"
  | "inspection"
  | "repair"
  | "edit";

export interface Device {
  id: string;
  name: string;
  code: string;
  region: string;
  model: string;
  category: string;
  lab: string;
  ownership: "共享" | "专有";
  location: string;
  manager: string;
  status: DeviceStatus;
  needsCalibration: boolean;
  calibrationDueDate: string;
  schedulable: boolean;
  maxConcurrency?: number;
}

export interface DeviceEvent {
  id: string;
  deviceId: string;
  time: string;
  operator: string;
  type: DeviceEventType;
  detail: string;
}

export const deviceStatusText: Record<DeviceStatus, string> = {
  IDLE: "空闲可用",
  IN_USE: "使用中",
  CALIBRATING: "校准中",
  FAULTED: "故障",
};

export const calibrationStatusText: Record<CalibrationStatus, string> = {
  normal: "正常",
  dueSoon: "即将到期",
  overdue: "已过期",
};

export const deviceEventTypeText: Record<DeviceEventType, string> = {
  use: "使用",
  fault: "故障",
  resolve: "恢复",
  calibration: "校准",
  maintenance: "维护",
  traceability: "溯源",
  inspection: "核查",
  repair: "维修",
  edit: "编辑",
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatDateTime = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ");

const today = new Date();
const dueSoon = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
const overdue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
const later = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

export const mockDevices: Device[] = [
  {
    id: "dv-01",
    name: "VISIA-CR #01",
    code: "EQ-001",
    region: "宝华中心",
    model: "VISIA-CR",
    category: "成像设备",
    lab: "影像实验室",
    ownership: "专有",
    location: "Room 101",
    manager: "王工",
    status: "IDLE",
    needsCalibration: true,
    calibrationDueDate: formatDate(later),
    schedulable: true,
    maxConcurrency: 1,
  },
  {
    id: "dv-02",
    name: "Corneometer CM825",
    code: "EQ-014",
    region: "长宁医美",
    model: "CM825",
    category: "检测设备",
    lab: "功效实验室",
    ownership: "共享",
    location: "Lab A",
    manager: "刘倩",
    status: "IN_USE",
    needsCalibration: true,
    calibrationDueDate: formatDate(dueSoon),
    schedulable: true,
    maxConcurrency: 2,
  },
  {
    id: "dv-03",
    name: "Tewameter TM300",
    code: "EQ-016",
    region: "长宁医美",
    model: "TM300",
    category: "检测设备",
    lab: "功效实验室",
    ownership: "共享",
    location: "Lab B",
    manager: "张昊",
    status: "CALIBRATING",
    needsCalibration: true,
    calibrationDueDate: formatDate(overdue),
    schedulable: false,
    maxConcurrency: 1,
  },
  {
    id: "dv-04",
    name: "Cutometer MPA580",
    code: "EQ-022",
    region: "宝华中心",
    model: "MPA580",
    category: "力学设备",
    lab: "材料实验室",
    ownership: "专有",
    location: "Room 203",
    manager: "赵敏",
    status: "FAULTED",
    needsCalibration: false,
    calibrationDueDate: formatDate(later),
    schedulable: false,
    maxConcurrency: 1,
  },
  {
    id: "dv-05",
    name: "色差计 CR-400",
    code: "EQ-031",
    region: "长宁医美",
    model: "CR-400",
    category: "色彩设备",
    lab: "影像实验室",
    ownership: "共享",
    location: "Room 105",
    manager: "周泽",
    status: "IDLE",
    needsCalibration: true,
    calibrationDueDate: formatDate(later),
    schedulable: true,
    maxConcurrency: 1,
  },
];

export const mockDeviceEvents: DeviceEvent[] = [
  {
    id: "evt-001",
    deviceId: "dv-01",
    time: formatDateTime(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)),
    operator: "设备工程师",
    type: "maintenance",
    detail: "完成日常清洁与镜头检查",
  },
  {
    id: "evt-002",
    deviceId: "dv-01",
    time: formatDateTime(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)),
    operator: "王工",
    type: "calibration",
    detail: "完成校准，记录已归档",
  },
  {
    id: "evt-003",
    deviceId: "dv-02",
    time: formatDateTime(new Date(today.getTime() - 3 * 60 * 60 * 1000)),
    operator: "排程员A",
    type: "use",
    detail: "项目 VST-2025-018 使用中",
  },
  {
    id: "evt-004",
    deviceId: "dv-03",
    time: formatDateTime(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)),
    operator: "张昊",
    type: "calibration",
    detail: "进入校准流程，等待确认",
  },
  {
    id: "evt-005",
    deviceId: "dv-04",
    time: formatDateTime(new Date(today.getTime() - 4 * 60 * 60 * 1000)),
    operator: "赵敏",
    type: "fault",
    detail: "真空泵异常报警，暂停使用",
  },
  {
    id: "evt-006",
    deviceId: "dv-05",
    time: formatDateTime(new Date(today.getTime() - 12 * 24 * 60 * 60 * 1000)),
    operator: "设备工程师",
    type: "maintenance",
    detail: "完成日常巡检",
  },
  {
    id: "evt-007",
    deviceId: "dv-05",
    time: formatDateTime(new Date(today.getTime() - 9 * 24 * 60 * 60 * 1000)),
    operator: "周泽",
    type: "use",
    detail: "项目 VST-2025-011 使用完毕",
  },
  {
    id: "evt-008",
    deviceId: "dv-01",
    time: formatDateTime(new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000)),
    operator: "设备工程师",
    type: "traceability",
    detail: "完成计量溯源记录，证书编号 TR-2025-011",
  },
  {
    id: "evt-009",
    deviceId: "dv-02",
    time: formatDateTime(new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000)),
    operator: "质量专员",
    type: "inspection",
    detail: "期间核查完成，结论正常",
  },
  {
    id: "evt-010",
    deviceId: "dv-04",
    time: formatDateTime(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)),
    operator: "维修工程师",
    type: "repair",
    detail: "更换真空泵组件，恢复正常",
  },
];

export const getCalibrationStatus = (dueDate: string, now: Date = new Date()): CalibrationStatus => {
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return "normal";
  }
  const diffMs = parsed.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 30) return "dueSoon";
  return "normal";
};

export const deviceRegions = ["宝华中心", "长宁医美"];

export const deviceCategories = ["成像设备", "检测设备", "力学设备", "色彩设备"];

export const deviceLabs = ["影像实验室", "功效实验室", "材料实验室"];

export const deviceOwnershipOptions: Array<Device["ownership"]> = ["专有", "共享"];
