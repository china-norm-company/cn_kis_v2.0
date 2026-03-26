/**
 * 受试者管理（执行台视角）
 *
 * 全局视角管理所有项目中的受试者：
 * - 状态概览卡片（筛选中/已入组/随访中/已完成/脱落）
 * - 入组列表 DataTable（按项目/状态筛选）
 * - 入组详情抽屉（受试者基本信息 + 知情同意状态 + 关联工单）
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { subjectApi, protocolApi } from '@cn-kis/api-client'
import { DataTable, Badge, Empty, StatCard, Modal } from '@cn-kis/ui-kit'
import { Users, UserPlus, UserCheck, UserX, ClipboardList } from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error'; icon: React.ReactNode }> = {
  screening: { label: '筛选中', color: 'default', icon: <Users className="w-5 h-5" /> },
  enrolled: { label: '已入组', color: 'primary', icon: <UserPlus className="w-5 h-5" /> },
  active: { label: '随访中', color: 'warning', icon: <ClipboardList className="w-5 h-5" /> },
  completed: { label: '已完成', color: 'success', icon: <UserCheck className="w-5 h-5" /> },
  withdrawn: { label: '脱落', color: 'error', icon: <UserX className="w-5 h-5" /> },
  disqualified: { label: '不合格', color: 'error', icon: <UserX className="w-5 h-5" /> },
}

const ENROLLMENT_STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  pending: { label: '待入组', color: 'default' },
  enrolled: { label: '已入组', color: 'primary' },
  completed: { label: '已完成', color: 'success' },
  withdrawn: { label: '已退出', color: 'error' },
}

interface EnrollmentDetail {
  id: number
  subject_id: number
  subject_name: string
  subject_status: string
  protocol_id: number
  protocol_title: string
  status: string
  enrolled_at: string | null
  create_time: string
}

export default function SubjectPage() {
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterProtocol, setFilterProtocol] = useState<string>('')
  const [page, setPage] = useState(1)
  const [selectedEnrollment, setSelectedEnrollment] = useState<EnrollmentDetail | null>(null)

  // Stats
  const { data: statsRes } = useQuery({
    queryKey: ['subject', 'stats'],
    queryFn: () => subjectApi.stats(),
    refetchInterval: 60_000,
  })

  // Enrollment list with details
  const { data: enrollmentsRes, isLoading } = useQuery({
    queryKey: ['subject', 'enrollments-detail', filterProtocol, filterStatus, page],
    queryFn: () => subjectApi.enrollmentsDetail({
      protocol_id: filterProtocol ? Number(filterProtocol) : undefined,
      status: filterStatus || undefined,
      page,
      page_size: 20,
    }),
    refetchInterval: 30_000,
  })

  // Protocol list for filter
  const { data: protocolsRes } = useQuery({
    queryKey: ['protocol', 'list-for-filter'],
    queryFn: () => protocolApi.list({ page: 1, page_size: 100 }),
  })

  const stats = statsRes?.data as Record<string, number> | undefined
  const enrollments = ((enrollmentsRes?.data as any)?.items ?? []) as EnrollmentDetail[]
  const totalEnrollments = (enrollmentsRes?.data as any)?.total ?? 0
  const protocols = (protocolsRes?.data as any)?.items ?? []

  const statusKeys = ['screening', 'enrolled', 'active', 'completed', 'withdrawn']

  const columns = [
    {
      key: 'subject_name', header: '受试者', render: (e: EnrollmentDetail) => (
        <span className="font-medium text-slate-800">{e.subject_name}</span>
      ),
    },
    { key: 'protocol_title', header: '项目', render: (e: EnrollmentDetail) => <span className="text-sm text-slate-600 truncate max-w-[200px] block">{e.protocol_title}</span> },
    {
      key: 'status', header: '入组状态', render: (e: EnrollmentDetail) => {
        const info = ENROLLMENT_STATUS_LABELS[e.status] || { label: e.status, color: 'default' as const }
        return <Badge variant={info.color}>{info.label}</Badge>
      },
    },
    {
      key: 'subject_status', header: '受试者状态', render: (e: EnrollmentDetail) => {
        const info = STATUS_CONFIG[e.subject_status] || { label: e.subject_status, color: 'default' as const }
        return <Badge variant={info.color}>{info.label}</Badge>
      },
    },
    { key: 'enrolled_at', header: '入组时间', render: (e: EnrollmentDetail) => e.enrolled_at?.split('T')[0] || '-' },
    { key: 'create_time', header: '创建时间', render: (e: EnrollmentDetail) => e.create_time?.split('T')[0] || '-' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">受试者管理</h2>
          <p className="text-sm text-slate-500 mt-1">全局管理所有项目的受试者入组、随访与脱落</p>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-5 gap-3">
        {statusKeys.map(key => {
          const config = STATUS_CONFIG[key]
          const count = stats?.[key] ?? 0
          return (
            <StatCard
              key={key}
              label={config.label}
              value={count}
              icon={config.icon}
              color={key === 'screening' ? 'blue' : key === 'enrolled' ? 'blue' : key === 'active' ? 'amber' : key === 'completed' ? 'green' : 'red'}
            />
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          className="text-sm border border-slate-200 rounded-lg px-3 py-2"
          value={filterProtocol}
          onChange={e => { setFilterProtocol(e.target.value); setPage(1) }}
        >
          <option value="">全部项目</option>
          {protocols.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select
          className="text-sm border border-slate-200 rounded-lg px-3 py-2"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
        >
          <option value="">全部状态</option>
          {Object.entries(ENROLLMENT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400 ml-auto">共 {totalEnrollments} 条记录</span>
      </div>

      {/* DataTable */}
      <div className="bg-white rounded-xl border border-slate-200">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">加载中...</div>
        ) : enrollments.length === 0 ? (
          <div className="p-12"><Empty message="暂无入组记录" /></div>
        ) : (
          <>
            <DataTable
              columns={columns}
              data={enrollments}
              onRowClick={(e: EnrollmentDetail) => setSelectedEnrollment(e)}
            />
            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                第 {page} 页 / 共 {Math.ceil(totalEnrollments / 20)} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 text-sm rounded border border-slate-200 disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(totalEnrollments / 20)}
                  className="px-3 py-1 text-sm rounded border border-slate-200 disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedEnrollment && (
        <Modal title="入组详情" onClose={() => setSelectedEnrollment(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500">受试者</label>
                <p className="text-sm font-medium">{selectedEnrollment.subject_name}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500">项目</label>
                <p className="text-sm font-medium">{selectedEnrollment.protocol_title}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500">入组状态</label>
                <div className="mt-0.5">
                  <Badge variant={ENROLLMENT_STATUS_LABELS[selectedEnrollment.status]?.color || 'default'}>
                    {ENROLLMENT_STATUS_LABELS[selectedEnrollment.status]?.label || selectedEnrollment.status}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">受试者状态</label>
                <div className="mt-0.5">
                  <Badge variant={STATUS_CONFIG[selectedEnrollment.subject_status]?.color || 'default'}>
                    {STATUS_CONFIG[selectedEnrollment.subject_status]?.label || selectedEnrollment.subject_status}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">入组时间</label>
                <p className="text-sm">{selectedEnrollment.enrolled_at?.split('T')[0] || '未入组'}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500">创建时间</label>
                <p className="text-sm">{selectedEnrollment.create_time?.split('T')[0]}</p>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
