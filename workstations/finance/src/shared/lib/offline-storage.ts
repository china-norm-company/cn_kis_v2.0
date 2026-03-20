/**
 * 离线存储管理器
 * Offline Storage Manager - IndexedDB-based offline data storage
 * 
 * 功能:
 * - IndexedDB数据存储
 * - 离线数据队列管理
 * - 数据同步机制
 * - 冲突检测与解决
 */

// ============ 类型定义 ============

export interface OfflineRecord<T = unknown> {
  id: string;
  storeName: string;
  data: T;
  timestamp: number;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error';
  operation: 'create' | 'update' | 'delete';
  retryCount: number;
  errorMessage?: string;
  serverVersion?: number;
  localVersion: number;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  conflicts: number;
  errors: string[];
}

export interface SyncConflict<T = unknown> {
  recordId: string;
  localData: T;
  serverData: T;
  localTimestamp: number;
  serverTimestamp: number;
}

export type ConflictResolution = 'local' | 'server' | 'merge';

// ============ IndexedDB管理器 ============

const DB_NAME = 'cn_study_kis_offline';
const DB_VERSION = 1;

const STORES = {
  // EDC数据存储
  edc_measurements: 'edc_measurements',
  edc_visits: 'edc_visits',
  edc_efficacy: 'edc_efficacy',
  // 同步队列
  sync_queue: 'sync_queue',
  // 元数据
  metadata: 'metadata',
} as const;

let db: IDBDatabase | null = null;

/**
 * 初始化IndexedDB数据库
 */
export async function initOfflineDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[OfflineDB] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[OfflineDB] Database opened successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // EDC测量数据存储
      if (!database.objectStoreNames.contains(STORES.edc_measurements)) {
        const store = database.createObjectStore(STORES.edc_measurements, { keyPath: 'id' });
        store.createIndex('visit_id', 'visit_id', { unique: false });
        store.createIndex('sync_status', 'syncStatus', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // EDC访视数据存储
      if (!database.objectStoreNames.contains(STORES.edc_visits)) {
        const store = database.createObjectStore(STORES.edc_visits, { keyPath: 'id' });
        store.createIndex('project_id', 'project_id', { unique: false });
        store.createIndex('subject_id', 'subject_id', { unique: false });
        store.createIndex('sync_status', 'syncStatus', { unique: false });
      }

      // 功效计算存储
      if (!database.objectStoreNames.contains(STORES.edc_efficacy)) {
        const store = database.createObjectStore(STORES.edc_efficacy, { keyPath: 'id' });
        store.createIndex('visit_id', 'visit_id', { unique: false });
        store.createIndex('sync_status', 'syncStatus', { unique: false });
      }

      // 同步队列
      if (!database.objectStoreNames.contains(STORES.sync_queue)) {
        const store = database.createObjectStore(STORES.sync_queue, { keyPath: 'id' });
        store.createIndex('storeName', 'storeName', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 元数据存储
      if (!database.objectStoreNames.contains(STORES.metadata)) {
        database.createObjectStore(STORES.metadata, { keyPath: 'key' });
      }

      console.log('[OfflineDB] Database upgrade completed');
    };
  });
}

/**
 * 获取数据库实例
 */
async function getDB(): Promise<IDBDatabase> {
  if (!db) {
    await initOfflineDB();
  }
  return db!;
}

// ============ 通用CRUD操作 ============

/**
 * 保存数据到离线存储
 */
