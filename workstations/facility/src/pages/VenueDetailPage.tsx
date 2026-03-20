import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import { ChevronLeft, Building2 } from 'lucide-react'

export function VenueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['venue-detail', id],
    queryFn: () => facilityApi.getVenueDetail(Number(id)),
    enabled: !!id,
  })

  const venue = (data?.data as any) ?? {}

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> 返回
        </button>
        <Building2 className="w-5 h-5 text-blue-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">场地详情</h1>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: '场地编号', value: venue.venue_code ?? venue.code },
              { label: '场地名称', value: venue.name },
              { label: '场地类型', value: venue.venue_type },
              { label: '楼层/位置', value: venue.location },
              { label: '容量', value: venue.capacity },
              { label: '面积（m²）', value: venue.area },
              { label: '负责人', value: venue.manager_name },
              { label: '状态', value: venue.status },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">{label}</span>
                <span className="text-sm text-slate-800">{value ?? '-'}</span>
              </div>
            ))}
          </div>
          {venue.description && (
            <div className="border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500 font-medium">描述</span>
              <p className="mt-1 text-sm text-slate-700">{venue.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
