import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recruitmentApi } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ErrorAlert } from '../components/ErrorAlert'
import { Pagination } from '../components/Pagination'
import { Search, CheckCircle, XCircle, ChevronRight } from 'lucide-react'

interface CriteriaItem {
  name: string
  met: boolean | null
  notes: string
}

const defaultInclusionCriteria: string[] = [
  '年龄符合入组范围（18-65岁）',
  '知情同意书已签署',
  '符合疾病诊断标准',
  '未参加其他临床试验',
  '实验室检查指标符合要求',
]

const defaultExclusionCriteria: string[] = [
  '妊娠期或哺乳期',
  '严重肝/肾功能不全',
  '近3月内参加过其他临床试验',
  '已知对试验药物过敏',
  '合并严重心血管疾病',
]

export default function ScreeningPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selectedReg, setSelectedReg] = useState<{ id: number; name: string } | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'registrations', 'screening', page],
    queryFn: async () => {
      const res = await recruitmentApi.listRegistrations({ status: 'screening', page, page_size: 20 })
      if (!res?.data) throw new Error('获取筛选列表失败')
      return res
    },
  })

  const allItems = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const items = keyword ? allItems.filter((r: { name: string; registration_no: string; phone: string }) => r.name.includes(keyword) || r.registration_no.includes(keyword) || r.phone.includes(keyword)) : allItems

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">筛选管理</h2>
        <p className="text-sm text-slate-500 mt-1">逐项检查入排标准、记录生命体征，完成筛选评估</p>
      </div>

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={searchInput} title="搜索姓名编号手机" onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setKeyword(searchInput)} placeholder="搜索姓名/编号/手机" className="min-h-11 w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <span className="shrink-0 self-center text-sm text-slate-400">共 {total} 条待筛选</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">{keyword ? '无匹配结果' : '暂无待筛选记录'}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((reg: { id: number; registration_no: string; name: string; phone: string; gender?: string; age?: number; create_time?: string }) => (
              <div key={reg.id} className="flex flex-col gap-2 px-4 py-3 hover:bg-slate-50 cursor-pointer sm:flex-row sm:items-center sm:justify-between" onClick={() => setSelectedReg({ id: reg.id, name: reg.name })}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600">{reg.name[0]}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{reg.name}</span>
                      <span className="text-xs text-slate-400">{reg.registration_no}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{reg.phone} · {reg.gender === 'male' ? '男' : reg.gender === 'female' ? '女' : '-'} · {reg.age ?? '-'}岁 · 报名于 {reg.create_time?.slice(0, 10)}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            ))}
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={20} total={total} onChange={setPage} />

      {selectedReg && (
        <ScreeningDetailModal
          regId={selectedReg.id}
          regName={selectedReg.name}
          onClose={() => setSelectedReg(null)}
          onComplete={() => { setSelectedReg(null); queryClient.invalidateQueries({ queryKey: ['recruitment'] }) }}
        />
      )}
    </div>
  )
}

