import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { labPersonnelApi } from '@cn-kis/api-client'
import type { StaffDetail, SlotItem, WorkTimeLogItem } from '@cn-kis/api-client'
import {
  ArrowLeft, User, ShieldCheck, FlaskConical, Monitor,
  FolderKanban, GraduationCap, BarChart3, CalendarDays, Clock,
} from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

type TabKey = 'basic' | 'certificates' | 'methods' | 'equipment' | 'projects' | 'training' | 'assessment' | 'schedule'

const TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: 'basic', label: '基本信息', icon: User },
  { key: 'certificates', label: '资质证书', icon: ShieldCheck },
  { key: 'methods', label: '方法资质', icon: FlaskConical },
  { key: 'equipment', label: '设备授权', icon: Monitor },
  { key: 'projects', label: '项目经验', icon: FolderKanban },
  { key: 'training', label: '培训记录', icon: GraduationCap },
  { key: 'assessment', label: '能力评估', icon: BarChart3 },
  { key: 'schedule', label: '排班/工时', icon: CalendarDays },
]

const levelBadge = (level: string, display: string) => {
  const cls: Record<string, string> = {
    L1: 'bg-slate-100 text-slate-600',
    L2: 'bg-blue-50 text-blue-600',
    L3: 'bg-green-50 text-green-600',
    L4: 'bg-violet-50 text-violet-600',
    L5: 'bg-amber-50 text-amber-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[level] || 'bg-slate-100 text-slate-600'}`}>
      {display}
    </span>
  )
}

