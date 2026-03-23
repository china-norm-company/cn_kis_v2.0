/**
 * 项目全链路 - 详情页（与 KIS 完全一致）
 *
 * 展示项目基本信息、方案解析结果（只读）、访视计划概览、排程流程进度、审批/打回/重新提交入口、
 * AI 解析入口、发布工单入口；布局为固定标题栏 + 左侧目录 + 右侧内容。
 */
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, useEffect } from 'react'
import { projectFullLinkApi } from '@cn-kis/api-client'
import type { ProjectFullLinkProject, ProjectFullLinkProtocol } from '@cn-kis/api-client'
import { Button, Card, Badge } from '@cn-kis/ui-kit'
import { Edit, ArrowLeft, Sparkles, Calendar, Send, Loader2, AlertCircle } from 'lucide-react'
import { TableOfContents } from '../components/ProjectFullLink/TableOfContents'
import { ProjectFormViewer } from '../components/ProjectFullLink/ProjectFormViewer'
import { VisitPlanPreviewDialog } from '../components/ProjectFullLink/VisitPlanPreviewDialog'
import { SchedulingWorkflowProgress } from '../components/ProjectFullLink/SchedulingWorkflowProgress'
import type { SchedulingApprovalRecord, SchedulingWorkflowStatus } from '../lib/schedulerApprovalTypes'
import { convertParsedDataToVisitPlan } from '../utils/visitPlanConverter'

type JSONValue = string | number | boolean | null | JSONObject | JSONValue[]
interface JSONObject {
  [key: string]: JSONValue
}

/** 从 localStorage 读取排程项目（与 KIS 一致） */
function getSchedulerProject(projectId: number, protocolId: number): {
  status: SchedulingWorkflowStatus
  approvalRecords: SchedulingApprovalRecord[]
  projectName?: string
  projectId?: number
} | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('mock_scheduler_projects') : null
    const list = JSON.parse(raw || '[]')
    const project = protocolId
      ? list.find((p: { protocolId?: number }) => p.protocolId === protocolId)
      : list.find((p: { projectId?: number }) => p.projectId === projectId)
    if (!project) return null
    const status = (project.status || 'pending_review') as SchedulingWorkflowStatus
    const approvalRecords = (project.approvalRecords || []) as SchedulingApprovalRecord[]
    return {
      status,
      approvalRecords,
      projectName: project.projectName,
      projectId: project.projectId,
    }
  } catch {
    return null
  }
}

