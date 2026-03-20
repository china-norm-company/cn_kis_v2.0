import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { subjectApi, executionApi, loyaltyApi } from '@cn-kis/api-client'
import { ErrorAlert } from '../components/ErrorAlert'
import { toast } from '../hooks/useToast'
import { Edit3, Save, X, Heart } from 'lucide-react'

type Tab = 'profile' | 'medical' | 'domain' | 'enrollments' | 'loyalty' | 'timeline'

export default function SubjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const subjectId = Number(id)
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subject', subjectId],
    queryFn: async () => { const res = await subjectApi.get(subjectId); if (!res?.data) throw new Error('获取受试者信息失败'); return res },
    enabled: !!subjectId,
  })

  const subject = data?.data

  if (isLoading) return <div className="space-y-4 p-6">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
  if (error) return <div className="p-6"><ErrorAlert message={(error as Error).message} onRetry={() => refetch()} /></div>
  if (!subject) return <div className="text-sm text-slate-400 py-12 text-center">受试者不存在</div>

  const tabs: { key: Tab; label: string; icon?: React.ReactNode }[] = [
    { key: 'profile', label: '主档案' }, { key: 'medical', label: '医学史/过敏/用药' },
    { key: 'domain', label: '领域档案' }, { key: 'enrollments', label: '入组记录' },
    { key: 'loyalty', label: '忠诚度', icon: <Heart className="w-3.5 h-3.5" /> },
    { key: 'timeline', label: '时间线' },
  ]

  const riskLabels: Record<string, string> = { low: '低', medium: '中', high: '高' }
  const riskColors: Record<string, string> = { low: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700' }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/subjects')} className="text-sm text-slate-400 hover:text-slate-600">&larr; 返回列表</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold">{subject.name?.charAt(0)}</div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-800">{subject.name}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
              <span>{subject.subject_no || '未分配编号'}</span>
              <span>{subject.gender || '-'} / {subject.age ?? '-'}岁</span>
              <span>{subject.phone}</span>
              {subject.source_channel && <span>来源: {subject.source_channel}</span>}
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${riskColors[subject.risk_level] || 'bg-slate-100'}`}>{riskLabels[subject.risk_level] || subject.risk_level} 风险</span>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`pb-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${activeTab === tab.key ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.icon}{tab.label}</button>
          ))}
        </div>
      </div>

      {activeTab === 'profile' && <ProfileTab subjectId={subjectId} />}
      {activeTab === 'medical' && <MedicalTab subjectId={subjectId} />}
      {activeTab === 'domain' && <DomainTab subjectId={subjectId} />}
      {activeTab === 'enrollments' && <EnrollmentsTab subjectId={subjectId} />}
      {activeTab === 'loyalty' && <LoyaltyTab subjectId={subjectId} />}
      {activeTab === 'timeline' && <TimelineTab subjectId={subjectId} />}
    </div>
  )
}

function ProfileTab({ subjectId }: { subjectId: number }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subject', subjectId, 'profile'],
    queryFn: async () => { const res = await executionApi.getSubjectProfile(subjectId); return res },
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      return executionApi.updateSubjectProfile(subjectId, editForm)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subject', subjectId, 'profile'] })
      toast.success('档案已更新')
      setEditing(false)
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })

  const profile = data?.data
  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-6 bg-slate-100 rounded animate-pulse" />)}</div>
  if (error) return <ErrorAlert message="加载档案失败" onRetry={() => refetch()} />
  if (!profile) return <div className="text-sm text-slate-400 py-8 text-center">暂无档案信息</div>

  const editableFields = [
    { key: 'birth_date', label: '出生日期' }, { key: 'ethnicity', label: '民族' },
    { key: 'education', label: '学历' }, { key: 'occupation', label: '职业' },
    { key: 'marital_status', label: '婚姻状况' },
    { key: 'province', label: '省' }, { key: 'city', label: '市' }, { key: 'district', label: '区' },
    { key: 'address', label: '详细地址' }, { key: 'phone_backup', label: '备用电话' },
    { key: 'email', label: '邮箱' }, { key: 'emergency_contact_name', label: '紧急联系人' },
    { key: 'emergency_contact_phone', label: '紧急联系电话' },
  ]

  const displayFields = [
    ...editableFields,
    { key: 'first_screening_date', label: '首次筛选日期' },
    { key: 'first_enrollment_date', label: '首次入组日期' },
    { key: 'total_enrollments', label: '参与项目数' },
    { key: 'total_completed', label: '完成项目数' },
  ]

  const startEdit = () => {
    const form: Record<string, string> = {}
    editableFields.forEach((f) => { form[f.key] = String(profile[f.key as keyof typeof profile] ?? '') })
    setEditForm(form)
    setEditing(true)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">基本档案信息</h3>
        {editing ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"><X className="w-3.5 h-3.5" /> 取消</button>
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"><Save className="w-3.5 h-3.5" /> {updateMutation.isPending ? '保存中...' : '保存'}</button>
          </div>
        ) : (
          <button onClick={startEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg"><Edit3 className="w-3.5 h-3.5" /> 编辑</button>
        )}
      </div>
      {editing ? (
        <div className="grid grid-cols-3 gap-4">
          {editableFields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
              <input value={editForm[f.key] || ''} onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm" title={f.label} placeholder={f.label} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {displayFields.map((f) => (<div key={f.key}><p className="text-xs text-slate-500">{f.label}</p><p className="text-sm text-slate-700 mt-0.5">{String(profile[f.key as keyof typeof profile] ?? '-')}</p></div>))}
        </div>
      )}
      <div className="mt-6 pt-4 border-t border-slate-100">
        <h4 className="text-xs font-medium text-slate-500 mb-2">隐私设置</h4>
        <div className="flex gap-4 text-sm">
          <Privacy label="数据共享" value={profile.consent_data_sharing} />
          <Privacy label="真实世界研究" value={profile.consent_rwe_usage} />
          <Privacy label="生物样本库" value={profile.consent_biobank} />
          <Privacy label="后续随访" value={profile.consent_follow_up} />
        </div>
      </div>
    </div>
  )
}

