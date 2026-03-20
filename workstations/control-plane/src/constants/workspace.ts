/** 角色视角与默认工作区路径（天工优化计划 Phase 2） */
export const WORKSPACE_ROLES = [
  { id: 'executive', label: '管理层', path: '/dashboard' },
  { id: 'ops', label: '运营中枢', path: '/today-ops' },
  { id: 'domain', label: '专业管理', path: '/objects' },
  { id: 'tech', label: '技术保障', path: '/resource-health' },
  { id: 'duty', label: '值班处置', path: '/events' },
] as const

export const DEFAULT_WORKSPACE_PATH = '/dashboard'

const STORAGE_KEY = 'control_plane_workspace_role'

export function getStoredWorkspacePath(): string {
  try {
    const role = localStorage.getItem(STORAGE_KEY)
    const found = WORKSPACE_ROLES.find((r) => r.id === role)
    return found ? found.path : DEFAULT_WORKSPACE_PATH
  } catch {
    return DEFAULT_WORKSPACE_PATH
  }
}

export function setStoredWorkspaceRole(roleId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, roleId)
  } catch {
    /* ignore */
  }
}
