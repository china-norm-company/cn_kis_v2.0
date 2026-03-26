/**
 * 员工角色切换器（P3.4）
 *
 * 场景：内部员工同时拥有多个角色（如 evaluator + QA），
 * 可在不重新登录的情况下切换活跃工作视角。
 */
import { useState, useCallback, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'

export type RolePerspective = {
  role: string
  label: string
  icon: string
  description: string
}

const ROLE_PERSPECTIVE_META: Record<string, Omit<RolePerspective, 'role'>> = {
  evaluator: { label: '评估人员', icon: '🔬', description: '查看今日排班与评估任务' },
  technician: { label: '技术员', icon: '🛠', description: '执行工单与仪器操作' },
  clinical_executor: { label: '临床执行', icon: '💉', description: '访视执行与样本采集' },
  receptionist: { label: '接待员', icon: '📋', description: '受试者接待与签到' },
  qa_auditor: { label: 'QA 审计', icon: '✅', description: '质量巡查与偏差管理' },
  project_manager: { label: '项目经理', icon: '📊', description: '项目进度与资源管理' },
}

export function getRolePerspectives(roles: string[]): RolePerspective[] {
  const internalRoles = [
    'evaluator', 'technician', 'clinical_executor', 'receptionist',
    'qa_auditor', 'project_manager', 'qa', 'superadmin', 'admin',
    'general_manager', 'project_director', 'pi', 'crc', 'research_assistant',
    'recruiter', 'scheduler', 'lab_personnel',
  ]
  return roles
    .filter((r) => internalRoles.includes(r))
    .map((r) => ({
      role: r,
      ...(ROLE_PERSPECTIVE_META[r] ?? {
        label: r,
        icon: '👤',
        description: `${r} 工作视角`,
      }),
    }))
}

const STORAGE_KEY = 'active_perspective'

export function useRoleSwitcher(availableRoles: string[]) {
  const [activePerspective, setActivePerspectiveState] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((saved) => {
        if (saved && availableRoles.includes(saved)) {
          setActivePerspectiveState(saved)
        } else if (availableRoles.length > 0) {
          setActivePerspectiveState(availableRoles[0] ?? null)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [availableRoles.join(',')])

  const setActivePerspective = useCallback(async (role: string | null) => {
    if (role) {
      await SecureStore.setItemAsync(STORAGE_KEY, role)
    } else {
      await SecureStore.deleteItemAsync(STORAGE_KEY)
    }
    setActivePerspectiveState(role)
  }, [])

  const perspectives = getRolePerspectives(availableRoles)

  return { activePerspective, setActivePerspective, perspectives, loaded }
}
