import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Button, Modal, Input, type Column } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

interface ActivityItem {
  id: number
  title: string
  category: string
  planned_date: string
  owner: string
  status: string
  participant_count: number
  [key: string]: unknown
}

interface PulseItem {
  id: number
  survey_month: string
  score: number
  risk_level: string
  actions: string
  [key: string]: unknown
}

const activityColumns: Column<ActivityItem>[] = [
  { key: 'title', title: '活动主题' },
  { key: 'category', title: '类型' },
  { key: 'planned_date', title: '日期' },
  { key: 'owner', title: '负责人' },
  { key: 'status', title: '状态' },
  { key: 'participant_count', title: '参与人数', width: 100, align: 'center' },
]

const pulseColumns: Column<PulseItem>[] = [
  { key: 'survey_month', title: '月份' },
  { key: 'score', title: '敬业度' },
  { key: 'risk_level', title: '风险等级' },
  { key: 'actions', title: '跟进行动' },
]

export function CulturePage() {
  const [showActivity, setShowActivity] = useState(false)
  const [showPulse, setShowPulse] = useState(false)
  const [activityForm, setActivityForm] = useState({
    title: '', category: '文化活动', planned_date: '', owner: '', participant_count: '0',
  })
  const [pulseForm, setPulseForm] = useState({
    survey_month: '', score: '', risk_level: 'low', actions: '',
  })
  const queryClient = useQueryClient()

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['hr-culture-activities'],
    queryFn: () => api.get<{ items: ActivityItem[]; total: number }>('/hr/culture/activities/list', {
      params: { page: 1, page_size: 20 },
    }),
  })
  const { data: pulseData, isLoading: pulseLoading } = useQuery({
    queryKey: ['hr-culture-pulse'],
    queryFn: () => api.get<{ items: PulseItem[]; total: number }>('/hr/culture/pulse/list', {
      params: { page: 1, page_size: 20 },
    }),
  })

  const createActivity = useMutation({
    mutationFn: () => api.post('/hr/culture/activities/create', {
      title: activityForm.title,
      category: activityForm.category,
      planned_date: activityForm.planned_date || null,
      owner: activityForm.owner,
      participant_count: Number(activityForm.participant_count || 0),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-culture-activities'] })
      setShowActivity(false)
      setActivityForm({ title: '', category: '文化活动', planned_date: '', owner: '', participant_count: '0' })
    },
  })

  const createPulse = useMutation({
    mutationFn: () => api.post('/hr/culture/pulse/create', {
      survey_month: pulseForm.survey_month,
      score: Number(pulseForm.score || 0),
      risk_level: pulseForm.risk_level,
      actions: pulseForm.actions,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-culture-pulse'] })
      setShowPulse(false)
      setPulseForm({ survey_month: '', score: '', risk_level: 'low', actions: '' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">企业文化</h1>
        <PermissionGuard permission="hr.staff.manage">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowActivity(true)}>新增文化活动</Button>
            <Button onClick={() => setShowPulse(true)}>新增敬业度脉冲</Button>
          </div>
        </PermissionGuard>
      </div>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">文化活动</h2>
          <DataTable<ActivityItem> columns={activityColumns} data={activityData?.data?.items ?? []} loading={activityLoading} emptyText="暂无活动记录" />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">敬业度脉冲</h2>
          <DataTable<PulseItem> columns={pulseColumns} data={pulseData?.data?.items ?? []} loading={pulseLoading} emptyText="暂无脉冲记录" />
        </div>
      </Card>

      <Modal
        isOpen={showActivity}
        onClose={() => setShowActivity(false)}
        title="新增文化活动"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowActivity(false)}>取消</Button>
            <Button loading={createActivity.isPending} onClick={() => createActivity.mutate()}>保存</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="活动主题" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} />
          <Input label="类型" value={activityForm.category} onChange={(e) => setActivityForm({ ...activityForm, category: e.target.value })} />
          <Input label="日期" type="date" value={activityForm.planned_date} onChange={(e) => setActivityForm({ ...activityForm, planned_date: e.target.value })} />
          <Input label="负责人" value={activityForm.owner} onChange={(e) => setActivityForm({ ...activityForm, owner: e.target.value })} />
          <Input label="参与人数" type="number" value={activityForm.participant_count} onChange={(e) => setActivityForm({ ...activityForm, participant_count: e.target.value })} />
        </div>
      </Modal>

      <Modal
        isOpen={showPulse}
        onClose={() => setShowPulse(false)}
        title="新增敬业度脉冲"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowPulse(false)}>取消</Button>
            <Button loading={createPulse.isPending} onClick={() => createPulse.mutate()}>保存</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="调查月份(YYYY-MM)" value={pulseForm.survey_month} onChange={(e) => setPulseForm({ ...pulseForm, survey_month: e.target.value })} />
          <Input label="敬业度得分" type="number" value={pulseForm.score} onChange={(e) => setPulseForm({ ...pulseForm, score: e.target.value })} />
          <Input label="风险等级" value={pulseForm.risk_level} onChange={(e) => setPulseForm({ ...pulseForm, risk_level: e.target.value })} />
          <Input label="跟进行动" value={pulseForm.actions} onChange={(e) => setPulseForm({ ...pulseForm, actions: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
