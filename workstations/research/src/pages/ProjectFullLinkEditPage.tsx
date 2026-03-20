/**
 * 项目全链路 - 编辑页（与 KIS 布局和功能一致）
 *
 * 固定标题栏 + 左侧目录 + 项目基本信息 + 方案解析表单(ProjectFormViewer) + 访视计划概览 + AI 解析/解析过程。
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectFullLinkApi, type ProjectUpdateIn } from '@cn-kis/api-client'

/** 从 parsed_data.project_info 构建可回填到项目的字段（与 KIS 项目全链路一致：解析成功后填到项目） */
function projectUpdateFromParsedInfo(pi: Record<string, unknown>): ProjectUpdateIn {
  const out: ProjectUpdateIn = {}
  if (typeof pi.project_name === 'string' && pi.project_name.trim()) out.project_name = pi.project_name.trim()
  if (typeof pi.sponsor_no === 'string' && pi.sponsor_no.trim()) out.sponsor_no = pi.sponsor_no.trim()
  if (typeof pi.sponsor_name === 'string' && pi.sponsor_name.trim()) out.sponsor_name = pi.sponsor_name.trim()
  if (typeof pi.priority === 'string' && ['high', 'medium', 'low'].includes(pi.priority)) out.priority = pi.priority
  if (typeof pi.business_type === 'string') out.business_type = pi.business_type
  const descParts: string[] = []
  if (typeof pi.description === 'string' && pi.description.trim()) descParts.push(pi.description.trim())
  if (typeof pi.research_purpose === 'string' && pi.research_purpose.trim()) descParts.push(pi.research_purpose.trim())
  if (descParts.length) out.description = descParts.join('\n')
  const dateFields: [string, keyof ProjectUpdateIn][] = [
    ['expected_start_date', 'expected_start_date'],
    ['expected_end_date', 'expected_end_date'],
    ['client_expected_delivery_date', 'report_deadline'],
  ]
  for (const [from, to] of dateFields) {
    const v = pi[from]
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) (out as Record<string, unknown>)[to] = v.slice(0, 10)
  }
  return out
}
import { Button, Card, Input, Badge } from '@cn-kis/ui-kit'
import { ArrowLeft, Save, Sparkles, Send, Loader2 } from 'lucide-react'
import { AiParseUploadDialog } from '../components/ProjectFullLink/AiParseUploadDialog'
import {
  AiParseProgressDialog,
  type AiParseProgressItem,
  type AiParseLogItem,
} from '../components/ProjectFullLink/AiParseProgressDialog'
import { TableOfContents } from '../components/ProjectFullLink/TableOfContents'
import { ProjectFormViewer } from '../components/ProjectFullLink/ProjectFormViewer'
import { VisitPlanPreviewDialog } from '../components/ProjectFullLink/VisitPlanPreviewDialog'
import { convertParsedDataToVisitPlan } from '../utils/visitPlanConverter'
import { protocolExtractV2Api } from '../lib/protocolExtractV2'
import {
  SUBAGENTS,
  ARRAY_SUBAGENTS,
  mergeParsedData,
  extractSubagentResult,
  extractSubagentExtractions,
} from '../lib/protocolExtractUtils'

type JSONObject = Record<string, unknown>

const buildDefaultAiProgressItems = (): AiParseProgressItem[] =>
  SUBAGENTS.map((s) => ({ subagent: s, status: 'pending' }))

/** 与 KIS 一致：合并后端存储的进度与默认 SUBAGENTS，避免缺失或顺序错乱 */
const normalizeAiProgressItems = (items?: AiParseProgressItem[]): AiParseProgressItem[] => {
  const defaults = buildDefaultAiProgressItems()
  if (!items || items.length === 0) return defaults
  return defaults.map((item) => {
    const stored = items.find((entry) => entry.subagent === item.subagent)
    return stored ? { ...item, ...stored } : item
  })
}

const MAX_AI_LOGS = 200

/** 与 KIS 一致：从错误对象提取可读信息 */
function formatErrorMessage(error: unknown): string {
  const err = error as { status?: number; data?: unknown; message?: string }
  const status = err?.status
  const data = err?.data
  if (data && typeof data === 'object') {
    const msg =
      (data as { message?: string }).message ??
      (data as { detail?: string }).detail ??
      (data as { error?: string }).error
    if (msg) return status ? `HTTP ${status} - ${msg}` : String(msg)
  }
  if (typeof data === 'string' && data.trim())
    return status ? `HTTP ${status} - ${data.trim()}` : data.trim()
  if (typeof err?.message === 'string' && err.message.trim())
    return status ? `HTTP ${status} - ${err.message.trim()}` : err.message.trim()
  return status ? `HTTP ${status} - 解析失败` : '解析失败'
}

