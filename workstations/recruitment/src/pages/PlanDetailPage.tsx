import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recruitmentApi } from '@cn-kis/api-client'
import type { RecruitmentPlan, RecruitTemplateAd } from '@cn-kis/api-client'
import { completionRatePercent } from '../utils/planDisplay'
import { toast } from '../hooks/useToast'
import { ErrorAlert } from '../components/ErrorAlert'
import { BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type Tab = 'project' | 'material' | 'channel'

const MATERIAL_PREP_LABELS: Record<string, string> = {
  draft: '草稿',
  in_progress: '进行中',
  published: '发布',
}

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const planId = Number(id)
  const [activeTab, setActiveTab] = useState<Tab>('project')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'plan', planId],
    queryFn: async () => { const res = await recruitmentApi.getPlan(planId); if (!res?.data) throw new Error('获取计划详情失败'); return res },
    enabled: !!planId,
  })

  const plan = data?.data

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
  if (error) return <div className="py-6"><ErrorAlert message={(error as Error).message} onRetry={() => refetch()} /></div>
  if (!plan) return <div className="text-sm text-slate-400 py-12 text-center">计划不存在</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'project', label: '项目信息' },
    { key: 'material', label: '物料准备' },
    { key: 'channel', label: '渠道准备' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/plans')} className="text-sm text-slate-400 hover:text-slate-600">&larr; 返回列表</button>
        <h2 className="text-xl font-bold text-slate-800">{plan.title}</h2>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">{plan.status}</span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatMini label="目标" value={plan.target_count} />
        <StatMini label="报名" value={plan.registered_count} />
        <StatMini
          label="筛选"
          value={plan.screened_count}
          title={plan.display_project_code ? `与项目编号「${plan.display_project_code}」一致的预约管理记录条数` : '需配置项目编号以对齐预约管理'}
        />
        <StatMini
          label="入组"
          value={plan.enrolled_count}
          title={plan.display_project_code ? `与项目编号「${plan.display_project_code}」一致且入组情况为「正式入组」的人数（初筛）` : '需配置项目编号以对齐初筛队列'}
        />
      </div>

      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.key ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.label}</button>
          ))}
        </div>
      </div>

      {activeTab === 'project' && (
        <div className="space-y-4">
          <PlanInfoTab plan={plan} />
          <CriteriaTab planId={planId} />
        </div>
      )}
      {activeTab === 'material' && (
        <div className="space-y-4">
          <MaterialPrepTab planId={planId} plan={plan} />
          <RecruitTemplatePanel planId={planId} plan={plan} />
          <AppointmentDocsPanel planId={planId} />
        </div>
      )}
      {activeTab === 'channel' && <ChannelsTab planId={planId} />}
    </div>
  )
}

function StatMini({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4" title={title}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
  )
}

