import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { labPersonnelApi } from '@cn-kis/api-client'
import type { StaffItem, StaffDetail } from '@cn-kis/api-client'
import { Users, Plus, Search, X, ShieldCheck } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

const ROLE_OPTIONS = [
  { value: '', label: '全部角色' },
  { value: 'instrument_operator', label: '仪器操作员' },
  { value: 'medical_evaluator', label: '医学评估员' },
  { value: 'site_assistant', label: '现场辅助人员' },
  { value: 'logistics_support', label: '后勤支持人员' },
  { value: 'qa_auditor', label: 'QA审计员' },
  { value: 'lab_supervisor', label: '实验室主管' },
]

const LEVEL_OPTIONS = [
  { value: '', label: '全部等级' },
  { value: 'L1', label: 'L1 学习期' },
  { value: 'L2', label: 'L2 见习期' },
  { value: 'L3', label: 'L3 独立期' },
  { value: 'L4', label: 'L4 专家期' },
  { value: 'L5', label: 'L5 带教导师' },
]

export function StaffListPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ lab_role: 'instrument_operator', employment_type: 'full_time', competency_level: 'L1' })
  const [createMsg, setCreateMsg] = useState('')

  const { data: listData } = useQuery({
    queryKey: ['lab-personnel', 'staff', { keyword, roleFilter, levelFilter }],
    queryFn: () => labPersonnelApi.getStaffList({
      ...(keyword ? { search: keyword } : {}),
      ...(roleFilter ? { lab_role: roleFilter } : {}),
      ...(levelFilter ? { competency_level: levelFilter } : {}),
    }),
  })
  const items = ((listData as any)?.data as { items: StaffItem[] } | undefined)?.items ?? []
  const total = ((listData as any)?.data as { total: number } | undefined)?.total ?? 0

  const { data: detailData } = useQuery({
    queryKey: ['lab-personnel', 'staff-detail', detailId],
    queryFn: () => labPersonnelApi.getStaffDetail(detailId!),
    enabled: detailId !== null,
  })
  const detail = (detailData as any)?.data as StaffDetail | undefined

  const levelBadge = (level: string, display: string) => {
    const cls: Record<string, string> = {
      L1: 'bg-slate-100 text-slate-600',
      L2: 'bg-blue-50 text-blue-600',
      L3: 'bg-green-50 text-green-600',
      L4: 'bg-violet-50 text-violet-600',
      L5: 'bg-amber-50 text-amber-700',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[level] || 'bg-slate-100 text-slate-600'}`} data-level={level}>{display}</span>
  }

  const gcpBadge = (status: string) => {
    if (status === 'valid') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-600" data-gcp="valid" data-badge="gcp">GCP有效</span>
    if (status === 'expiring') return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-600" data-gcp="expiring" data-badge="gcp">GCP即将过期</span>
    return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600" data-gcp="expired" data-badge="gcp">GCP已过期</span>
  }

  async function handleCreate() {
    if (!detailId) return
    try {
      await labPersonnelApi.upsertProfile(detailId, createForm)
      setCreateMsg('档案创建成功')
      setTimeout(() => { setShowCreate(false); setCreateMsg('') }, 1500)
    } catch { setCreateMsg('创建失败') }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">人员档案</h2>
          <p className="text-sm text-slate-500 mt-1">实验室一线人员档案管理 — 仪器操作员、医学评估员、现场辅助人员等</p>
        </div>
        <PermissionGuard permission="lab-personnel.staff.create">
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors">
            <Plus className="w-4 h-4" />新增档案
          </button>
        </PermissionGuard>
      </div>

      {/* Stat Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4" data-stat="total">
          <p className="text-sm text-slate-500">在册总数</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">{total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4" data-stat="active">
          <p className="text-sm text-slate-500">在岗人员</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{items.filter(i => i.is_active).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4" data-stat="gcp_warning">
          <p className="text-sm text-slate-500">GCP预警</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{items.filter(i => i.gcp_status === 'expiring').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4" data-stat="high_level">
          <p className="text-sm text-slate-500">L3+高级人员</p>
          <p className="text-2xl font-bold mt-1 text-violet-600">{items.filter(i => ['L3', 'L4', 'L5'].includes(i.competency_level)).length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[220px] flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="搜索姓名、工号或手机号" value={keyword} onChange={e => setKeyword(e.target.value)} title="搜索姓名工号手机号"
            className="min-h-11 w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" aria-label="实验室角色" title="实验室角色筛选">
          {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" aria-label="能力等级" title="能力等级筛选">
          {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Staff Cards Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-4" data-section="staff-list">
        {items.map(staff => (
          <div key={staff.id} className="staff-card bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md transition-shadow" data-staff-item onClick={() => navigate(`/staff/${staff.staff_id}`)}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-medium text-slate-800">{staff.staff_name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{staff.employee_no} · {staff.department}</p>
              </div>
              {levelBadge(staff.competency_level, staff.competency_level_display)}
            </div>
            <div className="space-y-1.5 text-sm text-slate-600">
              <p>{staff.lab_role_display}</p>
              <p className="text-xs">{staff.employment_type_display}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">{staff.position}</span>
              {gcpBadge(staff.gcp_status)}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>暂无人员数据</p>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {detailId !== null && detail && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setDetailId(null)} />
          <div className="ml-auto w-[92vw] max-w-[560px] bg-white h-full overflow-auto shadow-xl relative z-10" data-module="staff-detail">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">人员详情</h3>
              <button title="关闭详情" onClick={() => setDetailId(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-medium text-slate-800 text-lg">{detail.staff_name}</h4>
                <p className="text-sm text-slate-500">{detail.employee_no} · {detail.department} · {detail.position}</p>
                <div className="flex gap-2 mt-2">
                  {levelBadge(detail.competency_level, detail.competency_level_display)}
                  {gcpBadge(detail.gcp_status)}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-slate-700 mb-2">基本信息</h5>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">角色</p><p className="font-semibold">{detail.lab_role_display}</p></div>
                  <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">用工类型</p><p className="font-semibold">{detail.employment_type_display}</p></div>
                  <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">每日上限</p><p className="font-semibold">{detail.max_daily_hours}h</p></div>
                  <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500">每周上限</p><p className="font-semibold">{detail.max_weekly_hours}h</p></div>
                </div>
              </div>
              <div data-section="certificates">
                <h5 className="text-sm font-medium text-slate-700 mb-2">持有证书 ({detail.certificates?.length ?? 0})</h5>
                <div className="space-y-2">
                  {detail.certificates?.map(cert => (
                    <div key={cert.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3 text-sm">
                      <div>
                        <span className="font-medium">{cert.cert_name}</span>
                        <span className="text-slate-400 ml-2">{cert.cert_type_display}</span>
                      </div>
                      <span className={`text-xs ${cert.status === 'valid' ? 'text-green-600' : cert.status === 'expiring' ? 'text-yellow-600' : 'text-red-600'}`}>
                        {cert.status_display}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div data-section="method-qualifications">
                <h5 className="text-sm font-medium text-slate-700 mb-2">
                  <ShieldCheck className="w-4 h-4 inline mr-1" />方法资质 ({detail.method_qualifications?.length ?? 0})
                </h5>
                <div className="space-y-2">
                  {detail.method_qualifications?.map(mq => (
                    <div key={mq.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3 text-sm">
                      <div>
                        <span className="font-medium">{mq.method_name}</span>
                        <span className="text-slate-400 ml-2">{mq.method_code}</span>
                      </div>
                      {levelBadge(mq.level, mq.level_display)}
                    </div>
                  ))}
                </div>
              </div>
              {detail.risk_alerts && detail.risk_alerts.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-red-700 mb-2">关联风险 ({detail.risk_alerts.length})</h5>
                  {detail.risk_alerts.map(r => (
                    <div key={r.id} className="bg-red-50 rounded-lg p-3 text-sm mb-2">
                      <p className="font-medium text-red-700">{r.title}</p>
                      <p className="text-red-500 text-xs">{r.risk_type_display} · {r.level_display}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowCreate(false); setCreateMsg('') }} />
          <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto relative z-10">
            <h3 className="text-lg font-semibold mb-4">新增实验室人员档案</h3>
            {createMsg && <div className="mb-4 p-3 bg-violet-50 text-violet-700 rounded-lg text-sm">{createMsg}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">实验室角色</label>
                <select value={createForm.lab_role} onChange={e => setCreateForm(p => ({ ...p, lab_role: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" aria-label="新增实验室角色" title="新增实验室角色">
                  {ROLE_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">用工类型</label>
                <select value={createForm.employment_type} onChange={e => setCreateForm(p => ({ ...p, employment_type: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" aria-label="用工类型" title="用工类型">
                  <option value="full_time">全职</option>
                  <option value="part_time">兼职</option>
                  <option value="contractor">外包</option>
                  <option value="intern">实习</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">初始能力等级</label>
                <select value={createForm.competency_level} onChange={e => setCreateForm(p => ({ ...p, competency_level: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" aria-label="能力等级" title="初始能力等级">
                  {LEVEL_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); setCreateMsg('') }} className="min-h-11 px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={handleCreate} className="min-h-11 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
