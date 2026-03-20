/**
 * 查新网址配置 Mock 数据
 */

export interface QueryUrlConfig {
  id: string;
  urlName: string; // 网址名称
  urlLink: string; // 网址链接
  queryPerson: string; // 查新人
  queryDate: string; // 查新时间
  modifyDate: string; // 修改日期
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  nodeName: string; // 节点名称
  operator: string; // 操作人
  operationDate: string; // 操作日期
  operation: string; // 操作
  comment?: string; // 留言
}

export interface ModificationHistory {
  id: string;
  action: "create" | "update" | "delete"; // 操作类型
  operator: string; // 操作人
  operatorRole: string; // 操作人角色
  operationTime: string; // 操作时间
  changes: Array<{
    field: string; // 字段名
    oldValue: string | null; // 旧值
    newValue: string | null; // 新值
  }>;
  remarks?: string; // 备注（与 ModificationHistoryDialog 等组件兼容）
}

// 获取当前用户信息
export function getCurrentUser() {
  // 从 localStorage 获取当前登录用户的昵称
  const nickname = typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage.getItem("admin_nickname") || "当前用户"
    : "当前用户";
  
  return {
    name: nickname, // 使用登录账号的人员姓名
    role: "查新员",
    department: "质量部",
  };
}

// 生成记录编号
export function generateRecordNo(): string {
  const existingNos = mockConfigs.map((c) => c.id);
  const numbers = existingNos
    .map((id) => {
      const match = id.match(/URL-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);
  
  const maxNo = numbers.length > 0 ? Math.max(...numbers) : 0;
  const newNo = maxNo + 1;
  
  return `URL-${String(newNo).padStart(3, "0")}`;
}

// Mock 数据存储
let mockConfigs: QueryUrlConfig[] = [
  {
    id: "URL-001",
    urlName: "国家标准全文公开系统",
    urlLink: "https://openstd.samr.gov.cn/",
    queryPerson: "张小斐",
    queryDate: "2024-01-15",
    modifyDate: "2024-01-15",
    createdAt: "2024-01-15T09:00:00",
    updatedAt: "2024-01-15T09:00:00",
  },
  {
    id: "URL-002",
    urlName: "全国标准信息公共服务平台",
    urlLink: "https://std.samr.gov.cn/",
    queryPerson: "李四",
    queryDate: "2024-01-16",
    modifyDate: "2024-01-16",
    createdAt: "2024-01-16T10:00:00",
    updatedAt: "2024-01-16T10:00:00",
  },
  {
    id: "URL-003",
    urlName: "ISO国际标准组织",
    urlLink: "https://www.iso.org/",
    queryPerson: "王五",
    queryDate: "2024-01-17",
    modifyDate: "2024-01-17",
    createdAt: "2024-01-17T11:00:00",
    updatedAt: "2024-01-17T11:00:00",
  },
];

// 修改历史存储
const modificationHistoryMap: Record<string, ModificationHistory[]> = {};

// 审批记录存储
const approvalRecordsMap: Record<string, ApprovalRecord[]> = {};

// 版本号管理
export const QUERY_URL_CONFIG_VERSION = "v1.0";
const STORAGE_VERSION_KEY = "mock_query_url_config_version";
const STORAGE_KEY = "mock_query_url_configs";
const STORAGE_HISTORY_KEY = "mock_query_url_config_history";
const STORAGE_APPROVAL_KEY = "mock_query_url_config_approval";

// 检查是否可以使用 localStorage
function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// 初始化数据存储
function initQueryUrlConfigStore() {
  if (!canUseLocalStorage()) return;
  
  const storedVersion = window.localStorage.getItem(STORAGE_VERSION_KEY);
  
  // 检查版本号，如果版本不匹配，清除旧数据
  if (storedVersion !== QUERY_URL_CONFIG_VERSION) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_HISTORY_KEY);
    window.localStorage.removeItem(STORAGE_APPROVAL_KEY);
    window.localStorage.setItem(STORAGE_VERSION_KEY, QUERY_URL_CONFIG_VERSION);
  }
  
  // 从 localStorage 加载数据
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      mockConfigs = JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse stored query url configs:", e);
      mockConfigs = [];
    }
  } else {
    // 初始化默认数据
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockConfigs));
  }
  
  // 加载修改历史
  const storedHistory = window.localStorage.getItem(STORAGE_HISTORY_KEY);
  if (storedHistory) {
    try {
      const parsed = JSON.parse(storedHistory);
      Object.keys(parsed).forEach((id) => {
        modificationHistoryMap[id] = parsed[id];
      });
    } catch (e) {
      console.error("Failed to parse stored modification history:", e);
    }
  }
  
  // 加载审批记录
  const storedApproval = window.localStorage.getItem(STORAGE_APPROVAL_KEY);
  if (storedApproval) {
    try {
      const parsed = JSON.parse(storedApproval);
      Object.keys(parsed).forEach((id) => {
        approvalRecordsMap[id] = parsed[id];
      });
    } catch (e) {
      console.error("Failed to parse stored approval records:", e);
    }
  }
}

// 初始化
initQueryUrlConfigStore();

// 保存到 localStorage
function saveToStorage() {
  if (canUseLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockConfigs));
    window.localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(modificationHistoryMap));
    window.localStorage.setItem(STORAGE_APPROVAL_KEY, JSON.stringify(approvalRecordsMap));
  }
}