export default function ProjectFullLinkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = id ? parseInt(id, 10) : 0

  const [showNoProtocolDialog, setShowNoProtocolDialog] = useState(false)
  const [showVisitPlanDialog, setShowVisitPlanDialog] = useState(false)

  const { data: projectRes, isLoading: loadingProject } = useQuery({
    queryKey: ['project-full-link', 'project', projectId],
    queryFn: () => projectFullLinkApi.get(projectId),
    enabled: projectId > 0,
  })

  const { data: protocolsRes } = useQuery({
    queryKey: ['project-full-link', 'protocols', projectId],
    queryFn: () => projectFullLinkApi.listProtocols(projectId, { page: 1, pageSize: 50 }),
    enabled: projectId > 0,
  })

  const project = projectRes?.data as ProjectFullLinkProject | undefined
  const protocols = (protocolsRes?.data?.list ?? []) as ProjectFullLinkProtocol[]
  const activeProtocol = protocols[0] ?? null
  const activeProtocolId = activeProtocol?.id ?? 0
  const parsedData = activeProtocol?.parsed_data as JSONObject | null | undefined

  const schedulerProject = useMemo(
    () => getSchedulerProject(projectId, activeProtocolId),
    [projectId, activeProtocolId]
  )

  const schedulingStatus = schedulerProject?.status ?? 'pending_review'
  const showSchedulingProgress =
    schedulingStatus === 'pending_review' ||
    schedulingStatus === 'pending_schedule' ||
    schedulingStatus === 'pending_researcher_confirmation' ||
    schedulingStatus === 'researcher_confirmed' ||
    schedulingStatus === 'scheduled' ||
    schedulingStatus === 'rejected'

  const hasParsedData = !!(parsedData && Object.keys(parsedData).length > 0)

  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: ['project-full-link'] })
    window.addEventListener('schedulerProjectsUpdated', handler)
    return () => window.removeEventListener('schedulerProjectsUpdated', handler)
  }, [queryClient])

  if (projectId <= 0) {
    return (
      <div className="p-6 text-slate-500">
        无效的项目 ID，
        <button type="button" className="text-primary-600 underline" onClick={() => navigate('/project-full-link')}>
          返回列表
        </button>
      </div>
    )
  }

  if (loadingProject || !project) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        {loadingProject ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> 加载中…
          </>
        ) : (
          '项目不存在'
        )}
      </div>
    )
  }

  const projectInfo = project as ProjectFullLinkProject
  const displayParsedData = {
    ...(parsedData || {}),
    project_info: {
      ...((parsedData?.project_info as JSONObject) || {}),
      project_no: projectInfo.project_no || projectInfo.opportunity_no || '',
      project_name: projectInfo.project_name || '',
    },
  }

  const tocItems = [
    { id: 'project-basic-info', title: '项目基本信息', visible: true },
    { id: 'site-plan', title: '场地计划', visible: true },
    { id: 'sample-plan', title: '样品计划', visible: true },
    { id: 'recruitment-plan', title: '招募计划', visible: true },
    { id: 'consumables-plan', title: '耗材计划', visible: true },
    { id: 'visit-plan', title: '访视计划', visible: true },
    { id: 'equipment-plan', title: '设备计划', visible: true },
    { id: 'evaluation-plan', title: '评估计划', visible: true },
    { id: 'auxiliary-measurement-plan', title: '辅助测量计划', visible: true },
    { id: 'special-requirements', title: '特殊要求', visible: true },
    { id: 'visit-plan-overview', title: '访视计划概览', visible: hasParsedData },
    { id: 'scheduling-progress', title: '排程流程进度', visible: showSchedulingProgress },
  ]

  const handleAIParseClick = () => {
    if (protocols.length === 0 || !activeProtocolId) {
      setShowNoProtocolDialog(true)
      return
    }
    navigate(`/project-full-link/${projectId}/edit`)
  }

  const rejectRecord = schedulerProject?.approvalRecords
    ?.slice()
    .reverse()
    .find((r) => r.nodeName === '研究员确认' && r.action === '退回')

  return (
    <div>
      {/* 固定标题栏（与 KIS 一致） */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="flex gap-6">
          <div className="w-48 flex-shrink-0" />
          <div className="flex-1 flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/project-full-link')}>
                返回
              </Button>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {projectInfo.project_no || projectInfo.opportunity_no || `#${projectId}`}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">{projectInfo.project_name || '未命名项目'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={projectInfo.execution_status === 'cancelled' ? 'destructive' : 'default'}>
                {projectInfo.execution_status === 'cancelled' ? '取消' : '正常'}
              </Badge>
              <Button icon={<Edit className="w-4 h-4" />} onClick={() => navigate(`/project-full-link/${projectId}/edit`)}>
                编辑
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-48 flex-shrink-0">
          <TableOfContents items={tocItems} />
        </div>

        <div className="flex-1 space-y-6 pb-8">
          {/* 项目基本信息 */}
          <Card id="project-basic-info" className="p-4">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">项目基本信息</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-slate-500">项目编号</p>
                <p className="text-sm font-medium">{projectInfo.project_no || projectInfo.opportunity_no || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">项目名称</p>
                <p className="text-sm font-medium">{projectInfo.project_name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">客户编号</p>
                <p className="text-sm font-medium">{projectInfo.sponsor_no || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">优先级</p>
                <p className="text-sm font-medium">
                  {projectInfo.priority === 'high' ? '高' : projectInfo.priority === 'low' ? '低' : '中'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">业务类型</p>
                <p className="text-sm font-medium">{projectInfo.business_type || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">项目阶段</p>
                <p className="text-sm font-medium">{projectInfo.schedule_status || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">研究组</p>
                <p className="text-sm font-medium">{projectInfo.research_institution || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">项目状态</p>
                <Badge variant={projectInfo.execution_status === 'cancelled' ? 'destructive' : 'default'}>
                  {projectInfo.execution_status === 'cancelled' ? '取消' : '正常'}
                </Badge>
              </div>
            </div>
            {(parsedData?.project_info as JSONObject)?.execution_period && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">执行时间周期</p>
                  <p className="text-sm font-medium mt-1">
                    {(parsedData.project_info as JSONObject).execution_period as string}
                  </p>
                </div>
                {(parsedData.project_info as JSONObject).client_expected_delivery_date && (
                  <div>
                    <p className="text-sm text-slate-500">客户期望交付日期</p>
                    <p className="text-sm font-medium mt-1">
                      {(parsedData.project_info as JSONObject).client_expected_delivery_date as string}
                    </p>
                  </div>
                )}
                {(parsedData.project_info as JSONObject).research_purpose && (
                  <div>
                    <p className="text-sm text-slate-500">研究目的</p>
                    <p className="text-sm font-medium mt-1 whitespace-pre-wrap">
                      {(parsedData.project_info as JSONObject).research_purpose as string}
                    </p>
                  </div>
                )}
              </div>
            )}
            {projectInfo.description && (
              <div className="mt-4">
                <p className="text-sm text-slate-500">项目描述</p>
                <p className="text-sm font-medium mt-1 whitespace-pre-wrap">{projectInfo.description}</p>
              </div>
            )}
          </Card>

          {/* 方案文档已解析提示 */}
          {hasParsedData && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">方案文档已解析</span>
            </div>
          )}

          {/* 方案解析结果（只读） */}
          {hasParsedData && (
            <ProjectFormViewer data={displayParsedData as JSONObject} editable={false} />
          )}

          {/* 无方案时引导 */}
          {!hasParsedData && protocols.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              暂无解析结果，请点击「编辑」进入编辑页上传方案文件并进行 AI 解析。
            </div>
          )}
          {protocols.length === 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-sm">
              <p className="font-medium text-slate-700">该项目暂无方案</p>
              <p className="mt-1">请前往编辑页上传项目方案文档。</p>
              <Button className="mt-3" variant="outline" onClick={() => navigate(`/project-full-link/${projectId}/edit`)} icon={<Edit className="w-4 h-4" />}>
                前往编辑页
              </Button>
            </div>
          )}

          {/* 访视计划概览 */}
          {hasParsedData && (
            <Card id="visit-plan-overview" className="p-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">访视计划概览</h3>
              <p className="text-sm text-slate-500 mb-4">访视计划已生成，可查看详情</p>
              <Button variant="outline" onClick={() => setShowVisitPlanDialog(true)} icon={<Calendar className="w-4 h-4" />}>
                查看访视计划详情
              </Button>
            </Card>
          )}

          {/* 排程流程进度 */}
          {showSchedulingProgress && (
            <Card id="scheduling-progress" className="p-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">排程流程进度</h3>
              {schedulerProject?.approvalRecords?.length ? (
                <SchedulingWorkflowProgress
                  status={schedulerProject.status}
                  approvalRecords={schedulerProject.approvalRecords}
                />
              ) : (
                <div className="text-sm text-slate-500 py-4">暂无操作记录，请先提交方案进行排程</div>
              )}
            </Card>
          )}

          {/* 发布工单（研究员确认后，与 KIS 一致） */}
          {schedulingStatus === 'researcher_confirmed' && schedulerProject && (
            <Card className="p-4 border-teal-500">
              <h3 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <Send className="w-5 h-5 text-teal-600" /> 发布工单
              </h3>
              <p className="text-sm text-slate-600 mb-2">排程方案已确认，现在可以发布工单。</p>
              <p className="text-sm text-slate-500 mb-4">
                项目：{schedulerProject.projectName || projectInfo.project_name || '未知项目'}
              </p>
              <Button className="bg-teal-600 hover:bg-teal-700" icon={<Send className="w-4 h-4" />}>
                发布工单
              </Button>
            </Card>
          )}

          {/* 排程方案退回（排程专员可见的退回原因展示） */}
          {schedulingStatus === 'pending_schedule' && schedulerProject && rejectRecord && (
            <Card className="p-4 border-amber-500">
              <h3 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" /> 排程方案退回
              </h3>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm font-medium text-amber-900 mb-1">退回原因：</p>
                <p className="text-sm text-amber-800 whitespace-pre-wrap">{rejectRecord.comment || '无退回原因'}</p>
                {rejectRecord.operateDate && (
                  <p className="text-xs text-amber-700 mt-2">
                    退回时间：{new Date(rejectRecord.operateDate).toLocaleString('zh-CN')}
                  </p>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-2">请根据退回原因调整排程方案，然后重新保存。</p>
            </Card>
          )}

          {/* 排程质疑记录（占位，与 KIS 布局一致） */}
          {showSchedulingProgress && (
            <Card className="p-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-2">排程质疑记录</h3>
              <p className="text-sm text-slate-500">暂无质疑记录</p>
            </Card>
          )}

          {/* 重新提交审批（状态为已拒绝时，与 KIS 一致） */}
          {hasParsedData && schedulingStatus === 'rejected' && (
            <Card className="p-4 border-amber-600">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-100">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-amber-900">方案已被打回</h3>
                  <p className="text-sm text-slate-600 mt-2">请根据反馈意见修改方案后，重新提交审批</p>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  variant="outline"
                  className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                  onClick={() => navigate(`/project-full-link/${projectId}/edit`)}
                  icon={<Send className="w-4 h-4" />}
                >
                  前往编辑页重新提交
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* 访视计划预览弹窗 */}
      <VisitPlanPreviewDialog
        open={showVisitPlanDialog}
        onOpenChange={setShowVisitPlanDialog}
        visitPlan={convertParsedDataToVisitPlan(parsedData ?? undefined)}
        protocolName={activeProtocol?.protocol_name}
        projectName={projectInfo.project_name}
      />

      {/* 未上传方案提示 */}
      {showNoProtocolDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNoProtocolDialog(false)}>
          <div
            className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-2">提示</h3>
            <p className="text-sm text-slate-600 mb-4">
              该项目尚未上传方案文档，无法进行 AI 解析。请先前往编辑页上传项目方案后再进行解析。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowNoProtocolDialog(false)}>
                取消
              </Button>
              <Button onClick={() => { setShowNoProtocolDialog(false); navigate(`/project-full-link/${projectId}/edit`); }}>
                前往编辑页
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
