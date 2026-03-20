export type PersonnelStatus = "active" | "inactive";
export type EmploymentStatus = "在职" | "离职";
export type AvailabilityStatus = "available" | "leave" | "inactive";
export type SkillLevel = "L1" | "L2" | "L3";

export interface PersonnelSkill {
  name: string;
  level: SkillLevel;
  active: boolean;
}

export interface Personnel {
  id: string;
  name: string;
  code: string;
  region: string;
  role: string;
  contact: string;
  status: PersonnelStatus;
  employment: EmploymentStatus;
  onLeave: boolean;
  remark?: string;
  skills: PersonnelSkill[];
}

export type PersonnelEventType = "status" | "leave" | "edit" | "note" | "skill";

export interface PersonnelEvent {
  id: string;
  personnelId: string;
  time: string;
  operator: string;
  type: PersonnelEventType;
  detail: string;
}

export const availabilityStatusText: Record<AvailabilityStatus, string> = {
  available: "可分配",
  leave: "休假",
  inactive: "停用",
};

export const personnelEventTypeText: Record<PersonnelEventType, string> = {
  status: "状态变更",
  leave: "请假/返岗",
  edit: "信息更新",
  note: "备注",
  skill: "技能更新",
};

export const getAvailabilityStatus = (person: Personnel): AvailabilityStatus => {
  if (person.status !== "active") return "inactive";
  if (person.onLeave) return "leave";
  return "available";
};

const formatDateTime = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ");
const now = new Date();

export const mockPersonnel: Personnel[] = [
  {
    id: "ps-01",
    name: "张岚",
    code: "EMP-201",
    region: "宝华中心",
    role: "设备工程师",
    contact: "137-2213-0921",
    status: "active",
    employment: "在职",
    onLeave: false,
    remark: "负责成像设备",
    skills: [
      { name: "校准", level: "L3", active: true },
      { name: "维护", level: "L2", active: true },
    ],
  },
  {
    id: "ps-02",
    name: "李晨",
    code: "EMP-135",
    region: "长宁医美",
    role: "样品管理员",
    contact: "138-9921-1103",
    status: "active",
    employment: "在职",
    onLeave: false,
    remark: "负责样品出入库",
    skills: [
      { name: "收样", level: "L2", active: true },
      { name: "领样", level: "L2", active: true },
    ],
  },
  {
    id: "ps-03",
    name: "王牧",
    code: "EMP-166",
    region: "宝华中心",
    role: "研究员",
    contact: "136-7754-3401",
    status: "active",
    employment: "在职",
    onLeave: true,
    remark: "预计下周返岗",
    skills: [
      { name: "方法开发", level: "L2", active: true },
      { name: "数据评估", level: "L1", active: true },
    ],
  },
  {
    id: "ps-04",
    name: "陈曦",
    code: "EMP-178",
    region: "长宁医美",
    role: "排程员",
    contact: "139-0034-8819",
    status: "inactive",
    employment: "离职",
    onLeave: false,
    remark: "账号停用",
    skills: [{ name: "排程", level: "L2", active: false }],
  },
];

export const personnelRegions = ["宝华中心", "长宁医美"];

export const personnelRoles = [
  "设备工程师",
  "样品管理员",
  "研究员",
  "排程员",
  "质量专员",
  "技术员",
];

export const employmentStatusOptions: EmploymentStatus[] = ["在职", "离职"];

export const skillLevelOptions: SkillLevel[] = ["L1", "L2", "L3"];

export const mockPersonnelEvents: PersonnelEvent[] = [
  {
    id: "pe-001",
    personnelId: "ps-01",
    time: formatDateTime(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)),
    operator: "系统",
    type: "status",
    detail: "状态更新为可分配",
  },
  {
    id: "pe-002",
    personnelId: "ps-01",
    time: formatDateTime(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)),
    operator: "设备主管",
    type: "skill",
    detail: "校准等级提升至 L3",
  },
  {
    id: "pe-003",
    personnelId: "ps-02",
    time: formatDateTime(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)),
    operator: "系统",
    type: "edit",
    detail: "联系方式更新",
  },
  {
    id: "pe-004",
    personnelId: "ps-03",
    time: formatDateTime(new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)),
    operator: "排程员A",
    type: "leave",
    detail: "标记为休假",
  },
  {
    id: "pe-005",
    personnelId: "ps-03",
    time: formatDateTime(new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)),
    operator: "系统",
    type: "note",
    detail: "备注：预计返岗时间更新",
  },
  {
    id: "pe-006",
    personnelId: "ps-04",
    time: formatDateTime(new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000)),
    operator: "管理员",
    type: "status",
    detail: "人员停用",
  },
];