const gcpBadge = (status: string) => {
  if (status === 'valid') return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-600">GCP有效</span>
  if (status === 'expiring') return <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-600">GCP即将过期</span>
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">GCP已过期</span>
}

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('basic')
  const staffId = Number(id)

  const { data: detailData } = useQuery({
    queryKey: ['lab-personnel', 'staff-detail', staffId],
    queryFn: () => labPersonnelApi.getStaffDetail(staffId),
    enabled: !!staffId,
  })
  const detail = (detailData as any)?.data as StaffDetail | undefined

  const { data: slotsData } = useQuery({
    queryKey: ['lab-personnel', 'staff-slots', staffId],
    queryFn: () => labPersonnelApi.getSlots({ staff_id: staffId }),
    enabled: activeTab === 'schedule' && !!staffId,
  })
  const staffSlots = ((slotsData as any)?.data as { items: SlotItem[] } | undefined)?.items ?? []

  const { data: worktimeData } = useQuery({
    queryKey: ['lab-personnel', 'staff-worktime', staffId],
    queryFn: () => labPersonnelApi.getWorktimeLogs({ staff_id: staffId }),
    enabled: activeTab === 'schedule' && !!staffId,
  })
  const worktimeLogs = ((worktimeData as any)?.data as { items: WorkTimeLogItem[] } | undefined)?.items ?? []

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <p>加载中...</p>
      </div>
    )
  }

  const radarData = detail.method_qualifications?.map(mq => {
    const levelMap: Record<string, number> = { learning: 25, probation: 50, independent: 75, mentor: 100 }
    return {
      method: mq.method_name.length > 6 ? mq.method_name.slice(0, 6) + '…' : mq.method_name,
      等级: levelMap[mq.level] ?? 0,
      执行次数: Math.min(mq.total_executions, 100),
    }
  }) ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/staff')} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-800">{detail.staff_name}</h2>
            {levelBadge(detail.competency_level, detail.competency_level_display)}
            {gcpBadge(detail.gcp_status)}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {detail.employee_no} · {detail.department} · {detail.position}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            data-tab={tab.key}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'basic' && (
        <div className="grid grid-cols-2 gap-4" data-section="basic">
          {[
            { label: '实验室角色', value: detail.lab_role_display },
            { label: '辅助角色', value: detail.lab_role_secondary || '无' },
            { label: '用工类型', value: detail.employment_type_display },
            { label: '能力等级', value: detail.competency_level_display },
            { label: '每日工时上限', value: `${detail.max_daily_hours}h` },
            { label: '每周工时上限', value: `${detail.max_weekly_hours}h` },
            { label: '可排班日', value: (detail.available_weekdays || []).map(d => `周${d}`).join('、') || '周一至周五' },
            { label: '是否在岗', value: detail.is_active ? '在岗' : '离岗' },
            { label: '联系电话', value: detail.phone || '未登记' },
            { label: '邮箱', value: detail.email || '未登记' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="text-sm font-medium text-slate-800 mt-1">{item.value}</p>
            </div>
          ))}
          {detail.notes && (
            <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">备注</p>
              <p className="text-sm text-slate-700 mt-1">{detail.notes}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'certificates' && (
        <div className="space-y-3" data-section="certificates">
          {detail.certificates?.length ? detail.certificates.map(cert => (
            <div key={cert.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-800">{cert.cert_name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {cert.cert_type_display} · {cert.cert_number || '无编号'} · {cert.issuing_authority || '未知机构'}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  cert.status === 'valid' ? 'bg-green-50 text-green-600'
                    : cert.status.startsWith('expiring') ? 'bg-yellow-50 text-yellow-600'
                    : 'bg-red-50 text-red-600'
                }`}>
                  {cert.status_display}
                </span>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-500">
                {cert.issue_date && <span>签发: {cert.issue_date}</span>}
                {cert.expiry_date && <span>到期: {cert.expiry_date}</span>}
                {cert.is_locked && <span className="text-red-500 font-medium">已锁定</span>}
              </div>
            </div>
          )) : (
            <div className="text-center text-slate-400 py-8">暂无证书记录</div>
          )}
        </div>
      )}

      {activeTab === 'methods' && (
        <div className="space-y-3" data-section="methods">
          {detail.method_qualifications?.length ? detail.method_qualifications.map(mq => (
            <div key={mq.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-800">{mq.method_name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{mq.method_code}</p>
                </div>
                {levelBadge(mq.level, mq.level_display)}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-500">
                <span>累计执行: {mq.total_executions} 次</span>
                {mq.last_execution_date && <span>上次执行: {mq.last_execution_date}</span>}
                {mq.qualified_date && <span>认定日期: {mq.qualified_date}</span>}
              </div>
            </div>
          )) : (
            <div className="text-center text-slate-400 py-8">暂无方法资质</div>
          )}
        </div>
      )}

      {activeTab === 'equipment' && (
        <div className="space-y-3" data-section="equipment">
          <div className="text-center text-slate-400 py-8">
            <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>设备授权数据来自器衡·设备台</p>
            <p className="text-xs mt-1">后续版本将展示关联的设备操作授权列表</p>
          </div>
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="space-y-3" data-section="projects">
          <div className="text-center text-slate-400 py-8">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>项目经验数据来自人事台 ProjectAssignment</p>
            <p className="text-xs mt-1">后续版本将展示历史项目参与记录</p>
          </div>
        </div>
      )}

      {activeTab === 'training' && (
        <div className="space-y-3" data-section="training">
          <div className="text-center text-slate-400 py-8">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>培训记录数据来自时雨·人事台 Training 模块</p>
            <p className="text-xs mt-1">后续版本将展示完整培训历史和关联资质升级</p>
          </div>
        </div>
      )}

      {activeTab === 'assessment' && (
        <div className="space-y-4" data-section="assessment">
          {radarData.length > 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-medium text-slate-700 mb-3">方法资质能力雷达图</h4>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="method" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar name="资质等级" dataKey="等级" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-8">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无能力评估数据</p>
            </div>
          )}
          {detail.risk_alerts && detail.risk_alerts.filter(r => r.title.includes('晋级')).length > 0 && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h4 className="text-sm font-medium text-blue-700 mb-2">晋级建议</h4>
              {detail.risk_alerts.filter(r => r.title.includes('晋级')).map(r => (
                <div key={r.id} className="text-sm text-blue-600 mb-1">{r.title}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-4" data-section="schedule">
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">
              <CalendarDays className="w-4 h-4 inline mr-1" />排班记录 ({staffSlots.length})
            </h4>
            {staffSlots.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-2 font-medium text-slate-600">日期</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">时段</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">项目</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">工时</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffSlots.slice(0, 20).map(slot => (
                      <tr key={slot.id} className="border-b border-slate-100">
                        <td className="px-4 py-2 text-slate-600">{slot.shift_date}</td>
                        <td className="px-4 py-2 text-slate-600">{slot.start_time?.slice(0, 5)}-{slot.end_time?.slice(0, 5)}</td>
                        <td className="px-4 py-2 text-slate-600">{slot.project_name || '-'}</td>
                        <td className="px-4 py-2 text-slate-600">{slot.planned_hours}h</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            slot.confirm_status === 'confirmed' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                          }`}>
                            {slot.confirm_status_display}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-slate-400 py-4 text-sm">暂无排班记录</div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">
              <Clock className="w-4 h-4 inline mr-1" />工时记录 ({worktimeLogs.length})
            </h4>
            {worktimeLogs.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-2 font-medium text-slate-600">日期</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">时段</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">工时</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">来源</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-600">描述</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worktimeLogs.slice(0, 20).map(log => (
                      <tr key={log.id} className="border-b border-slate-100">
                        <td className="px-4 py-2 text-slate-600">{log.work_date}</td>
                        <td className="px-4 py-2 text-slate-600">{log.start_time}{log.end_time ? `-${log.end_time}` : ''}</td>
                        <td className="px-4 py-2 font-medium">{log.actual_hours}h</td>
                        <td className="px-4 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-slate-100">{log.source_display}</span></td>
                        <td className="px-4 py-2 text-slate-500 text-xs">{log.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-slate-400 py-4 text-sm">暂无工时记录</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
