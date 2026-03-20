/**
 * 环境监控配置修改历史 Mock 数据存储
 */
import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";

// Storage Key
export const ENVIRONMENT_MONITORING_CONFIG_HISTORY_STORAGE_KEY = "mock_environment_monitoring_config_history_store_v1";

// 修改历史记录类型
export interface ModificationHistory {
  id: string;
  configId: string; // 关联的配置ID
  action: "create" | "update" | "delete"; // 操作类型
  operator: string; // 操作人
  operatorRole: string; // 操作人角色
  operationTime: string; // 操作时间
  changes: {
    field: string;
    oldValue: string | number | boolean | string[] | null;
    newValue: string | number | boolean | string[] | null;
  }[];
  remarks?: string; // 备注
}

// 审批记录类型
export interface ApprovalRecord {
  id: string;
  configId: string; // 关联的配置ID
  sequenceNo: number; // 序号
  nodeName: string; // 节点名称
  operator: string; // 操作人
  operationDate: string; // 操作日期
  operation: string; // 操作（提交、通过、退回等）
  message: string; // 留言
}

// 内存缓存
let modificationHistoryStore: ModificationHistory[] | null = null;
let approvalRecordsStore: ApprovalRecord[] | null = null;

// 初始化函数
function initModificationHistoryStore() {
  if (modificationHistoryStore) return;
  
  if (canUseLocalStorage()) {
    const stored = safeParseJson<ModificationHistory[]>(
      window.localStorage.getItem(ENVIRONMENT_MONITORING_CONFIG_HISTORY_STORAGE_KEY)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      modificationHistoryStore = stored;
      return;
    }
  }
  
  // localStorage为空，初始化为空数组
  modificationHistoryStore = [];
  persistModificationHistoryStore();
}

// 初始化审批记录
function initApprovalRecordsStore() {
  if (approvalRecordsStore) return;
  
  if (canUseLocalStorage()) {
    const stored = safeParseJson<ApprovalRecord[]>(
      window.localStorage.getItem(`${ENVIRONMENT_MONITORING_CONFIG_HISTORY_STORAGE_KEY}_approval`)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      approvalRecordsStore = stored;
      return;
    }
  }
  
  approvalRecordsStore = [];
  persistApprovalRecordsStore();
}

// 持久化函数
function persistModificationHistoryStore() {
  if (!canUseLocalStorage() || !modificationHistoryStore) return;
  window.localStorage.setItem(
    ENVIRONMENT_MONITORING_CONFIG_HISTORY_STORAGE_KEY,
    JSON.stringify(modificationHistoryStore)
  );
}

function persistApprovalRecordsStore() {
  if (!canUseLocalStorage() || !approvalRecordsStore) return;
  window.localStorage.setItem(
    `${ENVIRONMENT_MONITORING_CONFIG_HISTORY_STORAGE_KEY}_approval`,
    JSON.stringify(approvalRecordsStore)
  );
}

// 公共API函数

/**
 * 添加修改历史记录
 */
export function addModificationHistory(history: Omit<ModificationHistory, "id">): ModificationHistory {
  initModificationHistoryStore();
  const newHistory: ModificationHistory = {
    ...history,
    id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
  modificationHistoryStore = [newHistory, ...(modificationHistoryStore || [])];
  persistModificationHistoryStore();
  return newHistory;
}

/**
 * 获取指定配置的修改历史
 */
export function getModificationHistoryByConfigId(
  configId: string
): ModificationHistory[] {
  initModificationHistoryStore();
  return (modificationHistoryStore || [])
    .filter((h) => h.configId === configId)
    .sort((a, b) => new Date(b.operationTime).getTime() - new Date(a.operationTime).getTime());
}

/**
 * 删除指定配置的所有历史记录
 */
export function deleteModificationHistoryByConfigId(configId: string): void {
  initModificationHistoryStore();
  modificationHistoryStore = (modificationHistoryStore || []).filter(
    (h) => h.configId !== configId
  );
  persistModificationHistoryStore();
}

/**
 * 获取所有操作记录（按时间倒序）
 */
export function getAllModificationHistory(): ModificationHistory[] {
  initModificationHistoryStore();
  return (modificationHistoryStore || []).sort(
    (a, b) => new Date(b.operationTime).getTime() - new Date(a.operationTime).getTime()
  );
}

/**
 * 添加审批记录
 */
export function addApprovalRecord(record: Omit<ApprovalRecord, "id">): ApprovalRecord {
  initApprovalRecordsStore();
  const newRecord: ApprovalRecord = {
    ...record,
    id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
  approvalRecordsStore = [...(approvalRecordsStore || []), newRecord];
  persistApprovalRecordsStore();
  return newRecord;
}

/**
 * 获取指定配置的审批记录
 */
export function getApprovalRecordsByConfigId(
  configId: string
): ApprovalRecord[] {
  initApprovalRecordsStore();
  return (approvalRecordsStore || [])
    .filter((r) => r.configId === configId)
    .sort((a, b) => a.sequenceNo - b.sequenceNo);
}

/**
 * 删除指定配置的所有审批记录
 */
export function deleteApprovalRecordsByConfigId(configId: string): void {
  initApprovalRecordsStore();
  approvalRecordsStore = (approvalRecordsStore || []).filter(
    (r) => r.configId !== configId
  );
  persistApprovalRecordsStore();
}

