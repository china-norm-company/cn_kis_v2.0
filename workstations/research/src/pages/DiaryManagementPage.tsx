/**
 * 日记管理（研究台 · 采苓）
 *
 * 三块：配置日记、数据查看和下载、进度管理。
 * 对接后端 /api/v1/research/diary/ 与项目列表 /projects/、受试者列表 /subject/list。
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Button,
  Badge,
  Tabs,
  DataTable,
  Input,
  Modal,
  Select,
} from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import { api, getAxiosInstance } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import {
  NotebookPen,
  Settings2,
  Database,
  LineChart,
  RefreshCw,
  Download,
  Save,
  Send,
  CheckCircle,
  FileEdit,
  FolderPlus,
  UserPlus,
  Users,
} from 'lucide-react'
import { DiaryConfigEditorForm } from '../components/diary/DiaryConfigEditorForm'
import type { FormFieldItem, RuleFormState } from '../components/diary/diaryConfigMapper'
import {
  DEFAULT_RULE_STATE,
  emptyField,
  formDefinitionToItems,
  itemsToFormDefinition,
  ruleJsonToState,
  stateToRuleJson,
  validateConfigBeforeSave,
} from '../components/diary/diaryConfigMapper'

/** 日记列表单元格：后端约定 string；防御异常值避免界面出现 [object Object] */
function formatDiaryTableText(value: unknown, maxLen: number): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string') {
    const t = value.trim()
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t
  }
  if (typeof value === 'object') {
    try {
      const s = JSON.stringify(value)
      return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s
    } catch {
      return String(value)
    }
  }
  const s = String(value)
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s
}

/** 提交时间：后端 ISO 字符串 → 本地 YYYY-MM-DD HH:mm:ss */
function formatDiarySubmitTime(iso: string | undefined): string {
  if (!iso || !String(iso).trim()) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).trim()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

type DiaryConfigItem = {
  id: number
  project_id: number
  project_no: string
  config_version_label: string
  form_definition_json: unknown[]
  rule_json: Record<string, unknown>
  status: string
  researcher_confirmed_at: string | null
  supervisor_confirmed_at: string | null
  create_time: string
  update_time: string
  /** 仅「从模板创建」接口返回，便于提示来源 */
  template_source?: string
}

type ProjectRow = {
  id: number
  project_no: string | null
  project_name: string
}

type SubjectRow = {
  id: number
  subject_no: string
  name: string
}

type DiaryEntryRow = {
  id: number
  subject_id: number
  subject_no: string
  subject_name: string
  /** 受试者手机号（明文，与研究台导出 CSV 一致） */
  subject_phone?: string
  entry_date: string
  symptoms: string
  medication_taken: boolean
  has_adverse: boolean
  symptom_severity: string
  symptom_onset: string
  symptom_duration: string
  create_time: string
}

type ProgressSubject = {
  subject_id: number
  subject_no: string
  subject_name: string
  expected_days: number
  filled_days: number
  completion_rate: number
  missing_dates: string[]
  missing_count: number
}

type ProjectSubjectRow = {
  enrollment_id: number
  subject_id: number
  subject_no: string
  name: string
  phone_masked: string
  enrollment_status: string
  enrollment_status_label: string
  protocol_code: string
}

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: '草稿', variant: 'default' },
  published: { label: '已发布', variant: 'success' },
}

const ENROLLMENT_VARIANT: Record<string, BadgeVariant> = {
  pending: 'warning',
  enrolled: 'success',
  completed: 'default',
  withdrawn: 'default',
}

