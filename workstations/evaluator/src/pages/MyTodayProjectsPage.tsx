import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { evaluatorApi } from '@cn-kis/api-client'
import type { MyTodayProjectItem, MyTodayProjectsData, MyTodayProjectTask } from '@cn-kis/api-client'
import { RefreshCcw, FlaskConical, ChevronRight } from 'lucide-react'

type SelectedProbeMap = Record<string, { probe: string; measured: boolean; primary_param: string }>

function statCard(label: string, value: string | number, tone: string) {
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  )
}

function buildProbeChoiceKey(projectCode: string, subjectNo: string, timePoint: string, taskKey: string) {
  return `${projectCode}:${subjectNo}:${timePoint}:${taskKey}`
}

export function MyTodayProjectsPage() {
  const navigate = useNavigate()
  const [probeSelections, setProbeSelections] = useState<SelectedProbeMap>({})
  const [probeDialog, setProbeDialog] = useState<{
    projectCode: string
    subjectNo: string
    timePoint: string
    task: MyTodayProjectTask
  } | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['evaluator', 'my-today-projects'],
    queryFn: () => evaluatorApi.myTodayProjects(),
    refetchInterval: 300_000,
  })

  const payload = (data as { data?: MyTodayProjectsData } | undefined)?.data
  const projects = payload?.projects ?? []
  const stats = payload?.stats ?? {
    project_count: 0,
    signed_in_count: 0,
    completed_count: 0,
    pending_count: 0,
    completion_rate: 0,
  }

  const probeDialogOptions = useMemo(() => probeDialog?.task.probe_options ?? [], [probeDialog])

  const getResolvedTask = (
    projectCode: string,
    subjectNo: string,
    timePoint: string,
    task: MyTodayProjectTask,
  ) => {
    if (task.status !== 'needs_probe_selection') return task
    const selection = probeSelections[buildProbeChoiceKey(projectCode, subjectNo, timePoint, task.task_key)]
    if (!selection) return task
    return {
      ...task,
      status: selection.measured ? 'measured' : 'unmeasured',
      status_label: selection.measured ? '已测量' : '未测量',
      probe: selection.probe,
      primary_param: selection.primary_param,
    }
  }

  const handleMeasure = (task: MyTodayProjectTask) => {
    if (task.measure_link) navigate(task.measure_link)
  }

  const renderEquipmentTask = (
    project: MyTodayProjectItem,
    subjectNo: string,
    timePoint: string,
    task: MyTodayProjectTask,
  ) => {
    const resolvedTask = getResolvedTask(project.project_code, subjectNo, timePoint, task)
    const canMeasure = Boolean(resolvedTask.measure_link)
    return (
      <div key={task.task_key} className="rounded-lg border border-slate-200 bg-white p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{resolvedTask.task_name}</p>
            {resolvedTask.probe && (
              <p className="mt-1 text-xs text-slate-500">
                探头：{resolvedTask.probe}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
              resolvedTask.status === 'measured'
                ? 'bg-emerald-100 text-emerald-700'
                : resolvedTask.status === 'unmeasured'
                  ? 'bg-amber-100 text-amber-700'
                  : resolvedTask.status === 'needs_probe_selection'
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-slate-100 text-slate-600'
            }`}
          >
            {resolvedTask.status_label}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {resolvedTask.status === 'needs_probe_selection' && (
            <button
              type="button"
              onClick={() => setProbeDialog({
                projectCode: project.project_code,
                subjectNo,
                timePoint,
                task,
              })}
              className="rounded-md border border-violet-200 px-2 py-1 text-xs text-violet-700 hover:bg-violet-50"
            >
              选择探头
            </button>
          )}
          {canMeasure && (
            <button
              type="button"
              onClick={() => handleMeasure(resolvedTask)}
              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
            >
              去测量 <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">我的今日项目</h2>
          <p className="mt-1 text-sm text-slate-500">按项目查看今日受试者、时间点任务矩阵与 SADC 测量状态</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCcw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          手动刷新
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {statCard('今日项目数', stats.project_count, 'border-slate-200 bg-white')}
        {statCard('已签到人数', stats.signed_in_count, 'border-blue-200 bg-blue-50')}
        {statCard('已完成人数', stats.completed_count, 'border-emerald-200 bg-emerald-50')}
        {statCard('待完成人数', stats.pending_count, 'border-amber-200 bg-amber-50')}
        {statCard('完成率', `${stats.completion_rate}%`, 'border-violet-200 bg-violet-50')}
      </div>

      {!payload?.measurement_source_available && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前未配置 `instrument_readings` 数据源，SADC 自动判定会全部按未命中处理。
        </div>
      )}

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">
          正在加载今日项目...
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">
          今日暂无分配到你的评估项目
        </div>
      ) : (
        <div className="space-y-5">
          {projects.map((project) => (
            <section key={project.project_code} className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-800">{project.project_name}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {project.project_code}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      最近签到时间：{project.recent_checkin_time ?? '--'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">已签到 {project.stats.signed_in_count}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">已完成 {project.stats.completed_count}</span>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">待完成 {project.stats.pending_count}</span>
                    <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">完成率 {project.stats.completion_rate}%</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1200px] w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs text-slate-500">
                      <th className="sticky left-0 z-10 min-w-[120px] border-b border-slate-200 bg-slate-50 px-3 py-3">姓名</th>
                      <th className="min-w-[130px] border-b border-slate-200 px-3 py-3">受试者编号</th>
                      <th className="min-w-[90px] border-b border-slate-200 px-3 py-3">SC号</th>
                      <th className="min-w-[90px] border-b border-slate-200 px-3 py-3">队列状态</th>
                      <th className="min-w-[110px] border-b border-slate-200 px-3 py-3">入组情况</th>
                      {project.time_points.map((timePoint) => (
                        <th key={timePoint} className="min-w-[280px] border-b border-slate-200 px-3 py-3">
                          {timePoint}
                        </th>
                      ))}
                      <th className="min-w-[120px] border-b border-slate-200 px-3 py-3">整体状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.subjects.map((subject) => (
                      <tr key={`${project.project_code}-${subject.subject_no || subject.subject_id || subject.subject_name}`} className="align-top">
                        <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-3">
                          <div className="font-medium text-slate-800">{subject.subject_name || '--'}</div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{subject.subject_no || '--'}</td>
                        <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{subject.sc_number || '--'}</td>
                        <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{subject.queue_status || '--'}</td>
                        <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{subject.enrollment_status || '--'}</td>
                        {subject.time_point_cells.map((cell) => (
                          <td key={`${subject.subject_no}-${cell.time_point}`} className="border-b border-slate-100 px-3 py-3">
                            <div className="space-y-2">
                              {cell.terminated && (
                                <div className="rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">终止完成</div>
                              )}
                              {cell.equipment_tasks.length > 0 && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                                    <FlaskConical className="h-3.5 w-3.5" />
                                    设备任务
                                  </div>
                                  {cell.equipment_tasks.map((task) =>
                                    renderEquipmentTask(project, subject.subject_no, cell.time_point, task),
                                  )}
                                </div>
                              )}
                              {cell.evaluation_tasks.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-slate-500">评估任务</div>
                                  {cell.evaluation_tasks.map((task) => (
                                    <div key={task.task_key} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                                      {task.task_name} · {task.status_label}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {cell.auxiliary_tasks.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-slate-500">辅助任务</div>
                                  {cell.auxiliary_tasks.map((task) => (
                                    <div key={task.task_key} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                                      {task.task_name} · {task.status_label}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {cell.equipment_tasks.length === 0 && cell.evaluation_tasks.length === 0 && cell.auxiliary_tasks.length === 0 && (
                                <div className="text-xs text-slate-400">暂无任务</div>
                              )}
                            </div>
                          </td>
                        ))}
                        <td className="border-b border-slate-100 px-3 py-3 text-sm font-medium text-slate-800">
                          {subject.overall_status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {probeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-800">选择探头</h3>
            <p className="mt-2 text-sm text-slate-500">
              {probeDialog.task.task_name} 无法高置信度自动匹配，请手动选择。本次选择仅当前页面有效。
            </p>
            <div className="mt-4 space-y-2">
              {probeDialogOptions.map((option) => (
                <button
                  key={option.probe}
                  type="button"
                  onClick={() => {
                    setProbeSelections((current) => ({
                      ...current,
                      [buildProbeChoiceKey(
                        probeDialog.projectCode,
                        probeDialog.subjectNo,
                        probeDialog.timePoint,
                        probeDialog.task.task_key,
                      )]: {
                        probe: option.probe,
                        measured: option.measured,
                        primary_param: option.primary_param,
                      },
                    }))
                    setProbeDialog(null)
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{option.probe}</p>
                    <p className="text-xs text-slate-500">{option.primary_param}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${option.measured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {option.measured ? '已测量' : '未测量'}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setProbeDialog(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