function Privacy({ label, value }: { label: string; value: boolean }) {
  return <span className={`px-2 py-0.5 rounded text-xs ${value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{label}: {value ? '已同意' : '未同意'}</span>
}

function MedicalTab({ subjectId }: { subjectId: number }) {
  const historyQuery = useQuery({ queryKey: ['subject', subjectId, 'medical-history'], queryFn: () => executionApi.listMedicalHistory(subjectId) })
  const allergyQuery = useQuery({ queryKey: ['subject', subjectId, 'allergies'], queryFn: () => executionApi.listAllergies(subjectId) })
  const medQuery = useQuery({ queryKey: ['subject', subjectId, 'medications'], queryFn: () => executionApi.listMedications(subjectId) })

  return (
    <div className="space-y-4">
      <RecordList title="既往病史" items={historyQuery.data?.data?.items} loading={historyQuery.isLoading} error={historyQuery.error} onRetry={() => historyQuery.refetch()} fields={['disease_name', 'diagnosis_date', 'current_status']} />
      <RecordList title="过敏记录" items={allergyQuery.data?.data?.items} loading={allergyQuery.isLoading} error={allergyQuery.error} onRetry={() => allergyQuery.refetch()} fields={['allergen', 'reaction_type', 'severity']} />
      <RecordList title="合并用药" items={medQuery.data?.data?.items} loading={medQuery.isLoading} error={medQuery.error} onRetry={() => medQuery.refetch()} fields={['drug_name', 'dosage', 'indication']} />
    </div>
  )
}

function RecordList({ title, items, loading, error, onRetry, fields }: { title: string; items?: Record<string, unknown>[]; loading: boolean; error?: unknown; onRetry: () => void; fields: string[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      {loading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        : error ? <ErrorAlert message={`加载${title}失败`} onRetry={onRetry} />
        : !items || items.length === 0 ? <div className="text-sm text-slate-400 py-4 text-center">暂无记录</div>
        : <div className="space-y-2">{items.map((item, idx) => (<div key={(item.id as number) ?? idx} className="flex items-center gap-4 p-2 rounded bg-slate-50 text-sm">{fields.map((f) => <span key={f} className="text-slate-600">{String(item[f] ?? '-')}</span>)}</div>))}</div>}
    </div>
  )
}

function DomainTab({ subjectId }: { subjectId: number }) {
  const [domain, setDomain] = useState('skin')
  const domains = ['skin', 'oral', 'nutrition', 'exposure']
  const domainLabels: Record<string, string> = { skin: '皮肤', oral: '口腔', nutrition: '营养', exposure: '暴露' }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subject', subjectId, 'domain', domain],
    queryFn: () => executionApi.getDomainProfile(subjectId, domain),
  })
  const profile = data?.data

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-slate-700">领域档案</h3>
        <div className="flex gap-1">
          {domains.map((d) => (<button key={d} onClick={() => setDomain(d)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${domain === d ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{domainLabels[d]}</button>))}
        </div>
      </div>
      {isLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-6 bg-slate-100 rounded animate-pulse" />)}</div>
        : error ? <ErrorAlert message="加载领域档案失败" onRetry={() => refetch()} />
        : !profile || Object.keys(profile).length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">暂无 {domainLabels[domain]} 领域档案</div>
        : <div className="grid grid-cols-3 gap-4">{Object.entries(profile).filter(([k]) => !['id', 'subject', 'create_time', 'update_time'].includes(k)).map(([key, value]) => (<div key={key}><p className="text-xs text-slate-500">{key}</p><p className="text-sm text-slate-700 mt-0.5">{String(value ?? '-')}</p></div>))}</div>}
    </div>
  )
}

function EnrollmentsTab({ subjectId }: { subjectId: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subject', subjectId, 'enrollments'],
    queryFn: () => subjectApi.listEnrollments({ subject_id: subjectId }),
  })
  const items = data?.data?.items ?? []

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">入组记录</h3>
      {isLoading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        : error ? <ErrorAlert message="加载入组记录失败" onRetry={() => refetch()} />
        : items.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">暂无入组记录</div>
        : <table className="w-full text-sm"><thead><tr className="border-b border-slate-200"><th className="text-left py-2 font-medium text-slate-600">项目</th><th className="text-left py-2 font-medium text-slate-600">状态</th><th className="text-left py-2 font-medium text-slate-600">入组时间</th></tr></thead><tbody>{items.map((e: { id: number; protocol_title?: string; protocol_id: number; status: string; enrolled_at?: string }) => (<tr key={e.id} className="border-b border-slate-100"><td className="py-2 text-slate-700">{e.protocol_title || `协议 #${e.protocol_id}`}</td><td className="py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${e.status === 'enrolled' ? 'bg-emerald-100 text-emerald-700' : e.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{e.status}</span></td><td className="py-2 text-slate-500">{e.enrolled_at?.slice(0, 10) || '-'}</td></tr>))}</tbody></table>}
    </div>
  )
}

