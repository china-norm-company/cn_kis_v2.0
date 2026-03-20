import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { safetyApi, type AEStats } from '@cn-kis/api-client'
import { Card, Button, StatCard } from '@cn-kis/ui-kit'

const SEVERITY_LABELS: Record<string, string> = { mild: '轻度', moderate: '中度', severe: '重度' }
const STATUS_LABELS: Record<string, string> = {
  reported: '已上报', under_review: '审核中', approved: '已确认', following: '随访中', closed: '已关闭',
}
const RELATION_LABELS: Record<string, string> = {
  unrelated: '无关', possible: '可能有关', probable: '很可能有关', certain: '肯定有关',
}

function BarChart({ data, labels, title }: { data: Record<string, number>; labels: Record<string, string>; title: string }) {
  const entries = Object.entries(data)
  const maxVal = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <Card title={title}>
      <div className="space-y-3">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-20 text-sm text-gray-600 text-right">{labels[key] || key}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2"
                style={{ width: `${(val / maxVal) * 100}%`, minWidth: val > 0 ? '2rem' : 0 }}
              >
                <span className="text-xs text-white font-medium">{val}</span>
              </div>
            </div>
          </div>
        ))}
        {entries.length === 0 && <p className="text-gray-400 text-sm text-center py-4">暂无数据</p>}
      </div>
    </Card>
  )
}

export default function AdverseEventDashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<AEStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    safetyApi.getStats().then((res) => {
      if (res.code === 200) setStats(res.data ?? null)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-6 text-gray-500">加载中...</div>
  if (!stats) return <div className="p-6 text-red-500">统计数据加载失败</div>

  const saeRate = stats.total > 0 ? ((stats.sae_count / stats.total) * 100).toFixed(1) : '0'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AE 统计仪表盘</h1>
        <Button variant="outline" onClick={() => navigate('/adverse-events')}>返回列表</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="AE 总数" value={stats.total} />
        <StatCard title="SAE 数量" value={stats.sae_count} color="red" />
        <StatCard title="SAE 率" value={`${saeRate}%`} color={Number(saeRate) > 10 ? 'red' : 'green'} />
        <StatCard title="未关闭" value={stats.open_count} color="orange" />
        <StatCard title="已关闭" value={stats.total - stats.open_count} color="green" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BarChart data={stats.by_severity || {}} labels={SEVERITY_LABELS} title="严重程度分布" />
        <BarChart data={stats.by_status || {}} labels={STATUS_LABELS} title="状态分布" />
        <BarChart data={stats.by_relation || {}} labels={RELATION_LABELS} title="因果关系分布" />
      </div>
    </div>
  )
}
