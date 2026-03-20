/**
 * 环境监控配置 Mock 数据存储
 * 遵循 Mock 数据规范：Seed数据 + localStorage持久化
 */
import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";
import { addModificationHistory, addApprovalRecord } from "./environmentMonitoringConfigHistoryMocks";

// Storage Key
export const ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY = "mock_environment_monitoring_config_store";
// Seed数据版本号
const SEED_DATA_VERSION = "1.0";
const STORAGE_VERSION_KEY = `${ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY}_version`;

// 环境监控配置数据类型
export interface EnvironmentMonitoringConfig {
  id: string;
  configNo: string; // 环境配置编号
  roomName: string; // 房间名称
  location: string; // 所属场地（中心-楼层-区域）
  functionType: string; // 功能类型
  temperatureRange: string; // 温度标准范围
  humidityRange: string; // 湿度标准范围
  illuminanceRequirement: string; // 照度要求
  cleanlinessLevel: string; // 洁净度等级
  maxPersonnel: number | null; // 人数上限
  equipmentList: string[]; // 可放置设备（可多个）
  requiresAccessControl: boolean; // 是否需门禁控制
  relatedDetectionMethods: string[]; // 关联检测方法
  monitoringMeasures: string; // 监控措施说明
  createdAt: string;
  updatedAt: string;
}

/** 表单/创建/更新入参：不含 id、createdAt、updatedAt */
export type EnvironmentMonitoringConfigFormData = Omit<
  EnvironmentMonitoringConfig,
  "id" | "createdAt" | "updatedAt"
>;

