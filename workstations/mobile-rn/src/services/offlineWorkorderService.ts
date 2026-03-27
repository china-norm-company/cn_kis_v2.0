/**
 * 离线工单执行服务（P2.2）
 *
 * 架构：
 * 1. 有网时：从后端加载今日工单到 SQLite 本地数据库
 * 2. 断网时：从 SQLite 读取工单，完成工单后标记为待同步
 * 3. 恢复网络：自动同步待同步的工单到后端（最多等待 30 秒）
 */
import * as SQLite from 'expo-sqlite'
import NetInfo from '@react-native-community/netinfo'
import type { ApiClient } from '@cn-kis/subject-core'

export type OfflineWorkorderStatus = 'pending' | 'in_progress' | 'completed_local' | 'synced' | 'sync_failed'

export interface OfflineWorkorder {
  id: number
  remote_id: number
  title: string
  work_order_type: string
  status: OfflineWorkorderStatus
  subject_name: string
  subject_no: string
  scheduled_date: string | null
  protocol_title: string
  visit_node_name: string
  activity_name: string
  completion_data: string | null
  completed_at: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

const DB_NAME = 'cn_kis_offline.db'
const TABLE_NAME = 'offline_workorders'

let db: SQLite.SQLiteDatabase | null = null

// -------------------------------------------------------
// 数据库初始化
// -------------------------------------------------------

export async function initOfflineDB(): Promise<void> {
  db = await SQLite.openDatabaseAsync(DB_NAME)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL,
      work_order_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      subject_name TEXT NOT NULL DEFAULT '',
      subject_no TEXT NOT NULL DEFAULT '',
      scheduled_date TEXT,
      protocol_title TEXT NOT NULL DEFAULT '',
      visit_node_name TEXT NOT NULL DEFAULT '',
      activity_name TEXT NOT NULL DEFAULT '',
      completion_data TEXT,
      completed_at TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workorders_status ON ${TABLE_NAME}(status);
    CREATE INDEX IF NOT EXISTS idx_workorders_remote_id ON ${TABLE_NAME}(remote_id);
  `)
}

function getDB(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('离线数据库未初始化，请先调用 initOfflineDB()')
  return db
}

// -------------------------------------------------------
// 工单加载与缓存
// -------------------------------------------------------

interface RemoteWorkorder {
  id: number
  title: string
  work_order_type: string
  status: string
  subject_name: string
  subject_no?: string
  scheduled_date: string | null
  protocol_title: string
  visit_node_name: string
  activity_name: string
}

/**
 * 从后端拉取今日工单并缓存到 SQLite
 */
export async function syncWorkordersFromRemote(apiClient: ApiClient): Promise<{
  synced: number
  error?: string
}> {
  try {
    const res = await apiClient.get<RemoteWorkorder[]>('/workorder/my-today')
    if (res.code !== 200 || !Array.isArray(res.data)) {
      return { synced: 0, error: '获取工单失败' }
    }

    const database = getDB()
    let synced = 0

    for (const wo of res.data) {
      const exists = await database.getFirstAsync<{ id: number }>(
        `SELECT id FROM ${TABLE_NAME} WHERE remote_id = ?`,
        wo.id,
      )

      if (!exists) {
        await database.runAsync(
          `INSERT INTO ${TABLE_NAME} (remote_id, title, work_order_type, status, subject_name, subject_no, scheduled_date, protocol_title, visit_node_name, activity_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          wo.id, wo.title, wo.work_order_type, 'pending', wo.subject_name, wo.subject_no || '', wo.scheduled_date, wo.protocol_title, wo.visit_node_name, wo.activity_name,
        )
        synced++
      } else {
        // 更新状态（如果远端已完成，不覆盖本地已完成状态）
        const local = await database.getFirstAsync<{ status: string }>(
          `SELECT status FROM ${TABLE_NAME} WHERE remote_id = ?`,
          wo.id,
        )
        if (local && local.status !== 'completed_local') {
          await database.runAsync(
            `UPDATE ${TABLE_NAME} SET status = ?, updated_at = datetime('now') WHERE remote_id = ?`,
            wo.status, wo.id,
          )
        }
      }
    }

    return { synced }
  } catch (error) {
    return { synced: 0, error: String(error) }
  }
}