function ScreeningDetailModal({ regId, regName, onClose, onComplete }: { regId: number; regName: string; onClose: () => void; onComplete: () => void }) {
  const [inclusionCriteria, setInclusionCriteria] = useState<CriteriaItem[]>(
    defaultInclusionCriteria.map((name) => ({ name, met: null, notes: '' }))
  )
  const [exclusionCriteria, setExclusionCriteria] = useState<CriteriaItem[]>(
    defaultExclusionCriteria.map((name) => ({ name, met: null, notes: '' }))
  )
  const [vitalSigns, setVitalSigns] = useState({
    blood_pressure_systolic: '',
    blood_pressure_diastolic: '',
    heart_rate: '',
    temperature: '',
    weight: '',
    height: '',
  })
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState<'criteria' | 'vitals' | 'confirm'>('criteria')

  const completeMutation = useMutation({
    mutationFn: async (result: string) => {
      const vitalData: Record<string, number> = {}
      if (vitalSigns.blood_pressure_systolic) vitalData.blood_pressure_systolic = Number(vitalSigns.blood_pressure_systolic)
      if (vitalSigns.blood_pressure_diastolic) vitalData.blood_pressure_diastolic = Number(vitalSigns.blood_pressure_diastolic)
      if (vitalSigns.heart_rate) vitalData.heart_rate = Number(vitalSigns.heart_rate)
      if (vitalSigns.temperature) vitalData.temperature = Number(vitalSigns.temperature)
      if (vitalSigns.weight) vitalData.weight = Number(vitalSigns.weight)
      if (vitalSigns.height) vitalData.height = Number(vitalSigns.height)

      return recruitmentApi.completeScreening(regId, {
        result,
        inclusion_criteria: inclusionCriteria.map((c) => ({ name: c.name, met: c.met ?? false, notes: c.notes })),
        exclusion_criteria: exclusionCriteria.map((c) => ({ name: c.name, met: c.met ?? false, notes: c.notes })),
        vital_signs: Object.keys(vitalData).length > 0 ? vitalData : undefined,
        notes,
      } as any)
    },
    onSuccess: (_d, result) => {
      toast.success(result === 'pass' ? `${regName} 筛选通过` : `${regName} 筛选不通过`)
      onComplete()
    },
    onError: (err) => toast.error((err as Error).message || '筛选操作失败'),
  })

  const allInclusionMet = inclusionCriteria.every((c) => c.met === true)
  const noExclusionMet = exclusionCriteria.every((c) => c.met === false)
  const allCriteriaChecked = inclusionCriteria.every((c) => c.met !== null) && exclusionCriteria.every((c) => c.met !== null)
  const canPass = allInclusionMet && noExclusionMet

  const updateCriteria = (list: CriteriaItem[], setList: (v: CriteriaItem[]) => void, idx: number, met: boolean) => {
    const updated = [...list]
    updated[idx] = { ...updated[idx], met }
    setList(updated)
  }

  const updateCriteriaNotes = (list: CriteriaItem[], setList: (v: CriteriaItem[]) => void, idx: number, text: string) => {
    const updated = [...list]
    updated[idx] = { ...updated[idx], notes: text }
    setList(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-4 md:px-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">筛选评估 — {regName}</h3>
            <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
              {(['criteria', 'vitals', 'confirm'] as const).map((s, i) => (
                  <button key={s} onClick={() => setStep(s)} className={`shrink-0 min-h-9 text-xs px-2 py-0.5 rounded ${step === s ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-slate-400'}`}>
                  {i + 1}. {s === 'criteria' ? '入排标准' : s === 'vitals' ? '生命体征' : '确认提交'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="min-h-10 min-w-10 text-slate-400 hover:text-slate-600 text-lg" title="关闭">&times;</button>
        </div>

        <div className="p-4 md:p-6">
          {step === 'criteria' && (
            <div className="space-y-6">
              <CriteriaSection title="入组标准" subtitle="全部满足方可入组" items={inclusionCriteria} expectedMet={true} onToggle={(i, v) => updateCriteria(inclusionCriteria, setInclusionCriteria, i, v)} onNote={(i, t) => updateCriteriaNotes(inclusionCriteria, setInclusionCriteria, i, t)} />
              <CriteriaSection title="排除标准" subtitle="任一满足则不可入组" items={exclusionCriteria} expectedMet={false} onToggle={(i, v) => updateCriteria(exclusionCriteria, setExclusionCriteria, i, v)} onNote={(i, t) => updateCriteriaNotes(exclusionCriteria, setExclusionCriteria, i, t)} />
              <div className="flex justify-end">
                <button onClick={() => setStep('vitals')} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">下一步：生命体征</button>
              </div>
            </div>
          )}

          {step === 'vitals' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700">生命体征记录</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <VitalInput label="收缩压 (mmHg)" value={vitalSigns.blood_pressure_systolic} onChange={(v) => setVitalSigns({ ...vitalSigns, blood_pressure_systolic: v })} placeholder="如 120" />
                <VitalInput label="舒张压 (mmHg)" value={vitalSigns.blood_pressure_diastolic} onChange={(v) => setVitalSigns({ ...vitalSigns, blood_pressure_diastolic: v })} placeholder="如 80" />
                <VitalInput label="心率 (bpm)" value={vitalSigns.heart_rate} onChange={(v) => setVitalSigns({ ...vitalSigns, heart_rate: v })} placeholder="如 72" />
                <VitalInput label="体温 (°C)" value={vitalSigns.temperature} onChange={(v) => setVitalSigns({ ...vitalSigns, temperature: v })} placeholder="如 36.5" />
                <VitalInput label="体重 (kg)" value={vitalSigns.weight} onChange={(v) => setVitalSigns({ ...vitalSigns, weight: v })} placeholder="如 65" />
                <VitalInput label="身高 (cm)" value={vitalSigns.height} onChange={(v) => setVitalSigns({ ...vitalSigns, height: v })} placeholder="如 170" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">备注</label>
                <textarea value={notes} title="筛选备注" onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={3} placeholder="筛选过程备注..." />
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep('criteria')} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">上一步</button>
                <button onClick={() => setStep('confirm')} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">下一步：确认</button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700">筛选结果确认</h4>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">入组标准</span>
                  <span className={allInclusionMet ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                    {inclusionCriteria.filter((c) => c.met === true).length}/{inclusionCriteria.length} 满足
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">排除标准</span>
                  <span className={noExclusionMet ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                    {exclusionCriteria.filter((c) => c.met === true).length}/{exclusionCriteria.length} 命中
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">自动判定</span>
                  {!allCriteriaChecked ? (
                    <span className="text-amber-600 font-medium">尚未完全检查</span>
                  ) : canPass ? (
                    <span className="text-emerald-600 font-bold">建议通过</span>
                  ) : (
                    <span className="text-red-600 font-bold">建议不通过</span>
                  )}
                </div>
              </div>

              {!allCriteriaChecked && (
                <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  提示：尚有未检查的标准项，请返回逐项确认后再提交。
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep('vitals')} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">上一步</button>
                <div className="flex gap-3">
                  <button onClick={() => completeMutation.mutate('fail')} disabled={completeMutation.isPending} className="min-h-11 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                    {completeMutation.isPending ? '处理中...' : '筛选不通过'}
                  </button>
                  <button onClick={() => completeMutation.mutate('pass')} disabled={completeMutation.isPending || !canPass} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50" title={!canPass ? '入排标准不满足，无法通过' : undefined}>
                    {completeMutation.isPending ? '处理中...' : '筛选通过'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CriteriaSection({ title, subtitle, items, expectedMet, onToggle, onNote }: {
  title: string; subtitle: string; items: CriteriaItem[]; expectedMet: boolean
  onToggle: (idx: number, met: boolean) => void; onNote: (idx: number, text: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>
      <div className="space-y-2">
        {items.map((c, i) => {
          const isGood = (expectedMet && c.met === true) || (!expectedMet && c.met === false)
          const isBad = c.met !== null && !isGood
          return (
            <div key={i} className={`rounded-lg border px-3 py-2 ${c.met === null ? 'border-slate-200 bg-white' : isGood ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">{c.name}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => onToggle(i, true)} className={`min-h-9 min-w-9 p-1 rounded-full transition-colors ${c.met === true ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-emerald-100'}`} title="满足">
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button onClick={() => onToggle(i, false)} className={`min-h-9 min-w-9 p-1 rounded-full transition-colors ${c.met === false ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-red-100'}`} title="不满足">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {isBad && (
                <input value={c.notes} onChange={(e) => onNote(i, e.target.value)} title="不满足原因" placeholder="请说明原因..." className="mt-2 min-h-10 w-full text-xs px-2 py-1.5 border border-slate-200 rounded bg-white" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VitalInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} title={label} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
    </div>
  )
}
