import { BookOpen } from 'lucide-react'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export function StandardsPage() {
  return (
    <div className="space-y-5">
      <PlaceholderPage
        title="接入与标准"
        description="接入对象登记、接入模式、数据映射与健康检查模板、接入验收与成熟度。"
        icon={<BookOpen className="h-12 w-12" />}
      />
    </div>
  )
}
