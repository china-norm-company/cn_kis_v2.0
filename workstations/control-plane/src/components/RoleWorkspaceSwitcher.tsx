import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { WORKSPACE_ROLES, setStoredWorkspaceRole } from '@/constants/workspace'

export function RoleWorkspaceSwitcher() {
  const navigate = useNavigate()
  const location = useLocation()

  const currentPath = location.pathname
  const currentRole = WORKSPACE_ROLES.find((r) => r.path === currentPath) ?? WORKSPACE_ROLES[0]

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
      <LayoutDashboard className="ml-1.5 h-4 w-4 text-slate-400" />
      <select
        value={currentRole.id}
        onChange={(e) => {
          const role = WORKSPACE_ROLES.find((r) => r.id === e.target.value)
          if (role) {
            setStoredWorkspaceRole(role.id)
            navigate(role.path)
          }
        }}
        className="border-0 bg-transparent py-1 pr-6 pl-1 text-sm font-medium text-slate-700 outline-none"
        aria-label="工作区视角"
      >
        {WORKSPACE_ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  )
}
