/**
 * 项目监察 — 按执行开始时间排序；支持按执行开始时间的年月筛选；监察计划/实际与状态联动
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qualityApi, protocolApi, type ProjectSupervisionItem, type ProjectSupervisionDetail } from '@cn-kis/api-client'
import { Card, DataTable, StatCard, Input, Modal, Button, Badge, type Column } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import {
  FolderKanban,
  Plus,
  ClipboardClock,
  CircleCheck,
  FileQuestion,
  Eye,
} from 'lucide-react'

type Row = ProjectSupervisionItem

const statusVariant: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  pending_plan: 'default',
  abnormal: 'error',
  pending_execution: 'warning',
  completed: 'success',
}

function currentYearMonth(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** 将输入规范为 YYYY-MM-DD；无效则返回 undefined（避免把斜杠日期原样发给后端） */
function normalizeIsoDateInput(s: string): string | undefined {
  const t = (s || '').trim()
  if (!t) return undefined
  const d = t.replace(/\//g, '-').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  return undefined
}

export function ProjectSupervisionPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const listMode = searchParams.get('tab') === 'management' ? 'management' : 'supervision'

  const [page, setPage] = useState(1)
  const pageSize = 20
  const [keyword, setKeyword] = useState('')
  const [researcherKeyword, setResearcherKeyword] = useState('')
  const [yearMonth, setYearMonth] = useState(currentYearMonth())

  const { data, isLoading } = useQuery({
    queryKey: [
      'quality',
      'project-supervision',
      page,
      pageSize,
      keyword,
      yearMonth,
      listMode,
      researcherKeyword,
    ],
    queryFn: () =>
      qualityApi.listProjectSupervision({
        page,
        page_size: pageSize,
        list_mode: listMode,
        ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
        ...(yearMonth.trim() ? { year_month: yearMonth.trim() } : {}),
        ...(researcherKeyword.trim() && listMode === 'supervision'
          ? { researcher_keyword: researcherKeyword.trim() }
          : {}),
      }),
  })

  const raw = data?.data
  const items = raw?.items ?? []
  const total = raw?.total ?? 0
  const stats = raw?.stats
  const pendingSupervisionCount = stats?.pending_supervision ?? 0
  const supervisedCount = stats?.supervised ?? 0
  const noRecordCount = stats?.no_supervision_record ?? 0

  const [modalOpen, setModalOpen] = useState(false)
  /** 打开弹窗时的页签（避免切换页签后弹窗逻辑错乱） */
  const [modalOpenedAsManagement, setModalOpenedAsManagement] = useState(false)
  const [activeRow, setActiveRow] = useState<Row | null>(null)
  const [planText, setPlanText] = useState('')
  const [actualText, setActualText] = useState('')

  const emptyCreateForm = () => ({
    title: '',
    code: '',
    group_label: '',
    sample_size: '',
    backup_sample_label: '',
    visits_summary: '',
    execution_start: '',
    execution_end: '',
    principal_investigator: '',
  })

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: async () => {
      const title = createForm.title.trim()
      if (!title) throw new Error('请填写项目名称')
      const n = createForm.sample_size.trim()
      let sampleSize: number | undefined
      if (n) {
        const x = Number(n)
        if (Number.isNaN(x) || x < 0) throw new Error('样本量须为非负数字')
        sampleSize = x
      }
      const execStartRaw = createForm.execution_start.trim()
      const execEndRaw = createForm.execution_end.trim()
      const execution_start = normalizeIsoDateInput(execStartRaw)
      const execution_end = normalizeIsoDateInput(execEndRaw)
      if (execStartRaw && !execution_start) {
        throw new Error('执行开始时间格式须为 YYYY-MM-DD（或浏览器日期选择器）')
      }
      if (execEndRaw && !execution_end) {
        throw new Error('执行结束时间格式须为 YYYY-MM-DD（或浏览器日期选择器）')
      }
      if (execution_start && execution_end && execution_start > execution_end) {
        throw new Error('执行结束时间须晚于或等于执行开始时间')
      }
      const payload = {
        title,
        code: createForm.code.trim() || undefined,
        sample_size: sampleSize,
        group_label: createForm.group_label.trim() || undefined,
        backup_sample_label: createForm.backup_sample_label.trim() || undefined,
        visits_summary: createForm.visits_summary.trim() || undefined,
        execution_start,
        execution_end,
        principal_investigator: createForm.principal_investigator.trim() || undefined,
        quality_manual_test: true,
      }
      try {
        await qualityApi.createProtocolForSupervision(payload)
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status
        // 旧后端未挂载 POST /quality/.../create-protocol 时返回 404；回退到协议创建（同样支持 quality_manual_test）
        if (status === 404) {
          await protocolApi.create(payload)
        } else {
          throw e
        }
      }
      return { execStart: execution_start ?? '' }
    },
    onSuccess: ({ execStart }) => {
      setCreateError(null)
      setCreateModalOpen(false)
      setCreateForm(emptyCreateForm())
      if (execStart.length >= 7) setYearMonth(execStart.slice(0, 7))
      else setYearMonth(currentYearMonth())
      setPage(1)
      queryClient.invalidateQueries({ queryKey: ['quality', 'project-supervision'] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { msg?: string } }; message?: string })?.response?.data?.msg
        ?? (err as Error)?.message
        ?? '创建失败'
      setCreateError(msg)
    },
  })

  const detailQuery = useQuery({
    queryKey: ['quality', 'project-supervision-detail', activeRow?.protocol_id],
    queryFn: () => qualityApi.getProjectSupervision(activeRow!.protocol_id),
    enabled: modalOpen && !!activeRow?.protocol_id,
  })

  useEffect(() => {
    const d = detailQuery.data?.data as ProjectSupervisionDetail | undefined
    if (!d) return
    setPlanText(d.plan_content_full ?? d.plan_content ?? '')
    setActualText(d.actual_content_full ?? d.actual_content ?? '')
  }, [detailQuery.data])

  const planMutation = useMutation({
    mutationFn: () => qualityApi.submitSupervisionPlan(activeRow!.protocol_id, planText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality', 'project-supervision'] })
      queryClient.invalidateQueries({ queryKey: ['quality', 'project-supervision-detail'] })
    },
  })

  const actualMutation = useMutation({
    mutationFn: () => qualityApi.submitSupervisionActual(activeRow!.protocol_id, actualText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality', 'project-supervision'] })
      queryClient.invalidateQueries({ queryKey: ['quality', 'project-supervision-detail'] })
      setModalOpen(false)
    },
  })

  const detail = detailQuery.data?.data as ProjectSupervisionDetail | undefined
  const planSubmitted = !!(detail?.plan_submitted_at || activeRow?.plan_submitted_at)
  const actualSubmitted = !!(detail?.actual_submitted_at || activeRow?.actual_submitted_at)

  const columns: Column<Row>[] = useMemo(() => {
    const openDetail = (row: Row) => {
      setActiveRow(row)
      setModalOpenedAsManagement(listMode === 'management')
      setModalOpen(true)
      setPlanText('')
      setActualText('')
    }

    const shared: Column<Row>[] = [
      {
        key: 'project_code',
        title: '项目编号',
        width: 110,
        render: (val, row) => (
          <span className="font-mono text-xs">{(val as string) || row.project_title}</span>
        ),
      },
      { key: 'group_label', title: '组别', width: 88, render: (v) => (v as string) || '—' },
      { key: 'sample_size_label', title: '样本量', width: 72 },
      { key: 'backup_label', title: '备份样本量', width: 96, render: (v) => (v as string) || '—' },
      {
        key: 'visits_label',
        title: '访视时间点',
        render: (v) => <span className="text-xs text-slate-700 line-clamp-2">{v as string}</span>,
      },
      {
        key: 'execution_start_date',
        title: '执行开始时间',
        width: 120,
        render: (val) => (val ? String(val).slice(0, 10) : '—'),
      },
      {
        key: 'execution_end_date',
        title: '执行结束时间',
        width: 120,
        render: (val) => (val ? String(val).slice(0, 10) : '—'),
      },
      { key: 'researcher_label', title: '研究员', width: 88, render: (v) => (v as string) || '—' },
    ]

    const supervisionCols: Column<Row>[] =
      listMode === 'supervision'
        ? [
            {
              key: 'record_summary',
              title: '监察记录',
              width: 160,
              render: (_, row) => (
                <div className="text-xs text-slate-600 space-y-0.5">
                  <div>{row.record_summary}</div>
                  {row.plan_preview !== '—' && (
                    <div className="text-slate-400 truncate max-w-[200px]" title={row.plan_preview}>
                      计划：{row.plan_preview}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'supervision_status',
              title: '监察状态',
              width: 96,
              render: (_, row) => (
                <Badge variant={statusVariant[row.supervision_status] ?? 'default'}>{row.supervision_status_label}</Badge>
              ),
            },
          ]
        : []

    const action: Column<Row> = {
      key: 'protocol_id',
      title: '操作',
      width: 88,
      render: (_, row) => (
        <Button
          variant="secondary"
          size="xs"
          className="min-h-9"
          title="查看项目基本信息、监察计划与监察记录"
          icon={<Eye className="w-3.5 h-3.5" />}
          onClick={() => openDetail(row)}
        >
          查看
        </Button>
      ),
    }

    return [...shared, ...supervisionCols, action]
  }, [listMode])

  const setTab = (mode: 'supervision' | 'management') => {
    if (mode === 'management') {
      setSearchParams({ tab: 'management' })
    } else {
      setSearchParams({})
    }
    setPage(1)
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 md:text-2xl">项目监察</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              title="项目监察工作台"
              onClick={() => setTab('supervision')}
              className={`rounded-lg px-4 py-2 text-sm font-medium min-h-11 border transition-colors ${
                listMode === 'supervision'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              项目监察
            </button>
            <button
              type="button"
              title="仅维周执行台同步的项目"
              onClick={() => setTab('management')}
              className={`rounded-lg px-4 py-2 text-sm font-medium min-h-11 border transition-colors ${
                listMode === 'management'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              项目管理
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {listMode === 'management' ? (
              <>
                <strong>项目管理</strong>仅展示已在质量台登记的<strong>维周执行台</strong>来源项目（维周新建协议会自动推送登记）。可按执行开始年月与关键词筛选。
              </>
            ) : (
              <>
                <strong>项目监察</strong>主表：自动包含<strong>执行启动月</strong>为<strong>本月或下月</strong>且尚未完成实际监察的项目、以及<strong>全部历史</strong>已完成监察或监察异常（超执行结束日仍未提交监察计划）的项目；每次打开列表会按当前筛选重新拉取，避免遗漏新推送。可按年月、项目关键词、<strong>研究员</strong>缩小范围。
              </>
            )}
          </p>
        </div>
        {listMode === 'supervision' &&
          (import.meta.env.DEV ? (
            <Button
              className="min-h-11 shrink-0"
              title="本地开发：新建临床试验协议（与维周执行台同源）"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setCreateError(null)
                setCreateModalOpen(true)
              }}
            >
              新建项目（测试）
            </Button>
          ) : (
            <PermissionGuard anyPermission={['quality.deviation.create', 'protocol.protocol.create']}>
              <Button
                className="min-h-11 shrink-0"
                title="新建临床试验协议（与维周执行台同源）"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  setCreateError(null)
                  setCreateModalOpen(true)
                }}
              >
                新建项目（测试）
              </Button>
            </PermissionGuard>
          ))}
      </div>

      {listMode === 'supervision' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
          <StatCard
            title="待监察"
            value={pendingSupervisionCount}
            color="amber"
            icon={<ClipboardClock className="w-6 h-6" />}
            footer={
              <p className="text-xs text-slate-500 leading-snug">
                已提交监察计划、尚未提交实际监察（与「待执行」一致）
              </p>
            }
          />
          <StatCard
            title="已监察"
            value={supervisedCount}
            color="emerald"
            icon={<CircleCheck className="w-6 h-6" />}
            footer={<p className="text-xs text-slate-500 leading-snug">已提交实际监察</p>}
          />
          <StatCard
            title="未监察"
            value={noRecordCount}
            color="indigo"
            icon={<FileQuestion className="w-6 h-6" />}
            footer={
              <p className="text-xs text-slate-500 leading-snug">
                监察计划与实际均未提交（无监察记录）
              </p>
            }
          />
          <StatCard
            title="匹配总数"
            value={total}
            color="blue"
            icon={<FolderKanban className="w-6 h-6" />}
            footer={
              <p className="text-xs text-slate-500 leading-snug">
                与当前筛选一致的项目数（含分页外全部匹配条）
              </p>
            }
          />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 overflow-x-auto bg-white rounded-lg border border-slate-200 p-3">
        <div className="min-w-[180px]">
          <label htmlFor="supervision-month" className="block text-xs text-slate-500 mb-1">
            执行开始时间（年月）
          </label>
          <input
            id="supervision-month"
            type="month"
            title="按执行开始时间所在年月筛选"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-11 w-full"
            value={yearMonth}
            onChange={(e) => {
              setYearMonth(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Button variant="ghost" size="sm" className="min-h-11" title="不按执行开始时间筛选" onClick={() => { setYearMonth(''); setPage(1) }}>
          查看全部
        </Button>
        <Input
          label="搜索项目"
          value={keyword}
          className="min-h-11 min-w-[200px] flex-1"
          title="按标题或编号搜索"
          placeholder="项目名称或项目编号"
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
        />
        {listMode === 'supervision' && (
          <Input
            label="研究员"
            value={researcherKeyword}
            className="min-h-11 min-w-[140px]"
            title="匹配主要研究者/团队 JSON 中的姓名"
            placeholder="如：张三"
            onChange={(e) => {
              setResearcherKeyword(e.target.value)
              setPage(1)
            }}
          />
        )}
      </div>

      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          if (!createMutation.isPending) setCreateModalOpen(false)
        }}
        title="新建项目（测试）"
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={createMutation.isPending}
              title="取消"
              onClick={() => setCreateModalOpen(false)}
            >
              取消
            </Button>
            <Button
              className="min-h-11"
              title="创建协议"
              loading={createMutation.isPending}
              disabled={!createForm.title.trim()}
              onClick={() => createMutation.mutate()}
            >
              创建
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          <strong>手动补录</strong>：与维周推送无关，用于数据源异常时在质量台补项目并完成监察；<strong>项目编号</strong>若填写则须全局唯一（与已有项目重复将无法创建）。未填执行开始/结束时监察表按解析规则推断。需具备{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">quality.deviation.create</code>。
        </p>
        {createError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
        )}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <Input
            label="项目名称 *"
            value={createForm.title}
            title="项目名称"
            inputClassName="min-h-11"
            placeholder="协议标题"
            onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
          />
          <Input
            label="项目编号"
            value={createForm.code}
            title="项目编号（可选，须全局唯一）"
            inputClassName="min-h-11"
            placeholder="留空则后端自动生成"
            onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
          />
          <Input
            label="组别"
            value={createForm.group_label}
            title="组别"
            inputClassName="min-h-11"
            placeholder="可选"
            onChange={(e) => setCreateForm((f) => ({ ...f, group_label: e.target.value }))}
          />
          <Input
            label="样本量"
            type="number"
            value={createForm.sample_size}
            title="样本量（可选）"
            inputClassName="min-h-11"
            placeholder="可选"
            min={0}
            onChange={(e) => setCreateForm((f) => ({ ...f, sample_size: e.target.value }))}
          />
          <Input
            label="备份样本量"
            value={createForm.backup_sample_label}
            title="备份样本量（可选）"
            inputClassName="min-h-11"
            placeholder="可选"
            onChange={(e) => setCreateForm((f) => ({ ...f, backup_sample_label: e.target.value }))}
          />
          <div>
            <label htmlFor="create-visits-summary" className="text-xs text-slate-500">
              访视时间点
            </label>
            <textarea
              id="create-visits-summary"
              title="多个访视可用分号或换行分隔"
              value={createForm.visits_summary}
              onChange={(e) => setCreateForm((f) => ({ ...f, visits_summary: e.target.value }))}
              rows={2}
              placeholder="例如：V1；V2；V3"
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-11"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-exec-start" className="text-xs text-slate-500">
                执行开始时间
              </label>
              <input
                id="create-exec-start"
                type="date"
                title="YYYY-MM-DD"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-11"
                value={createForm.execution_start}
                onChange={(e) => setCreateForm((f) => ({ ...f, execution_start: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="create-exec-end" className="text-xs text-slate-500">
                执行结束时间
              </label>
              <input
                id="create-exec-end"
                type="date"
                title="YYYY-MM-DD"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-11"
                value={createForm.execution_end}
                onChange={(e) => setCreateForm((f) => ({ ...f, execution_end: e.target.value }))}
              />
            </div>
          </div>
          <Input
            label="研究员"
            value={createForm.principal_investigator}
            title="主要研究者/研究员"
            inputClassName="min-h-11"
            placeholder="可选"
            onChange={(e) => setCreateForm((f) => ({ ...f, principal_investigator: e.target.value }))}
          />
        </div>
      </Modal>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[1280px]">
            <DataTable<Row>
              columns={columns}
              data={items}
              loading={isLoading}
              emptyText={
                listMode === 'management'
                  ? '暂无维周来源项目；维周执行台新建协议后会自动出现在此'
                  : '暂无符合当前监察视图的数据；可调整年月/关键词/研究员或前往维周创建项目'
              }
              pagination={{ current: page, pageSize, total, onChange: setPage }}
            />
          </div>
        </div>
      </Card>

      <Modal
        isOpen={modalOpen && !!activeRow}
        onClose={() => {
          setModalOpen(false)
          setActiveRow(null)
        }}
        title={
          activeRow
            ? modalOpenedAsManagement
              ? `项目详情 — ${activeRow.project_title || activeRow.project_code}`
              : `项目监察 — ${activeRow.project_title || activeRow.project_code}`
            : '项目详情'
        }
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              className="min-h-11"
              title="关闭"
              onClick={() => {
                setModalOpen(false)
                setActiveRow(null)
              }}
            >
              关闭
            </Button>
          </>
        }
      >
        {activeRow && (
          <div className="space-y-6 text-sm">
            <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
              <h4 className="font-medium text-slate-800 mb-3">基本信息</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-700">
                <div>
                  <span className="text-slate-500">项目名称</span>
                  <div className="mt-0.5 font-medium text-slate-800">{activeRow.project_title || '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">项目编号</span>
                  <div className="mt-0.5 font-mono">{activeRow.project_code || '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">协议状态</span>
                  <div className="mt-0.5">{activeRow.protocol_status || '—'}</div>
                </div>
                {!modalOpenedAsManagement && (
                  <div>
                    <span className="text-slate-500">监察状态</span>
                    <div className="mt-0.5">
                      <Badge variant={statusVariant[activeRow.supervision_status] ?? 'default'}>
                        {detail?.supervision_status_label ?? activeRow.supervision_status_label}
                      </Badge>
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">组别</span>
                  <div className="mt-0.5">{activeRow.group_label || '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">样本量</span>
                  <div className="mt-0.5">{activeRow.sample_size_label || '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">备份样本量</span>
                  <div className="mt-0.5">{activeRow.backup_label || '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">执行周期说明</span>
                  <div className="mt-0.5">{activeRow.period_label || '—'}</div>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">访视时间点</span>
                  <div className="mt-0.5 text-slate-700">{activeRow.visits_label || '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">执行开始时间</span>
                  <div className="mt-0.5">{activeRow.execution_start_date?.slice(0, 10) ?? '—'}</div>
                </div>
                <div>
                  <span className="text-slate-500">执行结束时间</span>
                  <div className="mt-0.5">{activeRow.execution_end_date?.slice(0, 10) ?? '—'}</div>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">研究员</span>
                  <div className="mt-0.5">{activeRow.researcher_label || '—'}</div>
                </div>
              </div>
            </section>

            {detailQuery.isLoading ? (
              <p className="text-sm text-slate-500 py-6 text-center">加载监察详情中…</p>
            ) : modalOpenedAsManagement ? (
              <>
                <section>
                  <h4 className="font-medium text-slate-800 mb-2">监察计划</h4>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 whitespace-pre-wrap min-h-[4rem]">
                    {(detail?.plan_content_full ?? detail?.plan_content ?? planText)?.trim()
                      ? (detail?.plan_content_full ?? detail?.plan_content ?? planText)
                      : '暂无监察计划'}
                  </div>
                </section>
                <section>
                  <h4 className="font-medium text-slate-800 mb-2">监察记录详情</h4>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 whitespace-pre-wrap min-h-[4rem]">
                    {(detail?.actual_content_full ?? detail?.actual_content)?.trim()
                      ? (detail?.actual_content_full ?? detail?.actual_content)
                      : '暂无监察记录'}
                  </div>
                </section>
              </>
            ) : (
              <>
                <section>
                  <h4 className="font-medium text-slate-800 mb-2">监察计划</h4>
                  <p className="text-xs text-slate-500 mb-2">
                    填写监察内容后提交，监察状态将变为「待执行」{planSubmitted ? '（已提交，可修改至完成实际监察前）' : ''}
                  </p>
                  <textarea
                    title="监察计划内容"
                    value={planText}
                    disabled={actualSubmitted}
                    onChange={(e) => setPlanText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="监察内容、监察要点、计划等"
                  />
                  <PermissionGuard permission="quality.deviation.create">
                    <div className="mt-2 flex justify-end">
                      <Button
                        className="min-h-11"
                        title="提交监察计划"
                        loading={planMutation.isPending}
                        disabled={!planText.trim() || actualSubmitted}
                        onClick={() => planMutation.mutate()}
                      >
                        {planSubmitted ? '保存监察计划' : '提交监察计划'}
                      </Button>
                    </div>
                  </PermissionGuard>
                </section>

                <section>
                  <h4 className="font-medium text-slate-800 mb-2">监察记录详情</h4>
                  <p className="text-xs text-slate-500 mb-2">
                    须先提交监察计划。填写实际监察内容并提交后，状态变为「已完成」。
                  </p>
                  <textarea
                    title="监察记录详情"
                    value={actualText}
                    disabled={!planSubmitted || actualSubmitted}
                    onChange={(e) => setActualText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50"
                    placeholder={planSubmitted ? '实际监察内容' : '请先提交监察计划'}
                  />
                  <PermissionGuard permission="quality.deviation.create">
                    <div className="mt-2 flex justify-end">
                      <Button
                        className="min-h-11"
                        title="提交实际监察"
                        loading={actualMutation.isPending}
                        disabled={!planSubmitted || !actualText.trim() || actualSubmitted}
                        onClick={() => actualMutation.mutate()}
                      >
                        提交监察记录
                      </Button>
                    </div>
                  </PermissionGuard>
                </section>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