export default function DiaryManagementPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('config')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null)
  const [formItems, setFormItems] = useState<FormFieldItem[]>([emptyField(10)])
  const [ruleState, setRuleState] = useState<RuleFormState>({ ...DEFAULT_RULE_STATE })
  const [configEditorSubTab, setConfigEditorSubTab] = useState<'items' | 'publish'>('items')
  const [versionLabel, setVersionLabel] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const [entrySubjectId, setEntrySubjectId] = useState<string>('')
  const [entryPage, setEntryPage] = useState(1)

  const [progressSubjectIds, setProgressSubjectIds] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [newProjectNo, setNewProjectNo] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false)
  const [addSubjectNo, setAddSubjectNo] = useState('')
  const [addSubjectName, setAddSubjectName] = useState('')
  const [addSubjectPhone, setAddSubjectPhone] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)
  const [addSubjectError, setAddSubjectError] = useState<string | null>(null)
  const [createTemplateHint, setCreateTemplateHint] = useState<string | null>(null)

  const { data: projectsRes } = useQuery({
    queryKey: ['projects', 'diary-mgmt'],
    queryFn: () =>
      api.get<{ list: ProjectRow[]; total: number }>('/projects/', {
        params: { page: 1, pageSize: 200 },
      }),
  })
  const projects = projectsRes?.data?.list ?? []

  const selectedProject = useMemo(
    () => (projectId !== '' ? projects.find((p) => p.id === projectId) : undefined),
    [projects, projectId],
  )

  const projectNoDisplay = (selectedProject?.project_no || '').trim() || '—'

  const projectOptions = useMemo(
    () =>
      projects.map((p) => ({
        value: String(p.id),
        label: `${p.project_no || p.id} — ${p.project_name || '未命名'}`,
      })),
    [projects],
  )

  const { data: configsRes, isLoading: configsLoading } = useQuery({
    queryKey: ['research-diary-configs', projectId],
    queryFn: () =>
      api.get<{ items: DiaryConfigItem[] }>('/research/diary/configs', {
        params: { project_id: projectId },
      }),
    enabled: projectId !== '',
  })
  const configs = configsRes?.data?.items ?? []

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === selectedConfigId) ?? null,
    [configs, selectedConfigId],
  )

  const syncEditorFromConfig = useCallback((c: DiaryConfigItem) => {
    setFormItems(formDefinitionToItems(c.form_definition_json))
    setRuleState(ruleJsonToState(c.rule_json))
    setVersionLabel(c.config_version_label || '')
    setConfigEditorSubTab('items')
    setJsonError(null)
    setCreateTemplateHint(null)
  }, [])

  useEffect(() => {
    if (selectedConfigId == null) {
      setFormItems([emptyField(10)])
      setRuleState({ ...DEFAULT_RULE_STATE })
      setVersionLabel('')
      setJsonError(null)
      setCreateTemplateHint(null)
    }
  }, [selectedConfigId])

  const { data: subjectsRes } = useQuery({
    queryKey: ['subjects', 'diary-mgmt'],
    queryFn: () =>
      api.get<{ items: SubjectRow[]; total: number }>('/subject/list', {
        params: { page: 1, page_size: 500 },
      }),
  })
  const subjects = subjectsRes?.data?.items ?? []

  const subjectOptions = useMemo(
    () =>
      subjects.map((s) => ({
        value: String(s.id),
        label: `${s.subject_no} ${s.name}`,
      })),
    [subjects],
  )

  const entrySubjectIdNum = entrySubjectId ? parseInt(entrySubjectId, 10) : undefined

  const { data: entriesRes, isLoading: entriesLoading } = useQuery({
    queryKey: ['research-diary-entries', entrySubjectIdNum, entryPage],
    queryFn: () =>
      api.get<{ items: DiaryEntryRow[]; total: number; page: number; page_size: number }>(
        '/research/diary/entries',
        {
          params: {
            subject_id: entrySubjectIdNum,
            page: entryPage,
            page_size: 20,
          },
        },
      ),
  })
  const entries = entriesRes?.data?.items ?? []
  const entriesTotal = entriesRes?.data?.total ?? 0

  const { data: progressRes, isLoading: progressLoading, refetch: refetchProgress } = useQuery({
    queryKey: ['research-diary-progress', projectId, progressSubjectIds],
    queryFn: () =>
      api.get<{
        period_start?: string
        period_end?: string
        expected_days_total?: number
        subjects?: ProgressSubject[]
        hint?: string
      }>('/research/diary/progress', {
        params: {
          project_id: projectId,
          subject_ids: progressSubjectIds.trim(),
        },
      }),
    enabled: projectId !== '' && progressSubjectIds.trim().length > 0,
  })
  const progressData = progressRes?.data

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConfigId) throw new Error('请选择一条配置')
      const v = validateConfigBeforeSave(formItems, ruleState)
      if (!v.ok) throw new Error(v.message)
      const form_definition_json = itemsToFormDefinition(formItems)
      const rule_json = stateToRuleJson(ruleState)
      return api.put(`/research/diary/configs/${selectedConfigId}`, {
        config_version_label: versionLabel,
        form_definition_json,
        rule_json,
      })
    },
    onSuccess: () => {
      setJsonError(null)
      queryClient.invalidateQueries({ queryKey: ['research-diary-configs', projectId] })
    },
    onError: (e: Error) => setJsonError(e.message),
  })

  const createMutation = useMutation({
    mutationFn: () => {
      if (projectId === '') throw new Error('请选择项目')
      return api.post<DiaryConfigItem>('/research/diary/configs/from-template', {
        project_id: projectId,
        template_project_no: 'W26000000',
        config_version_label: 'v1',
      })
    },
    onSuccess: (res) => {
      setShowCreateModal(false)
      queryClient.invalidateQueries({ queryKey: ['research-diary-configs', projectId] })
      const d = res?.data
      if (d?.id) {
        setSelectedConfigId(d.id)
        setFormItems(formDefinitionToItems(d.form_definition_json))
        setRuleState(ruleJsonToState(d.rule_json))
        setVersionLabel(d.config_version_label || '')
        setConfigEditorSubTab('items')
        setJsonError(null)
        setCreateTemplateHint(d.template_source ?? null)
      }
    },
  })

  const setupProjectMutation = useMutation({
    mutationFn: () =>
      api.post<{
        project_id: number
        project_no: string
        project_name: string
        protocol_id: number
      }>('/research/diary/setup-project', {
        project_no: newProjectNo.trim(),
        project_name: newProjectName.trim(),
      }),
    onSuccess: (res) => {
      setSetupError(null)
      setShowNewProjectModal(false)
      setNewProjectNo('')
      setNewProjectName('')
      queryClient.invalidateQueries({ queryKey: ['projects', 'diary-mgmt'] })
      queryClient.invalidateQueries({ queryKey: ['research-diary-project-subjects'] })
      const pid = res?.data?.project_id
      if (pid) {
        setProjectId(pid)
        setSelectedConfigId(null)
      }
    },
    onError: (e: Error) => setSetupError(e.message),
  })

  const { data: linkedProtocolRes, isLoading: linkedProtocolLoading } = useQuery({
    queryKey: ['research-diary-linked-protocol', projectId],
    queryFn: () =>
      api.get<{ protocol_id: number | null; hint?: string | null }>('/research/diary/linked-protocol', {
        params: { project_id: projectId },
      }),
    enabled: projectId !== '' && showAddSubjectModal,
  })
  const linkedProtocolId = linkedProtocolRes?.data?.protocol_id ?? null
  const linkedProtocolHint = linkedProtocolRes?.data?.hint

  const { data: projectSubjectsRes, isLoading: projectSubjectsLoading, refetch: refetchProjectSubjects } =
    useQuery({
      queryKey: ['research-diary-project-subjects', projectId],
      queryFn: () =>
        api.get<{
          items: ProjectSubjectRow[]
          total: number
          hint?: string | null
          project_no?: string
          protocol_id?: number | null
        }>('/research/diary/project-subjects', { params: { project_id: projectId } }),
      enabled: projectId !== '',
    })
  const projectSubjectsData = projectSubjectsRes?.data

  const addSubjectMutation = useMutation({
    mutationFn: async () => {
      if (projectId === '') throw new Error('请先选择项目')
      const no = addSubjectNo.trim()
      const phone = addSubjectPhone.trim()
      if (!no) throw new Error('请填写受试者编号')
      if (!phone) throw new Error('请填写手机号码')
      const name = addSubjectName.trim()
      return api.post<{
        subject_id: number
        subject_no: string
        enrollment_id: number
      }>('/research/diary/register-subject', {
        project_id: projectId,
        subject_no: no,
        phone,
        ...(name ? { name } : {}),
      })
    },
    onSuccess: () => {
      setAddSubjectError(null)
      setShowAddSubjectModal(false)
      setAddSubjectNo('')
      setAddSubjectName('')
      setAddSubjectPhone('')
      queryClient.invalidateQueries({ queryKey: ['subjects', 'diary-mgmt'] })
      queryClient.invalidateQueries({ queryKey: ['research-diary-project-subjects', projectId] })
    },
    onError: (e: Error) => setAddSubjectError(e.message),
  })

  const publishMutation = useMutation({
    mutationFn: (id: number) => api.post(`/research/diary/configs/${id}/publish`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-diary-configs', projectId] }),
  })

  const confirmMutation = useMutation({
    mutationFn: (id: number) => api.post(`/research/diary/configs/${id}/confirm-researcher`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-diary-configs', projectId] }),
  })

  const draftMutation = useMutation({
    mutationFn: (id: number) => api.post(`/research/diary/configs/${id}/draft`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-diary-configs', projectId] }),
  })

  const entryColumns: Column<DiaryEntryRow>[] = [
    { key: 'subject_no', title: '受试者编号', width: 120 },
    { key: 'subject_name', title: '姓名', width: 100 },
    {
      key: 'subject_phone',
      title: '手机号',
      width: 120,
      render: (_, row) => (row.subject_phone && String(row.subject_phone).trim()) || '—',
    },
    { key: 'entry_date', title: '规定使用日期', width: 120 },
    {
      key: 'create_time',
      title: '提交时间',
      width: 168,
      render: (_, row) => formatDiarySubmitTime(row.create_time),
    },
    {
      key: 'medication_taken',
      title: '是否按要求使用产品',
      width: 140,
      render: (_, row) => (row.medication_taken ? '是' : '否'),
    },
    {
      key: 'has_adverse',
      title: '是否发生任何不良情况',
      width: 160,
      render: (_, row) => (row.has_adverse ? '是' : '否'),
    },
    {
      key: 'symptoms',
      title: '症状',
      width: 120,
      render: (_, row) => formatDiaryTableText(row.symptoms, 80) || '—',
    },
    {
      key: 'symptom_severity',
      title: '症状程度',
      width: 100,
      render: (_, row) => formatDiaryTableText(row.symptom_severity, 40) || '—',
    },
    {
      key: 'symptom_onset',
      title: '症状开始时间',
      width: 120,
      render: (_, row) => formatDiaryTableText(row.symptom_onset, 60) || '—',
    },
    {
      key: 'symptom_duration',
      title: '症状持续时长',
      width: 120,
      render: (_, row) => formatDiaryTableText(row.symptom_duration, 60) || '—',
    },
  ]

  const progressColumns: Column<ProgressSubject>[] = [
    { key: 'subject_no', title: '编号', width: 120 },
    { key: 'subject_name', title: '姓名', width: 100 },
    { key: 'filled_days', title: '已填天数', width: 90 },
    { key: 'expected_days', title: '应填天数', width: 90 },
    {
      key: 'completion_rate',
      title: '完成率',
      render: (_, row) => `${(row.completion_rate * 100).toFixed(1)}%`,
    },
    { key: 'missing_count', title: '缺填天数', width: 90 },
    {
      key: 'missing_preview',
      title: '缺填日期（节选）',
      render: (_, row) =>
        row.missing_dates?.length
          ? `${row.missing_dates.slice(0, 5).join(', ')}${row.missing_dates.length > 5 ? '…' : ''}`
          : '—',
    },
  ]

  const diaryPublishAudienceSlot = useMemo(() => {
    if (projectId === '') return null
    const ps = projectSubjectsData
    const hint = ps?.hint
    const items = ps?.items ?? []
    const total = ps?.total ?? 0
    const loading = projectSubjectsLoading
    const previewRows = items.slice(0, 5)
    const code = ((ps?.project_no || projectNoDisplay) ?? '').trim() || '—'

    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4 text-emerald-800 shrink-0" aria-hidden />
          <span className="text-sm font-semibold text-slate-900">日记面向对象</span>
          <Badge variant={total > 0 ? 'success' : 'default'}>
            {total > 0 ? `已匹配 ${total} 人` : '暂无入组'}
          </Badge>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          以下受试者已与<strong>正式项目编号</strong>（<span className="font-mono">{code}</span>
          ）及对应研究协议一致并完成入组登记。您在列表中「发布」并「确认」本配置后，他们可在<strong>小程序</strong>
          中拉取到本日记任务（非短信推送）。
        </p>
        {loading && <p className="text-xs text-slate-500">加载中…</p>}
        {hint && !loading && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded p-2">{hint}</p>
        )}
        {!loading && !hint && total === 0 && (
          <p className="text-sm text-slate-600">当前无入组受试者，请先在页头「登记受试者并入组」。</p>
        )}
        {!loading && !hint && total > 0 && (
          <div className="overflow-x-auto rounded border border-white/80 bg-white/80">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 pr-2">受试者编号</th>
                  <th className="py-2 pr-2">姓名</th>
                  <th className="py-2 pr-2">手机</th>
                  <th className="py-2">入组状态</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.enrollment_id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 font-mono">{row.subject_no || '—'}</td>
                    <td className="py-1.5 pr-2">{row.name || '—'}</td>
                    <td className="py-1.5 pr-2">{row.phone_masked}</td>
                    <td className="py-1.5">
                      <Badge variant={ENROLLMENT_VARIANT[row.enrollment_status] ?? 'default'}>
                        {row.enrollment_status_label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > 5 && (
              <p className="px-2 py-2 text-xs text-slate-500 border-t border-slate-100">
                仅展示前 5 条，完整名单见页面上方「本项目入组受试者」。
              </p>
            )}
          </div>
        )}
      </div>
    )
  }, [projectId, projectSubjectsData, projectSubjectsLoading, projectNoDisplay])

  const handleExport = async () => {
    const axios = getAxiosInstance()
    const res = await axios.get('/research/diary/entries/export', {
      params: entrySubjectIdNum ? { subject_id: entrySubjectIdNum } : {},
      responseType: 'blob',
    })
    const blob = res.data as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diary_entries_${entrySubjectId || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PermissionGuard permission="subject.subject.read">
      <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <NotebookPen className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">日记管理</h1>
              <p className="text-sm text-slate-500">
                配置日记表单与规则、查看/导出条目、按应填周期查看填写进度
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 min-w-[240px] justify-end">
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => {
                setSetupError(null)
                setShowNewProjectModal(true)
              }}
            >
              <FolderPlus className="h-4 w-4 mr-1" aria-hidden />
              新建研究项目
            </Button>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              disabled={projectId === ''}
              onClick={() => {
                setAddSubjectError(null)
                setShowAddSubjectModal(true)
              }}
            >
              <UserPlus className="h-4 w-4 mr-1" aria-hidden />
              登记受试者并入组
            </Button>
            <span className="text-sm text-slate-600">项目</span>
            <Select
              value={projectId === '' ? '' : String(projectId)}
              onChange={(e) => {
                const v = e.target.value
                setProjectId(v ? parseInt(v, 10) : '')
                setSelectedConfigId(null)
              }}
              options={[{ value: '', label: '请选择研究项目' }, ...projectOptions]}
              className="min-w-[220px]"
            />
          </div>
        </div>

        {projects.length === 0 && (
          <Card className="p-4 border border-amber-100 bg-amber-50/50">
            <p className="text-sm text-slate-800">
              当前还没有可选的研究项目。若您本地数据库为新库，列表会为空属正常现象。请先点击右上角
              <strong>「新建研究项目」</strong>
              填写正式项目编号与项目名称，创建后即可在本页配置日记；再在选中该项目后使用
              <strong>「登记受试者并入组」</strong>
              添加受试者。
            </p>
          </Card>
        )}

        {projectId !== '' && selectedProject && (
          <Card className="p-4 border border-sky-100 bg-sky-50/60">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">受试者小程序如何对应到本项目</h2>
            <p className="text-sm text-slate-700 leading-relaxed mb-2">
              您当前选择的是全链路项目「{selectedProject.project_name || '未命名'}」。在研究中心业务里，该项目的
              <strong className="text-slate-900"> 正式项目编号 </strong>
              为 <span className="font-mono text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">{projectNoDisplay}</span>
              。受试者在小程序填写日记时，系统会比对「入组时登记的研究项目编号」是否与此编号一致；一致时，才会自动展示您在此发布并确认的日记任务。
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              建议核对：每位受试者入组资料中的研究项目编号与本页编号一致，避免出现「研究台已发布日记，受试者端却看不到」的情况。若编号不一致，请在入组或主数据中更正后再请受试者使用。
            </p>
          </Card>
        )}

        {projectId !== '' && selectedProject && (
          <Card className="p-4 border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-slate-600" aria-hidden />
                <h2 className="text-sm font-semibold text-slate-800">本项目入组受试者</h2>
                {projectSubjectsData != null && (
                  <Badge variant={(projectSubjectsData.total ?? 0) > 0 ? 'success' : 'default'}>
                    共 {projectSubjectsData.total ?? 0} 人
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => refetchProjectSubjects()}
              >
                <RefreshCw className="h-4 w-4 mr-1" aria-hidden />
                刷新名单
              </Button>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              用于核对登记是否成功。列表来自与当前项目正式编号一致的研究协议下的入组记录；手机号已脱敏。
            </p>
            {projectSubjectsLoading && <p className="text-sm text-slate-500">加载中…</p>}
            {projectSubjectsData?.hint && !projectSubjectsLoading && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded p-2">
                {projectSubjectsData.hint}
              </p>
            )}
            {!projectSubjectsLoading && !projectSubjectsData?.hint && (projectSubjectsData?.total ?? 0) === 0 && (
              <p className="text-sm text-slate-600">暂无入组记录，请使用「登记受试者并入组」添加。</p>
            )}
            {!projectSubjectsLoading && !projectSubjectsData?.hint && (projectSubjectsData?.total ?? 0) > 0 && (
              <div className="overflow-x-auto rounded border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2 pr-3">受试者编号</th>
                      <th className="py-2 pr-3">姓名</th>
                      <th className="py-2 pr-3">手机</th>
                      <th className="py-2 pr-3">入组状态</th>
                      <th className="py-2">研究协议编号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(projectSubjectsData?.items ?? []).map((row) => (
                      <tr key={row.enrollment_id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-mono text-xs">{row.subject_no || '—'}</td>
                        <td className="py-2 pr-3">{row.name || '—'}</td>
                        <td className="py-2 pr-3">{row.phone_masked}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={ENROLLMENT_VARIANT[row.enrollment_status] ?? 'default'}>
                            {row.enrollment_status_label}
                          </Badge>
                        </td>
                        <td className="py-2 font-mono text-xs">{row.protocol_code || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        <Tabs
          items={[
            { key: 'config', label: '配置日记', icon: <Settings2 className="h-4 w-4" /> },
            { key: 'data', label: '数据查看和下载', icon: <Database className="h-4 w-4" /> },
            { key: 'progress', label: '进度管理', icon: <LineChart className="h-4 w-4" /> },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'config' && (
          <div className="space-y-4 pt-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-sm font-semibold text-slate-800">项目下的日记配置</h2>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={projectId === ''}
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['research-diary-configs', projectId] })}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" /> 刷新
                  </Button>
                  <Button
                    size="sm"
                    disabled={projectId === ''}
                    onClick={() => setShowCreateModal(true)}
                  >
                    <FileEdit className="h-4 w-4 mr-1" /> 新建配置
                  </Button>
                </div>
              </div>
              {projectId === '' ? (
                <p className="text-sm text-slate-500">请先选择项目。</p>
              ) : configsLoading ? (
                <p className="text-sm text-slate-500">加载中…</p>
              ) : configs.length === 0 ? (
                <p className="text-sm text-slate-500">暂无配置，可点击「新建配置」。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="py-2 pr-3">版本</th>
                        <th className="py-2 pr-3">状态</th>
                        <th className="py-2 pr-3">研究员确认</th>
                        <th className="py-2 pr-3">更新</th>
                        <th className="py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configs.map((c) => {
                        const st = STATUS_BADGE[c.status] ?? { label: c.status, variant: 'default' as BadgeVariant }
                        return (
                          <tr key={c.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3">{c.config_version_label || '—'}</td>
                            <td className="py-2 pr-3">
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </td>
                            <td className="py-2 pr-3 text-xs">
                              {c.researcher_confirmed_at ? c.researcher_confirmed_at.slice(0, 19) : '—'}
                            </td>
                            <td className="py-2 pr-3 text-xs">{c.update_time.slice(0, 19)}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedConfigId(c.id)
                                    syncEditorFromConfig(c)
                                  }}
                                >
                                  编辑
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => publishMutation.mutate(c.id)}
                                  disabled={c.status === 'published'}
                                >
                                  <Send className="h-3 w-3 mr-1" /> 发布
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => confirmMutation.mutate(c.id)}
                                  disabled={!!c.researcher_confirmed_at}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" /> 确认
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => draftMutation.mutate(c.id)}
                                >
                                  撤为草稿
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {selectedConfig && (
              <Card className="p-4 space-y-4">
                <h2 className="text-sm font-semibold text-slate-800">
                  编辑配置 #{selectedConfig.id}
                </h2>
                {createTemplateHint && (
                  <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 leading-relaxed">
                    {createTemplateHint}
                  </p>
                )}
                <div className="max-w-xs">
                  <label className="block text-xs text-slate-600 mb-1">版本标签</label>
                  <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="如 v1" />
                </div>

                <DiaryConfigEditorForm
                  formItems={formItems}
                  setFormItems={setFormItems}
                  ruleState={ruleState}
                  setRuleState={setRuleState}
                  subTab={configEditorSubTab}
                  setSubTab={setConfigEditorSubTab}
                  publishExtra={diaryPublishAudienceSlot}
                />

                {jsonError && <p className="text-sm text-red-600">{jsonError}</p>}
                <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-slate-100">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-1" /> 保存修改
                  </Button>
                  <span className="text-xs text-slate-500">
                    保存后可在列表中「发布」并「确认」；受试者端仅展示已发布且已确认的配置，与正式项目编号一致时才会自动匹配。
                  </span>
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === 'data' && (
          <div className="space-y-4 pt-4">
            <Card className="p-4 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px]">
                  <label className="block text-xs text-slate-600 mb-1">筛选受试者（可选）</label>
                  <Select
                    value={entrySubjectId}
                    onChange={(e) => {
                      setEntrySubjectId(e.target.value)
                      setEntryPage(1)
                    }}
                    options={[{ value: '', label: '全部受试者' }, ...subjectOptions]}
                  />
                </div>
                <Button variant="secondary" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" /> 下载 CSV
                </Button>
              </div>
              <DataTable
                columns={entryColumns}
                data={entries}
                loading={entriesLoading}
                rowKey="id"
                pagination={{
                  current: entryPage,
                  pageSize: 20,
                  total: entriesTotal,
                  onChange: (p) => setEntryPage(p),
                }}
              />
            </Card>
          </div>
        )}

        {tab === 'progress' && (
          <div className="space-y-4 pt-4">
            <Card className="p-4 space-y-4">
              <p className="text-sm text-slate-600">
                按当前项目在「配置日记」里填写的<strong>应填日期区间</strong>（开始日—结束日），统计每位受试者在该区间内已填写与尚未填写的日记天数。
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[280px] flex-1">
                  <label className="block text-xs text-slate-600 mb-1">受试者内部编号（逗号分隔）</label>
                  <Input
                    value={progressSubjectIds}
                    onChange={(e) => setProgressSubjectIds(e.target.value)}
                    placeholder="例如：1,2,3（在「数据查看」里筛选受试者时可见系统内部编号）"
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={projectId === '' || !progressSubjectIds.trim()}
                  onClick={() => refetchProgress()}
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> 计算进度
                </Button>
              </div>
              {projectId === '' && (
                <p className="text-sm text-amber-700">请先在页头选择项目。</p>
              )}
              {progressLoading && <p className="text-sm text-slate-500">计算中…</p>}
              {progressData?.hint && (
                <p className="text-sm text-amber-800 bg-amber-50 p-2 rounded">{progressData.hint}</p>
              )}
              {progressData && !progressData.hint && progressData.period_start && (
                <p className="text-sm text-slate-700">
                  统计区间：{progressData.period_start} ~ {progressData.period_end}，共{' '}
                  {progressData.expected_days_total} 个应填日。
                </p>
              )}
              {progressData?.subjects && progressData.subjects.length > 0 && (
                <DataTable
                  columns={progressColumns}
                  data={progressData.subjects}
                  rowKey="subject_id"
                />
              )}
            </Card>
          </div>
        )}

        <Modal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="新建日记配置"
        >
          <p className="text-sm text-slate-600 mb-3 leading-relaxed">
            将为当前项目创建一条<strong>草稿</strong>。题目与规则默认<strong>复制自正式项目编号 W26000000</strong>
            下<strong>最新一条</strong>日记配置（与多数项目通用）；若该模板项目尚无配置，则使用系统内置（每日一条、可补填等）。
          </p>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            创建后可在下方继续增删题目、调整应填周期与补填规则；保存前均可修改。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              取消
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? '生成中…' : '生成默认配置'}
            </Button>
          </div>
        </Modal>

        <Modal
          open={showNewProjectModal}
          onClose={() => {
            setShowNewProjectModal(false)
            setSetupError(null)
          }}
          title="新建研究项目"
        >
          <p className="text-sm text-slate-600 mb-3 leading-relaxed">
            将创建一条<strong>全链路研究项目</strong>，并自动生成与「正式项目编号」一致的研究协议记录，便于后续为受试者办理入组、与小程序日记任务对齐。编号提交后请与伦理与主数据保持一致。
          </p>
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs text-slate-600 mb-1">正式项目编号</label>
              <Input
                value={newProjectNo}
                onChange={(e) => setNewProjectNo(e.target.value)}
                placeholder="例如与伦理批件、合同一致的项目编号"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">项目名称</label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="便于识别的研究项目名称"
              />
            </div>
          </div>
          {setupError && <p className="text-sm text-red-600 mb-3">{setupError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setShowNewProjectModal(false)
                setSetupError(null)
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => setupProjectMutation.mutate()}
              disabled={setupProjectMutation.isPending || !newProjectNo.trim() || !newProjectName.trim()}
            >
              {setupProjectMutation.isPending ? '创建中…' : '创建并选中'}
            </Button>
          </div>
        </Modal>

        <Modal
          open={showAddSubjectModal}
          onClose={() => {
            setShowAddSubjectModal(false)
            setAddSubjectError(null)
            setAddSubjectNo('')
            setAddSubjectName('')
            setAddSubjectPhone('')
          }}
          title="登记受试者并入组"
        >
          <p className="text-sm text-slate-600 mb-3 leading-relaxed">
            用于联调验证：新建一条受试者档案并办理入组到<strong>当前所选项目</strong>。请填写您约定的受试者编号与手机号（编号最多 20
            个字符）；可不填姓名，系统将用编号生成展示名。请先在页头选中正确的研究项目。
          </p>
          {projectId !== '' && linkedProtocolLoading && (
            <p className="text-xs text-slate-600 mb-3">正在检查项目与协议是否已对齐…</p>
          )}
          {projectId !== '' && !linkedProtocolLoading && linkedProtocolHint && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded p-2 mb-3">
              {linkedProtocolHint}
            </p>
          )}
          {projectId !== '' && !linkedProtocolLoading && linkedProtocolId != null && !linkedProtocolHint && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded p-2 mb-3">
              已检测到与当前项目编号一致的研究协议，可提交登记。
            </p>
          )}
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs text-slate-600 mb-1">受试者编号</label>
              <Input
                value={addSubjectNo}
                onChange={(e) => setAddSubjectNo(e.target.value)}
                placeholder="例如本中心约定的筛选号或入组号，最多 20 字"
                maxLength={20}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">手机号码</label>
              <Input
                value={addSubjectPhone}
                onChange={(e) => setAddSubjectPhone(e.target.value)}
                placeholder="11 位手机号"
                inputMode="tel"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">姓名（选填）</label>
              <Input
                value={addSubjectName}
                onChange={(e) => setAddSubjectName(e.target.value)}
                placeholder="不填则使用「受试者(编号)」作为展示名"
              />
            </div>
          </div>
          {addSubjectError && <p className="text-sm text-red-600 mb-3">{addSubjectError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setShowAddSubjectModal(false)
                setAddSubjectError(null)
                setAddSubjectNo('')
                setAddSubjectName('')
                setAddSubjectPhone('')
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => addSubjectMutation.mutate()}
              disabled={
                addSubjectMutation.isPending ||
                projectId === '' ||
                !addSubjectNo.trim() ||
                !addSubjectPhone.trim()
              }
            >
              {addSubjectMutation.isPending ? '提交中…' : '登记并入组'}
            </Button>
          </div>
        </Modal>
      </div>
    </PermissionGuard>
  )
}
