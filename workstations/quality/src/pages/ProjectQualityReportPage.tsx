import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, Badge, Button, Input, DataTable, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { useState } from 'react'
import {
  FileText, AlertTriangle, ShieldCheck, MessageSquare,
  CheckCircle, XCircle, Download, Search,
} from 'lucide-react'

interface DeviationItem {
  code: string; title: string; category: string; severity: string;
  status: string; reported_at: string; closed_at: string | null;
}

interface CAPAItem {
  code: string; title: string; type: string; status: string;
  effectiveness: string; due_date: string; responsible: string;
}

interface GateCheck {
  name: string; passed: boolean; detail: string;
}

interface GateResult {
  gate: string; passed: boolean; checks: GateCheck[];
}

interface QualityReport {
  protocol_id: number
  deviation_summary: {
    total: number; closed: number; closure_rate: number;
    by_severity: Record<string, number>; by_status: Record<string, number>;
    by_category: Record<string, number>; list: DeviationItem[];
  }
  capa_summary: {
    total: number; closed: number; closure_rate: number;
    list: CAPAItem[];
  }
  query_summary: { total: number; resolved: number }
  quality_gates: Record<string, GateResult>
}

const gateLabels: Record<string, string> = {
  project_start: '项目启动门禁',
  data_lock: '数据锁定门禁',
  closeout: '结项门禁',
}

const devColumns: Column<DeviationItem>[] = [
  { key: 'code', title: '编号', width: 130 },
  { key: 'title', title: '描述' },
  { key: 'category', title: '分类', width: 100 },
  { key: 'severity', title: '严重度', width: 80,
    render: (v) => {
      const m: Record<string, string> = { critical: '严重', major: '重大', minor: '轻微' }
      return <Badge variant={v === 'critical' ? 'error' : v === 'major' ? 'warning' : 'info'}>{m[v as string] ?? v}</Badge>
    },
  },
  { key: 'status', title: '状态', width: 80 },
  { key: 'reported_at', title: '报告日期', width: 110 },
]

const capaColumns: Column<CAPAItem>[] = [
  { key: 'code', title: '编号', width: 130 },
  { key: 'title', title: '措施' },
  { key: 'type', title: '类型', width: 80, render: (v) => v === 'corrective' ? '纠正' : '预防' },
  { key: 'status', title: '状态', width: 80 },
  { key: 'effectiveness', title: '有效性', width: 80 },
  { key: 'responsible', title: '责任人', width: 90 },
  { key: 'due_date', title: '到期日', width: 110 },
]

export function ProjectQualityReportPage() {
  const [protocolId, setProtocolId] = useState('')
  const [searchId, setSearchId] = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['quality-report', searchId],
    queryFn: () => api.get<QualityReport>(`/quality/report/${searchId}`),
    enabled: !!searchId,
  })

  const report = data?.data

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">项目质量报告</h1>
      </div>

      <Card>
        <div className="p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 sm:max-w-xs">
              <Input
                label="项目/协议 ID"
                value={protocolId}
                onChange={(e) => setProtocolId(e.target.value)}
                placeholder="输入项目 ID"
                inputClassName="min-h-11"
                title="项目协议ID"
              />
            </div>
            <Button
              className="min-h-11"
              icon={<Search className="w-4 h-4" />}
              loading={isFetching}
              disabled={!protocolId}
              onClick={() => setSearchId(protocolId)}
            >
              生成报告
            </Button>
          </div>
        </div>
      </Card>

      {isLoading && searchId && (
        <div className="text-center py-12 text-slate-400">正在生成报告...</div>
      )}

      {report && (
        <div className="space-y-5 md:space-y-6">
          {/* 概览统计 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
            <StatCard title="偏差总数" value={report.deviation_summary.total} icon={<AlertTriangle className="w-6 h-6" />} color="red" />
            <StatCard title="偏差关闭率" value={`${report.deviation_summary.closure_rate}%`} icon={<CheckCircle className="w-6 h-6" />} color="green" />
            <StatCard title="CAPA 总数" value={report.capa_summary.total} icon={<ShieldCheck className="w-6 h-6" />} color="amber" />
            <StatCard title="数据质疑" value={report.query_summary.total} icon={<MessageSquare className="w-6 h-6" />} color="blue" />
          </div>

          {/* 质量门禁 */}
          <Card>
            <div className="p-4 md:p-5">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">质量门禁状态</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {Object.entries(report.quality_gates).map(([key, gate]) => (
                  <div key={key} className={`border rounded-lg p-4 ${gate.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {gate.passed ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                      <span className="font-semibold text-sm">{gateLabels[key] ?? key}</span>
                      <Badge variant={gate.passed ? 'success' : 'error'}>{gate.passed ? '通过' : '未通过'}</Badge>
                    </div>
                    <div className="space-y-1">
                      {gate.checks.map((check, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {check.passed ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          )}
                          <span className={check.passed ? 'text-green-700' : 'text-red-700'}>{check.name}</span>
                          <span className="text-slate-400 ml-auto">{check.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* 偏差汇总 */}
          <Card>
            <div className="p-5">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                偏差汇总 ({report.deviation_summary.total} 项, 关闭率 {report.deviation_summary.closure_rate}%)
              </h2>
              <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {Object.entries(report.deviation_summary.by_severity).map(([sev, count]) => (
                  <span key={sev} className="text-slate-600">
                    {{ critical: '严重', major: '重大', minor: '轻微' }[sev] ?? sev}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[980px]">
                  <DataTable<DeviationItem> columns={devColumns} data={report.deviation_summary.list} emptyText="无偏差记录" />
                </div>
              </div>
            </div>
          </Card>

          {/* CAPA 汇总 */}
          <Card>
            <div className="p-4 md:p-5">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                CAPA 汇总 ({report.capa_summary.total} 项, 关闭率 {report.capa_summary.closure_rate}%)
              </h2>
              <div className="overflow-x-auto">
                <div className="min-w-[980px]">
                  <DataTable<CAPAItem> columns={capaColumns} data={report.capa_summary.list} emptyText="无 CAPA 记录" />
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
