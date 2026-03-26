import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { protocolApi } from '@cn-kis/api-client'
import type { WitnessStaffRecord } from '@cn-kis/api-client'
import { Badge, Button, DataTable, Input, Modal } from '@cn-kis/ui-kit'
import { Search, Plus, Mail, ChevronLeft, RefreshCw, Trash2 } from 'lucide-react'
import {
  clearWitnessStaffListFocusStorage,
  parseFocusWitnessStaffIdFromHash,
  peekWitnessStaffListFocusId,
} from '../utils/witnessStaffListFocusStorage'
import { witnessStaffFocusLog } from '../utils/witnessStaffListFocusDebug'

export default function WitnessStaffPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  /** 跳转前写入（见 WitnessFaceVerifyPage）；作为 Hash/query 解析失败时的兜底 */
  const [sessionBackedFocusId, setSessionBackedFocusId] = useState<number | null>(() => peekWitnessStaffListFocusId())

  const focusStateId = (location.state as { focusWitnessStaffId?: number } | null)?.focusWitnessStaffId
  /** HashRouter 下 ? 在 # 后，useSearchParams 可能拿不到；同时解析 location.search、hash、sessionStorage */
  const focusWitnessStaffIdNum = useMemo(() => {
    const fromSearchParams = searchParams.get('focusWitnessStaffId')
    const fromLocSearch = new URLSearchParams(location.search || '').get('focusWitnessStaffId')
    const fromHash = parseFocusWitnessStaffIdFromHash()
    for (const raw of [fromSearchParams, fromLocSearch, fromHash]) {
      if (raw) {
        const n = parseInt(raw, 10)
        if (!Number.isNaN(n) && n > 0) return n
      }
    }
    if (typeof focusStateId === 'number' && focusStateId > 0) return focusStateId
    if (sessionBackedFocusId != null) return sessionBackedFocusId
    return null
  }, [searchParams, location.search, location.key, focusStateId, sessionBackedFocusId])

  useEffect(() => {
    witnessStaffFocusLog('名单页:解析快照', {
      focusWitnessStaffIdNum,
      searchParams: searchParams.toString(),
      locationSearch: location.search,
      locationKey: location.key,
      hash: typeof window !== 'undefined' ? window.location.hash : '',
      focusStateId,
      sessionBackedFocusId,
    })
  }, [focusWitnessStaffIdNum, searchParams, location.search, location.key, focusStateId, sessionBackedFocusId])

  const [listFocusWitnessStaffId, setListFocusWitnessStaffId] = useState<number | null>(null)

  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<WitnessStaffRecord | null>(null)
  const [verifyNotify, setVerifyNotify] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<WitnessStaffRecord | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [ptName, setPtName] = useState('')
  const [ptEmail, setPtEmail] = useState('')
  /** 勾选行 id（可跨页累积；表头为「本页全选/取消全选」） */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())

  /** 与知情管理 consent-overview 一致：queryFn 直接返回 ApiResponse，用 res.data.items / res.data.page */
  const { data: staffListRes, isLoading, error } = useQuery({
    queryKey: ['witness-staff', applied, page, focusWitnessStaffIdNum ?? '', focusStateId ?? ''],
    queryFn: () =>
      protocolApi.listWitnessStaff({
        search: applied || undefined,
        page,
        page_size: pageSize,
        ...(focusWitnessStaffIdNum != null && { focus_witness_staff_id: focusWitnessStaffIdNum }),
      }),
    /** 邮件核验页跳转来后无需手点刷新；与全局 refetchOnWindowFocus:false 解耦 */
    refetchOnWindowFocus: true,
  })
  const items = staffListRes?.data?.items ?? []
  const total = staffListRes?.data?.total ?? 0

  /** 深链定位：服务端分页后同步页码、高亮行并去掉 query/state（对齐 ConsentManagementPage focusProtocolId） */
  useEffect(() => {
    if (focusWitnessStaffIdNum == null) return
    if (!staffListRes?.data?.items) {
      witnessStaffFocusLog('名单页:effect 等待列表', { focusWitnessStaffIdNum, hasRes: !!staffListRes })
      return
    }
    const payload = staffListRes.data
    const dPage = payload.page
    const itemIds = payload.items.map((x) => x.id)
    const matched = payload.items.some((x) => Number(x.id) === Number(focusWitnessStaffIdNum))
    witnessStaffFocusLog('名单页:effect 应用', {
      focusWitnessStaffIdNum,
      responsePage: dPage,
      statePage: page,
      willSetPage: typeof dPage === 'number' && dPage !== page ? dPage : null,
      itemIds,
      rowMatched: matched,
    })
    if (typeof dPage === 'number' && dPage !== page) {
      setPage(dPage)
    }
    if (matched) {
      setListFocusWitnessStaffId(focusWitnessStaffIdNum)
    } else {
      witnessStaffFocusLog('名单页:高亮失败', {
        reason: '当前页 items 中无匹配 id',
        focusWitnessStaffIdNum,
        itemIds,
      })
    }
    /** HashRouter：`setSearchParams` 有时无法去掉 `#/path?focusWitnessStaffId=` 中的 query，需 navigate 清 search */
    navigate(
      { pathname: location.pathname, search: '' },
      { replace: true, state: focusStateId != null ? {} : undefined },
    )
    clearWitnessStaffListFocusStorage()
    setSessionBackedFocusId(null)
  }, [focusWitnessStaffIdNum, staffListRes, page, navigate, location.pathname, focusStateId])

  useEffect(() => {
    if (listFocusWitnessStaffId == null) return
    const t = window.setTimeout(() => setListFocusWitnessStaffId(null), 8000)
    return () => window.clearTimeout(t)
  }, [listFocusWitnessStaffId])

  useLayoutEffect(() => {
    if (listFocusWitnessStaffId == null) return
    if (isLoading) return
    const id = window.setTimeout(() => {
      const el = document.querySelector('.cnkis-witness-staff-focus')
      witnessStaffFocusLog('名单页:滚动', {
        listFocusWitnessStaffId,
        domFound: !!el,
      })
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(id)
  }, [listFocusWitnessStaffId, isLoading, page])

  const pageIds = useMemo(() => items.map((r) => r.id), [items])
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const somePageSelected = pageIds.some((id) => selectedIds.has(id))

  const createPartTimeMut = useMutation({
    mutationFn: async () => {
      const name = ptName.trim()
      const email = ptEmail.trim()
      if (!name) throw new Error('请填写姓名')
      if (!email) throw new Error('请填写工作邮箱')
      return protocolApi.createWitnessStaffPartTime({ name, email })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['witness-staff'] })
      setCreateOpen(false)
      setPtName('')
      setPtEmail('')
    },
  })

  const syncMut = useMutation({
    mutationFn: () => protocolApi.syncWitnessStaffFromAccounts(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['witness-staff'] })
    },
  })

  const verifyMut = useMutation({
    mutationFn: async () => {
      if (!verifyTarget) throw new Error('no target')
      return protocolApi.sendWitnessStaffProfileVerifyEmail(verifyTarget.id, {
        notify_email: verifyNotify.trim() || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['witness-staff'] })
      setVerifyOpen(false)
      setVerifyTarget(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (staffId: number) => protocolApi.deleteWitnessStaff(staffId),
    onSuccess: (_data, staffId) => {
      qc.invalidateQueries({ queryKey: ['witness-staff'] })
      setDeleteTarget(null)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(staffId)
        return next
      })
    },
  })

  const runSearch = () => {
    setApplied(search.trim())
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-slate-800">双签工作人员名单</h2>
          <p className="text-sm text-slate-500 mt-2">
            包含<strong className="text-slate-700">无治理台账号、由执行台手工录入</strong>的人员，与
            <strong className="text-slate-700"> 鹿鸣·治理台（3008）</strong>关联人员（具备全局角色
            <strong className="text-slate-700"> admin</strong> / <strong className="text-slate-700">crc</strong> /
            <strong className="text-slate-700">crc_supervisor</strong>
            ）。治理台侧请维护账号与角色后「同步」；无账号者请点「添加」在弹窗内填写姓名与工作邮箱。「核验」邮件中的人脸环节由本人填写身份证、手机号等实名信息并回写档案。
          </p>
        </div>
        <Link
          to="/consent"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 shrink-0 whitespace-nowrap"
        >
          <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden />
          返回知情管理
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] max-w-xl">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">搜索</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="搜索姓名、邮箱、身份证…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-10 whitespace-nowrap gap-1.5"
                icon={<Search className="w-4 h-4" aria-hidden />}
                onClick={runSearch}
              >
                查询
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-10 whitespace-nowrap gap-1.5"
                icon={<RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} aria-hidden />}
                disabled={syncMut.isPending}
                onClick={() => syncMut.mutate()}
              >
                从治理台同步
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="min-h-10 whitespace-nowrap gap-1.5"
                icon={<Plus className="w-4 h-4" aria-hidden />}
                onClick={() => {
                  setPtName('')
                  setPtEmail('')
                  setCreateOpen(true)
                }}
              >
                添加
              </Button>
            </div>
          </div>
          {error ? <p className="text-sm text-rose-600">加载失败，请确认已登录且具备协议权限</p> : null}
        </div>

        <DataTable<WitnessStaffRecord>
          rowKey="id"
          loading={isLoading}
          emptyText="暂无数据：可点「添加」录入，或在治理台分配角色后「从治理台同步」"
          data={items}
          rowClassName={(r) =>
            listFocusWitnessStaffId != null && Number(r.id) === Number(listFocusWitnessStaffId)
              ? 'cnkis-witness-staff-focus !bg-amber-50/95 shadow-[inset_0_0_0_2px_rgba(245,158,11,0.55)] ring-1 ring-amber-200/90'
              : undefined
          }
          columns={[
            {
              key: 'sel',
              title: '',
              width: 44,
              align: 'center',
              headerClassName: 'text-center',
              headerRender: (
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    aria-label="全选本页"
                    disabled={items.length === 0 || isLoading}
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected && !allPageSelected
                    }}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev)
                        if (allPageSelected) {
                          pageIds.forEach((id) => next.delete(id))
                        } else {
                          pageIds.forEach((id) => next.add(id))
                        }
                        return next
                      })
                    }}
                  />
                </div>
              ),
              render: (_, r) => (
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    aria-label={`选择 ${r.name || r.id}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(r.id)) next.delete(r.id)
                        else next.add(r.id)
                        return next
                      })
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'idx',
              title: '序号',
              width: 56,
              align: 'center',
              render: (_, __, i) => (page - 1) * pageSize + i + 1,
            },
            { key: 'name', title: '姓名', width: 100, render: (_, r) => r.name },
            {
              key: 'roles',
              title: '角色',
              width: 120,
              render: (_, r) => (r.role_labels?.length ? r.role_labels.join('、') : '—'),
            },
            {
              key: 'gender',
              title: '性别',
              width: 72,
              render: (_, r) => (r.gender && String(r.gender).trim() ? String(r.gender).trim() : '—'),
            },
            { key: 'id_card_no', title: '身份证号', width: 160, render: (_, r) => r.id_card_no || '—' },
            {
              key: 'email',
              title: '邮箱',
              width: 200,
              render: (_, r) => <span className="text-sm break-all">{r.email || '—'}</span>,
            },
            {
              key: 'face_order_id',
              title: '人脸识别订单号',
              width: 140,
              render: (_, r) => r.face_order_id || '—',
            },
            {
              key: 'face_verified_at',
              title: '人脸识别时间',
              width: 160,
              render: (_, r) => (r.face_verified_at ? r.face_verified_at.slice(0, 19).replace('T', ' ') : '—'),
            },
            {
              key: 'signature_file',
              title: '签名文件',
              width: 120,
              render: (_, r) =>
                r.signature_file ? (
                  <a
                    href={`/media/${r.signature_file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block"
                  >
                    <img
                      src={`/media/${r.signature_file}`}
                      alt="签名"
                      className="h-10 max-w-[100px] object-contain border border-slate-100 rounded bg-white"
                    />
                  </a>
                ) : (
                  '—'
                ),
            },
            {
              key: 'signature_at',
              title: '签名时间',
              width: 160,
              render: (_, r) => (r.signature_at ? r.signature_at.slice(0, 19).replace('T', ' ') : '—'),
            },
            {
              key: 'update_time',
              title: '最后更新时间',
              width: 160,
              render: (_, r) => (r.update_time ? r.update_time.slice(0, 19).replace('T', ' ') : '—'),
            },
            {
              key: 'id_ver',
              title: '核验',
              width: 88,
              render: (_, r) =>
                r.identity_verified ? <Badge variant="success">已核验</Badge> : <Badge variant="default">未核验</Badge>,
            },
            {
              key: 'op',
              title: '操作',
              width: 168,
              render: (_, r) => (
                <div className="flex flex-row flex-nowrap items-center gap-2 whitespace-nowrap">
                  <button
                    type="button"
                    className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-0.5 font-medium shrink-0"
                    onClick={() => {
                      setVerifyTarget(r)
                      setVerifyNotify(r.email || '')
                      setVerifyOpen(true)
                    }}
                  >
                    <Mail className="w-3 h-3 shrink-0" />
                    {r.identity_verified ? '认证重签' : '认证签名'}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-600 hover:underline inline-flex items-center gap-0.5 font-medium shrink-0"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="w-3 h-3 shrink-0" />
                    删除
                  </button>
                </div>
              ),
            },
          ]}
        />
        <div className="px-4 py-3 border-t border-slate-100 text-sm text-slate-500">共 {total} 条</div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => !createPartTimeMut.isPending && setCreateOpen(false)}
        title="添加"
        size="md"
      >
        <div className="space-y-4 mt-2 max-w-lg">
          <div className="grid gap-3 sm:grid-cols-1">
            <label className="block text-sm">
              <span className="text-slate-600">姓名</span>
              <Input
                value={ptName}
                onChange={(e) => setPtName(e.target.value)}
                className="mt-1"
                placeholder="与身份证件一致"
                autoComplete="name"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">工作邮箱</span>
              <Input
                value={ptEmail}
                onChange={(e) => setPtEmail(e.target.value)}
                className="mt-1"
                placeholder="用于接收核验邮件"
                inputMode="email"
                autoComplete="email"
              />
            </label>
          </div>
          {createPartTimeMut.isError ? (
            <p className="text-sm text-rose-600">{(createPartTimeMut.error as Error)?.message || '添加失败'}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createPartTimeMut.isPending}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={createPartTimeMut.isPending || !ptName.trim() || !ptEmail.trim()}
              onClick={() => createPartTimeMut.mutate()}
            >
              {createPartTimeMut.isPending ? '提交中…' : '保存'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleteMut.isPending && setDeleteTarget(null)}
        title="删除双签档案"
        size="md"
      >
        <div className="space-y-3 mt-2">
          <p className="text-sm text-slate-600">
            确认删除 <strong>{deleteTarget?.name}</strong> 的双签工作人员档案？此为<strong>软删除</strong>
            ，之后仍可通过「从治理台同步」或「添加」重新建档。
          </p>
          {deleteMut.isError ? (
            <p className="text-sm text-rose-600">{(deleteMut.error as Error)?.message || '删除失败'}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>
              取消
            </Button>
            <Button
              variant="primary"
              className="bg-rose-600 hover:bg-rose-700 border-transparent"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) deleteMut.mutate(deleteTarget.id)
              }}
            >
              {deleteMut.isPending ? '删除中…' : '确认删除'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={verifyOpen} onClose={() => !verifyMut.isPending && setVerifyOpen(false)} title="发送档案核验邮件" size="md">
        <div className="space-y-3 mt-2">
          <p className="text-sm text-slate-600">
            将向工作人员 <strong>{verifyTarget?.name}</strong> 发送邮件，对方打开链接后依次完成<strong>人脸核验</strong>与
            <strong>手写签名</strong>，签名图片与时间将同步到本列表。（联调环境可开启 <code className="text-xs bg-slate-100 px-1 rounded">WITNESS_FACE_DEV_BYPASS</code>{' '}
            跳过真实人脸）
          </p>
          <label className="block text-sm">
            <span className="text-slate-600">收件邮箱</span>
            <Input
              value={verifyNotify}
              onChange={(e) => setVerifyNotify(e.target.value)}
              className="mt-1"
              placeholder="默认同档案工作邮箱"
            />
          </label>
          {verifyMut.isError ? <p className="text-sm text-rose-600">{(verifyMut.error as Error)?.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVerifyOpen(false)} disabled={verifyMut.isPending}>
              取消
            </Button>
            <Button variant="primary" disabled={verifyMut.isPending} onClick={() => verifyMut.mutate()}>
              {verifyMut.isPending ? '发送中…' : '发送邮件'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