function MaterialPrepTab({ planId, plan }: { planId: number; plan: RecruitmentPlan }) {
  const queryClient = useQueryClient()
  const [materialPrepStatus, setMaterialPrepStatus] = useState('draft')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [actualHours, setActualHours] = useState('')

  const publishedLocked = plan.material_prep_status === 'published'

  useEffect(() => {
    const raw = plan.material_prep_status || 'draft'
    setMaterialPrepStatus(publishedLocked ? 'published' : (raw === 'published' ? 'in_progress' : raw))
    const est = plan.estimated_work_hours
    const act = plan.actual_work_hours
    setEstimatedHours(est != null ? String(est) : '')
    setActualHours(act != null ? String(act) : '')
  }, [plan, publishedLocked])

  const saveMutation = useMutation({
    mutationFn: () => {
      const parseOpt = (s: string) => {
        const t = s.trim()
        if (!t) return undefined
        const n = Number(t)
        return Number.isFinite(n) ? n : undefined
      }
      const payload: Parameters<typeof recruitmentApi.updatePlan>[1] = {
        estimated_work_hours: parseOpt(estimatedHours),
        actual_work_hours: parseOpt(actualHours),
      }
      if (!publishedLocked) {
        payload.material_prep_status = materialPrepStatus === 'published' ? 'in_progress' : materialPrepStatus
      }
      return recruitmentApi.updatePlan(planId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('物料准备已保存')
    },
    onError: (err) => toast.error((err as Error).message || '保存失败'),
  })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">物料进度</h3>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? '保存中…' : '保存'}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        「发布」由系统在<strong className="text-slate-700">招募模板</strong>与<strong className="text-slate-700">预约文档</strong>均审批通过后自动设置。
        当前：招募模板 {plan.ad_template_ready ? '已就绪' : '未就绪'} · 预约文档 {plan.appointment_docs_ready ? '已就绪' : '未就绪'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-slate-500 mb-1">物料准备状态</p>
          <select
            value={publishedLocked ? 'published' : materialPrepStatus}
            onChange={(e) => setMaterialPrepStatus(e.target.value)}
            disabled={publishedLocked}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-600"
            title="物料准备状态"
          >
            {(publishedLocked
              ? [['published', MATERIAL_PREP_LABELS.published]]
              : Object.entries(MATERIAL_PREP_LABELS).filter(([k]) => k !== 'published')
            ).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">预计工时</p>
          <input
            type="text"
            inputMode="decimal"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            placeholder="可选"
          />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">实际工时</p>
          <input
            type="text"
            inputMode="decimal"
            value={actualHours}
            onChange={(e) => setActualHours(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            placeholder="可选"
          />
        </div>
      </div>
    </div>
  )
}

const APPOINTMENT_DOC_SLOTS: { doc_type: string; label: string }[] = [
  { doc_type: 'phone_appointment_flow', label: '测试电话预约流程' },
  { doc_type: 'phone_screening_questionnaire', label: '电话甄别问卷' },
  { doc_type: 'phone_appointment_form', label: '电话预约信息表' },
]

/** 与后端 AppointmentDocsStatus 一致 */
const APPOINTMENT_DOCS_STATUS_LABELS: Record<string, string> = {
  missing: '未提交',
  pending_review: '待审批',
  approved: '已通过',
  rejected: '已驳回',
}

function appointmentDocsStatusLabel(raw: string | undefined | null): string {
  const key = (raw || 'missing').trim()
  return APPOINTMENT_DOCS_STATUS_LABELS[key] ?? key
}

const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending: '待审批',
  approved: '已通过',
  published: '已发布',
}

function RecruitTemplatePanel({ planId, plan }: { planId: number; plan: RecruitmentPlan }) {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [form, setForm] = useState({
    template_project_code: '',
    template_project_name: '',
    template_sample_requirement: '',
    template_visit_date: '',
    template_honorarium: '' as string,
    template_liaison_fee: '' as string,
    content: '',
  })

  const adQuery = useQuery({
    queryKey: ['recruitment', 'recruit-template-ad', planId],
    queryFn: () => recruitmentApi.getRecruitTemplateAd(planId),
    enabled: !!planId,
  })

  const ad = adQuery.data?.data as RecruitTemplateAd | undefined

  const openEditor = () => {
    const a = adQuery.data?.data as RecruitTemplateAd | undefined
    if (a) {
      setForm({
        template_project_code: a.template_project_code || plan.display_project_code || '',
        template_project_name: a.template_project_name || plan.title || '',
        template_sample_requirement: a.template_sample_requirement || plan.sample_requirement || '',
        template_visit_date: String(a.template_visit_date || plan.wei_visit_date || '').trim(),
        template_honorarium: a.template_honorarium != null ? String(a.template_honorarium) : '',
        template_liaison_fee: a.template_liaison_fee != null ? String(a.template_liaison_fee) : '',
        content: a.content || '',
      })
    }
    setShowModal(true)
  }

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await recruitmentApi.getRecruitTemplateAd(planId)
      const id = res.data?.id
      if (!id) throw new Error('模板未就绪')
      const honorRaw = form.template_honorarium.trim()
      const honorNum = honorRaw === '' ? null : Number(honorRaw)
      if (honorRaw !== '' && !Number.isFinite(honorNum)) {
        throw new Error('礼金请填写数字（元）')
      }
      return recruitmentApi.updateRecruitTemplateAd(id, {
        template_project_code: form.template_project_code,
        template_project_name: form.template_project_name,
        template_sample_requirement: form.template_sample_requirement,
        template_visit_date: form.template_visit_date || null,
        template_honorarium: honorNum,
        template_liaison_fee: form.template_liaison_fee.trim(),
        content: form.content,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'recruit-template-ad', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('已保存草稿')
      setShowModal(false)
    },
    onError: (err) => toast.error((err as Error).message || '保存失败'),
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await recruitmentApi.getRecruitTemplateAd(planId)
      const id = res.data?.id
      if (!id) throw new Error('模板未就绪')
      const honorRaw = form.template_honorarium.trim()
      const honorNum = honorRaw === '' ? null : Number(honorRaw)
      if (honorRaw === '' || !Number.isFinite(honorNum)) {
        throw new Error('请填写礼金（数字，元）')
      }
      const liaisonText = form.template_liaison_fee.trim()
      if (!liaisonText) {
        throw new Error('请填写联络费（金额或说明，如合格1人15元）')
      }
      await recruitmentApi.updateRecruitTemplateAd(id, {
        template_project_code: form.template_project_code,
        template_project_name: form.template_project_name,
        template_sample_requirement: form.template_sample_requirement,
        template_visit_date: form.template_visit_date || null,
        template_honorarium: honorNum,
        template_liaison_fee: liaisonText,
        content: form.content,
      })
      return recruitmentApi.submitRecruitTemplateAd(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'recruit-template-ad', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('已提交审批')
      setShowModal(false)
    },
    onError: (err) => toast.error((err as Error).message || '提交失败'),
  })

  const approveMutation = useMutation({
    mutationFn: () => recruitmentApi.approveRecruitTemplateAd((adQuery.data?.data as RecruitTemplateAd).id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'recruit-template-ad', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('已通过')
    },
    onError: (err) => toast.error((err as Error).message || '操作失败'),
  })

  const rejectMutation = useMutation({
    mutationFn: () => recruitmentApi.rejectRecruitTemplateAd((adQuery.data?.data as RecruitTemplateAd).id, rejectReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'recruit-template-ad', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('已驳回')
      setRejectReason('')
    },
    onError: (err) => toast.error((err as Error).message || '操作失败'),
  })

  const publishMutation = useMutation({
    mutationFn: () => recruitmentApi.publishAd((adQuery.data?.data as RecruitTemplateAd).id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'recruit-template-ad', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('招募模板已发布')
    },
    onError: (err) => toast.error((err as Error).message || '发布失败'),
  })

  if (adQuery.isLoading) {
    return <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
  }
  if (adQuery.error) {
    return <ErrorAlert message="加载招募模板失败" onRetry={() => adQuery.refetch()} />
  }

  const st = ad?.status || 'draft'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-700">招募广告（模板）</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">{TEMPLATE_STATUS_LABELS[st] || st}</span>
          {st === 'draft' && (
            <button type="button" onClick={openEditor} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">编辑模板</button>
          )}
          {st === 'pending' && (
            <>
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="px-2 py-1 border border-slate-200 rounded text-sm w-40"
                placeholder="驳回原因"
              />
              <button type="button" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="px-2 py-1 text-sm bg-blue-600 text-white rounded">通过</button>
              <button type="button" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending} className="px-2 py-1 text-sm border border-slate-200 rounded">驳回</button>
            </>
          )}
          {st === 'approved' && (
            <button type="button" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm">发布</button>
          )}
        </div>
      </div>
      {ad?.reject_reason ? (
        <p className="text-xs text-red-600 mb-2">驳回原因：{ad.reject_reason}</p>
      ) : null}
      <div className="text-sm text-slate-600 space-y-1">
        <p><span className="text-slate-400">项目编号</span> {ad?.template_project_code || '—'}</p>
        <p><span className="text-slate-400">项目名称</span> {ad?.template_project_name || '—'}</p>
        <p><span className="text-slate-400">样本要求</span> {(ad?.template_sample_requirement || '').slice(0, 120) || '—'}{((ad?.template_sample_requirement || '').length > 120) ? '…' : ''}</p>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 shadow-xl">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">招募模板</h4>
            <div className="space-y-3 text-sm">
              <label className="block"><span className="text-xs text-slate-500">项目编号</span><input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" value={form.template_project_code} onChange={(e) => setForm({ ...form, template_project_code: e.target.value })} /></label>
              <label className="block"><span className="text-xs text-slate-500">项目名称</span><input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" value={form.template_project_name} onChange={(e) => setForm({ ...form, template_project_name: e.target.value })} /></label>
              <label className="block"><span className="text-xs text-slate-500">样本要求</span><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" rows={3} value={form.template_sample_requirement} onChange={(e) => setForm({ ...form, template_sample_requirement: e.target.value })} /></label>
              <label className="block"><span className="text-xs text-slate-500">具体访视日期</span><input type="date" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" value={form.template_visit_date} onChange={(e) => setForm({ ...form, template_visit_date: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="text-xs text-slate-500">礼金</span><input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" inputMode="decimal" value={form.template_honorarium} onChange={(e) => setForm({ ...form, template_honorarium: e.target.value })} /></label>
                <label className="block"><span className="text-xs text-slate-500">联络费（金额或说明）</span><input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" placeholder="如 15 或 合格1人15元" value={form.template_liaison_fee} onChange={(e) => setForm({ ...form, template_liaison_fee: e.target.value })} /></label>
              </div>
              <label className="block"><span className="text-xs text-slate-500">备注/正文</span><textarea className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" rows={2} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-3 py-1.5 text-sm text-slate-600" onClick={() => setShowModal(false)}>取消</button>
              <button type="button" className="px-3 py-1.5 text-sm bg-slate-100 rounded-lg" onClick={() => saveDraftMutation.mutate()} disabled={saveDraftMutation.isPending}>保存草稿</button>
              <button type="button" className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>提交审批</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AppointmentDocsPanel({ planId }: { planId: number }) {
  const queryClient = useQueryClient()
  const [rejectReason, setRejectReason] = useState('')
  const planRes = useQuery({
    queryKey: ['recruitment', 'plan', planId],
    queryFn: () => recruitmentApi.getPlan(planId),
    enabled: !!planId,
  })
  const docsQuery = useQuery({
    queryKey: ['recruitment', 'appointment-docs', planId],
    queryFn: () => recruitmentApi.listAppointmentDocs(planId),
    enabled: !!planId,
  })
  const items = docsQuery.data?.data?.items ?? []
  const byType = Object.fromEntries(items.map((x) => [x.doc_type, x]))

  const uploadMut = useMutation({
    mutationFn: ({ docType, file }: { docType: string; file: File }) => recruitmentApi.uploadAppointmentDoc(planId, docType, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'appointment-docs', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('已上传')
    },
    onError: (err) => toast.error((err as Error).message || '上传失败'),
  })

  const submitMut = useMutation({
    mutationFn: () => recruitmentApi.submitAppointmentDocs(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'appointment-docs', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('已提交审批')
    },
    onError: (err) => toast.error((err as Error).message || '提交失败'),
  })

  const approveMut = useMutation({
    mutationFn: () => recruitmentApi.approveAppointmentDocs(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'appointment-docs', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('预约文档已通过')
    },
    onError: (err) => toast.error((err as Error).message || '操作失败'),
  })

  const rejectMut = useMutation({
    mutationFn: () => recruitmentApi.rejectAppointmentDocs(planId, rejectReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'appointment-docs', planId] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plan', planId] })
      toast.success('已驳回')
      setRejectReason('')
    },
    onError: (err) => toast.error((err as Error).message || '操作失败'),
  })

  const preview = async (docType: string) => {
    try {
      const blob = await recruitmentApi.fetchAppointmentDocBlob(planId, docType)
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) {
        toast.error('请允许弹窗以预览')
        URL.revokeObjectURL(url)
        return
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error((e as Error).message || '无法打开文件')
    }
  }

  const plan = planRes.data?.data
  const st = plan?.appointment_docs_status || 'missing'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-700">招募预约文档</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-500">状态：{appointmentDocsStatusLabel(plan?.appointment_docs_status)}</span>
          {st === 'pending_review' && (
            <>
              <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-sm w-36" placeholder="驳回原因" />
              <button type="button" className="px-2 py-1 text-sm bg-blue-600 text-white rounded" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>通过</button>
              <button type="button" className="px-2 py-1 text-sm border rounded" onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}>驳回</button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">支持 Word / Excel；点击预览在新窗口打开（浏览器可能调用本机 Office）。</p>
      {plan?.appointment_docs_reject_reason ? (
        <p className="text-xs text-red-600 mb-2">驳回：{plan.appointment_docs_reject_reason}</p>
      ) : null}
      <div className="space-y-3">
        {APPOINTMENT_DOC_SLOTS.map((slot) => {
          const row = byType[slot.doc_type]
          return (
            <div key={slot.doc_type} className="flex flex-wrap items-center gap-2 border border-slate-100 rounded-lg p-3">
              <span className="text-sm text-slate-700 flex-1 min-w-[140px]">{slot.label}</span>
              {row ? (
                <span className="text-xs text-slate-500 truncate max-w-[180px]" title={row.original_filename}>{row.original_filename}</span>
              ) : (
                <span className="text-xs text-slate-400">未上传</span>
              )}
              <label className="text-xs text-emerald-600 cursor-pointer hover:underline">
                {row ? '替换' : '上传'}
                <input
                  type="file"
                  accept=".doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadMut.mutate({ docType: slot.doc_type, file: f })
                    e.target.value = ''
                  }}
                />
              </label>
              {row && (
                <button type="button" className="text-xs text-blue-600" onClick={() => preview(slot.doc_type)}>预览</button>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50"
          disabled={submitMut.isPending || APPOINTMENT_DOC_SLOTS.some((s) => !byType[s.doc_type])}
          onClick={() => submitMut.mutate()}
        >
          提交文档审批
        </button>
      </div>
    </div>
  )
}

function PlanInfoTab({ plan }: { plan: any }) {
  const planId = plan.id as number
  const [trendDays, setTrendDays] = useState(30)

  const trendsQuery = useQuery({
    queryKey: ['recruitment', 'trends', planId, trendDays],
    queryFn: () => recruitmentApi.getTrends(planId, trendDays),
    enabled: !!planId,
  })

  const trendItems = trendsQuery.data?.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="计划编号" value={String(plan.plan_no)} /><InfoRow label="协议 ID" value={plan.protocol_id != null ? String(plan.protocol_id) : '—'} />
          <InfoRow label="开始日期" value={String(plan.start_date)} /><InfoRow label="结束日期" value={String(plan.end_date)} />
          <InfoRow label="完成率" value={`${completionRatePercent(plan.completion_rate as number).toFixed(1)}%`} /><InfoRow label="创建时间" value={String(plan.create_time).slice(0, 10)} />
        </div>
        {plan.description && <div className="mt-4 pt-4 border-t border-slate-100"><p className="text-xs text-slate-500 mb-1">描述</p><p className="text-sm text-slate-700">{String(plan.description)}</p></div>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">项目扩展</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="项目编号" value={plan.display_project_code ? String(plan.display_project_code) : (plan.project_code ? String(plan.project_code) : '—')} />
          <InfoRow label="协议编号" value={plan.protocol_code ? String(plan.protocol_code) : '—'} />
          <InfoRow label="访视点" value={plan.wei_visit_point ? String(plan.wei_visit_point) : '—'} />
          <InfoRow label="具体访视日期" value={plan.wei_visit_date ? String(plan.wei_visit_date) : '—'} />
          <InfoRow label="研究员" value={plan.researcher_name ? String(plan.researcher_name) : '—'} />
          <InfoRow label="督导" value={plan.supervisor_name ? String(plan.supervisor_name) : '—'} />
          <InfoRow label="招募启动" value={plan.recruit_start_date ? String(plan.recruit_start_date) : '—'} />
          <InfoRow label="招募结束" value={plan.recruit_end_date ? String(plan.recruit_end_date) : '—'} />
          <InfoRow label="计划预约人数" value={plan.planned_appointment_count != null ? String(plan.planned_appointment_count) : '—'} />
          <InfoRow label="实际预约人数(V1)" value={plan.actual_appointment_count != null ? String(plan.actual_appointment_count) : '—'} />
          <InfoRow label="预约完成率" value={plan.appointment_completion_rate != null ? `${Number(plan.appointment_completion_rate).toFixed(1)}%` : '—'} />
          <InfoRow label="渠道招募" value={plan.channel_recruitment_needed ? '是' : '否'} />
          <InfoRow
            label="派发专员"
            value={Array.isArray(plan.recruit_specialist_names) && plan.recruit_specialist_names.length ? plan.recruit_specialist_names.join('、') : '—'}
          />
        </div>
        {plan.sample_requirement ? (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-1">样本要求</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{String(plan.sample_requirement)}</p>
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">招募趋势</h3>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                className={`px-2 py-1 text-xs rounded ${trendDays === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>
        {trendsQuery.isLoading ? (
          <div className="h-48 bg-slate-100 rounded animate-pulse" />
        ) : trendItems.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">暂无趋势数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendItems}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip labelFormatter={(d: string) => `日期: ${d}`} />
              <Line type="monotone" dataKey="registered" name="报名" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="screened" name="筛选" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="enrolled" name="入组" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="text-slate-700 mt-0.5">{value}</p></div>
}

function CriteriaTab({ planId }: { planId: number }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newCriteria, setNewCriteria] = useState({ criteria_type: 'inclusion', description: '', sequence: 1 })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'criteria', planId],
    queryFn: () => recruitmentApi.listCriteria(planId),
  })

  const addMutation = useMutation({
    mutationFn: () => recruitmentApi.addCriteria(planId, newCriteria),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'criteria', planId] })
      toast.success('入排标准已添加')
      setShowAdd(false)
      setNewCriteria({ criteria_type: 'inclusion', description: '', sequence: 1 })
    },
    onError: (err) => toast.error((err as Error).message || '添加失败'),
  })

  const items = data?.data?.items ?? []

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">入排标准</h3>
        <button onClick={() => setShowAdd(true)} className="text-sm text-emerald-600 hover:underline">+ 新增</button>
      </div>
      {isLoading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        : error ? <ErrorAlert message="加载入排标准失败" onRetry={() => refetch()} />
        : items.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">暂无入排标准</div>
        : <div className="space-y-2">{items.map((c) => (
          <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.criteria_type === 'inclusion' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{c.criteria_type === 'inclusion' ? '纳入' : '排除'}</span>
            <span className="text-sm text-slate-700 flex-1">{c.description}</span>
            {c.is_mandatory && <span className="text-xs text-amber-600">必填</span>}
          </div>
        ))}</div>}

      {showAdd && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-3">
            <select value={newCriteria.criteria_type} onChange={(e) => setNewCriteria({ ...newCriteria, criteria_type: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" title="标准类型"><option value="inclusion">纳入标准</option><option value="exclusion">排除标准</option></select>
            <input type="number" value={newCriteria.sequence} onChange={(e) => setNewCriteria({ ...newCriteria, sequence: Number(e.target.value) })} className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="序号" />
          </div>
          <textarea value={newCriteria.description} onChange={(e) => setNewCriteria({ ...newCriteria, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} placeholder="标准描述" />
          <div className="flex gap-2">
            <button onClick={() => addMutation.mutate()} disabled={!newCriteria.description || addMutation.isPending} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">{addMutation.isPending ? '添加中...' : '添加'}</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ChannelsTab({ planId }: { planId: number }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ channel_type: 'online', name: '' })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'channels', planId],
    queryFn: () => recruitmentApi.listChannels(planId),
  })

  const addMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error('请输入渠道名称')
      return recruitmentApi.addChannel(planId, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'channels', planId] })
      toast.success('渠道已添加')
      setShowAdd(false); setForm({ channel_type: 'online', name: '' })
    },
    onError: (err) => toast.error((err as Error).message || '添加失败'),
  })

  const items: Array<{ id: number; channel_type: string; name: string; registered_count: number; screened_count: number; enrolled_count: number; status: string }> = data?.data?.items ?? []
  const chartData = items.map((ch) => ({
    name: ch.name,
    报名: ch.registered_count,
    筛选: ch.screened_count,
    入组: ch.enrolled_count,
    转化率: ch.registered_count > 0 ? Math.round(ch.enrolled_count / ch.registered_count * 100) : 0,
  }))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">渠道列表</h3>
          <button onClick={() => setShowAdd(true)} className="text-sm text-emerald-600 hover:underline">+ 新增</button>
        </div>
        {isLoading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
          : error ? <ErrorAlert message="加载渠道数据失败" onRetry={() => refetch()} />
          : items.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">暂无渠道</div>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 text-slate-600 font-medium">渠道名称</th>
                  <th className="text-left py-2 text-slate-600 font-medium">类型</th>
                  <th className="text-right py-2 text-slate-600 font-medium">报名</th>
                  <th className="text-right py-2 text-slate-600 font-medium">筛选</th>
                  <th className="text-right py-2 text-slate-600 font-medium">入组</th>
                  <th className="text-right py-2 text-slate-600 font-medium">转化率</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ch) => (
                  <tr key={ch.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-700 font-medium">{ch.name}</td>
                    <td className="py-2"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{ch.channel_type}</span></td>
                    <td className="py-2 text-right text-slate-600">{ch.registered_count}</td>
                    <td className="py-2 text-right text-slate-600">{ch.screened_count}</td>
                    <td className="py-2 text-right text-emerald-600 font-medium">{ch.enrolled_count}</td>
                    <td className="py-2 text-right text-slate-600">{ch.registered_count > 0 ? `${(ch.enrolled_count / ch.registered_count * 100).toFixed(1)}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
            <select value={form.channel_type} onChange={(e) => setForm({ ...form, channel_type: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" title="渠道类型"><option value="online">线上</option><option value="offline">线下</option><option value="referral">转介</option><option value="social_media">社交媒体</option></select>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="渠道名称" />
            <button onClick={() => addMutation.mutate()} disabled={!form.name || addMutation.isPending} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">{addMutation.isPending ? '添加中...' : '添加'}</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-2 text-sm text-slate-600">取消</button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">渠道效果对比</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="报名" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="筛选" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="入组" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
