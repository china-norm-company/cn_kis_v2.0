import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Settings, Database, Cloud, Shield, Server, Globe, Cpu, HardDrive } from 'lucide-react'

export function SystemConfigPage() {
  const { data: healthData } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () => api.get<any>('/health'),
    retry: false,
    refetchInterval: 30_000,
  })

  const health = (healthData as any)?.data ?? healthData ?? {}

  const configSections = [
    {
      title: '基础设施',
      icon: Server,
      items: [
        { label: 'Django 版本', value: health.django_version || '5.1+' },
        { label: 'Python 版本', value: health.python_version || '3.12+' },
        { label: '数据库', value: 'PostgreSQL 16' },
        { label: '缓存', value: 'Redis 7.0' },
        { label: '任务队列', value: 'Celery + Redis' },
      ],
    },
    {
      title: 'AI 服务',
      icon: Cpu,
      items: [
        { label: 'ARK（火山方舟）', value: '已配置' },
        { label: 'Kimi（Moonshot）', value: '已配置' },
        { label: 'Agent 数量', value: '18 个' },
        { label: 'Claw 技能', value: '27 个' },
        { label: 'pgvector', value: '向量检索已启用' },
      ],
    },
    {
      title: '飞书集成',
      icon: Globe,
      items: [
        { label: 'OAuth 登录', value: '已启用' },
        { label: 'H5 内嵌', value: '已配置' },
        { label: '消息通知', value: '已配置' },
        { label: '多维表格', value: '已配置' },
      ],
    },
    {
      title: '安全与合规',
      icon: Shield,
      items: [
        { label: 'RBAC 权限', value: '已启用' },
        { label: '审计日志', value: 'GCP/21 CFR Part 11 合规' },
        { label: '电子签名', value: '已实现' },
        { label: 'SSL/HTTPS', value: health.ssl_enabled ? '已启用' : '待配置' },
      ],
    },
    {
      title: '存储',
      icon: HardDrive,
      items: [
        { label: '文件存储', value: '本地存储' },
        { label: '知识图谱', value: 'PostgreSQL (KnowledgeEntity)' },
        { label: '向量索引', value: 'pgvector (1024 dim, jina-embeddings-v3)' },
        { label: 'CDISC/BRIDG', value: '本体已就绪' },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">系统配置</h2>
        <p className="text-sm text-slate-400 mt-1">CN KIS V1.0 系统配置概览</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {configSections.map((section) => (
          <div key={section.title} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <section.icon className="w-5 h-5 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700">{section.title}</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-slate-500">{item.label}</span>
                  <span className="text-sm font-medium text-slate-700">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
