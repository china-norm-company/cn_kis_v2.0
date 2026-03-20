/**
 * 获取项目的排程进度（与 KIS 一致）
 * 根据排程管理模块的状态自动同步，当前从 localStorage 读取 mock 数据
 */
export type SchedulingProgress =
  | '待提交访视计划'
  | '待审核'
  | '待排程'
  | '待研究员确认'
  | '待发布工单'
  | '已发布工单'

export function getSchedulingProgress(
  projectId: number,
  protocolId?: number
): SchedulingProgress {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('mock_scheduler_projects') : null
    const schedulerProjects = JSON.parse(raw || '[]')
    const schedulerProject = schedulerProjects.find((p: { projectId?: number; protocolId?: number }) => {
      if (protocolId && p.protocolId === protocolId) return true
      if (p.projectId === projectId) return true
      return false
    })
    if (!schedulerProject) return '待提交访视计划'
    const status = schedulerProject.status
    switch (status) {
      case 'pending_review':
        return '待审核'
      case 'pending_schedule':
        return '待排程'
      case 'pending_researcher_confirmation':
        return '待研究员确认'
      case 'researcher_confirmed':
        return '待发布工单'
      case 'scheduled':
        return '已发布工单'
      case 'rejected':
      case 'cancelled':
        return '待提交访视计划'
      default:
        return '待提交访视计划'
    }
  } catch {
    return '待提交访视计划'
  }
}

export function getSchedulingProgressConfig(progress: SchedulingProgress): {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  color: string
} {
  const configs: Record<SchedulingProgress, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
    '待提交访视计划': { label: '待提交访视计划', variant: 'outline', color: 'text-slate-600' },
    '待审核': { label: '待审核', variant: 'secondary', color: 'text-amber-600' },
    '待排程': { label: '待排程', variant: 'default', color: 'text-blue-600' },
    '待研究员确认': { label: '待研究员确认', variant: 'secondary', color: 'text-purple-600' },
    '待发布工单': { label: '待发布工单', variant: 'default', color: 'text-teal-600' },
    '已发布工单': { label: '已发布工单', variant: 'default', color: 'text-green-600' },
  }
  return configs[progress]
}
