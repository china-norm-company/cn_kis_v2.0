import { GitBranch } from 'lucide-react'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export function DependenciesPage() {
  return (
    <div className="space-y-5">
      <PlaceholderPage
        title="依赖与拓扑"
        description="资源关系图、场景依赖图与影响传播图，支持依赖链定位与恢复分析。"
        icon={<GitBranch className="h-12 w-12" />}
      />
    </div>
  )
}