// 列表查询
export function listQueryUrlConfigs(): QueryUrlConfig[] {
  return [...mockConfigs];
}

// 根据ID查询
export function getQueryUrlConfigById(id: string): QueryUrlConfig | undefined {
  return mockConfigs.find((c) => c.id === id);
}

// 新增
export function addQueryUrlConfig(data: Omit<QueryUrlConfig, "id" | "createdAt" | "updatedAt">): QueryUrlConfig {
  const newConfig: QueryUrlConfig = {
    ...data,
    id: generateRecordNo(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  mockConfigs.push(newConfig);
  saveToStorage();
  
  // 记录修改历史
  const history: ModificationHistory = {
    id: `history-${Date.now()}`,
    action: "create",
    operator: getCurrentUser().name,
    operatorRole: getCurrentUser().role,
    operationTime: new Date().toISOString(),
    changes: [
      { field: "网址名称", oldValue: null, newValue: data.urlName },
      { field: "网址链接", oldValue: null, newValue: data.urlLink },
      { field: "查新人", oldValue: null, newValue: data.queryPerson },
      { field: "查新时间", oldValue: null, newValue: data.queryDate },
    ],
  };
  
  if (!modificationHistoryMap[newConfig.id]) {
    modificationHistoryMap[newConfig.id] = [];
  }
  modificationHistoryMap[newConfig.id].push(history);
  saveToStorage();
  
  return newConfig;
}

// 更新
export function updateQueryUrlConfig(
  id: string,
  data: Partial<Omit<QueryUrlConfig, "id" | "createdAt" | "updatedAt">>
): QueryUrlConfig | null {
  const index = mockConfigs.findIndex((c) => c.id === id);
  if (index === -1) return null;
  
  const oldConfig = { ...mockConfigs[index] };
  const updatedConfig: QueryUrlConfig = {
    ...mockConfigs[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  
  mockConfigs[index] = updatedConfig;
  saveToStorage();
  
  // 记录修改历史
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  
  if (data.urlName !== undefined && data.urlName !== oldConfig.urlName) {
    changes.push({ field: "网址名称", oldValue: oldConfig.urlName, newValue: data.urlName });
  }
  if (data.urlLink !== undefined && data.urlLink !== oldConfig.urlLink) {
    changes.push({ field: "网址链接", oldValue: oldConfig.urlLink, newValue: data.urlLink });
  }
  if (data.queryPerson !== undefined && data.queryPerson !== oldConfig.queryPerson) {
    changes.push({ field: "查新人", oldValue: oldConfig.queryPerson, newValue: data.queryPerson });
  }
  if (data.queryDate !== undefined && data.queryDate !== oldConfig.queryDate) {
    changes.push({ field: "查新时间", oldValue: oldConfig.queryDate, newValue: data.queryDate });
  }
  if (data.modifyDate !== undefined && data.modifyDate !== oldConfig.modifyDate) {
    changes.push({ field: "修改日期", oldValue: oldConfig.modifyDate, newValue: data.modifyDate });
  }
  
  if (changes.length > 0) {
    const history: ModificationHistory = {
      id: `history-${Date.now()}`,
      action: "update",
      operator: getCurrentUser().name,
      operatorRole: getCurrentUser().role,
      operationTime: new Date().toISOString(),
      changes,
    };
    
    if (!modificationHistoryMap[id]) {
      modificationHistoryMap[id] = [];
    }
    modificationHistoryMap[id].push(history);
    saveToStorage();
  }
  
  return updatedConfig;
}

// 删除
export function deleteQueryUrlConfig(id: string): boolean {
  const index = mockConfigs.findIndex((c) => c.id === id);
  if (index === -1) return false;
  
  // 记录删除历史（在删除之前）
  const deletedConfig = mockConfigs[index];
  if (deletedConfig) {
    const history: ModificationHistory = {
      id: `history-${Date.now()}`,
      action: "delete",
      operator: getCurrentUser().name,
      operatorRole: getCurrentUser().role,
      operationTime: new Date().toISOString(),
      changes: [
        { field: "网址名称", oldValue: deletedConfig.urlName, newValue: null },
        { field: "网址链接", oldValue: deletedConfig.urlLink, newValue: null },
      ],
    };
    
    if (!modificationHistoryMap[id]) {
      modificationHistoryMap[id] = [];
    }
    modificationHistoryMap[id].push(history);
  }
  
  mockConfigs.splice(index, 1);
  saveToStorage();
  
  return true;
}

// 批量删除
export function batchDeleteQueryUrlConfigs(ids: string[]): number {
  let deletedCount = 0;
  ids.forEach((id) => {
    if (deleteQueryUrlConfig(id)) {
      deletedCount++;
    }
  });
  return deletedCount;
}

// 获取修改历史
export function getModificationHistoryByConfigId(configId: string): ModificationHistory[] {
  return modificationHistoryMap[configId] || [];
}

// 获取审批记录
export function getApprovalRecordsByConfigId(configId: string): ApprovalRecord[] {
  return approvalRecordsMap[configId] || [];
}

// 添加审批记录
export function addApprovalRecord(configId: string, record: Omit<ApprovalRecord, "id">): ApprovalRecord {
  const newRecord: ApprovalRecord = {
    ...record,
    id: `approval-${Date.now()}`,
  };
  
  if (!approvalRecordsMap[configId]) {
    approvalRecordsMap[configId] = [];
  }
  approvalRecordsMap[configId].push(newRecord);
  saveToStorage();
  
  return newRecord;
}

