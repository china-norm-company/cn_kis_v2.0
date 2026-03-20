import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import type { DetectionMethod, DetectionMethodDetail } from '@cn-kis/api-client'
import { FlaskConical, Plus, X, Clock, Thermometer, Droplets, ChevronLeft, ChevronRight } from 'lucide-react'

const CATEGORY_OPTIONS = [
  { value: '', label: '全部类别' },
  { value: 'skin_hydration', label: '皮肤水分' },
  { value: 'skin_elasticity', label: '皮肤弹性' },
  { value: 'skin_color', label: '皮肤色素' },
  { value: 'skin_imaging', label: '皮肤成像' },
  { value: 'skin_roughness', label: '皮肤粗糙度' },
  { value: 'skin_sebum', label: '皮脂分泌' },
  { value: 'skin_ph', label: '皮肤pH值' },
  { value: 'skin_barrier', label: '皮肤屏障' },
  { value: 'hair_analysis', label: '毛发分析' },
  { value: 'patch_test', label: '斑贴试验' },
  { value: 'efficacy_general', label: '功效综合' },
  { value: 'other', label: '其他' },
]

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-50 text-slate-600',
  active: 'bg-green-50 text-green-700',
  deprecated: 'bg-red-50 text-red-600',
}

export function DetectionMethodPage() {
  const [category, setCategory] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data: listData, isLoading } = useQuery({
    queryKey: ['equipment', 'detection-methods', { category, keyword, page }],
    queryFn: () => equipmentApi.listDetectionMethods({
      category: category || undefined,
      keyword: keyword || undefined,
      page, page_size: 20,
    }),
  })

  const list = (listData as any)?.data as { items: DetectionMethod[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">检测方法</h2>
          <p className="text-sm text-slate-500 mt-1">化妆品功效检测方法模板与资源需求定义</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors">
          <Plus className="w-4 h-4" />新增方法
        </button>
      </div>

      {/* 类别标签 + 搜索 */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 flex-wrap">
          {CATEGORY_OPTIONS.slice(0, 8).map(opt => (
            <button key={opt.value} onClick={() => { setCategory(opt.value); setPage(1) }}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${category === opt.value ? 'bg-cyan-100 text-cyan-700 font-medium' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative ml-auto max-w-xs">
          <input value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1) }} placeholder="搜索方法名称..."
            className="w-full pl-3 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </div>
      </div>

      {/* 方法卡片网格 */}
      {isLoading ? (
        <div className="p-8 text-center text-slate-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">暂无检测方法</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {items.map(m => (
            <div key={m.id} onClick={() => setDetailId(m.id)}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-cyan-300 hover:shadow-sm cursor-pointer transition-all">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-medium text-slate-800">{m.name}</h4>
                  {m.name_en && <p className="text-xs text-slate-400">{m.name_en}</p>}
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[m.status] || ''}`}>
                  {m.status_display}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-3">
                <span className="bg-slate-100 px-2 py-0.5 rounded">{m.category_display}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{m.estimated_duration_minutes}分钟</span>
                {m.temperature_range && <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" />{m.temperature_range}</span>}
                {m.humidity_range && <span className="flex items-center gap-1"><Droplets className="w-3 h-3" />{m.humidity_range}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                <span>设备需求: {m.resource_count}</span>
                <span>人员要求: {m.personnel_count}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">共 {list?.total ?? 0} 个方法</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} title="上一页" className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} title="下一页" className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* 方法详情 */}
      {detailId && <MethodDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}

      {/* 创建方法 */}
      {showCreate && <CreateMethodModal onClose={() => setShowCreate(false)} onSuccess={() => {
        setShowCreate(false)
        queryClient.invalidateQueries({ queryKey: ['equipment', 'detection-methods'] })
      }} />}
    </div>
  )
}

function MethodDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['equipment', 'detection-method', id],
    queryFn: () => equipmentApi.getDetectionMethod(id),
  })

  const m = (detailData as any)?.data as DetectionMethodDetail | undefined

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[560px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{m?.name ?? '检测方法详情'}</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : !m ? (
          <div className="p-8 text-center text-slate-400">方法不存在</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* 基本信息 */}
            <section>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">基本信息</h4>
              <div className="space-y-2 text-sm">
                <div className="flex gap-4"><span className="text-slate-500 w-24">编号</span><span className="text-slate-800 font-mono">{m.code}</span></div>
                <div className="flex gap-4"><span className="text-slate-500 w-24">英文名</span><span className="text-slate-800">{m.name_en || '-'}</span></div>
                <div className="flex gap-4"><span className="text-slate-500 w-24">类别</span><span className="text-slate-800">{m.category_display}</span></div>
                <div className="flex gap-4"><span className="text-slate-500 w-24">检测时长</span><span className="text-slate-800">{m.estimated_duration_minutes} 分钟</span></div>
                <div className="flex gap-4"><span className="text-slate-500 w-24">准备时长</span><span className="text-slate-800">{m.preparation_time_minutes} 分钟</span></div>
                {m.description && <div className="flex gap-4"><span className="text-slate-500 w-24">说明</span><span className="text-slate-800">{m.description}</span></div>}
              </div>
            </section>

            {/* 环境要求 */}
            {(m.temperature_min || m.humidity_min) && (
              <section>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">环境要求</h4>
                <div className="bg-blue-50 rounded-lg p-3 space-y-2 text-sm">
                  {m.temperature_min != null && m.temperature_max != null && (
                    <div className="flex items-center gap-2"><Thermometer className="w-4 h-4 text-blue-600" /><span>温度: {m.temperature_min} ~ {m.temperature_max}°C</span></div>
                  )}
                  {m.humidity_min != null && m.humidity_max != null && (
                    <div className="flex items-center gap-2"><Droplets className="w-4 h-4 text-blue-600" /><span>湿度: {m.humidity_min} ~ {m.humidity_max}%</span></div>
                  )}
                  {m.environment_notes && <p className="text-xs text-blue-700 mt-1">{m.environment_notes}</p>}
                </div>
              </section>
            )}

            {/* 资源需求 */}
            <section>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">资源需求 ({m.resources?.length ?? 0})</h4>
              {(!m.resources || m.resources.length === 0) ? (
                <p className="text-xs text-slate-400">暂无资源需求</p>
              ) : (
                <div className="space-y-2">
                  {m.resources.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                      <div>
                        <span className="font-medium">{r.resource_category__name || r.resource_type}</span>
                        <span className="text-xs text-slate-400 ml-2">× {r.quantity}</span>
                        {r.is_mandatory && <span className="text-xs text-red-500 ml-1">(必须)</span>}
                      </div>
                      {r.recommended_models?.length > 0 && (
                        <span className="text-xs text-slate-400">推荐: {r.recommended_models.join(', ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 人员要求 */}
            <section>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">人员要求 ({m.personnel?.length ?? 0})</h4>
              {(!m.personnel || m.personnel.length === 0) ? (
                <p className="text-xs text-slate-400">暂无人员要求</p>
              ) : (
                <div className="space-y-2">
                  {m.personnel.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                      <span className="font-medium">{p.qualification_name}</span>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{p.level === 'required' ? '必须' : p.level === 'preferred' ? '优先' : '培训中'}</span>
                        {p.min_experience_months > 0 && <span>≥{p.min_experience_months}月经验</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 关键词 */}
            {m.keywords && m.keywords.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">匹配关键词</h4>
                <div className="flex flex-wrap gap-2">
                  {m.keywords.map((k, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">{k}</span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CreateMethodModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    code: '', name: '', name_en: '', category: 'skin_hydration',
    description: '', estimated_duration_minutes: '30', preparation_time_minutes: '10',
    temperature_min: '', temperature_max: '', humidity_min: '', humidity_max: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => equipmentApi.createDetectionMethod({
      code: form.code, name: form.name, category: form.category,
      name_en: form.name_en || undefined,
      description: form.description || undefined,
      estimated_duration_minutes: Number(form.estimated_duration_minutes) || 30,
      preparation_time_minutes: Number(form.preparation_time_minutes) || 10,
      temperature_min: form.temperature_min ? Number(form.temperature_min) : undefined,
      temperature_max: form.temperature_max ? Number(form.temperature_max) : undefined,
      humidity_min: form.humidity_min ? Number(form.humidity_min) : undefined,
      humidity_max: form.humidity_max ? Number(form.humidity_max) : undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[540px] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">新增检测方法</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">方法编号 *</span>
              <input value={form.code} onChange={e => set('code', e.target.value)} placeholder="如 DM-CORN-001"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">类别 *</span>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                {CATEGORY_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">方法名称 *</span>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="如 Corneometer 皮肤水分测量"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">英文名称</span>
            <input value={form.name_en} onChange={e => set('name_en', e.target.value)} placeholder="Corneometer Skin Hydration Measurement"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">方法说明</span>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">检测时长（分钟）</span>
              <input type="number" value={form.estimated_duration_minutes} onChange={e => set('estimated_duration_minutes', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">准备时长（分钟）</span>
              <input type="number" value={form.preparation_time_minutes} onChange={e => set('preparation_time_minutes', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
          </div>

          <p className="text-xs text-slate-500 font-medium mt-2">环境要求</p>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-slate-600">温度范围（°C）</span>
              <div className="flex gap-2 mt-1">
                <input type="number" value={form.temperature_min} onChange={e => set('temperature_min', e.target.value)} placeholder="20" className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                <span className="text-slate-400 self-center">~</span>
                <input type="number" value={form.temperature_max} onChange={e => set('temperature_max', e.target.value)} placeholder="24" className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
              </div>
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">湿度范围（%）</span>
              <div className="flex gap-2 mt-1">
                <input type="number" value={form.humidity_min} onChange={e => set('humidity_min', e.target.value)} placeholder="40" className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                <span className="text-slate-400 self-center">~</span>
                <input type="number" value={form.humidity_max} onChange={e => set('humidity_max', e.target.value)} placeholder="60" className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
              </div>
            </label>
          </div>

          <div className="pt-2 flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button onClick={() => mutation.mutate()} disabled={!form.code || !form.name || mutation.isPending}
              className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors">
              {mutation.isPending ? '创建中...' : '创建方法'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
