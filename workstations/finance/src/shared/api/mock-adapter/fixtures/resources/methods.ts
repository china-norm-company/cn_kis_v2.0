export type MethodType = "method" | "standard";

export type MethodStatus = "active" | "obsolete";

export type MethodEventType = "CREATE" | "UPDATE" | "STATUS_CHANGE" | "VERSION_CHANGE";

export interface Method {
  id: string;
  code: string;
  name: string;
  type: MethodType;
  category: string;
  lab: string;
  status: MethodStatus;
  currentVersion: string;
  effectiveDate?: string;
  obsoleteDate?: string;
  scope?: string;
  docUrl?: string;
  owner?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MethodEvent {
  id: string;
  methodId: string;
  eventType: MethodEventType;
  time: string;
  operator: string;
  detail: string;
}

export interface MethodDraft {
  code: string;
  name: string;
  type: MethodType;
  category: string;
  lab: string;
  status: MethodStatus;
  currentVersion: string;
  effectiveDate?: string;
  scope?: string;
  docUrl?: string;
  owner?: string;
}

export const methodTypeText: Record<MethodType, string> = {
  method: "检测方法",
  standard: "标准规范",
};

export const methodStatusText: Record<MethodStatus, string> = {
  active: "有效",
  obsolete: "已废止",
};

export const methodEventTypeText: Record<MethodEventType, string> = {
  CREATE: "创建",
  UPDATE: "更新",
  STATUS_CHANGE: "状态变更",
  VERSION_CHANGE: "版本更新",
};

const formatDateTime = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ");

const today = new Date();

export const methodCategories = ["功效", "安全性", "微生物", "理化", "标准规范"];

export const methodLabs = ["功效实验室", "安全性实验室", "微生物实验室", "材料实验室", "全局"];

export const methodOwners = ["王芳", "陈刚", "刘丽", "张昊", "质量负责人"];

let methods: Method[] = [
  {
    id: "mth-001",
    code: "MTH-001",
    name: "皮肤水分含量测试方法",
    type: "method",
    category: "功效",
    lab: "功效实验室",
    status: "active",
    currentVersion: "V1.2",
    effectiveDate: "2025-01-15",
    scope: "适用于面部保湿功效评价。",
    docUrl: "https://docs.example.com/method/mth-001",
    owner: "王芳",
    createdAt: formatDateTime(new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)),
    updatedAt: formatDateTime(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)),
  },
  {
    id: "mth-002",
    code: "MTH-007",
    name: "皮肤屏障功能评价方法",
    type: "method",
    category: "安全性",
    lab: "安全性实验室",
    status: "active",
    currentVersion: "V2.0",
    effectiveDate: "2024-12-01",
    scope: "适用于敏感性人群安全性评价。",
    docUrl: "https://docs.example.com/method/mth-007",
    owner: "刘丽",
    createdAt: formatDateTime(new Date(today.getTime() - 110 * 24 * 60 * 60 * 1000)),
    updatedAt: formatDateTime(new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000)),
  },
  {
    id: "std-001",
    code: "STD-GB-5555",
    name: "化妆品功效宣称评价规范",
    type: "standard",
    category: "标准规范",
    lab: "全局",
    status: "active",
    currentVersion: "2024版",
    effectiveDate: "2024-07-01",
    scope: "适用于功效宣称的技术依据。",
    docUrl: "https://docs.example.com/standard/std-5555",
    owner: "质量负责人",
    createdAt: formatDateTime(new Date(today.getTime() - 200 * 24 * 60 * 60 * 1000)),
    updatedAt: formatDateTime(new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000)),
  },
  {
    id: "std-002",
    code: "STD-ISO-9001",
    name: "质量管理体系 ISO 9001",
    type: "standard",
    category: "标准规范",
    lab: "全局",
    status: "obsolete",
    currentVersion: "2015版",
    effectiveDate: "2015-09-01",
    obsoleteDate: "2025-01-01",
    scope: "历史版本，仅作参考。",
    docUrl: "https://docs.example.com/standard/iso9001",
    owner: "质量负责人",
    createdAt: formatDateTime(new Date(today.getTime() - 600 * 24 * 60 * 60 * 1000)),
    updatedAt: formatDateTime(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)),
  },
];

let methodEvents: MethodEvent[] = [
  {
    id: "evt-001",
    methodId: "mth-001",
    eventType: "CREATE",
    time: formatDateTime(new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)),
    operator: "王芳",
    detail: "创建检测方法并录入版本 V1.0",
  },
  {
    id: "evt-002",
    methodId: "mth-001",
    eventType: "VERSION_CHANGE",
    time: formatDateTime(new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000)),
    operator: "王芳",
    detail: "版本更新至 V1.2",
  },
  {
    id: "evt-003",
    methodId: "std-001",
    eventType: "UPDATE",
    time: formatDateTime(new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000)),
    operator: "质量负责人",
    detail: "补充适用范围说明",
  },
  {
    id: "evt-004",
    methodId: "std-002",
    eventType: "STATUS_CHANGE",
    time: formatDateTime(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)),
    operator: "质量负责人",
    detail: "标记为已废止",
  },
];

export const getMockMethods = () => methods.map((item) => ({ ...item }));

export const getMethodById = (id: string) => methods.find((item) => item.id === id);

export const getMethodEventsById = (methodId: string) =>
  methodEvents.filter((item) => item.methodId === methodId).map((item) => ({ ...item }));

export const addMethod = (draft: MethodDraft) => {
  const now = new Date();
  const newMethod: Method = {
    id: `mth-${Date.now()}`,
    code: draft.code,
    name: draft.name,
    type: draft.type,
    category: draft.category,
    lab: draft.lab,
    status: draft.status,
    currentVersion: draft.currentVersion,
    effectiveDate: draft.effectiveDate,
    scope: draft.scope,
    docUrl: draft.docUrl,
    owner: draft.owner,
    createdAt: formatDateTime(now),
    updatedAt: formatDateTime(now),
  };
  methods = [newMethod, ...methods];
  methodEvents = [
    {
      id: `evt-${Date.now()}`,
      methodId: newMethod.id,
      eventType: "CREATE",
      time: formatDateTime(now),
      operator: draft.owner || "方法管理员",
      detail: "创建方法/标准",
    },
    ...methodEvents,
  ];
  return newMethod;
};

export const updateMethod = (
  id: string,
  updates: Partial<Method>,
  event?: { eventType: MethodEventType; detail: string; operator?: string }
) => {
  let updatedMethod: Method | undefined;
  methods = methods.map((item) => {
    if (item.id !== id) return item;
    updatedMethod = { ...item, ...updates, updatedAt: formatDateTime(new Date()) };
    return updatedMethod;
  });
  if (updatedMethod && event) {
    methodEvents = [
      {
        id: `evt-${Date.now()}`,
        methodId: updatedMethod.id,
        eventType: event.eventType,
        time: formatDateTime(new Date()),
        operator: event.operator || "方法管理员",
        detail: event.detail,
      },
      ...methodEvents,
    ];
  }
  return updatedMethod;
};
