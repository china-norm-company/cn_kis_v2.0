/**
 * P1.3c: 财务报表生成
 *
 * 生成报表 + 查看已有报表 + 飞书文档链接
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { DataTable, Badge, Empty } from '@cn-kis/ui-kit'
import { FileText, Plus, ExternalLink, Download, FileSpreadsheet } from 'lucide-react'

const REPORT_TYPES = [
  { value: 'project_profit', label: '项目利润报表' },
  { value: 'monthly_summary', label: '月度汇总报表' },
  { value: 'quarterly_summary', label: '季度汇总报表' },
  { value: 'cash_flow', label: '现金流报表' },
  { value: 'ar_aging', label: '应收账龄报表' },
]

export function FinanceReportPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [formData, setFormData] = useState({
    report_no: '',
    report_name: '',
    report_type: 'project_profit',
    period_start: '',
    period_end: '',
  })

  const { data: reportsRes } = useQuery({
    queryKey: ['finance', 'reports'],
    queryFn: () => api.get<any>('/finance/reports/list', { params: { page: 1, page_size: 20 } }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/finance/reports/generate', formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'reports'] })
      setShowCreate(false)
    },
  })

  const reports = reportsRes?.data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">财务报表</h2>
          <p className="text-sm text-slate-500 mt-1">生成和管理财务报表</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          生成报表
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">生成新报表</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">报表编号</label>
              <input
                value={formData.report_no}
                onChange={(e) => setFormData(p => ({ ...p, report_no: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="FR-2026-001"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">报表名称</label>
              <input
                value={formData.report_name}
                onChange={(e) => setFormData(p => ({ ...p, report_name: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="2026年Q1利润报表"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">报表类型</label>
              <select
                value={formData.report_type}
                onChange={(e) => setFormData(p => ({ ...p, report_type: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">开始日期</label>
                <input type="date" value={formData.period_start} onChange={(e) => setFormData(p => ({ ...p, period_start: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">结束日期</label>
                <input type="date" value={formData.period_end} onChange={(e) => setFormData(p => ({ ...p, period_end: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
            <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createMutation.isPending ? '生成中...' : '生成'}
            </button>
          </div>
        </div>
      )}

      {/* Report List */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        {reports.length > 0 ? (
          <DataTable
            columns={[
              { key: 'report_no', title: '编号', render: (r: any) => <span className="font-mono text-xs">{r.report_no}</span> },
              { key: 'report_name', title: '名称' },
              { key: 'report_type', title: '类型', render: (r: any) => <Badge>{REPORT_TYPES.find(t => t.value === r.report_type)?.label || r.report_type}</Badge> },
              { key: 'status', title: '状态', render: (r: any) => <Badge variant={r.status === 'generated' ? 'success' : r.status === 'failed' ? 'error' : 'default'}>{r.status}</Badge> },
              { key: 'gross_profit', title: '毛利润', render: (r: any) => r.gross_profit ? `¥${r.gross_profit}` : '--' },
              { key: 'actions', title: '操作', render: (r: any) => (
                <div className="flex items-center gap-2">
                  <a href={`/api/finance/reports/${r.id}/export/excel`} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs">
                    <FileSpreadsheet className="w-3 h-3" /> Excel
                  </a>
                  <a href={`/api/finance/reports/${r.id}/export/pdf`} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs">
                    <Download className="w-3 h-3" /> PDF
                  </a>
                  {r.feishu_doc_token && (
                    <a href={`https://feishu.cn/docx/${r.feishu_doc_token}`} target="_blank" rel="noopener" className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs">
                      <ExternalLink className="w-3 h-3" /> 飞书
                    </a>
                  )}
                </div>
              ) },
            ]}
            data={reports}
          />
        ) : (
          <Empty message='暂无报表，点击「生成报表」创建' />
        )}
      </div>
    </div>
  )
}
