import { useQuery } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import { ShieldCheck, Plus } from 'lucide-react'

export function AuthorizationPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['equipment-authorizations'],
    queryFn: () => equipmentApi.listAuthorizations({ is_active: undefined }),
  })

  const rawData = (data?.data as any)
  const items = Array.isArray(rawData) ? rawData : (rawData?.items ?? [])

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-800 md:text-2xl">设备授权管理</h1>
        </div>
        <button className="flex min-h-11 items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> 新增授权
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['设备编号', '授权人员', '授权类型', '有效期至', '状态'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">暂无授权记录</td></tr>
              ) : items.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{item.equipment_code ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.operator_name ?? item.person_name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.auth_type ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.valid_until ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                      {item.status ?? '有效'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(Array.isArray(rawData) ? rawData.length : (rawData?.total ?? 0)) > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
        {Array.isArray(rawData) ? rawData.length : (rawData?.total ?? items.length)} 条授权记录
          </div>
        )}
      </div>
    </div>
  )
}