export async function saveOfflineData<T>(
  storeName: string,
  data: T,
  operation: 'create' | 'update' = 'create'
): Promise<OfflineRecord<T>> {
  const database = await getDB();
  
  const record: OfflineRecord<T> = {
    id: `${storeName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    storeName,
    data,
    timestamp: Date.now(),
    syncStatus: 'pending',
    operation,
    retryCount: 0,
    localVersion: 1,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName, STORES.sync_queue], 'readwrite');
    
    // 保存到数据存储
    const dataStore = transaction.objectStore(storeName);
    const dataRequest = dataStore.put(record);
    
    // 添加到同步队列
    const queueStore = transaction.objectStore(STORES.sync_queue);
    queueStore.put(record);

    dataRequest.onsuccess = () => {
      console.log(`[OfflineDB] Data saved to ${storeName}:`, record.id);
      resolve(record);
    };

    dataRequest.onerror = () => {
      console.error(`[OfflineDB] Failed to save data to ${storeName}:`, dataRequest.error);
      reject(dataRequest.error);
    };
  });
}

/**
 * 获取离线数据
 */
export async function getOfflineData<T>(
  storeName: string,
  id: string
): Promise<OfflineRecord<T> | null> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 获取所有离线数据
 */
export async function getAllOfflineData<T>(
  storeName: string,
  indexName?: string,
  indexValue?: IDBValidKey
): Promise<OfflineRecord<T>[]> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    let request: IDBRequest;
    if (indexName && indexValue !== undefined) {
      const index = store.index(indexName);
      request = index.getAll(indexValue);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 删除离线数据
 */
export async function deleteOfflineData(
  storeName: string,
  id: string
): Promise<void> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName, STORES.sync_queue], 'readwrite');
    
    const dataStore = transaction.objectStore(storeName);
    dataStore.delete(id);
    
    const queueStore = transaction.objectStore(STORES.sync_queue);
    queueStore.delete(id);

    transaction.oncomplete = () => {
      console.log(`[OfflineDB] Data deleted from ${storeName}:`, id);
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

/**
 * 清空存储
 */
export async function clearOfflineStore(storeName: string): Promise<void> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => {
      console.log(`[OfflineDB] Store cleared: ${storeName}`);
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============ 同步队列管理 ============

/**
 * 获取待同步的记录
 */
export async function getPendingSyncRecords(): Promise<OfflineRecord[]> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.sync_queue], 'readonly');
    const store = transaction.objectStore(STORES.sync_queue);
    const index = store.index('syncStatus');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 更新同步状态
 */
export async function updateSyncStatus(
  id: string,
  status: OfflineRecord['syncStatus'],
  errorMessage?: string
): Promise<void> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.sync_queue], 'readwrite');
    const store = transaction.objectStore(STORES.sync_queue);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.syncStatus = status;
        if (errorMessage) {
          record.errorMessage = errorMessage;
          record.retryCount += 1;
        }
        store.put(record);
      }
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

/**
 * 移除已同步的记录
 */
export async function removeSyncedRecords(): Promise<number> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.sync_queue], 'readwrite');
    const store = transaction.objectStore(STORES.sync_queue);
    const index = store.index('syncStatus');
    const request = index.openCursor(IDBKeyRange.only('synced'));
    
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        count++;
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      console.log(`[OfflineDB] Removed ${count} synced records`);
      resolve(count);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

// ============ 元数据管理 ============

/**
 * 保存元数据
 */
export async function setMetadata(key: string, value: unknown): Promise<void> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.metadata], 'readwrite');
    const store = transaction.objectStore(STORES.metadata);
    const request = store.put({ key, value, timestamp: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取元数据
 */
export async function getMetadata<T>(key: string): Promise<T | null> {
  const database = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.metadata], 'readonly');
    const store = transaction.objectStore(STORES.metadata);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result?.value ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

// ============ 网络状态检测 ============

let isOnline = navigator.onLine;

export function getOnlineStatus(): boolean {
  return isOnline;
}

export function setupNetworkListeners(
  onOnline?: () => void,
  onOffline?: () => void
): () => void {
  const handleOnline = () => {
    isOnline = true;
    console.log('[OfflineDB] Network online');
    onOnline?.();
  };

  const handleOffline = () => {
    isOnline = false;
    console.log('[OfflineDB] Network offline');
    onOffline?.();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// ============ 统计信息 ============

export interface OfflineStats {
  totalRecords: number;
  pendingSync: number;
  syncErrors: number;
  lastSyncTime: number | null;
  storageUsed: number;
}

/**
 * 获取离线存储统计信息
 */
export async function getOfflineStats(): Promise<OfflineStats> {
  await getDB(); // 确保数据库初始化
  
  const stats: OfflineStats = {
    totalRecords: 0,
    pendingSync: 0,
    syncErrors: 0,
    lastSyncTime: null,
    storageUsed: 0,
  };

  // 获取各存储的记录数
  const storeNames = [STORES.edc_measurements, STORES.edc_visits, STORES.edc_efficacy];
  
  for (const storeName of storeNames) {
    const records = await getAllOfflineData(storeName);
    stats.totalRecords += records.length;
  }

  // 获取待同步和错误记录数
  const pendingRecords = await getPendingSyncRecords();
  stats.pendingSync = pendingRecords.filter(r => r.syncStatus === 'pending').length;
  stats.syncErrors = pendingRecords.filter(r => r.syncStatus === 'error').length;

  // 获取上次同步时间
  stats.lastSyncTime = await getMetadata<number>('lastSyncTime');

  // 估算存储使用量
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    stats.storageUsed = estimate.usage || 0;
  }

  return stats;
}

// ============ 导出常量 ============

export { STORES };