function LoyaltyTab({ subjectId }: { subjectId: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loyalty', 'subject', subjectId],
    queryFn: () => loyaltyApi.getLoyalty(subjectId),
  })

  const referralsQuery = useQuery({
    queryKey: ['loyalty', 'referrals', subjectId],
    queryFn: () => loyaltyApi.listReferrals(subjectId),
  })

  const loyalty = data?.data
  const referralsData = referralsQuery.data?.data as any
  const referrals = referralsData?.items ?? referralsData?.referrals_made ?? []

  const riskLabels: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' }
  const riskColors: Record<string, string> = { low: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700' }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">忠诚度评分</h3>
        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : error ? (
          <ErrorAlert message="加载忠诚度数据失败" onRetry={() => refetch()} />
        ) : !loyalty ? (
          <div className="text-sm text-slate-400 py-6 text-center">暂无忠诚度数据</div>
        ) : (
          <div className="grid grid-cols-5 gap-4">
            <ScoreCard label="总评分" value={loyalty.total_score} className="text-indigo-600" />
            <ScoreCard label="参与次数" value={loyalty.participation_count} className="text-sky-600" />
            <ScoreCard label="完成次数" value={loyalty.completion_count} className="text-emerald-600" />
            <ScoreCard label="依从性" value={`${loyalty.compliance_avg}%`} className="text-amber-600" />
            <div>
              <p className="text-xs text-slate-500 mb-1">风险等级</p>
              <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${riskColors[loyalty.risk_level] || 'bg-slate-100'}`}>{riskLabels[loyalty.risk_level] || loyalty.risk_level}</span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">推荐记录</h3>
        {referralsQuery.isLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : referralsQuery.error ? (
          <ErrorAlert message="加载推荐记录失败" onRetry={() => referralsQuery.refetch()} />
        ) : referrals.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">暂无推荐记录</div>
        ) : (
          <div className="space-y-2">
            {referrals.map((r: { id: number; referred_subject_id: number; referral_date: string; status: string; bonus_points: number }) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                <div>
                  <span className="text-sm font-medium text-slate-700">推荐受试者 #{r.referred_subject_id}</span>
                  <span className="text-xs text-slate-400 ml-2">{r.referral_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'enrolled' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                  {r.bonus_points > 0 && <span className="text-xs text-amber-600 font-medium">+{r.bonus_points}分</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreCard({ label, value, className }: { label: string; value: string | number; className: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${className}`}>{value}</p>
    </div>
  )
}

function TimelineTab({ subjectId }: { subjectId: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subject', subjectId, 'timeline'],
    queryFn: () => executionApi.getSubjectTimeline(subjectId),
  })
  const items = data?.data?.items ?? []

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">时间线</h3>
      {isLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        : error ? <ErrorAlert message="加载时间线失败" onRetry={() => refetch()} />
        : items.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">暂无时序数据</div>
        : <div className="space-y-3">{items.map((event: { id?: number; type: string; measured_at: string; summary: string; source?: string }, idx: number) => (<div key={event.id ?? idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50"><div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" /><div className="flex-1"><div className="flex items-center gap-2"><span className="text-xs font-medium text-slate-500">{event.type}</span><span className="text-xs text-slate-400">{event.measured_at}</span></div><p className="text-sm text-slate-700 mt-0.5">{event.summary}</p>{event.source && <span className="text-xs text-slate-400">来源: {event.source}</span>}</div></div>))}</div>}
    </div>
  )
}
