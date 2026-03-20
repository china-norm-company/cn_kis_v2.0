import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { TemperatureLogItem, StorageLocationNode } from '@cn-kis/api-client'
import {
  Thermometer,
  Droplets,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Calendar,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'

const DATE_RANGES = [
  { key: '24h', label: '最近24小时', hours: 24 },
  { key: '7d', label: '最近7天', hours: 24 * 7 },
  { key: '30d', label: '最近30天', hours: 24 * 30 },
  { key: 'custom', label: '自定义', hours: 0 },
] as const

function flattenLocations(nodes: StorageLocationNode[]): Array<{ id: number; name: string; tempMin?: number; tempMax?: number }> {
  const result: Array<{ id: number; name: string; tempMin?: number; tempMax?: number }> = []
  function walk(n: StorageLocationNode) {
    result.push({
      id: n.id,
      name: n.name,
      tempMin: n.temperature_min,
      tempMax: n.temperature_max,
    })
    n.children?.forEach(walk)
  }
  nodes.forEach(walk)
  return result
}

export function TemperatureChartPage() {
  const [locationId, setLocationId] = useState<number | ''>('')
  const [dateRange, setDateRange] = useState<(typeof DATE_RANGES)[number]['key']>('7d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const { startDate, endDate } = useMemo(() => {
    const now = new Date()
    if (dateRange === 'custom' && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd }
    }
    const hours = DATE_RANGES.find((r) => r.key === dateRange)?.hours ?? 24 * 7
    const start = new Date(now.getTime() - hours * 60 * 60 * 1000)
    return {
      startDate: start.toISOString().slice(0, 19),
      endDate: now.toISOString().slice(0, 19),
    }
  }, [dateRange, customStart, customEnd])

  const { data: locData } = useQuery({
    queryKey: ['material', 'storage-locations-tree'],
    queryFn: () => materialApi.listStorageLocations({}),
  })
  const locList = useMemo(() => {
    const nodes = (locData as any)?.data as StorageLocationNode[] | undefined
    return nodes ? flattenLocations(nodes) : []
  }, [locData])

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['material', 'temperature-logs', { locationId, startDate, endDate }],
    queryFn: () =>
      materialApi.listTemperatureLogs({
        location_id: locationId || undefined,
        start_date: startDate,
        end_date: endDate,
        page: 1,
        page_size: 500,
      }),
    refetchInterval: autoRefresh ? 30_000 : false,
  })

  const logs = ((logsData as any)?.data as { items: TemperatureLogItem[] })?.items ?? []
  const selectedLoc = locList.find((l) => l.id === locationId)

  const chartData = useMemo(
    () =>
      logs.map((log) => ({
        time: new Date(log.recorded_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        fullTime: log.recorded_at,
        temperature: log.temperature,
        humidity: log.humidity ?? 0,
        abnormal: log.alarm_triggered || log.status === 'abnormal',
      })),
    [logs]
  )

  const summary = useMemo(() => {
    if (logs.length === 0)
      return {
        currentTemp: '--',
        currentHumidity: '--',
        maxTemp: '--',
        minTemp: '--',
        abnormalCount: 0,
      }
    const last = logs[logs.length - 1]
    const temps = logs.map((l) => l.temperature).filter((t) => typeof t === 'number')
    const abnormalCount = logs.filter((l) => l.alarm_triggered || l.status === 'abnormal').length
    return {
      currentTemp: last.temperature.toFixed(1) + '°C',
      currentHumidity: last.humidity != null ? last.humidity.toFixed(1) + '%' : '--',
      maxTemp: temps.length ? Math.max(...temps).toFixed(1) + '°C' : '--',
      minTemp: temps.length ? Math.min(...temps).toFixed(1) + '°C' : '--',
      abnormalCount,
    }
  }, [logs])

  const tempMin = selectedLoc?.tempMin ?? 2
  const tempMax = selectedLoc?.tempMax ?? 8
  const humidityMin = 30
  const humidityMax = 70

  const abnormalLogs = logs.filter((l) => l.alarm_triggered || l.status === 'abnormal')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">温湿度监控</h2>
          <p className="text-sm text-slate-500 mt-1">存储位置温湿度历史趋势与异常告警</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-400" />
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="存储位置"
          >
            <option value="">全部位置</option>
            {locList.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as (typeof DATE_RANGES)[number]['key'])}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="时间范围"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          {dateRange === 'custom' && (
            <>
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                aria-label="开始时间"
              />
              <span className="text-slate-400">至</span>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                aria-label="结束时间"
              />
            </>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
          />
          <span className="text-sm text-slate-600">自动刷新</span>
        </label>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <Thermometer className="w-4 h-4" /> 当前温度
          </p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{summary.currentTemp}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <Droplets className="w-4 h-4" /> 当前湿度
          </p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{summary.currentHumidity}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> 最高温度
          </p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{summary.maxTemp}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <TrendingDown className="w-4 h-4" /> 最低温度
          </p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{summary.minTemp}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> 异常次数
          </p>
          <p className={`text-2xl font-bold mt-1 ${summary.abnormalCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
            {summary.abnormalCount}
          </p>
        </div>
      </div>

      {/* Temperature chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4">温度趋势</h3>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-slate-400">加载中...</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400">暂无数据</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  label={{ value: '温度 (°C)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="text-slate-600">{payload[0].payload.fullTime}</p>
                        <p className="font-medium text-slate-800">温度: {payload[0].payload.temperature}°C</p>
                      </div>
                    ) : null
                  }
                />
                <ReferenceLine
                  y={tempMax}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{ value: `上限 ${tempMax}°C`, position: 'right' }}
                />
                <ReferenceLine
                  y={tempMin}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{ value: `下限 ${tempMin}°C`, position: 'right' }}
                />
                {chartData
                  .map((d, i) => (d.abnormal ? i : -1))
                  .filter((i) => i >= 0)
                  .map((i) => (
                    <ReferenceArea
                      key={i}
                      x1={chartData[Math.max(0, i - 1)]?.time}
                      x2={chartData[Math.min(chartData.length - 1, i + 1)]?.time}
                      fill="#fecaca"
                      fillOpacity={0.3}
                    />
                  ))}
                <Line
                  type="monotone"
                  dataKey="temperature"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name="温度"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Humidity chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4">湿度趋势</h3>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-slate-400">加载中...</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400">暂无数据</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  label={{ value: '湿度 (%)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="text-slate-600">{payload[0].payload.fullTime}</p>
                        <p className="font-medium text-slate-800">湿度: {payload[0].payload.humidity}%</p>
                      </div>
                    ) : null
                  }
                />
                <ReferenceLine
                  y={humidityMax}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{ value: `上限 ${humidityMax}%`, position: 'right' }}
                />
                <ReferenceLine
                  y={humidityMin}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{ value: `下限 ${humidityMin}%`, position: 'right' }}
                />
                <Line
                  type="monotone"
                  dataKey="humidity"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  name="湿度"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Alert log */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h3 className="text-base font-semibold text-slate-800 px-6 py-4 border-b border-slate-200">
          异常告警记录
        </h3>
        {abnormalLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">暂无异常记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">位置</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">数值</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">限值</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">持续时长</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">处置</th>
              </tr>
            </thead>
            <tbody>
              {abnormalLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-red-50/50">
                  <td className="px-4 py-3 text-slate-800">{new Date(log.recorded_at).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-3 text-slate-600">{log.location_name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      {log.status === 'abnormal' ? '异常' : '告警'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    温度 {log.temperature}°C
                    {log.humidity != null && ` / 湿度 ${log.humidity}%`}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {tempMin}–{tempMax}°C
                  </td>
                  <td className="px-4 py-3 text-slate-500">--</td>
                  <td className="px-4 py-3">
                    {log.alarm_handled ? (
                      <span className="text-green-600 text-xs">已处置</span>
                    ) : (
                      <span className="text-amber-600 text-xs">待处置</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