export default function ProjectFullLinkEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = id ? parseInt(id, 10) : 0
  const lastUploadedFileRef = useRef<File | null>(null)
  /** 与 KIS 一致：防止上传确认被重复触发导致「单独解析」后又执行全量解析 */
  const isConfirmingUploadRef = useRef(false)

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

  const project = projectRes?.data
  const protocols = protocolsRes?.data?.list ?? []
  const activeProtocol = protocols[0] ?? null
  const activeProtocolId = activeProtocol?.id ?? 0

  const [projectForm, setProjectForm] = useState({
    code: '',
    name: '',
    customerCode: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
    businessType: '',
    projectPhase: '',
    researchGroup: '',
    executionPeriod: '',
    clientExpectedDeliveryDate: '',
    researchPurpose: '',
    description: '',
  })

  const [parsedData, setParsedData] = useState<JSONObject | null>(null)
  const [hasGeneratedVisitPlan, setHasGeneratedVisitPlan] = useState(false)
  const [showVisitPlanDialog, setShowVisitPlanDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showAiUploadDialog, setShowAiUploadDialog] = useState(false)
  const [showAiProgressDialog, setShowAiProgressDialog] = useState(false)
  const [isAIParsing, setIsAIParsing] = useState(false)
  const [aiProgressItems, setAiProgressItems] = useState<AiParseProgressItem[]>(buildDefaultAiProgressItems)
  const [aiLogs, setAiLogs] = useState<AiParseLogItem[]>([])
  const [pendingSingleParseSubagent, setPendingSingleParseSubagent] = useState<string | null>(null)

  useEffect(() => {
    if (!project) return
    setProjectForm((prev) => ({
      ...prev,
      code: project.project_no || project.opportunity_no || '',
      name: project.project_name || '',
      customerCode: project.sponsor_no || '',
      priority: (project.priority as 'high' | 'medium' | 'low') || 'medium',
      businessType: project.business_type || '',
      description: project.description || '',
    }))
  }, [project])

  useEffect(() => {
    const pd = activeProtocol?.parsed_data as JSONObject | null
    if (pd) {
      setParsedData(pd)
      setHasGeneratedVisitPlan(true)
      const pi = pd.project_info as Record<string, unknown> | undefined
      if (pi) {
        setProjectForm((prev) => ({
          ...prev,
          executionPeriod: (pi.execution_period as string) || prev.executionPeriod,
          clientExpectedDeliveryDate: (pi.client_expected_delivery_date as string) || prev.clientExpectedDeliveryDate,
          researchPurpose: (pi.research_purpose as string) || prev.researchPurpose,
        }))
      }
    }
  }, [activeProtocol?.id, activeProtocol?.parsed_data])

  useEffect(() => {
    if (!activeProtocol) return
    const storedProgress = activeProtocol.parse_progress as { items?: AiParseProgressItem[] } | undefined
    if (storedProgress?.items?.length) {
      setAiProgressItems(normalizeAiProgressItems(storedProgress.items))
    }
    const logs = activeProtocol.parse_logs as AiParseLogItem[] | undefined
    if (logs?.length) setAiLogs(logs.slice(-MAX_AI_LOGS))
  }, [activeProtocol?.id, activeProtocol?.parse_progress, activeProtocol?.parse_logs])

  const hasParsedBefore = !!(parsedData || activeProtocol?.parsed_data)
  const canOpenAiProgress = isAIParsing || hasParsedBefore || aiProgressItems.some((i) => i.status !== 'pending')

  const updateProject = useMutation({
    mutationFn: (payload: ProjectUpdateIn) => projectFullLinkApi.update(projectId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-full-link', 'project', projectId] }),
  })

  const buildParseProgressPayload = (items: AiParseProgressItem[], runId?: string) => ({
    run_id: runId,
    items,
    updated_at: new Date().toISOString(),
  })

  const persistAiProgress = async (
    items: AiParseProgressItem[],
    logs: AiParseLogItem[],
    nextParsedData: JSONObject | null | undefined,
    protocolId: number,
    runId?: string
  ) => {
    try {
      await projectFullLinkApi.updateProtocol(protocolId, {
        parsed_data: nextParsedData ?? undefined,
        parse_progress: buildParseProgressPayload(items, runId),
        parse_logs: logs as unknown as Array<Record<string, unknown>>,
      })
    } catch (_) {}
  }

  const runAiParse = async (file: File, subagents: readonly string[], resetProgress: boolean, protocolIdOverride: number) => {
    lastUploadedFileRef.current = file
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    let merged: JSONObject | null = parsedData
    let currentItems = resetProgress ? buildDefaultAiProgressItems() : aiProgressItems
    let currentLogs = resetProgress ? [] : aiLogs

    const appendLog = (level: AiParseLogItem['level'], message: string, subagent?: string) => {
      const entry: AiParseLogItem = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        level,
        message,
        subagent,
      }
      currentLogs = currentLogs.length >= MAX_AI_LOGS ? [...currentLogs.slice(-MAX_AI_LOGS + 1), entry] : [...currentLogs, entry]
      setAiLogs(currentLogs)
    }
    const updateProgress = (subagent: string, patch: Partial<AiParseProgressItem>) => {
      currentItems = currentItems.map((i) => (i.subagent === subagent ? { ...i, ...patch } : i))
      setAiProgressItems(currentItems)
    }

    setShowAiUploadDialog(false)
    setShowAiProgressDialog(true)
    setIsAIParsing(true)
    if (resetProgress) setAiLogs([])
    appendLog('info', '开始调用 AI 解析服务')
    await persistAiProgress(currentItems, currentLogs, merged, protocolIdOverride, runId)

    let failedCount = 0
    for (const subagent of subagents) {
      updateProgress(subagent, {
        status: 'running',
        startedAt: new Date().toLocaleString('zh-CN'),
        endedAt: undefined,
        durationMs: undefined,
        httpStatus: undefined,
        errorMessage: undefined,
      })
      appendLog('info', '开始解析', subagent)
      await persistAiProgress(currentItems, currentLogs, merged, protocolIdOverride, runId)
      const start = performance.now()
      try {
        const res = await protocolExtractV2Api.extractBySubagent(file, subagent)
        const durationMs = Math.round(performance.now() - start)
        updateProgress(subagent, { status: 'success', endedAt: new Date().toLocaleString('zh-CN'), durationMs, httpStatus: res.status })
        let extracted = extractSubagentResult(res.data, subagent)
        if (ARRAY_SUBAGENTS.has(subagent) && Array.isArray(extracted) && extracted.length === 0) {
          const fallback = extractSubagentExtractions(res.data, subagent)
          if (fallback?.length) {
            extracted = fallback as unknown as typeof extracted
            appendLog('info', '解析结果为空，已使用溯源 attributes 回填', subagent)
          }
        }
        if (extracted !== undefined) {
          merged = mergeParsedData(merged, { [subagent]: extracted } as JSONObject)
          setParsedData(merged)
          appendLog('success', `解析成功（${durationMs}ms）`, subagent)
          appendLog('success', '解析结果已回填到表单', subagent)
        } else {
          appendLog('error', '解析结果结构不符合预期，未能回填', subagent)
        }
        await persistAiProgress(currentItems, currentLogs, merged, protocolIdOverride, runId)
      } catch (err: unknown) {
        failedCount += 1
        const durationMs = Math.round(performance.now() - start)
        const errorMessage = formatErrorMessage(err)
        const errWithStatus = err as { status?: number }
        updateProgress(subagent, {
          status: 'failed',
          endedAt: new Date().toLocaleString('zh-CN'),
          durationMs,
          httpStatus: errWithStatus?.status,
          errorMessage,
        })
        appendLog('error', errorMessage, subagent)
        await persistAiProgress(currentItems, currentLogs, merged, protocolIdOverride, runId)
      }
    }

    setIsAIParsing(false)
    if (failedCount > 0) {
      alert(`AI解析完成（部分失败），共有 ${failedCount} 项解析失败，请在过程弹框查看详情`)
    }
    queryClient.invalidateQueries({ queryKey: ['project-full-link', 'protocols', projectId] })

    // 与 KIS 一致：AI 解析成功后将解析结果填到项目中（project_info 回填到项目表）
    const pi = merged?.project_info as Record<string, unknown> | undefined
    if (pi && typeof pi === 'object' && Object.keys(pi).length > 0) {
      const payload = projectUpdateFromParsedInfo(pi)
      if (Object.keys(payload).length > 0) {
        try {
          await projectFullLinkApi.update(projectId, payload)
          queryClient.invalidateQueries({ queryKey: ['project-full-link', 'project', projectId] })
          setProjectForm((prev) => ({
            ...prev,
            ...(typeof pi.project_no === 'string' && pi.project_no.trim() ? { code: pi.project_no.trim() } : {}),
            ...(typeof pi.project_name === 'string' && pi.project_name.trim() ? { name: pi.project_name.trim() } : {}),
            ...(typeof pi.sponsor_no === 'string' && pi.sponsor_no.trim() ? { customerCode: pi.sponsor_no.trim() } : {}),
            ...(typeof pi.priority === 'string' && ['high', 'medium', 'low'].includes(pi.priority) ? { priority: pi.priority as 'high' | 'medium' | 'low' } : {}),
            ...(typeof pi.research_purpose === 'string' && pi.research_purpose.trim() ? { researchPurpose: pi.research_purpose.trim() } : {}),
            ...(typeof pi.execution_period === 'string' ? { executionPeriod: pi.execution_period } : {}),
            ...(typeof pi.client_expected_delivery_date === 'string' ? { clientExpectedDeliveryDate: String(pi.client_expected_delivery_date).slice(0, 10) } : {}),
          }))
        } catch (_) {
          // 回填失败不影响解析结果已写入方案，仅不更新项目表
        }
      }
    }
  }

  const handleAiParseClick = () => {
    if (isAIParsing) return
    setShowAiUploadDialog(true)
  }

  const handleAiProgressClick = () => {
    if (!canOpenAiProgress) return
    setShowAiProgressDialog(true)
  }

  /** 与 KIS 一致：从后端下载方案文件（按 file_id，静态路径 /system/files/{id}/download） */
  const fetchProtocolFileByFileId = async (protocol: { file_id: number | null; protocol_name?: string }): Promise<File> => {
    const fileId = protocol.file_id
    if (fileId == null) throw new Error('方案未关联文件，无法解析')
    try {
      return await projectFullLinkApi.downloadSystemFile(fileId, protocol.protocol_name || 'protocol.pdf')
    } catch {
      throw new Error('获取方案文件失败')
    }
  }

  /** 与 KIS 一致：按方案 ID 下载方案文件（静态路径 /projects/protocols/{id}/download） */
  const fetchProtocolFileByProtocolId = async (protocolId: number, protocolName?: string): Promise<File> => {
    try {
      return await projectFullLinkApi.downloadProtocolFile(protocolId, protocolName || 'protocol.pdf')
    } catch {
      throw new Error('获取方案文件失败')
    }
  }

  const handleAiUploadDialogChange = (open: boolean) => {
    if (!open) setPendingSingleParseSubagent(null)
    setShowAiUploadDialog(open)
  }

  const handleAiUploadConfirm = async (file: File, _confirmOverwrite: boolean) => {
    if (isConfirmingUploadRef.current) return
    isConfirmingUploadRef.current = true
    setIsAIParsing(true)
    const wasPendingSingle = pendingSingleParseSubagent
    setPendingSingleParseSubagent(null)
    let protocolId = activeProtocolId
    try {
      if (!activeProtocol) {
        const res = await projectFullLinkApi.createProtocol(projectId, file, { protocol_name: file.name.replace(/\.[^/.]+$/, '') })
        const body = res as { data?: { id?: number } }
        protocolId = body?.data?.id ?? 0
        queryClient.invalidateQueries({ queryKey: ['project-full-link', 'protocols', projectId] })
      }
      if (wasPendingSingle) {
        if (protocolId) {
          await runAiParse(file, [wasPendingSingle], false, protocolId)
        } else {
          setIsAIParsing(false)
        }
        return
      }
      if (protocolId) {
        await runAiParse(file, SUBAGENTS, true, protocolId)
      } else {
        setIsAIParsing(false)
      }
    } catch (e) {
      console.error(e)
      setIsAIParsing(false)
      const msg = e instanceof Error ? e.message : '上传方案文件时出错，请检查网络或权限'
      alert(`上传失败：${msg}`)
    } finally {
      isConfirmingUploadRef.current = false
    }
  }

  /** 与 KIS 一致：单独解析时优先用缓存文件，否则用方案关联文件（file_id 或 protocol 下载），都没有才弹上传框 */
  const handleSingleParse = (subagent: string) => {
    if (isAIParsing) return
    const cachedFile = lastUploadedFileRef.current
    if (cachedFile) {
      runAiParse(cachedFile, [subagent], false, activeProtocolId)
      return
    }
    if (activeProtocol) {
      const loadFileAndParse = (): Promise<File> => {
        if (activeProtocol.file_id != null && activeProtocol.file_id !== 0) {
          return fetchProtocolFileByFileId(activeProtocol)
        }
        return fetchProtocolFileByProtocolId(activeProtocol.id, activeProtocol.protocol_name)
      }
      loadFileAndParse()
        .then((file) => {
          lastUploadedFileRef.current = file
          runAiParse(file, [subagent], false, activeProtocolId)
        })
        .catch(() => {
          alert('获取方案文件失败，请重新上传方案文件')
          setPendingSingleParseSubagent(subagent)
          setShowAiUploadDialog(true)
        })
      return
    }
    setPendingSingleParseSubagent(subagent)
    setShowAiUploadDialog(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateProject.mutateAsync({
        project_name: projectForm.name,
        sponsor_no: projectForm.customerCode,
        sponsor_name: projectForm.customerCode,
        priority: projectForm.priority,
        business_type: projectForm.businessType,
        description: projectForm.description,
      })
      if (parsedData && activeProtocolId) {
        const updatedParsed = {
          ...parsedData,
          project_info: {
            ...((parsedData.project_info as JSONObject) || {}),
            project_no: projectForm.code,
            project_name: projectForm.name,
            research_purpose: projectForm.researchPurpose,
            execution_period: projectForm.executionPeriod,
            client_expected_delivery_date: projectForm.clientExpectedDeliveryDate,
            priority: projectForm.priority,
          },
        }
        setParsedData(updatedParsed)
        await projectFullLinkApi.updateProtocol(activeProtocolId, { parsed_data: updatedParsed })
        queryClient.invalidateQueries({ queryKey: ['project-full-link', 'protocols', projectId] })
      }
      setHasGeneratedVisitPlan(true)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmitVisitPlan = async () => {
    if (!parsedData) return
    setIsSubmitting(true)
    setHasGeneratedVisitPlan(true)
    setIsSubmitting(false)
  }

  const formViewerData = useMemo(() => {
    if (parsedData) return parsedData
    return {
      project_info: {
        project_no: projectForm.code,
        project_name: projectForm.name,
        research_purpose: projectForm.researchPurpose,
        execution_period: projectForm.executionPeriod,
        client_expected_delivery_date: projectForm.clientExpectedDeliveryDate,
        priority: projectForm.priority,
      },
    } as JSONObject
  }, [parsedData, projectForm.code, projectForm.name, projectForm.researchPurpose, projectForm.executionPeriod, projectForm.clientExpectedDeliveryDate, projectForm.priority])

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
    { id: 'visit-plan-overview', title: '访视计划概览', visible: hasGeneratedVisitPlan && !!parsedData },
  ]

  if (projectId <= 0 || !project) {
    return (
      <div className="p-6 text-slate-500">
        {loadingProject ? '加载中…' : '项目不存在'}，<button type="button" className="text-primary-600 underline" onClick={() => navigate('/project-full-link')}>返回列表</button>
      </div>
    )
  }

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
                  {projectForm.code || project?.project_no || project?.opportunity_no || '新建项目'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {projectForm.name || project?.project_name || '填写项目信息或上传研究方案文档进行AI解析'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" icon={<Sparkles className="w-4 h-4" />} onClick={handleAiParseClick} disabled={isAIParsing}>
                AI解析
              </Button>
              <Button variant="outline" onClick={handleAiProgressClick} disabled={!canOpenAiProgress}>
                {isAIParsing && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                解析过程
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
                <label className="block text-sm text-slate-500 mb-1">项目编号</label>
                <Input value={projectForm.code} onChange={(e) => setProjectForm((f) => ({ ...f, code: e.target.value }))} placeholder="请输入项目编号" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">项目名称</label>
                <Input value={projectForm.name} onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))} placeholder="请输入项目名称" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">客户编号</label>
                <Input value={projectForm.customerCode} onChange={(e) => setProjectForm((f) => ({ ...f, customerCode: e.target.value }))} placeholder="请输入客户编号" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">优先级</label>
                <select
                  className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={projectForm.priority}
                  onChange={(e) => setProjectForm((f) => ({ ...f, priority: e.target.value as 'high' | 'medium' | 'low' }))}
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">业务类型</label>
                <Input value={projectForm.businessType} onChange={(e) => setProjectForm((f) => ({ ...f, businessType: e.target.value }))} placeholder="请输入业务类型" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">项目阶段</label>
                <Input value={projectForm.projectPhase} onChange={(e) => setProjectForm((f) => ({ ...f, projectPhase: e.target.value }))} placeholder="请输入项目阶段" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">研究组</label>
                <Input value={projectForm.researchGroup} onChange={(e) => setProjectForm((f) => ({ ...f, researchGroup: e.target.value }))} placeholder="请输入研究组" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">项目状态</label>
                <div className="mt-1">
                  <Badge variant={project?.execution_status === 'cancelled' ? 'destructive' : 'default'}>
                    {project?.execution_status === 'cancelled' ? '取消' : '正常'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-500 mb-1">执行时间周期</label>
                <Input value={projectForm.executionPeriod} onChange={(e) => setProjectForm((f) => ({ ...f, executionPeriod: e.target.value }))} placeholder="请输入执行时间周期" className="mt-1" />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">客户期望交付日期</label>
                <Input type="date" value={projectForm.clientExpectedDeliveryDate} onChange={(e) => setProjectForm((f) => ({ ...f, clientExpectedDeliveryDate: e.target.value }))} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-500 mb-1">研究目的</label>
                <textarea
                  className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm min-h-[80px]"
                  value={projectForm.researchPurpose}
                  onChange={(e) => setProjectForm((f) => ({ ...f, researchPurpose: e.target.value }))}
                  placeholder="请输入研究目的"
                  rows={3}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-500 mb-1">项目描述</label>
                <textarea
                  className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm min-h-[80px]"
                  value={projectForm.description}
                  onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="请输入项目描述"
                  rows={3}
                />
              </div>
            </div>
          </Card>

          {parsedData && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">方案文档已解析</span>
            </div>
          )}

          <ProjectFormViewer
            data={formViewerData}
            editable={true}
            onSave={(updated) => {
              setParsedData(updated)
              if (updated.project_info) {
                const pi = updated.project_info as Record<string, unknown>
                setProjectForm((prev) => ({
                  ...prev,
                  researchPurpose: (pi.research_purpose as string) ?? prev.researchPurpose,
                  executionPeriod: (pi.execution_period as string) ?? prev.executionPeriod,
                  clientExpectedDeliveryDate: (pi.client_expected_delivery_date as string) ?? prev.clientExpectedDeliveryDate,
                }))
              }
            }}
          />

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} icon={<Save className="w-4 h-4" />}>
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>

          {hasGeneratedVisitPlan && parsedData && (
            <Card id="visit-plan-overview" className="p-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">访视计划概览</h3>
              <p className="text-sm text-slate-500 mb-4">访视计划已生成，请确认无误后提交</p>
              <Button variant="outline" onClick={() => setShowVisitPlanDialog(true)} className="mb-4">
                查看访视计划详情
              </Button>
              <div className="flex justify-end">
                <Button onClick={handleSubmitVisitPlan} disabled={isSubmitting} icon={<Send className="w-4 h-4" />}>
                  {isSubmitting ? '提交中...' : '提交访视计划'}
                </Button>
              </div>
            </Card>
          )}

          {showVisitPlanDialog && parsedData && (
            <VisitPlanPreviewDialog
              open={showVisitPlanDialog}
              onOpenChange={setShowVisitPlanDialog}
              visitPlan={convertParsedDataToVisitPlan(parsedData as any)}
              protocolName={activeProtocol?.protocol_name}
              projectName={projectForm.name || project?.project_name}
            />
          )}

          <AiParseUploadDialog
            open={showAiUploadDialog}
            onOpenChange={handleAiUploadDialogChange}
            hasExistingParsedData={!!parsedData || !!activeProtocol?.parsed_data}
            onConfirm={handleAiUploadConfirm}
            isSubmitting={isAIParsing}
          />
          <AiParseProgressDialog
            open={showAiProgressDialog}
            onOpenChange={setShowAiProgressDialog}
            items={aiProgressItems}
            logs={aiLogs}
            isRunning={isAIParsing}
            showSingleParse={!isAIParsing && canOpenAiProgress}
            onSingleParse={handleSingleParse}
          />
        </div>
      </div>
    </div>
  )
}
