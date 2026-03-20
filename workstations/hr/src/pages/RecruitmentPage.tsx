import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Button, Modal, Input, type Column } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

interface Demand {
  id: number
  title: string
  department: string
  headcount: number
  owner: string
  status: string
  target_date: string
  [key: string]: unknown
}

interface Candidate {
  id: number
  name: string
  phone: string
  source: string
  stage: string
  demand_title: string
  [key: string]: unknown
}

const demandColumns: Column<Demand>[] = [
  { key: 'title', title: '需求标题' },
  { key: 'department', title: '部门' },
  { key: 'headcount', title: '人数', width: 80, align: 'center' },
  { key: 'owner', title: '负责人' },
  { key: 'status', title: '状态', width: 90 },
  { key: 'target_date', title: '目标到岗日', width: 130 },
]

const candidateColumns: Column<Candidate>[] = [
  { key: 'name', title: '候选人' },
  { key: 'phone', title: '手机号' },
  { key: 'source', title: '来源' },
  { key: 'stage', title: '阶段' },
  { key: 'demand_title', title: '对应需求' },
]

export function RecruitmentPage() {
  const [showDemand, setShowDemand] = useState(false)
  const [showCandidate, setShowCandidate] = useState(false)
  const [demandForm, setDemandForm] = useState({ title: '', department: '', headcount: '1', owner: '' })
  const [candidateForm, setCandidateForm] = useState({ name: '', phone: '', source: '', stage: 'screening' })
  const queryClient = useQueryClient()

  const { data: demandsData, isLoading: demandsLoading } = useQuery({
    queryKey: ['hr-recruitment-demands'],
    queryFn: () => api.get<{ items: Demand[]; total: number }>('/hr/recruitment/demands/list', {
      params: { page: 1, page_size: 20 },
    }),
  })

  const { data: candidatesData, isLoading: candidatesLoading } = useQuery({
    queryKey: ['hr-recruitment-candidates'],
    queryFn: () => api.get<{ items: Candidate[]; total: number }>('/hr/recruitment/candidates/list', {
      params: { page: 1, page_size: 20 },
    }),
  })

  const createDemand = useMutation({
    mutationFn: () => api.post('/hr/recruitment/demands/create', {
      title: demandForm.title,
      department: demandForm.department,
      headcount: Number(demandForm.headcount || 1),
      owner: demandForm.owner,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-recruitment-demands'] })
      setShowDemand(false)
      setDemandForm({ title: '', department: '', headcount: '1', owner: '' })
    },
  })

  const createCandidate = useMutation({
    mutationFn: () => api.post('/hr/recruitment/candidates/create', candidateForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] })
      setShowCandidate(false)
      setCandidateForm({ name: '', phone: '', source: '', stage: 'screening' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">招聘管理</h1>
        <div className="flex gap-2">
          <PermissionGuard permission="hr.staff.manage">
            <Button variant="outline" onClick={() => setShowDemand(true)}>新增需求</Button>
            <Button onClick={() => setShowCandidate(true)}>新增候选人</Button>
          </PermissionGuard>
        </div>
      </div>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">招聘需求</h2>
          <DataTable<Demand>
            columns={demandColumns}
            data={demandsData?.data?.items ?? []}
            loading={demandsLoading}
            emptyText="暂无招聘需求"
          />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">候选人池</h2>
          <DataTable<Candidate>
            columns={candidateColumns}
            data={candidatesData?.data?.items ?? []}
            loading={candidatesLoading}
            emptyText="暂无候选人"
          />
        </div>
      </Card>

      <Modal
        isOpen={showDemand}
        onClose={() => setShowDemand(false)}
        title="新增招聘需求"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowDemand(false)}>取消</Button>
            <Button loading={createDemand.isPending} onClick={() => createDemand.mutate()}>保存</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="需求标题" value={demandForm.title} onChange={(e) => setDemandForm({ ...demandForm, title: e.target.value })} />
          <Input label="部门" value={demandForm.department} onChange={(e) => setDemandForm({ ...demandForm, department: e.target.value })} />
          <Input label="人数" type="number" value={demandForm.headcount} onChange={(e) => setDemandForm({ ...demandForm, headcount: e.target.value })} />
          <Input label="负责人" value={demandForm.owner} onChange={(e) => setDemandForm({ ...demandForm, owner: e.target.value })} />
        </div>
      </Modal>

      <Modal
        isOpen={showCandidate}
        onClose={() => setShowCandidate(false)}
        title="新增候选人"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowCandidate(false)}>取消</Button>
            <Button loading={createCandidate.isPending} onClick={() => createCandidate.mutate()}>保存</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="姓名" value={candidateForm.name} onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })} />
          <Input label="手机号" value={candidateForm.phone} onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })} />
          <Input label="来源" value={candidateForm.source} onChange={(e) => setCandidateForm({ ...candidateForm, source: e.target.value })} />
          <Input label="阶段" value={candidateForm.stage} onChange={(e) => setCandidateForm({ ...candidateForm, stage: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
