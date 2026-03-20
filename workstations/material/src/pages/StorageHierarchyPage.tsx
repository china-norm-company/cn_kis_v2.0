import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { StorageLocationNode, StorageLocationDetail } from '@cn-kis/api-client'
import {
  FolderTree,
  Plus,
  ChevronRight,
  ChevronDown,
  Thermometer,
  ThermometerSnowflake,
  Sun,
  Cloud,
  X,
  Edit3,
} from 'lucide-react'

const TEMPERATURE_ZONES = [
  { value: 'room', label: '常温', icon: Sun },
  { value: 'cool', label: '阴凉', icon: Cloud },
  { value: 'cold', label: '冷藏', icon: Thermometer },
  { value: 'frozen', label: '冷冻', icon: ThermometerSnowflake },
] as const

function ZoneIcon({ zone }: { zone?: string }) {
  const cfg = TEMPERATURE_ZONES.find((z) => z.value === zone)
  const Icon = cfg?.icon ?? Thermometer
  return <Icon className="w-4 h-4 text-slate-500" />
}

/** Build tree from flat list (fallback when tree API unavailable) */
function buildTreeFromFlat(
  flat: Array<{ id: number; zone: string; zone_display: string; shelf: string; positions: string[] }>,
): StorageLocationNode[] {
  const nodes: StorageLocationNode[] = flat.map((item, idx) => ({
    id: item.id,
    location_code: `${item.zone}-${item.shelf}`,
    name: `${item.zone_display} ${item.shelf}`,
    parent_id: null,
    temperature_zone: item.zone,
    temperature_zone_display: item.zone_display,
    capacity: 100,
    current_count: 0,
    capacity_usage: '0%',
    children: [],
  }))
  return nodes
}

export function StorageHierarchyPage() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [parentIdForNew, setParentIdForNew] = useState<number | null>(null)

  // Tree data - try listStorageLocations first, fallback to getStorageLocations
  const { data: treeData } = useQuery({
    queryKey: ['material', 'storage-locations-tree'],
    queryFn: async () => {
      try {
        const res = await materialApi.listStorageLocations?.()
        return (res as any)?.data
      } catch {
        const flat = (await materialApi.getStorageLocations()) as any
        const data = flat?.data ?? flat
        return Array.isArray(data) ? buildTreeFromFlat(data) : []
      }
    },
  })
  const treeNodes = (Array.isArray(treeData) ? treeData : []) as StorageLocationNode[]

  // Selected location detail
  const { data: detailData } = useQuery({
    queryKey: ['material', 'storage-location', selectedId],
    queryFn: () => materialApi.getStorageLocation(selectedId!),
    enabled: !!selectedId,
  })
  const selectedDetail = (detailData as any)?.data as StorageLocationDetail | undefined

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openCreateModal = (parentId: number | null) => {
    setParentIdForNew(parentId)
    setEditingId(null)
    setShowModal(true)
  }

  const openEditModal = (id: number) => {
    setEditingId(id)
    setParentIdForNew(null)
    setShowModal(true)
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Left panel: Tree */}
      <div className="w-80 shrink-0 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">库位层级</h3>
          <button
            onClick={() => openCreateModal(null)}
            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
            title="新增根位置"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {treeNodes.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              <FolderTree className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>暂无库位数据</p>
              <button
                onClick={() => openCreateModal(null)}
                className="mt-2 text-amber-600 hover:underline text-sm"
              >
                新增库位
              </button>
            </div>
          ) : (
            <TreeNodeList
              nodes={treeNodes}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={setSelectedId}
              onToggle={toggleExpand}
              onAddChild={openCreateModal}
              onEdit={openEditModal}
            />
          )}
        </div>
      </div>

      {/* Right panel: Detail */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-y-auto">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 py-16">
            <FolderTree className="w-16 h-16 mb-4 opacity-40" />
            <p className="text-sm">点击左侧库位查看详情</p>
          </div>
        ) : selectedDetail ? (
          <StorageLocationDetailPanel
            detail={selectedDetail}
            onEdit={() => openEditModal(selectedId)}
          />
        ) : (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <LocationModal
          editingId={editingId}
          parentId={parentIdForNew}
          onClose={() => {
            setShowModal(false)
            setEditingId(null)
            setParentIdForNew(null)
          }}
          onSuccess={() => {
            setShowModal(false)
            setEditingId(null)
            setParentIdForNew(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'storage-locations'] })
            if (selectedId) queryClient.invalidateQueries({ queryKey: ['material', 'storage-location', selectedId] })
          }}
        />
      )}
    </div>
  )
}

