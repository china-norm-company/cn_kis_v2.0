import { Database } from 'lucide-react'

export function HomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-center">
      <div className="mb-6 inline-flex rounded-2xl bg-slate-100 p-4 text-slate-600">
        <Database className="h-12 w-12" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-slate-800">洞明·数据台</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        数据中台可视化管理（数据目录、血缘、Pipeline 健康、质量看板等）将在此逐步交付。
        当前为部署与健康检查可用的占位版本。
      </p>
    </div>
  )
}
