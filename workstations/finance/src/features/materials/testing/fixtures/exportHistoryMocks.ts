/**
 * 导出历史记录存根
 * 实际业务接入时替换为真实存储实现
 */

export interface ExportHistory {
  id: string
  historyKey: string
  exportTime: string
  fileFormat: string
  exportType: 'all' | 'custom'
  maxRows: number
  numericMapping: boolean
  selectedColumns: string[]
  recordCount: number
}

const _store: ExportHistory[] = []

export function getAllExportHistory(): ExportHistory[] {
  return _store
}

export function saveExportHistory(entry: Omit<ExportHistory, 'id' | 'exportTime'>): ExportHistory {
  const record: ExportHistory = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    exportTime: new Date().toISOString(),
    ...entry,
  }
  _store.unshift(record)
  if (_store.length > 50) _store.splice(50)
  return record
}

export function deleteExportHistory(id: string): void {
  const idx = _store.findIndex(e => e.id === id)
  if (idx !== -1) _store.splice(idx, 1)
}
