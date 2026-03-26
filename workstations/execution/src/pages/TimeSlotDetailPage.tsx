/**
 * 时间槽详情页：展示已发布排程的项目信息 + 行政/评估/技术排期，支持按日期/按人员/按项目三视图
 * 路由：/scheduling/timeslot/:id （id 为 TimelinePublishedPlan.id）
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { schedulingApi } from '@cn-kis/api-client'
import { Button, Card, Tabs } from '@cn-kis/ui-kit'
import { ArrowLeft, Calendar, Users, FolderOpen } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { ExecutionOrderDetailReadOnly } from '../components/ExecutionOrderDetailReadOnly'
import { formatExecutionPeriodToMMMMDDYY } from '../utils/executionOrderPlanConfig'
import { getProcessIndicesForTab } from '../utils/personnelProcessTab'

type ViewTabKey = 'byDate' | 'byPerson' | 'byProject'

interface VisitBlock {
  visit_point?: string
  processes?: Array<{
    process?: string
    code?: string
    exec_dates?: string[]
    sample_size?: string | number
    admin_person?: string
    admin_room?: string
    eval_person?: string
    eval_room?: string
    tech_person?: string
    tech_room?: string
  }>
}

function getFirstRowAsDict(headers: string[], rows: unknown[]): Record<string, string> {
  const row = rows?.[0]
  if (row == null) return {}
  const out: Record<string, string> = {}
  if (Array.isArray(row)) {
    headers.forEach((h, i) => {
      out[h] = String((row as unknown[])[i] ?? '')
    })
  } else if (typeof row === 'object') {
    const obj = row as Record<string, unknown>
    headers.forEach((h) => {
      const v = obj[h]
      out[h] = v != null ? String(v) : ''
    })
  }
  return out
}

export default function TimeSlotDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [activeView, setActiveView] = useState<ViewTabKey>('byDate')

  const planId = id ? parseInt(id, 10) : NaN
  const { data: detailRes, isLoading, error } = useQuery({
    queryKey: ['scheduling', 'timeline-published-detail', planId],
    queryFn: () => schedulingApi.getTimelinePublishedDetail(planId),
    enabled: Number.isInteger(planId),
  })

  const detail = (detailRes as any)?.data
  const snapshot = (detail?.snapshot || {}) as Record<string, unknown>
  const personnelSnap = snapshot.personnel as
    | {
        admin?: Array<{ visit_point?: string; processes?: Array<{ executor?: string; backup?: string; room?: string }> }>
        eval?: Array<{ visit_point?: string; processes?: Array<{ executor?: string; backup?: string; room?: string }> }>
        tech?: Array<{ visit_point?: string; processes?: Array<{ executor?: string; backup?: string; room?: string }> }>
      }
    | undefined
  const order = detail?.order
  const schedule = detail?.schedule
  const payload = (schedule?.payload || {}) as { visit_blocks?: VisitBlock[] }
  const visitBlocks = payload.visit_blocks || []

  const headers = order?.headers || []
  const rows = order?.rows || []
  const firstRow = order ? getFirstRowAsDict(headers, rows) : {}

  if (!Number.isInteger(planId)) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">无效的时间槽 ID</p>
      </div>
    )
  }

  if (isLoading || error) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">{isLoading ? '加载中…' : '加载失败'}</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">未找到该记录</p>
      </div>
    )
  }

  // 按日期：从 visit_blocks 展开 (日期, 访视点, 流程)
  const byDateRows: { date: string; visit_point: string; process: string; sample_size: string }[] = []
  for (const block of visitBlocks) {
    const vp = (block.visit_point || '').trim()
    for (const proc of block.processes || []) {
      const processName = (proc.process || proc.code || '').trim()
      const dates = proc.exec_dates || []
      const sample = proc.sample_size != null ? String(proc.sample_size) : ''
      for (const d of dates) {
        if (d && String(d).trim()) byDateRows.push({ date: String(d).trim().slice(0, 10), visit_point: vp, process: processName, sample_size: sample })
      }
    }
  }
  byDateRows.sort((a, b) => a.date.localeCompare(b.date) || a.visit_point.localeCompare(b.visit_point))

  // 按人员：按流程汇总行政/评估/技术人员（若有）
  const byPersonRows: { role: string; person: string; room: string; visit_point: string; process: string; dates: string }[] = []
  for (const block of visitBlocks) {
    const vp = (block.visit_point || '').trim()
    for (const proc of block.processes || []) {
      const processName = (proc.process || proc.code || '').trim()
      const dates = (proc.exec_dates || []).filter(Boolean).map((d) => String(d).slice(0, 10))
      const datesStr = dates.length > 0 ? dates.join('、') : '-'
      if (proc.admin_person) byPersonRows.push({ role: '行政', person: proc.admin_person, room: proc.admin_room || '-', visit_point: vp, process: processName, dates: datesStr })
      if (proc.eval_person) byPersonRows.push({ role: '评估', person: proc.eval_person, room: proc.eval_room || '-', visit_point: vp, process: processName, dates: datesStr })
      if (proc.tech_person) byPersonRows.push({ role: '技术', person: proc.tech_person, room: proc.tech_room || '-', visit_point: vp, process: processName, dates: datesStr })
    }
  }

  const viewTabs = [
    { key: 'byDate', label: '按日期', icon: <Calendar className="w-4 h-4" /> },
    { key: 'byPerson', label: '按人员', icon: <Users className="w-4 h-4" /> },
    { key: 'byProject', label: '按项目', icon: <FolderOpen className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => navigate('/scheduling', { state: { tab: 'slots' } })}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200">时间槽详情</h1>
      </div>

      {/* 项目信息：有 order 则用 ExecutionOrderDetailReadOnly，否则用 snapshot */}
      <Card className={clsx('p-4', isDark && 'bg-slate-800/50 border-[#3b434e]')}>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">项目信息</h2>
        {order && headers.length > 0 && Object.keys(firstRow).length > 0 ? (
          <ExecutionOrderDetailReadOnly headers={headers} row={firstRow} isDark={isDark} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {['项目编号', '项目名称', '组别', '样本量', '督导', '访视时间点', '实际执行周期'].map((key) => (
              <div key={key} className={clsx('rounded-lg p-2', isDark ? 'bg-slate-700/30' : 'bg-slate-50')}>
                <span className="text-slate-500 dark:text-slate-400">{key}</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {key === '样本量' ? Number(snapshot[key]) : String(snapshot[key] ?? '-')}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 排程状态与访视点流程 */}
      {schedule && (
        <Card className={clsx('p-4', isDark && 'bg-slate-800/50 border-[#3b434e]')}>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">排程状态</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className={clsx('text-xs px-2 py-1 rounded', schedule.admin_published ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300')}>
              行政排程 {schedule.admin_published ? '已发布' : '未发布'}
            </span>
            <span className={clsx('text-xs px-2 py-1 rounded', schedule.eval_published ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300')}>
              评估排程 {schedule.eval_published ? '已发布' : '未发布'}
            </span>
            <span className={clsx('text-xs px-2 py-1 rounded', schedule.tech_published ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300')}>
              技术排程 {schedule.tech_published ? '已发布' : '未发布'}
            </span>
          </div>
          {visitBlocks.length > 0 && (
            <>
              <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">访视点与流程</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                      <th className="px-3 py-2 text-left font-medium">访视点</th>
                      <th className="px-3 py-2 text-left font-medium">流程</th>
                      <th className="px-3 py-2 text-left font-medium">执行日期</th>
                      <th className="px-3 py-2 text-left font-medium">样本量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitBlocks.flatMap((block) =>
                      (block.processes || []).map((proc, idx) => (
                        <tr key={`${block.visit_point}-${idx}`} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                          <td className="px-3 py-2">{idx === 0 ? block.visit_point : ''}</td>
                          <td className="px-3 py-2">{proc.process || proc.code || '-'}</td>
                          <td className="px-3 py-2 text-xs">{(proc.exec_dates || []).filter(Boolean).join('、') || '-'}</td>
                          <td className="px-3 py-2">{proc.sample_size != null ? proc.sample_size : '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {personnelSnap && (personnelSnap.admin || personnelSnap.eval || personnelSnap.tech) && (
        <Card className={clsx('p-4', isDark && 'bg-slate-800/50 border-[#3b434e]')}>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">人员排程结果</h2>
          {(['admin', 'eval', 'tech'] as const).map((role) => {
            const label = role === 'admin' ? '行政' : role === 'eval' ? '评估' : '技术'
            const blocks = personnelSnap[role] || []
            if (!blocks.length) return null
            return (
              <div key={role} className="mb-4 last:mb-0">
                <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{label}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[520px]">
                    <thead>
                      <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                        <th className="px-2 py-2 text-left">访视点</th>
                        <th className="px-2 py-2 text-left">流程</th>
                        <th className="px-2 py-2 text-left">执行人员</th>
                        <th className="px-2 py-2 text-left">备份人员</th>
                        <th className="px-2 py-2 text-left">房间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blocks.flatMap((block, bi) => {
                        const idxRow = getProcessIndicesForTab(visitBlocks, role)[bi] ?? []
                        return (block.processes || []).map((row, pi) => {
                          const globalPi = idxRow[pi]
                          const procRef =
                            globalPi != null ? visitBlocks[bi]?.processes?.[globalPi] : undefined
                          const pnm = (procRef?.process || procRef?.code || '').trim() || '—'
                          return (
                          <tr key={`${role}-${bi}-${pi}`} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                            <td className="px-2 py-2">{pi === 0 ? (block.visit_point || '—') : ''}</td>
                            <td className="px-2 py-2">{pnm}</td>
                            <td className="px-2 py-2">{row.executor || '—'}</td>
                            <td className="px-2 py-2">{row.backup || '—'}</td>
                            <td className="px-2 py-2">{row.room || '—'}</td>
                          </tr>
                          )
                        })
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* 三视图 Tab */}
      <Card className={clsx('p-4', isDark && 'bg-slate-800/50 border-[#3b434e]')}>
        <Tabs
          tabs={viewTabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
          value={activeView}
          onChange={(key) => setActiveView(key as ViewTabKey)}
          className={clsx('mb-0', isDark && 'border-slate-600')}
        />
        {activeView === 'byDate' && (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                  <th className="px-3 py-2 text-left font-medium">日期</th>
                  <th className="px-3 py-2 text-left font-medium">访视点</th>
                  <th className="px-3 py-2 text-left font-medium">流程</th>
                  <th className="px-3 py-2 text-left font-medium">样本量</th>
                </tr>
              </thead>
              <tbody>
                {byDateRows.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-slate-500 text-center">暂无按日期展开数据</td></tr>
                ) : (
                  byDateRows.map((r, i) => (
                    <tr key={i} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                      <td className="px-3 py-2">{r.date}</td>
                      <td className="px-3 py-2">{r.visit_point}</td>
                      <td className="px-3 py-2">{r.process}</td>
                      <td className="px-3 py-2">{r.sample_size}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeView === 'byPerson' && (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                  <th className="px-3 py-2 text-left font-medium">角色</th>
                  <th className="px-3 py-2 text-left font-medium">人员</th>
                  <th className="px-3 py-2 text-left font-medium">房间</th>
                  <th className="px-3 py-2 text-left font-medium">访视点</th>
                  <th className="px-3 py-2 text-left font-medium">流程</th>
                  <th className="px-3 py-2 text-left font-medium">执行日期</th>
                </tr>
              </thead>
              <tbody>
                {byPersonRows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-slate-500 text-center">暂无人员排期数据，请在项目排期页填写行政/评估/技术排程并发布</td></tr>
                ) : (
                  byPersonRows.map((r, i) => (
                    <tr key={i} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                      <td className="px-3 py-2">{r.role}</td>
                      <td className="px-3 py-2">{r.person}</td>
                      <td className="px-3 py-2">{r.room}</td>
                      <td className="px-3 py-2">{r.visit_point}</td>
                      <td className="px-3 py-2">{r.process}</td>
                      <td className="px-3 py-2 text-xs">{r.dates}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeView === 'byProject' && (
          <div className="mt-3 space-y-3">
            <div className={clsx('rounded-lg p-4', isDark ? 'bg-slate-700/30' : 'bg-slate-50')}>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {String(snapshot['项目名称'] ?? snapshot['项目编号'] ?? '本项目')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">项目编号：{String(snapshot['项目编号'] ?? '-')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">组别：{String(snapshot['组别'] ?? '-')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">督导：{String(snapshot['督导'] ?? '-')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">样本量：{String(snapshot['样本量'] ?? '-')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">访视时间点：{String(snapshot['访视时间点'] ?? '-')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">实际执行周期：{snapshot['实际执行周期'] ? formatExecutionPeriodToMMMMDDYY(String(snapshot['实际执行周期'])) : '-'}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
