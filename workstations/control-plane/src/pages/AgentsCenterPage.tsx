import { Bot } from 'lucide-react'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export function AgentsCenterPage() {
  return (
    <div className="space-y-5">
      <PlaceholderPage
        title="智能体中心"
        description="风险识别、异常归因、资源优化建议、场景就绪建议与 Runbook 推荐。"
        icon={<Bot className="h-12 w-12" />}
      />
    </div>
  )
}
