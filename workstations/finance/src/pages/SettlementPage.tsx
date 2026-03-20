import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { DataTable, Badge, StatCard, Modal, Empty } from '@cn-kis/ui-kit'
import { FileCheck, DollarSign, Percent, TrendingUp, ChevronLeft } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ExcelImportPanel } from '../components/ExcelImportPanel'

interface Settlement {
  id: number
  settlement_no: string
  project_name: string
  contract_amount: number
  total_cost: number
  gross_profit: number
  gross_margin: string
  settlement_status: string
  settlement_report?: Record<string, any>
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  draft: { label: '草稿', variant: 'default' },
  pending: { label: '待审核', variant: 'warning' },
  approved: { label: '已审核', variant: 'success' },
  rejected: { label: '已驳回', variant: 'error' },
  finalized: { label: '已完结', variant: 'success' },
}

function fmtMoney(v: number) {
  return `¥${(v / 10000).toFixed(2)}万`
}

export function SettlementPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'list' | 'import'>('list')
  const [showGenerate, setShowGenerate] = useState(false)
  const [selectedProtocol, setSelectedProtocol] = useState<number | null>(null)
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null)

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['finance', 'settlements'],
    queryFn: () => api.get<any>('/finance/settlements/list', { params: { page: 1, page_size: 50 } }),
  })

  const { data: protocolsRes } = useQuery({
    queryKey: ['protocols-for-settlement'],
    queryFn: () => api.get<any>('/protocol/list', { params: { page: 1, page_size: 100 } }),
    enabled: showGenerate,
  })

  const generateMutation = useMutation({
    mutationFn: (protocolId: number) =>
      api.post<any>(`/finance/settlements/generate/${protocolId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'settlements'] })
      setShowGenerate(false)
      setSelectedProtocol(null)
    },
  })

  const settlements: Settlement[] = listRes?.data?.items ?? []
  const protocols = protocolsRes?.data?.items ?? []

  // 月度毛利润走势（从 settlements 本地聚合，无需额外 API）
  const monthlyTrend = (() => {
    const map: Record<string, { month: string; profit: number; cost: number }> = {}
    settlements.forEach((s) => {
      const month = (s as any).created_at?.slice(0, 7) || '未知'
      if (!map[month]) map[month] = { month, profit: 0, cost: 0 }
      map[month].profit += s.gross_profit ?? 0
      map[month].cost += s.total_cost ?? 0
    })
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
  })()

  // 项目毛利率分布（前 8 个项目）
  const projectDistribution = settlements.slice(0, 8).map((s) => ({
    name: (s.project_name || '').slice(0, 8),
    margin: parseFloat(s.gross_margin?.replace('%', '') || '0'),
    profit: Math.round(s.gross_profit / 10000),
  }))

  if (selectedSettlement) {
    const s = selectedSettlement
    const report = s.settlement_report || {}
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedSettlement(null)}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="w-4 h-4" /> 返回列表
        </button>

        <div>
          <h2 className="text-xl font-semibold text-slate-800">决算详情 - {s.settlement_no}</h2>
          <p className="text-sm text-slate-500 mt-1">{s.project_name}</p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatCard title="合同金额" value={fmtMoney(s.contract_amount)} icon={<DollarSign className="w-5 h-5" />} color="blue" />
          <StatCard title="总成本" value={fmtMoney(s.total_cost)} icon={<FileCheck className="w-5 h-5" />} color="red" />
          <StatCard title="毛利润" value={fmtMoney(s.gross_profit)} icon={<TrendingUp className="w-5 h-5" />} color="green" />
          <StatCard title="毛利率" value={s.gross_margin} icon={<Percent className="w-5 h-5" />} color="emerald" />
        </div>

        {Object.keys(report).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">决算报告摘要</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(report).map(([key, value]) => (
                <div key={key} className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-500">{key}</span>
                  <span className="text-sm font-medium text-slate-800">
                    {typeof value === 'number' ? value.toLocaleString() : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">项目决算</h2>
          <p className="text-sm text-slate-500 mt-1">项目决算管理与生成</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'list' && (
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <FileCheck className="w-4 h-4" />
              生成决算
            </button>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['list', 'import'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'list' ? '决算列表' : 'Excel 导入'}
          </button>
        ))}
      </div>

      {activeTab === 'import' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">绩效奖金 Excel 批量导入</h3>
          <ExcelImportPanel />
        </div>
      )}

      {activeTab === 'list' && (<>

      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="生成项目决算">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">选择项目</label>
            <select
              value={selectedProtocol ?? ''}
              onChange={(e) => setSelectedProtocol(Number(e.target.value) || null)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              aria-label="选择项目"
            >
              <option value="">选择项目...</option>
              {protocols.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title} ({p.code || p.id})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowGenerate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              取消
            </button>
            <button
              onClick={() => selectedProtocol && generateMutation.mutate(selectedProtocol)}
              disabled={!selectedProtocol || generateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {generateMutation.isPending ? '生成中...' : '生成决算'}
            </button>
          </div>
        </div>
      </Modal>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        {isLoading ? (
          <div className="flex justify-center py-12 text-slate-400">加载中...</div>
        ) : settlements.length > 0 ? (
          <DataTable
            columns={[
              { key: 'settlement_no', title: '决算编号', render: (r: Settlement) => (
                <button onClick={() => setSelectedSettlement(r)} className="text-blue-600 hover:text-blue-700 font-mono text-xs">
                  {r.settlement_no}
                </button>
              )},
              { key: 'project_name', title: '项目名称' },
              { key: 'contract_amount', title: '合同金额', render: (r: Settlement) => fmtMoney(r.contract_amount) },
              { key: 'total_cost', title: '总成本', render: (r: Settlement) => fmtMoney(r.total_cost) },
              { key: 'gross_profit', title: '毛利润', render: (r: Settlement) => (
                <span className={r.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}>{fmtMoney(r.gross_profit)}</span>
              )},
              { key: 'gross_margin', title: '毛利率', render: (r: Settlement) => r.gross_margin },
              { key: 'settlement_status', title: '状态', render: (r: Settlement) => {
                const st = STATUS_MAP[r.settlement_status] || { label: r.settlement_status, variant: 'default' as const }
                return <Badge variant={st.variant}>{st.label}</Badge>
              }},
            ]}
            data={settlements}
          />
        ) : (
          <Empty message="暂无决算记录，点击「生成决算」创建" />
        )}
      </div>

      {/* 月度毛利润走势图 */}
      {monthlyTrend.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">月度毛利润走势（近 12 个月）</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyTrend} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `¥${(v / 10000).toFixed(2)}万`} />
              <Legend />
              <Line type="monotone" dataKey="profit" name="毛利润" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cost" name="总成本" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 项目毛利率分布图 */}
      {projectDistribution.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">项目毛利率分布（前 8 个项目）</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={projectDistribution} margin={{ top: 4, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name: string) => name === 'margin' ? `${v}%` : `¥${v}万`} />
              <Legend />
              <Bar dataKey="margin" name="毛利率(%)" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" name="毛利润(万)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      </>)}
    </div>
  )
}
