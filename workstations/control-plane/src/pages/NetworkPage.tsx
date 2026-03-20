import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  Radio,
  Router,
  Shield,
  Thermometer,
  Wifi,
  Zap,
} from 'lucide-react'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'

function ProgressBar({ value, max = 100, color = 'primary' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100)
  const barColor =
    pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : color === 'primary' ? 'bg-primary-500' : 'bg-emerald-500'
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function NetworkPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['control-plane', 'network-snapshot'],
    queryFn: controlPlaneApi.getNetworkSnapshot,
  })

  if (isLoading) return <QueryLoading loadingText="正在加载网络数据..." />
  if (error || !data) return <QueryError error={error} />

  const cs = data.core_switch
  const ifaces = data.interfaces
  const upPorts = ifaces.details.filter((i) => i.phy_status === 'up' && i.name.startsWith('Gigabit'))
  const hotLinks = ifaces.hot_links

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-900 to-indigo-800 p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Network className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-blue-200">核心交换机 — 实时采集数据</div>
            <h1 className="mt-1 text-2xl font-semibold">{cs.model}</h1>
            <p className="mt-1 text-sm text-blue-200">
              {cs.host} · {cs.software_version} · 运行 {cs.uptime}
            </p>
          </div>
          <div className="hidden gap-3 lg:flex">
            {cs.stack_members.map((m) => (
              <div key={m.slot} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">
                <div className="text-blue-200">Slot {m.slot}</div>
                <div className="font-medium">
                  {m.role} · {m.device_type}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard
          icon={Cpu}
          title="CPU 使用率"
          value={`${cs.cpu.current_percent}%`}
          hint={`5 分钟均值 ${cs.cpu.five_minutes}% · 历史峰值 ${cs.cpu.max_percent}%`}
        >
          <ProgressBar value={cs.cpu.current_percent} />
        </KPICard>
        <KPICard
          icon={HardDrive}
          title="内存使用率"
          value={`${cs.memory.used_percent}%`}
          hint={`${(cs.memory.used_bytes / 1048576).toFixed(0)} MB / ${(cs.memory.total_bytes / 1048576).toFixed(0)} MB`}
        >
          <ProgressBar value={cs.memory.used_percent} color="emerald" />
        </KPICard>
        <KPICard
          icon={Activity}
          title="端口状态"
          value={`${ifaces.up} / ${ifaces.total}`}
          hint={`${ifaces.up} 在线 · ${ifaces.down} 关闭`}
        >
          <ProgressBar value={ifaces.up} max={ifaces.total} color="emerald" />
        </KPICard>
        <KPICard
          icon={Thermometer}
          title="温度"
          value={cs.temperature.map((t) => `${t.celsius}°C`).join(' / ')}
          hint={cs.temperature.map((t) => `Slot${t.slot} ${t.status}`).join(' · ')}
        >
          <ProgressBar value={Math.max(...cs.temperature.map((t) => t.celsius))} max={55} color="emerald" />
        </KPICard>
      </section>

      {/* Topology & Infrastructure */}
      <section className="grid gap-6 xl:grid-cols-2">
        {/* Discovered Devices */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">LLDP 发现设备</h2>
          <div className="space-y-2">
            {data.discovered_devices.map((dev) => (
              <div key={dev.name} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <div className="rounded-lg bg-slate-50 p-2">
                  <DeviceIcon type={dev.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-slate-900">{dev.name}</div>
                  <div className="text-xs text-slate-500">
                    {dev.connected_via.join(', ')} · {dev.link_count} 链路
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {deviceTypeLabel(dev.type)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Infrastructure */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">基础设施</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfraCard
                icon={Shield}
                title={`防火墙 ${data.firewall.model}`}
                desc={`${data.firewall.host} · VRRP ${data.firewall.vrrp_vip}`}
              />
              <InfraCard
                icon={Wifi}
                title={`无线 ${data.wireless_controller.model}`}
                desc={`上联 ${data.wireless_controller.connected_via}`}
              />
            </div>
          </div>

          {/* VLAN Overview */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">VLAN 与在线设备</h2>
            <div className="space-y-2">
              {data.vlans.map((v) => {
                const key = `VLAN${v.vlan_id}`
                const stats = data.arp.by_vlan[key]
                return (
                  <div key={v.vlan_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <div>
                      <span className="font-mono text-sm font-semibold text-slate-900">VLAN {v.vlan_id}</span>
                      {v.name && <span className="ml-2 text-sm text-slate-500">{v.name}</span>}
                    </div>
                    {stats ? (
                      <span className="text-sm text-slate-600">
                        {stats.active} 在线 / {stats.total} 条
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">无 ARP 数据</span>
                    )}
                  </div>
                )
              })}
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm">
                <span className="text-slate-500">ARP 总计</span>
                <span className="font-semibold text-slate-900">
                  {data.arp.summary.total} 条（动态 {data.arp.summary.dynamic}）
                </span>
              </div>
            </div>
          </div>

          {/* Power */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">电源状态</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {cs.power.map((p) => (
                <div
                  key={`${p.slot}-${p.id}`}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${p.online ? 'bg-emerald-50' : 'bg-red-50'}`}
                >
                  <Zap className={`h-4 w-4 ${p.online ? 'text-emerald-600' : 'text-red-500'}`} />
                  <span className="text-sm">
                    Slot{p.slot}/{p.id} — {p.online ? `${p.mode} ${p.watts}W` : '未接入'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Interface Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">端口列表</h2>
        {hotLinks.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <strong>热点链路：</strong>
            {hotLinks.map((h) => `${h.name} (In ${h.in}% / Out ${h.out}%)`).join('、')}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4">端口</th>
                <th className="pb-2 pr-4">状态</th>
                <th className="pb-2 pr-4">描述</th>
                <th className="pb-2 pr-4 text-right">In%</th>
                <th className="pb-2 pr-4 text-right">Out%</th>
                <th className="pb-2 text-right">错误</th>
              </tr>
            </thead>
            <tbody>
              {upPorts.map((iface) => (
                <tr key={iface.name} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-mono text-xs">{iface.short_name}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{iface.description || '—'}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    <span className={iface.in_utilization > 30 ? 'text-amber-600 font-semibold' : ''}>
                      {iface.in_utilization}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">
                    <span className={iface.out_utilization > 30 ? 'text-amber-600 font-semibold' : ''}>
                      {iface.out_utilization}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-slate-500">
                    {iface.in_errors + iface.out_errors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Routes */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">路由表</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4">目的网段</th>
                <th className="pb-2 pr-4">协议</th>
                <th className="pb-2 pr-4">下一跳</th>
                <th className="pb-2">出接口</th>
              </tr>
            </thead>
            <tbody>
              {data.routing.routes.map((r) => (
                <tr key={r.destination} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-mono text-xs">{r.destination}</td>
                  <td className="py-2 pr-4">{r.protocol}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.nexthop}</td>
                  <td className="py-2 text-slate-600">{r.interface}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function KPICard({
  icon: Icon,
  title,
  value,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: string
  hint: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-500">{title}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
        </div>
        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3">{children}</div>
      <div className="mt-2 text-xs text-slate-500">{hint}</div>
    </div>
  )
}

function InfraCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="rounded-lg bg-white p-2 shadow-sm">
        <Icon className="h-5 w-5 text-slate-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">{title}</div>
        <div className="truncate text-xs text-slate-500">{desc}</div>
      </div>
    </div>
  )
}

function DeviceIcon({ type }: { type: string }) {
  switch (type) {
    case 'firewall':
      return <Shield className="h-4 w-4 text-red-500" />
    case 'wireless_controller':
      return <Wifi className="h-4 w-4 text-blue-500" />
    case 'switch':
      return <Router className="h-4 w-4 text-indigo-500" />
    case 'ip_phone':
      return <Radio className="h-4 w-4 text-emerald-500" />
    default:
      return <Network className="h-4 w-4 text-slate-400" />
  }
}

function deviceTypeLabel(type: string): string {
  switch (type) {
    case 'firewall':
      return '防火墙'
    case 'wireless_controller':
      return '无线AC'
    case 'switch':
      return '交换机'
    case 'ip_phone':
      return 'IP话机'
    default:
      return '终端'
  }
}