// -------------------------------------------------------
// 工单读取
// -------------------------------------------------------

/**
 * 获取本地缓存的今日工单列表
 */
export async function getLocalWorkorders(): Promise<OfflineWorkorder[]> {
  const database = getDB()
  const rows = await database.getAllAsync<OfflineWorkorder>(
    `SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC`,
  )
  return rows
}

/**
 * 获取单个工单
 */
export async function getLocalWorkorder(remoteId: number): Promise<OfflineWorkorder | null> {
  const database = getDB()
  return database.getFirstAsync<OfflineWorkorder>(
    `SELECT * FROM ${TABLE_NAME} WHERE remote_id = ?`,
    remoteId,
  )
}

// -------------------------------------------------------
// 工单完成（离线）
// -------------------------------------------------------

/**
 * 在本地标记工单为已完成（待同步）
 */
export async function completeWorkorderLocally(
  remoteId: number,
  completionData: Record<string, unknown>,
): Promise<void> {
  const database = getDB()
  await database.runAsync(
    `UPDATE ${TABLE_NAME}
     SET status = 'completed_local', completion_data = ?, completed_at = datetime('now'), updated_at = datetime('now')
     WHERE remote_id = ?`,
    JSON.stringify(completionData), remoteId,
  )
}

// -------------------------------------------------------
// 同步待同步工单到后端
// -------------------------------------------------------

export interface SyncResult {
  total: number
  succeeded: number
  failed: number
  errors: string[]
}

/**
 * 将本地已完成的工单同步到后端
 */
export async function syncPendingWorkordersToRemote(apiClient: ApiClient): Promise<SyncResult> {
  const database = getDB()
  const pending = await database.getAllAsync<OfflineWorkorder>(
    `SELECT * FROM ${TABLE_NAME} WHERE status = 'completed_local'`,
  )

  const result: SyncResult = { total: pending.length, succeeded: 0, failed: 0, errors: [] }

  for (const wo of pending) {
    try {
      const completionData = wo.completion_data ? JSON.parse(wo.completion_data) : {}
      const res = await apiClient.post<unknown>(`/workorder/${wo.remote_id}/complete`, {
        completion_data: completionData,
        completed_at: wo.completed_at,
        source: 'offline_rn',
      })

      if ((res as { code?: number }).code === 200) {
        await database.runAsync(
          `UPDATE ${TABLE_NAME} SET status = 'synced', synced_at = datetime('now'), updated_at = datetime('now') WHERE remote_id = ?`,
          wo.remote_id,
        )
        result.succeeded++
      } else {
        await database.runAsync(
          `UPDATE ${TABLE_NAME} SET status = 'sync_failed', updated_at = datetime('now') WHERE remote_id = ?`,
          wo.remote_id,
        )
        result.failed++
        result.errors.push(`工单 #${wo.remote_id}: ${(res as { msg?: string }).msg || '同步失败'}`)
      }
    } catch (error) {
      await database.runAsync(
        `UPDATE ${TABLE_NAME} SET status = 'sync_failed', updated_at = datetime('now') WHERE remote_id = ?`,
        wo.remote_id,
      )
      result.failed++
      result.errors.push(`工单 #${wo.remote_id}: ${String(error)}`)
    }
  }

  return result
}

// -------------------------------------------------------
// 自动同步监听器
// -------------------------------------------------------

let syncListenerCleanup: (() => void) | null = null

/**
 * 启动网络恢复自动同步
 * 网络从离线恢复时，30 秒内自动同步待同步工单
 */
export function startAutoSync(
  apiClient: ApiClient,
  onSyncComplete?: (result: SyncResult) => void,
): () => void {
  if (syncListenerCleanup) {
    syncListenerCleanup()
  }

  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      setTimeout(async () => {
        try {
          const result = await syncPendingWorkordersToRemote(apiClient)
          if (result.total > 0) {
            onSyncComplete?.(result)
          }
        } catch {
          // 静默处理
        }
      }, 2000) // 网络恢复 2 秒后同步，避免网络不稳定
    }
  })

  syncListenerCleanup = unsubscribe
  return unsubscribe
}

/**
 * 停止自动同步
 */
export function stopAutoSync(): void {
  if (syncListenerCleanup) {
    syncListenerCleanup()
    syncListenerCleanup = null
  }
}
