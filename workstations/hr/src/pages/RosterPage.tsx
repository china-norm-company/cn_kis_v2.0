import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Button, Modal, Input, Badge, type Column } from '@cn-kis/ui-kit'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'

interface RosterRow {
  id: number
  name: string
  employee_no: string
  department: string
  position: string
  phone: string
  email: string
  employment_status?: string
  status?: string
  [key: string]: unknown
}

interface ImportSummary {
  filename?: string
  sheet?: string
  created: number
  updated: number
  skipped: number
  at: string
}

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default' | 'primary'> = {
  在职: 'success',
  试用期: 'primary',
  停薪留职: 'warning',
  已离职: 'error',
}

const columns: Column<RosterRow>[] = [
  { key: 'name', title: '姓名', width: 100 },
  { key: 'employee_no', title: '工号', width: 120, render: (v, record) => (v ?? record.employee_no) ? String(v ?? record.employee_no) : '-' },
  { key: 'department', title: '部门', width: 120 },
  { key: 'position', title: '岗位', width: 140 },
  { key: 'phone', title: '手机', width: 120, render: (v, record) => (v ?? record.phone) ? String(v ?? record.phone) : '-' },
  { key: 'email', title: '邮箱', width: 180, render: (v, record) => (v ?? record.email) ? String(v ?? record.email) : '-' },
  {
    key: 'status',
    title: '任职状态',
    width: 100,
    render: (_, row) => {
      const label = (row.status as string) || '在职'
      return <Badge variant={statusVariant[label] ?? 'default'}>{label}</Badge>
    },
  },
]

export function RosterPage() {
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [opMessage, setOpMessage] = useState('')
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null)
  const [form, setForm] = useState({
    name: '',
    employee_no: '',
    position: '',
    department: '',
    email: '',
    phone: '',
  })
  const pageSize = 20
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['hr-roster', page, pageSize],
    queryFn: () =>
      api.get<{ items: RosterRow[]; total: number }>('/hr/staff/list', {
        params: { page, page_size: pageSize },
      }),
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/hr/staff/create', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-roster'] })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      queryClient.invalidateQueries({ queryKey: ['hr-archives'] })
      setShowCreate(false)
      setForm({ name: '', employee_no: '', position: '', department: '', email: '', phone: '' })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.post('/hr/staff/sync-feishu', {}),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['hr-roster'] })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      queryClient.invalidateQueries({ queryKey: ['hr-archives'] })
      const d = res?.data || {}
      setOpMessage(`同步完成：部门 ${d.departments ?? 0}，新建 ${d.users_created ?? 0}，更新 ${d.users_updated ?? 0}`)
    },
    onError: (e: any) => {
      setOpMessage(e?.response?.data?.msg || '同步失败，请检查权限或飞书配置')
    },
  })

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const resp = await fetch('/api/v1/hr/staff/import-excel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: form,
      })
      const data = await resp.json()
      if (!resp.ok || data?.code !== 200) {
        const msg = data?.msg || `导入失败(${resp.status})`
        if (resp.status === 403) {
          throw new Error(`无权限导入：需要 hr.staff.manage。${msg}`)
        }
        throw new Error(msg)
      }
      return data
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['hr-roster'] })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      queryClient.invalidateQueries({ queryKey: ['hr-archives'] })
      setShowImport(false)
      setImportFile(null)
      const d = res?.data?.data || res?.data || res || {}
      const summary: ImportSummary = {
        filename: d.filename || importFile?.name || '',
        sheet: d.sheet || '',
        created: Number(d.created || 0),
        updated: Number(d.updated || 0),
        skipped: Number(d.skipped || 0),
        at: new Date().toLocaleString(),
      }
      setLastImport(summary)
      setOpMessage(
        `导入完成（${summary.sheet || '-'}）：新建 ${summary.created}，更新 ${summary.updated}，跳过 ${summary.skipped}`,
      )
    },
    onError: (e: any) => {
      setOpMessage(e?.response?.data?.msg || '导入失败，请检查模板格式或权限')
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const listForbidden = (data as any)?.code === 403

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">员工花名册</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11"
            variant="outline"
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            同步飞书通讯录
          </Button>
          <Button className="min-h-11" variant="outline" onClick={() => setShowImport(true)}>
            批量导入
          </Button>
          <Button className="min-h-11" onClick={() => setShowCreate(true)} icon={<Plus className="h-4 w-4" />}>
            新增人员
          </Button>
        </div>
      </div>
      {opMessage && <div className="text-sm text-slate-600">{opMessage}</div>}
      {lastImport && (
        <Card>
          <div className="grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-5">
            <div><span className="text-slate-500">导入时间：</span>{lastImport.at}</div>
            <div><span className="text-slate-500">文件：</span>{lastImport.filename || '-'}</div>
            <div><span className="text-slate-500">工作表：</span>{lastImport.sheet || '-'}</div>
            <div><span className="text-slate-500">新建：</span>{lastImport.created}</div>
            <div><span className="text-slate-500">更新/跳过：</span>{lastImport.updated}/{lastImport.skipped}</div>
          </div>
        </Card>
      )}
      {listForbidden && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          当前账号缺少读取权限（hr.staff.read），花名册列表无法加载。请在鹿鸣治理台给该账号分配 hr 相关角色。
        </div>
      )}

      <Card>
        <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600 leading-relaxed">
          员工主数据以本系统为准。建议在服务端执行{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">python manage.py sync_feishu_contacts</code>{' '}
          从飞书通讯录同步；不在飞书的人员可通过「新增人员」或后续 Excel 导入补录。
        </div>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[880px]">
            <DataTable<RosterRow>
              columns={columns}
              data={items}
              loading={isLoading}
              emptyText="暂无员工，可先同步飞书或手动新增"
              pagination={{ current: page, pageSize, total, onChange: setPage }}
              onRowClick={(row) => navigate(`/staff/${row.id}`)}
            />
          </div>
        </div>
      </Card>

      <Modal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="批量导入员工（Excel）"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowImport(false)}>
              取消
            </Button>
            <Button
              loading={importMutation.isPending}
              disabled={importMutation.isPending}
              onClick={() => {
                if (!importFile) {
                  setOpMessage('请先选择 .xlsx 文件')
                  return
                }
                importMutation.mutate(importFile)
              }}
            >
              开始导入
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            请选择 Excel 文件（.xlsx）。系统会自动识别「人员信息表」工作表及“姓名/岗位/组别(或中心)/工号”等列。
          </p>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="block w-full rounded border border-slate-300 p-2 text-sm"
          />
          {importFile && (
            <div className="text-xs text-slate-500">
              已选择：{importFile.name}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新增人员"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              loading={createMutation.isPending}
              disabled={!form.name.trim() || !form.position.trim() || !form.department.trim()}
            >
              确认创建
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="姓名"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="必填"
          />
          <Input
            label="工号"
            value={form.employee_no}
            onChange={(e) => setForm({ ...form, employee_no: e.target.value })}
            placeholder="可选"
          />
          <Input
            label="岗位"
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
            placeholder="必填"
          />
          <Input
            label="部门"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            placeholder="必填"
          />
          <Input
            label="邮箱"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="可选"
          />
          <Input
            label="手机"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="可选"
          />
        </div>
      </Modal>
    </div>
  )
}