// Seed数据
const SEED_ENVIRONMENT_MONITORING_CONFIGS: EnvironmentMonitoringConfig[] = [
  {
    id: "1",
    configNo: "HJPC-001",
    roomName: "理化检测室A",
    location: "中心-1楼-东区",
    functionType: "理化检测",
    temperatureRange: "20±2℃",
    humidityRange: "50±5%RH",
    illuminanceRequirement: "≥300lx",
    cleanlinessLevel: "普通",
    maxPersonnel: 5,
    equipmentList: ["高效液相色谱仪", "气相色谱仪"],
    requiresAccessControl: true,
    relatedDetectionMethods: ["GB/T 5009.1", "GB/T 5009.2"],
    monitoringMeasures: "每日早9点开启空调预冷，保持恒温恒湿环境",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    configNo: "HJPC-002",
    roomName: "微生物检测室B",
    location: "中心-2楼-西区",
    functionType: "微生物检测",
    temperatureRange: "18±1℃",
    humidityRange: "60±5%RH",
    illuminanceRequirement: "≥500lx",
    cleanlinessLevel: "万级",
    maxPersonnel: 3,
    equipmentList: ["超净工作台", "培养箱"],
    requiresAccessControl: true,
    relatedDetectionMethods: ["GB 4789.1", "GB 4789.2"],
    monitoringMeasures: "每日早8点开启净化系统，保持洁净度等级",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// 初始化数据存储
function initEnvironmentMonitoringConfigStore() {
  if (!canUseLocalStorage()) return;

  const storedVersion = window.localStorage.getItem(STORAGE_VERSION_KEY);

  // 检查版本号，如果版本不匹配，清除旧数据
  if (storedVersion !== SEED_DATA_VERSION) {
    window.localStorage.removeItem(ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY);
    window.localStorage.setItem(STORAGE_VERSION_KEY, SEED_DATA_VERSION);
  }

  // 初始化数据
  const existingData = safeParseJson<EnvironmentMonitoringConfig[]>(
    window.localStorage.getItem(ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY)
  ) || [];

  // 如果数据为空，使用Seed数据
  if (existingData.length === 0) {
    window.localStorage.setItem(
      ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY,
      JSON.stringify(SEED_ENVIRONMENT_MONITORING_CONFIGS)
    );
  } else {
    // 合并Seed数据中的新项（基于configNo）
    const existingConfigNos = new Set(existingData.map((item) => item.configNo));
    const newItems = SEED_ENVIRONMENT_MONITORING_CONFIGS.filter(
      (item) => !existingConfigNos.has(item.configNo)
    );
    if (newItems.length > 0) {
      const mergedData = [...existingData, ...newItems];
      window.localStorage.setItem(
        ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY,
        JSON.stringify(mergedData)
      );
    }
  }
}

// 初始化
initEnvironmentMonitoringConfigStore();

// 获取所有环境监控配置
export function listEnvironmentMonitoringConfigs(): EnvironmentMonitoringConfig[] {
  if (!canUseLocalStorage()) return SEED_ENVIRONMENT_MONITORING_CONFIGS;
  return safeParseJson<EnvironmentMonitoringConfig[]>(
    window.localStorage.getItem(ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY)
  ) || SEED_ENVIRONMENT_MONITORING_CONFIGS;
}

// 根据ID获取环境监控配置
export function getEnvironmentMonitoringConfigById(id: string): EnvironmentMonitoringConfig | null {
  const configs = listEnvironmentMonitoringConfigs();
  return configs.find((item) => item.id === id) || null;
}

// 添加环境监控配置
export function addEnvironmentMonitoringConfig(
  data: Omit<EnvironmentMonitoringConfig, "id" | "createdAt" | "updatedAt">,
  operator?: string,
  operatorRole?: string
): EnvironmentMonitoringConfig {
  const configs = listEnvironmentMonitoringConfigs();
  const now = new Date().toISOString();
  const newConfig: EnvironmentMonitoringConfig = {
    ...data,
    id: `emc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  };
  configs.push(newConfig);
  if (canUseLocalStorage()) {
    window.localStorage.setItem(
      ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY,
      JSON.stringify(configs)
    );
  }

  // 记录修改历史
  const currentUser = getCurrentUser();
  const op = operator || currentUser.name;
  const opRole = operatorRole || currentUser.role;
  
  const changes = [
    { field: "configNo", oldValue: null, newValue: newConfig.configNo },
    { field: "roomName", oldValue: null, newValue: newConfig.roomName },
    { field: "location", oldValue: null, newValue: newConfig.location },
    { field: "functionType", oldValue: null, newValue: newConfig.functionType },
    { field: "temperatureRange", oldValue: null, newValue: newConfig.temperatureRange },
    { field: "humidityRange", oldValue: null, newValue: newConfig.humidityRange },
    { field: "illuminanceRequirement", oldValue: null, newValue: newConfig.illuminanceRequirement },
    { field: "cleanlinessLevel", oldValue: null, newValue: newConfig.cleanlinessLevel },
    { field: "maxPersonnel", oldValue: null, newValue: newConfig.maxPersonnel },
    { field: "equipmentList", oldValue: null, newValue: newConfig.equipmentList },
    { field: "requiresAccessControl", oldValue: null, newValue: newConfig.requiresAccessControl },
    { field: "relatedDetectionMethods", oldValue: null, newValue: newConfig.relatedDetectionMethods },
    { field: "monitoringMeasures", oldValue: null, newValue: newConfig.monitoringMeasures },
  ];
  
  addModificationHistory({
    configId: newConfig.id,
    action: "create",
    operator: op,
    operatorRole: opRole,
    operationTime: now,
    changes,
  });

  // 添加初始审批记录
  addApprovalRecord({
    configId: newConfig.id,
    sequenceNo: 1,
    nodeName: "提交",
    operator: op,
    operationDate: now,
    operation: "提交",
    message: "",
  });

  return newConfig;
}

// 更新环境监控配置
export function updateEnvironmentMonitoringConfig(
  id: string,
  data: Partial<Omit<EnvironmentMonitoringConfig, "id" | "createdAt" | "configNo">>,
  operator?: string,
  operatorRole?: string
): EnvironmentMonitoringConfig | null {
  const configs = listEnvironmentMonitoringConfigs();
  const index = configs.findIndex((item) => item.id === id);
  if (index === -1) return null;
  
  const oldItem = { ...configs[index] };
  const now = new Date().toISOString();
  
  configs[index] = {
    ...configs[index],
    ...data,
    updatedAt: now,
  };
  
  if (canUseLocalStorage()) {
    window.localStorage.setItem(
      ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY,
      JSON.stringify(configs)
    );
  }

  // 记录修改历史
  const currentUser = getCurrentUser();
  const op = operator || currentUser.name;
  const opRole = operatorRole || currentUser.role;
  
  const changes: { field: string; oldValue: any; newValue: any }[] = [];
  Object.keys(data).forEach((key) => {
    const field = key as keyof typeof data;
    if (field !== "updatedAt" && oldItem[field] !== configs[index][field]) {
      changes.push({
        field,
        oldValue: oldItem[field],
        newValue: configs[index][field],
      });
    }
  });

  if (changes.length > 0) {
    addModificationHistory({
      configId: id,
      action: "update",
      operator: op,
      operatorRole: opRole,
      operationTime: now,
      changes,
    });
  }

  return configs[index];
}

// 删除环境监控配置
export function deleteEnvironmentMonitoringConfig(
  id: string,
  operator?: string,
  operatorRole?: string
): boolean {
  const configs = listEnvironmentMonitoringConfigs();
  const deletedItem = configs.find((item) => item.id === id);
  if (!deletedItem) return false;
  
  const filtered = configs.filter((item) => item.id !== id);
  if (filtered.length === configs.length) return false;
  
  if (canUseLocalStorage()) {
    window.localStorage.setItem(
      ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY,
      JSON.stringify(filtered)
    );
  }

  // 记录删除历史
  const currentUser = getCurrentUser();
  const op = operator || currentUser.name;
  const opRole = operatorRole || currentUser.role;
  
  addModificationHistory({
    configId: id,
    action: "delete",
    operator: op,
    operatorRole: opRole,
    operationTime: new Date().toISOString(),
    changes: [
      { field: "configNo", oldValue: deletedItem.configNo, newValue: null },
      { field: "roomName", oldValue: deletedItem.roomName, newValue: null },
    ],
  });

  return true;
}

// 批量删除环境监控配置
export function batchDeleteEnvironmentMonitoringConfigs(
  ids: string[],
  operator?: string,
  operatorRole?: string
): number {
  const configs = listEnvironmentMonitoringConfigs();
  const deletedItems = configs.filter((item) => ids.includes(item.id));
  const filtered = configs.filter((item) => !ids.includes(item.id));
  const deletedCount = configs.length - filtered.length;
  
  if (deletedCount > 0 && canUseLocalStorage()) {
    window.localStorage.setItem(
      ENVIRONMENT_MONITORING_CONFIG_STORAGE_KEY,
      JSON.stringify(filtered)
    );
  }

  // 记录删除历史
  const currentUser = getCurrentUser();
  const op = operator || currentUser.name;
  const opRole = operatorRole || currentUser.role;
  const now = new Date().toISOString();

  deletedItems.forEach((item) => {
    addModificationHistory({
      configId: item.id,
      action: "delete",
      operator: op,
      operatorRole: opRole,
      operationTime: now,
      changes: [
        { field: "configNo", oldValue: item.configNo, newValue: null },
        { field: "roomName", oldValue: item.roomName, newValue: null },
      ],
    });
  });

  return deletedCount;
}

// 生成环境配置编号
export function generateEnvironmentConfigNo(): string {
  const configs = listEnvironmentMonitoringConfigs();
  const maxNo = configs.reduce((max, item) => {
    const match = item.configNo.match(/HJPC-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      return Math.max(max, num);
    }
    return max;
  }, 0);
  const nextNo = maxNo + 1;
  return `HJPC-${String(nextNo).padStart(3, "0")}`;
}

// 获取当前用户信息
export function getCurrentUser() {
  const nickname = typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage.getItem("admin_nickname") || "当前用户"
    : "当前用户";
  
  return {
    name: nickname,
    role: "环境管理员",
    department: "环境管理部",
  };
}

