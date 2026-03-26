import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import type { VenueItem, VenueDetail, VenueStats, VenueChangeLogItem } from '@cn-kis/api-client'
import { Building2, Download, History, Pencil, Plus, Search, Upload, X } from 'lucide-react'

const VENUE_TYPE_OPTIONS = [
  { value: '', label: '请选择' },
  { value: 'testing_room', label: '恒温恒湿测试室' },
  { value: 'waiting_area', label: '等候区' },
  { value: 'washing_area', label: '洗漱区' },
  { value: 'storage_room', label: '存储室' },
  { value: 'office', label: '办公室' },
  { value: 'utility_room', label: '功能间' },
  { value: 'reception', label: '接待' },
]

const VENUE_STATUS_OPTIONS = [
  { value: 'active', label: '启用' },
  { value: 'reserved', label: '使用中' },
  { value: 'maintenance', label: '维修中' },
  { value: 'retired', label: '停用' },
]

const FIELD_LABELS: Record<string, string> = {
  name: '场地名称',
  code: '场地编码',
  center: '所属中心',
  area: '面积',
  venue_type: '场地功能',
  env_requirements: '环境要求',
  status: '场地状态',
  floor: '楼层',
  building: '楼栋',
  capacity: '容量',
  description: '描述',
}

function VenueChangeModal({ venues, venueTypeOptions, onClose, onSuccess }: { venues: VenueItem[]; venueTypeOptions: Array<{ value: string; label: string }>; onClose: () => void; onSuccess: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<Record<string, string | number>>({})
  const [msg, setMsg] = useState('')

  const selected = venues.find(v => v.id === selectedId)
  const detailQuery = useQuery({
    queryKey: ['facility', 'venue-detail', selectedId],
    queryFn: () => facilityApi.getVenueDetail(selectedId!),
    enabled: selectedId !== null,
  })
  const detail = (detailQuery.data as any)?.data as VenueDetail | undefined

  const mutation = useMutation({
    mutationFn: (data: { venue_id: number; [k: string]: unknown }) => facilityApi.changeVenue(data),
    onSuccess: () => {
      setMsg('变更已生效')
      setTimeout(() => { onSuccess(); onClose(); setMsg('') }, 1200)
    },
    onError: (err: any) => setMsg(err?.message ?? '变更失败'),
  })

  useEffect(() => {
    if (selectedId && detail) {
      const attrs = (detail as any).attributes || {}
      setForm({
        name: detail.name,
        center: detail.center || '',
        area: detail.area || 0,
        venue_type: detail.venue_type || '',
        env_requirements: detail.env_requirements || '',
        status: detail.status || 'active',
        floor: (detail as any).floor || '',
        building: (detail as any).building || '',
        capacity: (detail as any).capacity || 0,
        description: (detail as any).description || '',
      })
    }
  }, [selectedId, detail])

  const handleSubmit = () => {
    if (!selectedId) return
    const payload: { venue_id: number; [k: string]: unknown } = { venue_id: selectedId }
    const changes: string[] = []
    if (form.name !== detail?.name) { payload.name = form.name; changes.push('name') }
    if (form.center !== (detail?.center || '')) { payload.center = form.center; changes.push('center') }
    if (Number(form.area) !== (detail?.area || 0)) { payload.area = Number(form.area); changes.push('area') }
    if (form.venue_type !== (detail?.venue_type || '')) { payload.venue_type = form.venue_type; changes.push('venue_type') }
    if (form.env_requirements !== (detail?.env_requirements || '')) { payload.env_requirements = form.env_requirements; changes.push('env_requirements') }
    if (form.status !== (detail?.status || 'active')) { payload.status = form.status; changes.push('status') }
    if (form.floor !== ((detail as any)?.floor || '')) { payload.floor = form.floor; changes.push('floor') }
    if (form.building !== ((detail as any)?.building || '')) { payload.building = form.building; changes.push('building') }
    if (Number(form.capacity) !== ((detail as any)?.capacity || 0)) { payload.capacity = Number(form.capacity); changes.push('capacity') }
    if (form.description !== ((detail as any)?.description || '')) { payload.description = form.description; changes.push('description') }
    if (changes.length === 0) {
      setMsg('未检测到变更')
      return
    }
    mutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[600px] max-h-[90vh] overflow-y-auto relative z-10">
        <h3 className="text-lg font-semibold mb-4">场地信息变更</h3>
        <p className="text-sm text-slate-500 mb-4">选择场地后修改信息，场地编号不可变更。提交后生效并记录历史。</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">选择场地</label>
            <select value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : null)} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">请选择场地</option>
              {venues.map(v => (
                <option key={v.id} value={v.id}>{v.name}（{v.code}）</option>
              ))}
            </select>
          </div>
          {selectedId && (
            <>
              <div className="text-sm font-medium text-slate-700">场地编号（不可变更）：{selected?.code}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm text-slate-600 mb-1">场地名称</label><input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm text-slate-600 mb-1">所属中心</label><input value={form.center || ''} onChange={e => setForm(f => ({ ...f, center: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm text-slate-600 mb-1">面积 (m²)</label><input type="number" value={form.area || 0} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm text-slate-600 mb-1">场地功能</label><select value={form.venue_type || ''} onChange={e => setForm(f => ({ ...f, venue_type: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm">{venueTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div><label className="block text-sm text-slate-600 mb-1">场地状态</label><select value={form.status || 'active'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm">{VENUE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                <div className="sm:col-span-2"><label className="block text-sm text-slate-600 mb-1">环境要求</label><input value={form.env_requirements || ''} onChange={e => setForm(f => ({ ...f, env_requirements: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" placeholder="如：22±2°C, 50±10%RH" /></div>
                <div className="sm:col-span-2"><label className="block text-sm text-slate-600 mb-1">描述</label><input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
            </>
          )}
          {msg && <div className={`p-3 rounded-lg text-sm ${msg.includes('失败') || msg.includes('未检测') ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg}</div>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">取消</button>
          <button onClick={handleSubmit} disabled={!selectedId || mutation.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{mutation.isPending ? '提交中...' : '提交变更'}</button>
        </div>
      </div>
    </div>
  )
}

function ImportVenueModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ total: number; success: number; failed: number; errors: Array<{ row: number; code: string; message: string }> } | null>(null)

  const mutation = useMutation({
    mutationFn: (f: File) => facilityApi.importVenues(f),
    onSuccess: (res: any) => {
      // API 返回 { code, msg, data: { total, success, failed, errors, created_ids } }
      const payload = res?.data ?? res
      const data = (typeof payload?.data !== 'undefined' ? payload.data : payload) ?? {}
      const successCount = data?.success ?? data?.created_ids?.length ?? 0
      setResult({
        total: data?.total ?? 0,
        success: successCount,
        failed: data?.failed ?? 0,
        errors: data?.errors ?? [],
      })
      if (successCount > 0) onSuccess()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.msg ?? err?.response?.data?.message ?? err?.message ?? '导入失败，请检查文件格式或联系管理员'
      setResult({ total: 0, success: 0, failed: 0, errors: [{ row: 0, code: 'ERROR', message: msg }] })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={() => { onClose(); setResult(null) }} />
      <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto relative z-10">
        <h3 className="text-lg font-semibold mb-4">批量导入场地</h3>
        <p className="text-sm text-slate-500 mb-4">支持 CSV、Excel（.xlsx）格式。可下载模板填写，或使用自定义模板（系统将自动识别常见列名：场地名称、编码、所属中心、面积、场地功能、环境要求、状态）。</p>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await facilityApi.downloadVenueImportTemplate('xlsx')
                } catch (e: any) {
                  alert(e?.message || '下载失败，请检查权限或网络')
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />下载 Excel 模板
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await facilityApi.downloadVenueImportTemplate('csv')
                } catch (e: any) {
                  alert(e?.message || '下载失败，请检查权限或网络')
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />下载 CSV 模板
            </button>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">选择文件</span>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null) }}
              className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
            />
          </label>
          {result && (
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <div className="font-medium text-slate-700 mb-2">导入结果</div>
              <div className="text-slate-600">共 {result.total} 条，成功 {result.success} 条，失败 {result.failed} 条</div>
              {result.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto text-red-600 text-xs">
                  {result.errors.slice(0, 10).map((e, i) => <div key={i}>第{e.row}行 {e.code ? `[${e.code}] ` : ''}{e.message}</div>)}
                  {result.errors.length > 10 && <div>... 还有 {result.errors.length - 10} 条错误</div>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => { onClose(); setResult(null) }} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">{result ? '关闭' : '取消'}</button>
          <button onClick={() => file && mutation.mutate(file)} disabled={!file || mutation.isPending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {mutation.isPending ? '导入中...' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function VenueListPage() {
  const queryClient = useQueryClient()
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showChange, setShowChange] = useState(false)
  const [showChangeHistory, setShowChangeHistory] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20
  // 防抖：输入停止 300ms 后同步到 keyword，减少请求
  useEffect(() => {
    const t = setTimeout(() => setKeyword(keywordInput), 300)
    return () => clearTimeout(t)
  }, [keywordInput])

  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    center: '',
    area: '',
    venue_type: 'testing_room',
    env_requirements: '',
    status: 'active',
  })
  const [createMsg, setCreateMsg] = useState('')

  const { data: statsData } = useQuery({
    queryKey: ['facility', 'venue-stats'],
    queryFn: () => facilityApi.getVenueStats(),
  })
  const stats = (statsData as any)?.data as VenueStats | undefined

  const { data: listData } = useQuery({
    queryKey: ['facility', 'venues', { keyword, typeFilter, statusFilter, page }],
    queryFn: () => facilityApi.getVenues({
      ...(keyword ? { keyword } : {}),
      ...(typeFilter ? { venue_type: typeFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      page,
      page_size: pageSize,
    }),
    placeholderData: keepPreviousData,
  })
  // API 返回 { code, msg, data: { items, total, page, page_size } }
  const listPayload = (listData as { data?: { items: VenueItem[]; total: number } } | undefined)?.data
  const items = listPayload?.items ?? []
  const total = listPayload?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const { data: allVenuesData } = useQuery({
    queryKey: ['facility', 'venues-all-for-change'],
    queryFn: () => facilityApi.getVenues({ page: 1, page_size: 500 }),
    enabled: showChange,
  })
  const allVenues = ((allVenuesData as any)?.data as { items?: VenueItem[] } | undefined)?.items ?? []

  // 信息变更弹窗的场地功能选项 = 系统预设 + 实际导入中出现的类型
  const venueTypeOptions = useMemo(() => {
    const system = VENUE_TYPE_OPTIONS.filter(o => o.value)
    const fromVenues = allVenues.reduce<Array<{ value: string; label: string }>>((acc, v) => {
      if (v.venue_type && !acc.some(a => a.value === v.venue_type) && !system.some(s => s.value === v.venue_type)) {
        acc.push({ value: v.venue_type, label: v.venue_type_display || v.venue_type })
      }
      return acc
    }, [])
    return [...system, ...fromVenues]
  }, [allVenues])

  const { data: changeLogsData } = useQuery({
    queryKey: ['facility', 'venue-change-logs', showChangeHistory],
    queryFn: () => facilityApi.getVenueChangeLogs({ page: 1, page_size: 50 }),
    enabled: showChangeHistory,
  })
  const changeLogs = ((changeLogsData as any)?.data as { items?: VenueChangeLogItem[] } | undefined)?.items ?? []

  const { data: detailData } = useQuery({
    queryKey: ['facility', 'venue-detail', detailId],
    queryFn: () => facilityApi.getVenueDetail(detailId!),
    enabled: detailId !== null,
  })
  const detail = (detailData as any)?.data as VenueDetail | undefined

  const statCards = [
    { key: 'total', label: '场地总数', value: stats?.total ?? '--', color: 'text-blue-600' },
    { key: 'available', label: '启用', value: stats?.available ?? '--', color: 'text-green-600' },
    { key: 'in_use', label: '使用中', value: stats?.in_use ?? '--', color: 'text-amber-600' },
    { key: 'maintenance', label: '维修中', value: stats?.maintenance ?? '--', color: 'text-red-600' },
  ]

  const statusBadge = (status: string, display: string) => {
    const cls: Record<string, string> = {
      active: 'bg-green-50 text-green-600',
      reserved: 'bg-blue-50 text-blue-600',
      maintenance: 'bg-yellow-50 text-yellow-600',
      retired: 'bg-slate-100 text-slate-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[status] || 'bg-slate-100 text-slate-600'}`}>{display}</span>
  }

  const complianceBadge = (compliant: boolean) => {
    return compliant
      ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-600 badge-success" data-compliant="true">合规</span>
      : <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 badge-danger" data-compliant="false">不合规</span>
  }

  async function handleCreate() {
    if (!createForm.name?.trim() || !createForm.code?.trim()) {
      setCreateMsg('请填写场地名称和编码')
      return
    }
    try {
      await facilityApi.createVenue({
        name: createForm.name.trim(),
        code: createForm.code.trim(),
        center: createForm.center.trim() || undefined,
        area: Number(createForm.area) || 0,
        venue_type: createForm.venue_type || 'testing_room',
        env_requirements: createForm.env_requirements.trim() || undefined,
        status: createForm.status || 'active',
      })
      setCreateMsg('场地创建成功')
      setTimeout(() => {
        setShowCreate(false)
        setCreateMsg('')
        setCreateForm({ name: '', code: '', center: '', area: '', venue_type: 'testing_room', env_requirements: '', status: 'active' })
      }, 1500)
    } catch { setCreateMsg('创建失败') }
  }

  function handleSearch(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { /* query auto-refetches */ }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">场地列表</h2>
          <p className="text-sm text-slate-500 mt-1">实验室、检测室、受试者接待区等功能区域管理</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4" />导入
          </button>
          <button onClick={() => setShowChange(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <Pencil className="w-4 h-4" />信息变更
          </button>
          <button onClick={() => setShowChangeHistory(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <History className="w-4 h-4" />变更历史
          </button>
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
            <Plus className="w-4 h-4" />新增场地
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map((s) => (
          <div key={s.key} className="bg-white rounded-xl border border-slate-200 p-4" data-stat={s.key}>
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="min-w-[220px] flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="搜索场地名称、编码或所属中心（支持模糊）" value={keywordInput} onChange={e => { setKeywordInput(e.target.value); setPage(1) }} onKeyDown={handleSearch} title="搜索场地名称、编码或所属中心（支持模糊）"
            className="min-h-11 w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <select title="场地类型筛选" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部类型</option>
          {(stats?.venue_types ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select title="场地状态筛选" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部状态</option>
          <option value="available">启用</option>
          <option value="in_use">使用中</option>
          <option value="maintenance">维修中</option>
          <option value="inactive">停用</option>
        </select>
      </div>

      {/* Venue Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[24%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium text-slate-700">场地名称</th>
                <th className="text-left py-3 px-4 font-medium text-slate-700">场地编码</th>
                <th className="text-left py-3 px-4 font-medium text-slate-700">所属中心</th>
                <th className="text-left py-3 px-4 font-medium text-slate-700">面积</th>
                <th className="text-left py-3 px-4 font-medium text-slate-700">场地功能</th>
                <th className="text-left py-3 px-4 font-medium text-slate-700">场地环境要求</th>
                <th className="text-left py-3 px-4 font-medium text-slate-700">场地状态</th>
              </tr>
            </thead>
            <tbody>
              {items.map(venue => (
                <tr
                  key={venue.id}
                  className="venue-card border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setDetailId(venue.id)}
                >
                  <td className="py-3 px-4 text-slate-800 font-medium truncate" title={venue.name}>{venue.name}</td>
                  <td className="py-3 px-4 text-slate-600 truncate" title={venue.code}>{venue.code}</td>
                  <td className="py-3 px-4 text-slate-600 truncate" title={venue.center}>{venue.center || '—'}</td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{venue.area ? `${venue.area} m²` : '—'}</td>
                  <td className="py-3 px-4 text-slate-600 truncate" title={venue.venue_type_display}>{venue.venue_type_display || '—'}</td>
                  <td className="py-3 px-4 text-slate-600 min-w-0">
                    <span className="block truncate" title={venue.env_requirements}>{venue.env_requirements || '—'}</span>
                  </td>
                  <td className="py-3 px-4">{statusBadge(venue.status, venue.status_display)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && (
          <div className="p-12 text-center text-slate-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>暂无场地数据</p>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-600">共 {total} 条</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed">上一页</button>
              <span className="px-3 py-1.5 text-sm text-slate-600">第 {page} / {totalPages} 页</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed">下一页</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {detailId !== null && detail && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setDetailId(null)} />
          <div className="ml-auto w-[92vw] max-w-[560px] bg-white h-full overflow-auto shadow-xl relative z-10">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">场地详情</h3>
              <button title="关闭详情" onClick={() => setDetailId(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-medium text-slate-800 text-lg">{detail.name}</h4>
                <p className="text-sm text-slate-500">{detail.code}{detail.center ? ` · ${detail.center}` : ''}{detail.floor ? ` · ${detail.floor}` : ''}{detail.area ? ` · ${detail.area}m²` : ''}</p>
              </div>
              {(detail.center || detail.venue_type_display || detail.env_requirements) && (
                <div>
                  <h5 className="text-sm font-medium text-slate-700 mb-2">场地信息</h5>
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    {detail.center && <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">所属中心</p><p className="font-medium">{detail.center}</p></div>}
                    {detail.venue_type_display && <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">场地功能</p><p className="font-medium">{detail.venue_type_display}</p></div>}
                    {detail.env_requirements && <div className="bg-slate-50 rounded-lg p-3 sm:col-span-2"><p className="text-slate-500">场地环境要求</p><p className="font-medium">{detail.env_requirements}</p></div>}
                  </div>
                </div>
              )}
              <div>
                <h5 className="text-sm font-medium text-slate-700 mb-2">环境控制标准</h5>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">目标温度</p><p className="font-semibold">{detail.target_temp}°C ± {detail.temp_tolerance}°C</p></div>
                  <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">目标湿度</p><p className="font-semibold">{detail.target_humidity}% ± {detail.humidity_tolerance}%</p></div>
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-slate-700 mb-2">关联设备 ({detail.equipment_list?.length ?? 0})</h5>
                <div className="space-y-2">
                  {detail.equipment_list?.map(eq => (
                    <div key={eq.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3 text-sm">
                      <span>{eq.name}</span><span className="text-slate-400">{eq.code}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-slate-700 mb-2">近期预约</h5>
                {detail.recent_reservations?.map(r => (
                  <div key={r.id} className="bg-slate-50 rounded-lg p-3 text-sm mb-2">
                    <p className="font-medium">{r.purpose}</p>
                    <p className="text-slate-500">{r.reserved_by_name} · {r.status}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 信息变更弹窗 */}
      {showChange && (
        <VenueChangeModal
          venues={allVenues}
          venueTypeOptions={venueTypeOptions}
          onClose={() => setShowChange(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['facility', 'venues'] })
            queryClient.invalidateQueries({ queryKey: ['facility', 'venue-stats'] })
            queryClient.invalidateQueries({ queryKey: ['facility', 'venue-change-logs'] })
          }}
        />
      )}

      {/* 变更历史侧边栏 */}
      {showChangeHistory && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowChangeHistory(false)} />
          <div className="ml-auto w-[92vw] max-w-[560px] bg-white h-full overflow-auto shadow-xl relative z-10">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">场地变更历史</h3>
              <button onClick={() => setShowChangeHistory(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {changeLogs.length === 0 && <p className="text-slate-500 text-sm">暂无变更记录</p>}
              {changeLogs.map(log => (
                <div key={log.id} className="border border-slate-200 rounded-lg p-4 text-sm">
                  <div className="flex justify-between text-slate-600 mb-2">
                    <span>{log.venue_name}（{log.venue_code}）</span>
                    <span>{log.changed_by_name || '—'} · {log.change_time ? new Date(log.change_time).toLocaleString('zh-CN') : '—'}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    {log.changed_fields.map(f => (
                      <div key={f} className="flex gap-2">
                        <span className="text-slate-500 shrink-0 w-20">{FIELD_LABELS[f] || f}</span>
                        <span className="text-amber-600 line-through">{String(log.before_data[f] ?? '—')}</span>
                        <span className="text-emerald-600">→ {String(log.after_data[f] ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportVenueModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['facility', 'venues'] })
            queryClient.invalidateQueries({ queryKey: ['facility', 'venue-stats'] })
          }}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowCreate(false); setCreateMsg('') }} />
          <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[520px] max-h-[90vh] overflow-y-auto relative z-10">
            <h3 className="text-lg font-semibold mb-4">新增场地</h3>
            {createMsg && <div className={`mb-4 p-3 rounded-lg text-sm ${createMsg.includes('失败') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{createMsg}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地名称 <span className="text-red-500">*</span></label><input type="text" aria-label="场地名称" placeholder="如：恒温恒湿测试室 A" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地编码 <span className="text-red-500">*</span></label><input type="text" aria-label="场地编码" placeholder="如：VNU-TH-A" value={createForm.code} onChange={e => setCreateForm(p => ({ ...p, code: e.target.value }))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">所属中心</label><input type="text" aria-label="所属中心" placeholder="如：上海中心" value={createForm.center} onChange={e => setCreateForm(p => ({ ...p, center: e.target.value }))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">面积 (m²)</label><input type="number" aria-label="面积" placeholder="0" min={0} step={0.1} value={createForm.area} onChange={e => setCreateForm(p => ({ ...p, area: e.target.value }))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地功能</label><select aria-label="场地功能" value={createForm.venue_type} onChange={e => setCreateForm(p => ({ ...p, venue_type: e.target.value }))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500">{VENUE_TYPE_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地环境要求</label><input type="text" aria-label="场地环境要求" placeholder="如：22±2°C, 50±10%RH" value={createForm.env_requirements} onChange={e => setCreateForm(p => ({ ...p, env_requirements: e.target.value }))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地状态</label><select aria-label="场地状态" value={createForm.status} onChange={e => setCreateForm(p => ({ ...p, status: e.target.value }))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500">{VENUE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); setCreateMsg('') }} className="min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">取消</button>
              <button onClick={handleCreate} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
