import { useCallback, useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { receptionApi, workorderApi, qualityApi, safetyApi, qrcodeApi, executionApi, clawRegistryApi, digitalWorkforcePortalApi, type QueueItem, type SuggestionItem } from '@cn-kis/api-client'
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  CalendarCheck,
  UserCheck,
  PlayCircle,
  LogOut,
  UserX,
} from 'lucide-react'
import { StatCard, Empty, Button, Badge, Card, Modal, Input, Select, ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import { useFeishuContext, PermissionGuard, getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { QuickAction } from '@cn-kis/ui-kit'

/** 入组情况下拉（接待看板专用表，写入 board-project-sc，与工单执行独立） */
const ENROLLMENT_STATUS_OPTIONS = ['初筛合格', '正式入组', '不合格', '复筛不合格', '退出', '缺席'] as const
/** 未签到时仍可选的入组情况（与工单执行页交互一致；看板数据写入独立接口） */
const ENROLLMENT_ALLOWED_WITHOUT_CHECKIN = new Set<string>(['缺席', '退出'])

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

/** 浏览器本地日历日 YYYY-MM-DD（与工单执行页一致） */
function localTodayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function normalizeQueueSc(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s || s === '-' || s === '—' || s === '－') return ''
  return s
}

/** 今日队列排序：与工单执行页 compareQueueByProjectAndSc 一致 */
function compareQueueByProjectAndSc(a: QueueItem, b: QueueItem): number {
  const pcA = (a.project_code || '').trim()
  const pcB = (b.project_code || '').trim()
  const pcCmp = pcA.localeCompare(pcB, 'zh-CN')
  if (pcCmp !== 0) return pcCmp
  const scA = normalizeQueueSc(a.sc_number)
  const scB = normalizeQueueSc(b.sc_number)
  const emptyA = !scA
  const emptyB = !scB
  if (emptyA !== emptyB) return emptyA ? 1 : -1
  const scCmp = scA.localeCompare(scB, 'zh-CN', { numeric: true })
  if (scCmp !== 0) return scCmp
  const apptA = String(a.appointment_time || '').trim()
  const apptB = String(b.appointment_time || '').trim()
  return apptA.localeCompare(apptB, 'zh-CN')
}

function formatGenderCell(value: unknown): string {
  if (value === undefined || value === null) return '—'
  const s = String(value).trim()
  if (!s) return '—'
  const lower = s.toLowerCase()
  if (lower === 'male' || lower === 'm') return '男'
  if (lower === 'female' || lower === 'f') return '女'
  if (lower === 'other') return '其他'
  return s
}

function matchQueueSearch(item: QueueItem, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const sc = (item.sc_number ?? '').toLowerCase()
  const rd = (item.rd_number ?? '').toLowerCase()
  const name = (item.subject_name ?? '').toLowerCase()
  const pc = (item.project_code ?? '').toLowerCase()
  const pname = (item.project_name ?? '').toLowerCase()
  const phone = (item.phone ?? '').replace(/\s/g, '')
  const phoneS = s.replace(/\s/g, '')
  return sc.includes(s) || rd.includes(s) || name.includes(s) || pc.includes(s) || pname.includes(s) || phone.includes(phoneS)
}

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export default function ReceptionDashboardPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const claw = useClawQuickActions('reception', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])
  const { hasPermission } = useFeishuContext()
  const [showCreateTicket, setShowCreateTicket] = useState(false)
  const [showEventReport, setShowEventReport] = useState(false)
  const [ticketTitle, setTicketTitle] = useState('')
  const [ticketContent, setTicketContent] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventType, setEventType] = useState<'deviation' | 'adverse_event'>('deviation')
  const [eventSeverity, setEventSeverity] = useState('medium')
  const [eventDescription, setEventDescription] = useState('')
  const [showQRCodeCenter, setShowQRCodeCenter] = useState(false)
  const [qrcodeSubjectId, setQrcodeSubjectId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [queueSearch, setQueueSearch] = useState('')
  /** 今日队列 RD 号输入未提交的本地值，key: subject_id-project_code */
  const [pendingQueueRd, setPendingQueueRd] = useState<Record<string, string>>({})

  const todayStr = useMemo(() => localTodayYmd(), [])
  const [queryDate, setQueryDate] = useState(localTodayYmd)
  const [queuePage, setQueuePage] = useState(1)
  const queuePageSize = 10
  const canViewSupportTickets = hasPermission('subject.recruitment.read')
  const canManageSupportTickets = hasPermission('subject.recruitment.update')

  // 临时到访补登状态
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInPurpose, setWalkInPurpose] = useState('临时到访')
  const [walkInAutoCheckin, setWalkInAutoCheckin] = useState(true)
  /** 签到前核对受试者信息（接待看板） */
  const [checkinConfirmTarget, setCheckinConfirmTarget] = useState<QueueItem | null>(null)

  const projectCodeForApi = projectFilter.trim() || undefined

  /** 项目下拉：始终未筛选，与工单执行页一致；勿用当前页 queue 推导，避免选项不全 */
  const { data: statsOptionsRes } = useQuery({
    queryKey: ['reception', 'today-stats', queryDate, 'board', 'all-project-options'],
    queryFn: () => receptionApi.todayStats(queryDate, undefined, 'board'),
    staleTime: 12 * 1000,
  })
  /** 统计卡片：后端 _get_today_stats_board 内 get_today_queue(page_size=99999)，按项目筛选亦为全日全量，与列表分页无关 */
  const { data: statsRes } = useQuery({
    queryKey: ['reception', 'today-stats', queryDate, 'board', projectCodeForApi ?? ''],
    queryFn: () => receptionApi.todayStats(queryDate, projectCodeForApi, 'board'),
    staleTime: 12 * 1000,
  })
  const { data: queueRes, isFetching: queueListFetching } = useQuery({
    queryKey: ['reception', 'today-queue', 'board', queryDate, queuePage, queuePageSize, projectCodeForApi ?? ''],
    queryFn: () =>
      receptionApi.todayQueue({
        target_date: queryDate,
        page: queuePage,
        page_size: queuePageSize,
        project_code: projectCodeForApi,
        source: 'board',
      }),
    enabled: queueSearch.trim().length === 0,
  })
  const { data: searchQueueRes, isFetching: searchQueueFetching } = useQuery({
    queryKey: ['reception', 'today-queue', 'board', 'search', queryDate, projectCodeForApi ?? '', queueSearch.trim()],
    queryFn: () =>
      receptionApi.todayQueue({
        target_date: queryDate,
        page: 1,
        page_size: 500,
        project_code: projectCodeForApi,
        source: 'board',
      }),
    enabled: queueSearch.trim().length > 0,
  })
  const { data: alertRes } = useQuery({
    queryKey: ['reception', 'pending-alerts', queryDate],
    queryFn: () => receptionApi.pendingAlerts(queryDate),
  })
  const { data: qrListRes, refetch: refetchQrList } = useQuery({
    queryKey: ['reception', 'qrcode-list'],
    queryFn: () => qrcodeApi.list({ entity_type: 'subject', page: 1, page_size: 20 }),
    enabled: showQRCodeCenter,
  })
  const { data: ticketRes } = useQuery({
    queryKey: ['reception', 'support-tickets'],
    queryFn: () => executionApi.listSupportTickets(),
    enabled: canViewSupportTickets,
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'reception'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('reception'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []
  const refreshBoardQueueAndStats = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
    void qc.invalidateQueries({ queryKey: ['reception', 'today-stats'] })
    void qc.invalidateQueries({ queryKey: ['reception', 'pending-alerts'] })
  }, [qc])

  /** 接待看板签到（独立于工单执行，SC/RD/签到时间独立）。支持 project_code 实现同天多项目各自 SC。 */
  const checkinMutation = useMutation({
    mutationFn: (params: { subject_id: number; project_code?: string }) =>
      receptionApi.boardCheckin({ subject_id: params.subject_id, target_date: queryDate, project_code: params.project_code }),
    onSuccess: refreshBoardQueueAndStats,
  })
  const handleConfirmCheckin = () => {
    if (!checkinConfirmTarget) return
    checkinMutation.mutate(
      { subject_id: checkinConfirmTarget.subject_id, project_code: checkinConfirmTarget.project_code },
      {
        onSuccess: () => setCheckinConfirmTarget(null),
        onError: (e) => window.alert('签到失败：' + (e as Error).message),
      },
    )
  }
  /** 接待看板签出（独立于工单执行） */
  const checkoutMutation = useMutation({
    mutationFn: (payload: { subject_id: number; target_date: string }) =>
      receptionApi.boardCheckout(payload),
    onSuccess: refreshBoardQueueAndStats,
  })
  const updateBoardProjectScMutation = useMutation({
    mutationFn: (params: { subject_id: number; project_code: string; enrollment_status?: string; rd_number?: string }) =>
      receptionApi.updateBoardProjectSc(params),
    onSuccess: refreshBoardQueueAndStats,
    onError: (err: Error) => window.alert('保存失败：' + err.message),
  })
  const createTicketMutation = useMutation({
    mutationFn: async (payload: { enrollmentId: number; title: string; description: string }) =>
      workorderApi.create({
        enrollment_id: payload.enrollmentId,
        title: payload.title,
        description: payload.description,
      }),
    onSuccess: () => {
      window.alert('答疑工单已创建')
      setShowCreateTicket(false)
      setTicketTitle('')
      setTicketContent('')
    },
  })

  const walkInMutation = useMutation({
    mutationFn: () => receptionApi.walkInRegister({
      name: walkInName.trim(),
      phone: walkInPhone.trim(),
      purpose: walkInPurpose,
      auto_checkin: walkInAutoCheckin,
    }),
    onSuccess: (res) => {
      const d = res.data
      const msg = d?.checkin
        ? `补登并签到成功：${d.subject_name}（${d.phone_masked}）`
        : `补登成功：${d?.subject_name}（${d?.phone_masked}），请手动签到`
      window.alert(msg)
      setShowWalkIn(false)
      setWalkInName('')
      setWalkInPhone('')
      refreshBoardQueueAndStats()
    },
    onError: (err: Error) => {
      window.alert(`补登失败：${err.message}`)
    },
  })
  const reportEventMutation = useMutation({
    mutationFn: async (payload: { enrollmentId: number }) => {
      if (eventType === 'deviation') {
        return qualityApi.createDeviation({
          title: eventTitle || '前台异常事件',
          category: 'process_deviation',
          severity: eventSeverity,
          reported_at: new Date().toISOString(),
          project: 'Reception',
          project_id: payload.enrollmentId,
          description: eventDescription || '前台上报异常事件',
        })
      }
      return safetyApi.createAdverseEvent({
        enrollment_id: payload.enrollmentId,
        description: eventDescription || '前台上报不良事件',
        start_date: new Date().toISOString().slice(0, 10),
        severity: eventSeverity,
        relation: 'possible',
        action_taken: 'reported',
      })
    },
    onSuccess: () => {
      window.alert('事件已上报')
      setShowEventReport(false)
      setEventTitle('')
      setEventDescription('')
      setEventType('deviation')
      setEventSeverity('medium')
    },
  })
  const generateQrMutation = useMutation({
    mutationFn: (subjectId: number) => qrcodeApi.generate({ entity_type: 'subject', entity_id: subjectId }),
    onSuccess: () => refetchQrList(),
  })
  const deactivateQrMutation = useMutation({
    mutationFn: (recordId: number) => qrcodeApi.deactivate(recordId),
    onSuccess: () => refetchQrList(),
  })
  const reactivateQrMutation = useMutation({
    mutationFn: (recordId: number) => qrcodeApi.reactivate(recordId),
    onSuccess: () => refetchQrList(),
  })
  const regenerateQrMutation = useMutation({
    mutationFn: (recordId: number) => qrcodeApi.regenerate(recordId),
    onSuccess: () => refetchQrList(),
  })
  const assignTicketMutation = useMutation({
    mutationFn: ({ ticketId, assignedToId }: { ticketId: number; assignedToId: number }) =>
      executionApi.assignSupportTicket(ticketId, assignedToId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reception', 'support-tickets'] }),
  })
  const closeTicketMutation = useMutation({
    mutationFn: (ticketId: number) => executionApi.closeSupportTicket(ticketId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reception', 'support-tickets'] }),
  })

  const queueRaw = queueRes?.data?.items ?? []
  const queueTotal = queueRes?.data?.total ?? 0
  const searchQueueRaw = searchQueueRes?.data?.items ?? []
  const projectOptions = useMemo(() => {
    const raw = statsOptionsRes?.data?.project_options
    if (!Array.isArray(raw) || raw.length === 0) return []
    return [...raw].sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'zh-CN'))
  }, [statsOptionsRes])

  useEffect(() => {
    if (!projectFilter.trim()) return
    if (projectOptions.length === 0) return
    const codes = new Set(projectOptions.map((o) => o.code))
    if (!codes.has(projectFilter.trim())) {
      setProjectFilter('')
      setQueuePage(1)
    }
  }, [projectOptions, projectFilter, queryDate])

  /** 卡片数字仅来自 today-stats（board），勿用 queue 当前页推算 */
  const displayStats = statsRes?.data
  const queueSorted = useMemo(() => {
    const base = queueSearch.trim() ? searchQueueRaw : queueRaw
    const filtered = queueSearch.trim() ? base.filter((i) => matchQueueSearch(i, queueSearch)) : base
    return [...filtered].sort(compareQueueByProjectAndSc)
  }, [queueSearch, queueRaw, searchQueueRaw])
  const isSearchMode = queueSearch.trim().length > 0
  const displayQueueTotal = isSearchMode ? queueSorted.length : queueTotal
  const displayQueuePageTotal = Math.max(1, Math.ceil(displayQueueTotal / queuePageSize))
  const displayQueue = isSearchMode
    ? queueSorted.slice((queuePage - 1) * queuePageSize, queuePage * queuePageSize)
    : queueSorted
  const alerts = alertRes?.data?.items || []
  const tickets = ticketRes?.data?.items || []

  const displayDateText = useMemo(
    () =>
      new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
      }).format(new Date(queryDate)),
    [queryDate],
  )
  const hasProjectFilter = !!projectFilter.trim()

  const withEnrollment = (action: (enrollmentId: number) => void) => {
    const target = queueSorted.find((item) => item.enrollment_id)
    if (!target?.enrollment_id) {
      window.alert('当前队列暂无可关联入组记录，请先选择已入组受试者')
      return
    }
    action(target.enrollment_id)
  }

  const handleCreateTicket = () => {
    withEnrollment((enrollmentId) => {
      if (!ticketTitle.trim()) {
        window.alert('请输入工单标题')
        return
      }
      createTicketMutation.mutate({
        enrollmentId,
        title: ticketTitle.trim(),
        description: ticketContent.trim(),
      })
    })
  }

  const handleReportEvent = () => {
    withEnrollment((enrollmentId) => {
      reportEventMutation.mutate({ enrollmentId })
    })
  }

  const handleCallNext = async () => {
    const res = await receptionApi.callNext()
    if (res.data?.called && res.data.subject) {
      window.alert(`已叫号：${res.data.subject.name}`)
      return
    }
    window.alert(res.data?.message || '当前无可叫号受试者')
  }

  const handleExportQueue = async () => {
    try {
      const res = await receptionApi.todayQueueExport({
        target_date: queryDate,
        project_code: projectCodeForApi,
        source: 'board',
      })
      const items = res.data?.items ?? []
      const headers = ['项目名称', '项目编号', 'SC号', '入组情况', 'RD号', '受试者姓名', '拼音首字母', '性别', '年龄', '手机号', '预约时间', '签到时间', '签出时间', '状态']
      const rows = items.map((i) => [
        i.project_name ?? '',
        i.project_code ?? '',
        i.sc_number ?? '',
        i.enrollment_status ?? '',
        i.rd_number ?? '',
        i.subject_name ?? '',
        i.name_pinyin_initials ?? '',
        formatGenderCell(i.gender),
        i.age ?? '',
        i.phone ?? '',
        i.appointment_time ?? '',
        i.checkin_time ?? '',
        i.checkout_time ?? '',
        i.status === 'checked_in' ? '已签到' : i.status === 'checked_out' ? '已签出' : i.status === 'no_show' ? '缺席' : i.status === 'in_progress' ? '执行中' : '待签到',
      ])
      const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\r\n')
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `今日队列_${queryDate}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      window.alert('导出成功')
    } catch (e) {
      window.alert('导出失败：' + (e as Error).message)
    }
  }

  const handleGenerateSubjectQR = async () => {
    const subjectId = Number(qrcodeSubjectId)
    if (!subjectId) {
      window.alert('请输入有效受试者ID')
      return
    }
    await generateQrMutation.mutateAsync(subjectId)
    setQrcodeSubjectId('')
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">前台接待</h2>
        <p className="text-sm text-slate-500 mt-1">{displayDateText}</p>
      </div>

      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="reception" actions={claw.actions.filter((a) => a.id !== 'check-in')} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 space-y-3" data-section="query-filter">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">查询日期</span>
            <input
              type="date"
              value={queryDate}
              onChange={(e) => setQueryDate(e.target.value)}
              max={todayStr}
              title="查询日期"
              aria-label="查询日期"
              className="min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            />
            {queryDate !== todayStr && (
              <button
                type="button"
                onClick={() => setQueryDate(todayStr)}
                className="text-sm text-blue-600 hover:underline"
              >
                回到今日
              </button>
            )}
          </div>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-slate-700">项目筛选</span>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value)
                setQueuePage(1)
              }}
              title="项目筛选"
              aria-label="项目筛选"
              className="min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white w-40"
            >
              <option value="">全部项目</option>
              {projectOptions.map(({ code }) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={queueSearch}
                onChange={(e) => {
                  setQueueSearch(e.target.value)
                  setQueuePage(1)
                }}
                placeholder="搜索 项目编号/SC号/RD号/姓名/手机号"
                title="与项目筛选为且关系：先按项目筛选，再在结果中搜索（含项目名称）"
                className="min-h-10 w-72 min-w-[200px] pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {hasProjectFilter
            ? `当前筛选：${projectFilter}，统计与队列已联动`
            : `默认展示 ${displayDateText} 当日全部预约数据`}
          {queueSearch.trim() && '；项目筛选与搜索为且关系'}
        </p>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:gap-3">
          <StatCard
            label="预约总数"
            value={displayStats?.total_appointments ?? 0}
            icon={<CalendarCheck className="h-4 w-4" />}
            color="blue"
          />
          <StatCard
            label="已签到"
            value={displayStats?.signed_in_count ?? displayStats?.total_signed_in ?? displayStats?.checked_in ?? 0}
            icon={<UserCheck className="h-4 w-4" />}
            color="green"
          />
          <StatCard
            label="执行中"
            value={displayStats?.in_progress ?? 0}
            icon={<PlayCircle className="h-4 w-4" />}
            color="amber"
          />
          <StatCard
            label="已签出"
            value={displayStats?.checked_out ?? 0}
            icon={<LogOut className="h-4 w-4" />}
            color="teal"
          />
          <StatCard
            label="缺席"
            value={displayStats?.enrollment_status_counts?.['缺席'] ?? displayStats?.no_show ?? 0}
            icon={<UserX className="h-4 w-4" />}
            color="red"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:gap-3">
          {(['初筛合格', '正式入组', '不合格', '复筛不合格', '退出'] as const).map((status) => (
            <StatCard
              key={status}
              label={status}
              value={displayStats?.enrollment_status_counts?.[status] ?? 0}
              color={
                status === '正式入组'
                  ? 'green'
                  : status === '不合格' || status === '复筛不合格'
                    ? 'red'
                    : status === '退出'
                      ? 'indigo'
                      : 'blue'
              }
            />
          ))}
        </div>
      </div>

      <Card
        variant="bordered"
        title={queryDate === todayStr ? '今日队列' : `${displayDateText} 预约队列`}
        extra={
          <Button className="min-h-9" size="sm" variant="outline" onClick={handleExportQueue} disabled={displayQueueTotal === 0}>
            <Download className="w-4 h-4 mr-1" /> 导出
          </Button>
        }
      >
        {(queueListFetching || (isSearchMode && searchQueueFetching)) ? (
          <p className="text-sm text-slate-400">加载中...</p>
        ) : displayQueue.length === 0 ? (
          <Empty title={isSearchMode ? '未找到匹配的 SC号/RD号/姓名或手机号' : (queryDate === todayStr ? '今日暂无预约' : '当日暂无预约')} />
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 font-medium text-slate-600">项目编号</th>
                    <th className="text-left py-2 font-medium text-slate-600">SC号</th>
                    <th className="text-left py-2 font-medium text-slate-600">受试者姓名</th>
                    <th className="text-left py-2 font-medium text-slate-600">拼音首字母</th>
                    <th className="text-left py-2 font-medium text-slate-600">性别</th>
                    <th className="text-left py-2 font-medium text-slate-600">年龄</th>
                    <th className="text-left py-2 font-medium text-slate-600">手机号</th>
                    <th className="text-left py-2 font-medium text-slate-600 hidden">受试者编号</th>
                    <th className="text-left py-2 font-medium text-slate-600">访视点</th>
                    <th className="text-left py-2 font-medium text-slate-600">预约时间</th>
                    <th className="text-left py-2 font-medium text-slate-600">签到/签出</th>
                    <th className="text-left py-2 font-medium text-slate-600">状态</th>
                    <th className="text-left py-2 font-medium text-slate-600 w-20 hidden">过号</th>
                    <th className="text-left py-2 font-medium text-slate-600">入组情况</th>
                    <th className="text-left py-2 font-medium text-slate-600">RD号</th>
                    <th className="text-left py-2 font-medium text-slate-600 min-w-[160px]">操作</th>
                    <th className="text-left py-2 font-medium text-slate-600">编辑</th>
                  </tr>
                </thead>
                <tbody>
                  {displayQueue.map((item) => {
                    const queueRowKey = `${item.subject_id}-${(item.project_code || '').trim()}`
                    const isEnrolled = (item.enrollment_status || '').trim() === '正式入组'
                    const rdDisplay = pendingQueueRd[queueRowKey] ?? item.rd_number ?? (isEnrolled ? 'RD' : '')
                    const hasBoardCheckin = !!item.checkin_id
                    return (
                      <tr
                        key={`${item.subject_id}-${item.appointment_time}-${item.appointment_id}`}
                        className={`border-b border-slate-100 ${item.status === 'in_progress' ? 'bg-amber-50/80' : ''}`}
                        data-stat="queue-item"
                        data-status={item.status}
                      >
                        <td className="py-2 text-slate-700">{item.project_code || '-'}</td>
                        <td className="py-2 text-slate-700">{item.sc_number ?? '-'}</td>
                        <td className="py-2 text-slate-700">{item.subject_name || '-'}</td>
                        <td className="py-2 text-slate-600">{item.name_pinyin_initials ?? '-'}</td>
                        <td className="py-2 text-slate-600">{formatGenderCell(item.gender)}</td>
                        <td className="py-2 text-slate-600">{item.age ?? '-'}</td>
                        <td className="py-2 text-slate-600">{item.phone ?? '-'}</td>
                        <td className="py-2 text-slate-700 hidden">{item.subject_no || '-'}</td>
                        <td className="py-2 text-slate-600">{item.visit_point || '-'}</td>
                        <td className="py-2 text-slate-600">{item.appointment_time || '-'}</td>
                        <td className="py-2 text-slate-600">
                          {item.checkin_time ? new Date(item.checkin_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          {' / '}
                          {item.checkout_time ? new Date(item.checkout_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="py-2">
                          {item.status === 'checked_in' ? '已签到' : item.status === 'checked_out' ? '已签出' : item.status === 'no_show' ? '缺席' : item.status === 'in_progress' ? '执行中' : '待签到'}
                        </td>
                        <td className="py-2 hidden">
                          <span className="text-slate-400 text-xs">—</span>
                        </td>
                        <td className="py-2">
                          <select
                            className="w-full min-w-[100px] px-2 py-1 text-sm border border-slate-200 rounded"
                            value={(item.enrollment_status || '').trim() || ''}
                            onChange={(e) => {
                              const v = e.target.value
                              updateBoardProjectScMutation.mutate({
                                subject_id: item.subject_id,
                                project_code: (item.project_code || '').trim(),
                                enrollment_status: v || undefined,
                                rd_number: v === '正式入组' && !(item.rd_number || '').trim() ? 'RD' : (item.rd_number || '').trim() || undefined,
                              })
                            }}
                          >
                            <option value="">请选择</option>
                            {ENROLLMENT_STATUS_OPTIONS.map((opt) => (
                              <option
                                key={opt}
                                value={opt}
                                disabled={!hasBoardCheckin && !ENROLLMENT_ALLOWED_WITHOUT_CHECKIN.has(opt)}
                              >
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2">
                          {isEnrolled ? (
                            <input
                              type="text"
                              className="w-24 px-2 py-1 text-sm border border-slate-200 rounded"
                              value={rdDisplay}
                              onChange={(e) => setPendingQueueRd((prev) => ({ ...prev, [queueRowKey]: e.target.value }))}
                              onBlur={() => {
                                const val = (pendingQueueRd[queueRowKey] ?? item.rd_number ?? 'RD').trim()
                                updateBoardProjectScMutation.mutate({
                                  subject_id: item.subject_id,
                                  project_code: (item.project_code || '').trim(),
                                  rd_number: val || 'RD',
                                })
                                setPendingQueueRd((prev) => {
                                  const next = { ...prev }
                                  delete next[queueRowKey]
                                  return next
                                })
                              }}
                              placeholder="RD 后填数字"
                            />
                          ) : (
                            <span className="text-slate-400">{item.rd_number || '—'}</span>
                          )}
                        </td>
                        <td className="py-2">
                          {item.status === 'waiting' && (
                            <PermissionGuard permission="reception.checkin.create">
                              <Button
                                className="min-h-8"
                                size="sm"
                                data-action="checkin"
                                onClick={() => setCheckinConfirmTarget(item)}
                              >
                                签到
                              </Button>
                            </PermissionGuard>
                          )}
                          {(item.status === 'checked_in' || item.status === 'in_progress') && item.checkin_id && (
                            <>
                              {item.task_type === 'pre_screening' && (
                                <Button
                                  className="min-h-8 mr-1"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(getWorkstationUrl('recruitment', `#/prescreening?subject_id=${item.subject_id}`), '_blank')}
                                >
                                  发起初筛
                                </Button>
                              )}
                              <Button
                                className="min-h-8"
                                size="sm"
                                variant="outline"
                                data-action="checkout"
                                onClick={() => checkoutMutation.mutate({ subject_id: item.subject_id, target_date: queryDate })}
                              >
                                签出
                              </Button>
                            </>
                          )}
                        </td>
                        <td className="py-2">
                          <PermissionGuard permission="subject.subject.update">
                            <Button
                              className="min-h-8"
                              size="sm"
                              variant="outline"
                              title="预约与工单执行共用；跳转至工单执行页编辑"
                              onClick={() => navigate('/appointments')}
                            >
                              编辑
                            </Button>
                          </PermissionGuard>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 pt-1">
              接待看板签到/签出、SC 号、入组情况与 RD 与工单执行相互独立；未在看板签到时仅可选「缺席」「退出」。编辑预约请至工单执行页。
            </p>
            {displayQueuePageTotal > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  共 {displayQueueTotal} 条，每页 {queuePageSize} 条{isSearchMode ? '（搜索模式）' : ''}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-8"
                    disabled={queuePage <= 1}
                    onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="px-2 text-sm text-slate-600">{queuePage} / {displayQueuePageTotal}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-8"
                    disabled={queuePage >= displayQueuePageTotal}
                    onClick={() => setQueuePage((p) => Math.min(displayQueuePageTotal, p + 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
      <Card variant="bordered" title="待处理提醒">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-400">暂无待处理提醒</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert, idx) => (
              <div key={`${alert.subject_no}-${idx}`} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-sm text-amber-800">
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </Card>

      {displayStats?.total_appointments > 0 && (
        <DigitalWorkerActionCard
          roleCode="reception_assistant"
          roleName="接待助理"
          title="队列签到与叫号建议"
          description="接待助理建议优先处理待签到和即将到点的预约，减少现场等待与拥堵。"
          items={[
            {
              key: 'pending-checkin',
              label: '待签到提醒',
              value: `今日待签到/处理中 ${Math.max((displayStats?.total_appointments ?? 0) - (displayStats?.checked_in ?? 0) - (displayStats?.checked_out ?? 0), 0)} 人`,
            },
          ]}
          onTrigger={handleCallNext}
          triggerLabel="开始叫号处理"
        />
      )}
      {canViewSupportTickets && (
        <Card variant="bordered" title="答疑工单SLA">
        {tickets.length === 0 ? (
          <p className="text-sm text-slate-400">暂无工单</p>
        ) : (
          <div className="space-y-2">
            {tickets.slice(0, 8).map((ticket) => (
              <div key={ticket.id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-800">{ticket.ticket_no} · {ticket.title}</div>
                  <Badge variant={ticket.sla?.is_overdue ? 'warning' : 'default'}>
                    {ticket.sla?.is_overdue ? '已逾期' : '处理中'}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500">
                  状态：{ticket.status} · 优先级：{ticket.priority || 'normal'} · 剩余 {ticket.sla?.remaining_minutes ?? '--'} 分钟
                </div>
                <div className="flex items-end gap-2 mt-2">
                  <Input
                    label="指派人ID"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    placeholder="Account ID"
                    inputClassName="min-h-10"
                    title="指派人ID"
                  />
                  <Button
                    className="min-h-10"
                    size="sm"
                    variant="outline"
                    disabled={!canManageSupportTickets}
                    onClick={() => {
                      const value = Number(assigneeId)
                      if (!value) {
                        window.alert('请输入有效处理人ID')
                        return
                      }
                      assignTicketMutation.mutate({ ticketId: ticket.id, assignedToId: value })
                    }}
                  >
                    指派
                  </Button>
                  <Button
                    className="min-h-10"
                    size="sm"
                    variant="outline"
                    disabled={!canManageSupportTickets}
                    onClick={() => closeTicketMutation.mutate(ticket.id)}
                  >
                    关闭
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        </Card>
      )}
      <Modal
        open={!!checkinConfirmTarget}
        onClose={() => !checkinMutation.isPending && setCheckinConfirmTarget(null)}
        title="确认签到"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={checkinMutation.isPending} onClick={() => setCheckinConfirmTarget(null)}>
              取消
            </Button>
            <Button size="sm" disabled={checkinMutation.isPending} onClick={handleConfirmCheckin}>
              {checkinMutation.isPending ? '提交中…' : '确认签到'}
            </Button>
          </div>
        }
      >
        {checkinConfirmTarget ? (
          <div className="space-y-4 text-sm text-slate-700">
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              请核对以下信息与现场受试者是否一致。若<strong className="font-semibold">有误</strong>请点击「取消」，核实后再操作；若<strong className="font-semibold">无误</strong>请点击「确认签到」。
            </p>
            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2">
              <dt className="text-slate-500">姓名</dt>
              <dd className="font-medium text-slate-900">{checkinConfirmTarget.subject_name || '—'}</dd>
              <dt className="text-slate-500">手机号</dt>
              <dd className="font-medium text-slate-900">{checkinConfirmTarget.phone?.trim() || '—'}</dd>
              <dt className="text-slate-500">项目编号</dt>
              <dd className="font-medium text-slate-900">{(checkinConfirmTarget.project_code || '').trim() || '—'}</dd>
              <dt className="text-slate-500">访视点</dt>
              <dd className="font-medium text-slate-900">{(checkinConfirmTarget.visit_point || '').trim() || '—'}</dd>
            </dl>
          </div>
        ) : null}
      </Modal>
      <Modal
        open={showCreateTicket}
        title="创建答疑工单"
        onClose={() => setShowCreateTicket(false)}
        footer={
          <>
            <Button className="min-h-11" size="sm" variant="outline" onClick={() => setShowCreateTicket(false)}>关闭</Button>
            <Button className="min-h-11" size="sm" onClick={handleCreateTicket} disabled={createTicketMutation.isPending}>提交</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="工单标题"
            placeholder="请输入工单标题"
            value={ticketTitle}
            onChange={(e) => setTicketTitle(e.target.value)}
            inputClassName="min-h-11"
            title="工单标题"
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">问题描述</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              placeholder="请输入问题描述"
              value={ticketContent}
              onChange={(e) => setTicketContent(e.target.value)}
              title="问题描述"
            />
          </div>
        </div>
      </Modal>
      <Modal
        open={showEventReport}
        title="事件上报"
        onClose={() => setShowEventReport(false)}
        footer={
          <>
            <Button className="min-h-11" size="sm" variant="outline" onClick={() => setShowEventReport(false)}>关闭</Button>
            <Button className="min-h-11" size="sm" onClick={handleReportEvent} disabled={reportEventMutation.isPending}>提交</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="事件类型"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as 'deviation' | 'adverse_event')}
            title="事件类型"
            options={[
              { value: 'deviation', label: '偏差' },
              { value: 'adverse_event', label: '不良事件' },
            ]}
          />
          <Select
            label="严重程度"
            value={eventSeverity}
            onChange={(e) => setEventSeverity(e.target.value)}
            title="严重程度"
            options={[
              { value: 'low', label: '低' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' },
            ]}
          />
          <Input
            label="事件标题"
            placeholder="请输入事件标题"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            inputClassName="min-h-11"
            title="事件标题"
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">事件描述</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              placeholder="请输入事件描述"
              value={eventDescription}
              onChange={(e) => setEventDescription(e.target.value)}
              title="事件描述"
            />
          </div>
        </div>
      </Modal>
      <Modal
        open={showQRCodeCenter}
        title="二维码管理中心"
        onClose={() => setShowQRCodeCenter(false)}
        footer={
          <>
            <Button className="min-h-11" size="sm" variant="outline" onClick={() => setShowQRCodeCenter(false)}>关闭</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <Input
              label="受试者ID"
              placeholder="输入 subject_id 生成二维码"
              value={qrcodeSubjectId}
              onChange={(e) => setQrcodeSubjectId(e.target.value)}
              inputClassName="min-h-11"
              title="受试者ID"
            />
            <Button className="min-h-11" size="sm" onClick={handleGenerateSubjectQR} disabled={generateQrMutation.isPending}>生成</Button>
          </div>
          <div className="space-y-2 max-h-[320px] overflow-auto">
            {(qrListRes?.data?.items || []).map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="text-sm text-slate-700">{item.label} · hash: {item.qr_hash}</div>
                <div className="text-xs text-slate-500 break-all">{item.qr_data}</div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.is_active ? 'success' : 'default'}>{item.is_active ? '有效' : '停用'}</Badge>
                  {item.is_active ? (
                    <Button className="min-h-10" size="sm" variant="outline" onClick={() => deactivateQrMutation.mutate(item.id)}>停用</Button>
                  ) : (
                    <Button className="min-h-10" size="sm" variant="outline" onClick={() => reactivateQrMutation.mutate(item.id)}>启用</Button>
                  )}
                  <Button className="min-h-10" size="sm" variant="outline" onClick={() => regenerateQrMutation.mutate(item.id)}>重置</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
      {/* 临时到访补登 Modal */}
      <Modal
        open={showWalkIn}
        title="无预约临时到访补登"
        onClose={() => setShowWalkIn(false)}
        data-testid="walkin-modal"
      >
        <div className="space-y-4 min-w-72">
          <p className="text-sm text-slate-500">为无预约受试者创建当日预约并可选自动签到</p>
          <Input
            title="姓名"
            placeholder="受试者姓名"
            value={walkInName}
            onChange={(e) => setWalkInName(e.target.value)}
            inputClassName="min-h-11"
            data-testid="walkin-name"
          />
          <Input
            title="手机号"
            placeholder="11位手机号"
            value={walkInPhone}
            onChange={(e) => setWalkInPhone(e.target.value)}
            inputClassName="min-h-11"
            maxLength={11}
            data-testid="walkin-phone"
          />
          <Input
            title="到访事由"
            placeholder="临时到访"
            value={walkInPurpose}
            onChange={(e) => setWalkInPurpose(e.target.value)}
            inputClassName="min-h-11"
          />
          <div className="flex items-center gap-2">
            <input
              id="auto-checkin"
              type="checkbox"
              checked={walkInAutoCheckin}
              onChange={(e) => setWalkInAutoCheckin(e.target.checked)}
              data-testid="walkin-auto-checkin"
            />
            <label htmlFor="auto-checkin" className="text-sm text-slate-700">同时自动签到</label>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 min-h-11"
              size="sm"
              onClick={() => walkInMutation.mutate()}
              disabled={walkInMutation.isPending || !walkInName.trim() || !/^1\d{10}$/.test(walkInPhone.trim())}
              data-testid="walkin-submit"
            >
              {walkInMutation.isPending ? '处理中...' : '确认补登'}
            </Button>
            <Button className="min-h-11" size="sm" variant="outline" onClick={() => setShowWalkIn(false)}>取消</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