function TreeNodeList({
  nodes,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onAddChild,
  onEdit,
  depth = 0,
}: {
  nodes: StorageLocationNode[]
  selectedId: number | null
  expandedIds: Set<number>
  onSelect: (id: number) => void
  onToggle: (id: number) => void
  onAddChild: (parentId: number) => void
  onEdit: (id: number) => void
  depth?: number
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const hasChildren = (node.children?.length ?? 0) > 0
        const isExpanded = expandedIds.has(node.id)
        const isSelected = selectedId === node.id
        return (
          <li key={node.id} style={{ paddingLeft: depth * 16 }}>
            <div
              className={`flex items-center gap-1 py-1.5 px-2 rounded-lg group cursor-pointer ${
                isSelected ? 'bg-amber-50 text-amber-800' : 'hover:bg-slate-50'
              }`}
            >
              <button
                onClick={() => hasChildren && onToggle(node.id)}
                className="p-0.5 shrink-0"
              >
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )
                ) : (
                  <span className="w-4 inline-block" />
                )}
              </button>
              <ZoneIcon zone={node.temperature_zone} />
              <div
                className="flex-1 min-w-0"
                onClick={() => onSelect(node.id)}
              >
                <span className="text-sm font-medium truncate block">{node.name}</span>
                <span className="text-xs text-slate-500 font-mono truncate block">
                  {node.location_code}
                </span>
              </div>
              {node.capacity != null && node.current_count != null && (
                <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{
                      width: `${Math.min(100, (node.current_count / node.capacity) * 100)}%`,
                    }}
                  />
                </div>
              )}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddChild(node.id)
                  }}
                  className="p-1 text-slate-400 hover:text-amber-600 rounded"
                  title="新增子位置"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(node.id)
                  }}
                  className="p-1 text-slate-400 hover:text-amber-600 rounded"
                  title="编辑"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {hasChildren && isExpanded && (
              <TreeNodeList
                nodes={node.children!}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onSelect={onSelect}
                onToggle={onToggle}
                onAddChild={onAddChild}
                onEdit={onEdit}
                depth={depth + 1}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function StorageLocationDetailPanel({ detail, onEdit }: { detail: StorageLocationDetail; onEdit: () => void }) {
  const zoneCfg = TEMPERATURE_ZONES.find((z) => z.value === detail.temperature_zone)
  const ZoneIconComponent = zoneCfg?.icon ?? Thermometer
  const usagePercent =
    detail.capacity != null && detail.current_count != null && detail.capacity > 0
      ? Math.min(100, (detail.current_count / detail.capacity) * 100)
      : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <ZoneIconComponent className="w-5 h-5 text-amber-600" />
          {detail.name}
        </h3>
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          <Edit3 className="w-4 h-4" /> 编辑
        </button>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <InfoRow label="编码" value={detail.location_code} />
        <InfoRow label="名称" value={detail.name} />
        <InfoRow label="描述" value={detail.description || '-'} />
        <InfoRow label="温区" value={detail.temperature_zone_display || detail.temperature_zone || '-'} />
        <InfoRow
          label="温度范围"
          value={
            detail.temperature_min != null && detail.temperature_max != null
              ? `${detail.temperature_min}°C ~ ${detail.temperature_max}°C`
              : '-'
          }
        />
      </div>

      {/* Capacity */}
      {detail.capacity != null && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">容量</h4>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <span className="text-sm text-slate-600 shrink-0">
              {detail.current_count ?? 0} / {detail.capacity}
            </span>
          </div>
        </div>
      )}

      {/* Temperature monitor */}
      {detail.has_temperature_monitor && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">温度监控</h4>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">设备ID:</span>
            <span className="font-mono">{detail.monitor_device_id || '-'}</span>
            <span
              className={`px-2 py-0.5 rounded text-xs ${
                detail.monitor_status === 'connected'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-slate-50 text-slate-600'
              }`}
            >
              {detail.monitor_status === 'connected' ? '已连接' : '未连接'}
            </span>
          </div>
        </div>
      )}

      {/* Child locations */}
      {(detail.child_locations?.length ?? 0) > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">子库位</h4>
          <ul className="space-y-1">
            {detail.child_locations!.map((child) => (
              <li
                key={child.id}
                className="flex items-center gap-2 py-2 px-3 rounded-lg bg-slate-50 text-sm"
              >
                <ZoneIcon zone={child.temperature_zone} />
                <span className="font-medium">{child.name}</span>
                <span className="text-slate-500 font-mono text-xs">{child.location_code}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800 mt-0.5">{value}</p>
    </div>
  )
}

function LocationModal({
  editingId,
  parentId,
  onClose,
  onSuccess,
}: {
  editingId: number | null
  parentId: number | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    location_code: '',
    name: '',
    description: '',
    temperature_zone: 'room',
    temperature_min: '',
    temperature_max: '',
    capacity: '',
    has_temperature_monitor: false,
    monitor_device_id: '',
  })
  const [error, setError] = useState('')

  const { data: editData } = useQuery({
    queryKey: ['material', 'storage-location', editingId],
    queryFn: () => materialApi.getStorageLocation(editingId!),
    enabled: !!editingId,
  })
  const existing = (editData as any)?.data as StorageLocationDetail | undefined

  useEffect(() => {
    if (existing) {
      setForm({
        location_code: existing.location_code ?? '',
        name: existing.name ?? '',
        description: existing.description ?? '',
        temperature_zone: existing.temperature_zone ?? 'room',
        temperature_min: existing.temperature_min != null ? String(existing.temperature_min) : '',
        temperature_max: existing.temperature_max != null ? String(existing.temperature_max) : '',
        capacity: existing.capacity != null ? String(existing.capacity) : '',
        has_temperature_monitor: existing.has_temperature_monitor ?? false,
        monitor_device_id: existing.monitor_device_id ?? '',
      })
    }
  }, [existing])

  const createMut = useMutation({
    mutationFn: () =>
      materialApi.createStorageLocation({
        location_code: form.location_code,
        name: form.name,
        description: form.description || undefined,
        parent_id: parentId ?? undefined,
        temperature_zone: form.temperature_zone,
        temperature_min: form.temperature_min ? parseFloat(form.temperature_min) : undefined,
        temperature_max: form.temperature_max ? parseFloat(form.temperature_max) : undefined,
        capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
        has_temperature_monitor: form.has_temperature_monitor,
        monitor_device_id: form.monitor_device_id || undefined,
      }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || err?.message || '创建失败'),
  })

  const updateMut = useMutation({
    mutationFn: () =>
      materialApi.updateStorageLocation(editingId!, {
        location_code: form.location_code,
        name: form.name,
        description: form.description,
        temperature_zone: form.temperature_zone,
        temperature_min: form.temperature_min ? parseFloat(form.temperature_min) : undefined,
        temperature_max: form.temperature_max ? parseFloat(form.temperature_max) : undefined,
        capacity: form.capacity ? parseInt(form.capacity, 10) : undefined,
        has_temperature_monitor: form.has_temperature_monitor,
        monitor_device_id: form.monitor_device_id,
      }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || err?.message || '更新失败'),
  })

  const set = (key: string, val: string | boolean) =>
    setForm((f) => ({ ...f, [key]: val }))

  const handleSubmit = () => {
    if (!form.location_code.trim() || !form.name.trim()) {
      setError('编码和名称为必填')
      return
    }
    if (editingId) updateMut.mutate()
    else createMut.mutate()
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[520px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">
            {editingId ? '编辑库位' : '新增库位'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">编码 *</span>
            <input
              value={form.location_code}
              onChange={(e) => set('location_code', e.target.value)}
              placeholder="如 WH-A1-S2"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">名称 *</span>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="库位名称"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">描述</span>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              placeholder="库位描述"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">温区</span>
            <select
              value={form.temperature_zone}
              onChange={(e) => set('temperature_zone', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              {TEMPERATURE_ZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">最低温度 (°C)</span>
              <input
                type="number"
                value={form.temperature_min}
                onChange={(e) => set('temperature_min', e.target.value)}
                placeholder="如 2"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">最高温度 (°C)</span>
              <input
                type="number"
                value={form.temperature_max}
                onChange={(e) => set('temperature_max', e.target.value)}
                placeholder="如 8"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">容量</span>
            <input
              type="number"
              min={0}
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
              placeholder="可存放数量"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.has_temperature_monitor}
              onChange={(e) => set('has_temperature_monitor', e.target.checked)}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-slate-700">启用温度监控</span>
          </label>

          {form.has_temperature_monitor && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">监控设备ID</span>
              <input
                value={form.monitor_device_id}
                onChange={(e) => set('monitor_device_id', e.target.value)}
                placeholder="设备编号"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
          )}

          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? '保存中...' : editingId ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
