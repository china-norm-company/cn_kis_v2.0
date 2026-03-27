import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { protocolApi } from '@cn-kis/api-client'
import type { WitnessStaffAuthSignatureStatus, WitnessStaffRecord } from '@cn-kis/api-client'
import { Badge, Button, DataTable, Input, Modal } from '@cn-kis/ui-kit'
import { Search, Plus, Mail, ChevronLeft, RefreshCw, Trash2 } from 'lucide-react'
import {
  clearWitnessStaffListFocusStorage,
  parseFocusWitnessStaffIdFromHash,
  peekWitnessStaffListFocusId,
} from '../utils/witnessStaffListFocusStorage'
import { witnessStaffFocusLog } from '../utils/witnessStaffListFocusDebug'
import { WitnessStaffBatchImportModal } from '../components/WitnessStaffBatchImportModal'
import { WitnessStaffSignatureCell } from '../components/WitnessStaffSignatureCell'
import { AuthSignatureFilterSelect, type WitnessStaffAuthSigFilter } from '../components/AuthSignatureFilterSelect'
import { maskIdCardNoForDisplay } from '../utils/idCardMask'

export type { WitnessStaffAuthSigFilter }

/** 仅根据行字段推断（与 list 接口一致）；不盲信 auth_signature_status，避免 API 仍为 pending_reauth 时无法显示「已完成」 */
function inferAuthSignatureStatusFromRow(r: WitnessStaffRecord): WitnessStaffAuthSignatureStatus {
  const hasExecutionSignature =
    !!(r.signature_file || '').trim() && !!r.signature_at && !Number.isNaN(Date.parse(r.signature_at))
  if (r.identity_reverify_pending && r.identity_verified) {
    const fid = (r.face_order_id || '').trim()
    const legacyFace = /^FACE-[0-9a-f]{16}$/i.test(fid)
    const effectiveFace =
      r.identity_verified && !!r.face_verified_at && !!fid && !legacyFace
    const sigAt = r.signature_at ? Date.parse(r.signature_at) : NaN
    const ut = r.update_time ? Date.parse(r.update_time) : NaN
    if (
      effectiveFace &&
      hasExecutionSignature &&
      !Number.isNaN(sigAt) &&
      !Number.isNaN(ut) &&
      sigAt >= ut
    ) {
      return 'completed'
    }
    return 'pending_reauth'
  }
  if (r.identity_verified) {
    if (hasExecutionSignature) return 'completed'
    return 'pending_sign'
  }
  const hasProgress =
    !!r.face_verified_at || !!(r.face_order_id || '').trim() || !!(r.signature_file || '').trim()
  if (!hasProgress) return 'pending_mail'
  return 'pending_sign'
}

function resolveAuthSignatureStatus(r: WitnessStaffRecord): WitnessStaffAuthSignatureStatus {
  const api = r.auth_signature_status
  const inferred = inferAuthSignatureStatusFromRow(r)
  if (api === 'pending_reauth') {
    return inferred === 'completed' ? 'completed' : 'pending_reauth'
  }
  // 纠偏：仅人脸通过、尚未登记手写签名时，接口不应展示「已完成」
  if (api === 'completed' && inferred === 'pending_sign') return 'pending_sign'
  if (api && api !== 'pending_reauth') return api
  return inferred
}

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

  /**
   * 深链定位用 focus_witness_staff_id 仅应请求一次；若一直携带，后端会固定返回「该行所在页」（常为 1），
   * 与用户在分页器上选择的 page 冲突，表现为点「下一页」被 effect 里 setPage(dPage) 拉回第 1 页，需点两次才翻页。
   */
  const [focusDeepLinkConsumed, setFocusDeepLinkConsumed] = useState(() => focusWitnessStaffIdNum == null)

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
  /** 分页切换后将列表块滚入视口顶部（避免长页仅滚了 window 后误以为仍停留在「第一页」） */
  const witnessStaffListTopRef = useRef<HTMLDivElement>(null)
  const skipPageScrollIntoViewOnMountRef = useRef(true)

  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [authSignatureFilter, setAuthSignatureFilter] = useState<WitnessStaffAuthSigFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpPageInput, setJumpPageInput] = useState('')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<WitnessStaffRecord | null>(null)
  const [verifyNotify, setVerifyNotify] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<WitnessStaffRecord | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [batchImportOpen, setBatchImportOpen] = useState(false)
  const [ptName, setPtName] = useState('')
  const [ptEmail, setPtEmail] = useState('')
  /** 勾选行 id（可跨页累积；表头为「本页全选/取消全选」） */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())

  /** 与知情管理 consent-overview 一致：queryFn 直接返回 ApiResponse，用 res.data.items / res.data.page */
  const { data: staffListRes, isLoading, error } = useQuery({
    queryKey: [
      'witness-staff',
      applied,
      authSignatureFilter,
      page,
      pageSize,
      focusWitnessStaffIdNum ?? '',
      focusStateId ?? '',
      focusDeepLinkConsumed,
    ],
    queryFn: () =>
      protocolApi.listWitnessStaff({
        search: applied || undefined,
        page,
        page_size: pageSize,
        ...(authSignatureFilter !== 'all' && { auth_signature: authSignatureFilter }),
        ...(focusWitnessStaffIdNum != null &&
          !focusDeepLinkConsumed && { focus_witness_staff_id: focusWitnessStaffIdNum }),
      }),
    /** 邮件核验页跳转来后无需手点刷新；与全局 refetchOnWindowFocus:false 解耦 */
    refetchOnWindowFocus: true,
    /** 深链进入后避免沿用缓存中的旧 auth_signature_status */
    refetchOnMount: 'always',
    staleTime: 0,
  })
  const items = staffListRes?.data?.items ?? []
  const total = staffListRes?.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  /**
   * 用户主动翻页/筛选时必须先放弃邮件深链：否则请求仍带 focus_witness_staff_id，
   * 后端会固定返回「该行所在页」，effect 里 setPage(dPage) 会把页码拉回第 1 页（与「下一页」冲突）。
   */
  const abandonDeepLinkFocus = useCallback(() => {
    setFocusDeepLinkConsumed(true)
    setListFocusWitnessStaffId(null)
    clearWitnessStaffListFocusStorage()
    setSessionBackedFocusId(null)
    // 无深链时切勿 navigate：Router 默认会滚动到文档顶部，长页底部点「下一页」会像回到第一页。
    const needClearRouter =
      focusWitnessStaffIdNum != null || (typeof focusStateId === 'number' && focusStateId > 0)
    if (needClearRouter) {
      navigate(
        { pathname: location.pathname, search: '' },
        { replace: true, state: {}, preventScrollReset: true },
      )
    }
  }, [navigate, location.pathname, focusWitnessStaffIdNum, focusStateId])

  const handleJumpPage = useCallback(() => {
    const n = parseInt(jumpPageInput, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      abandonDeepLinkFocus()
      setPage(n)
      setJumpPageInput('')
    }
  }, [jumpPageInput, totalPages, abandonDeepLinkFocus])

  useEffect(() => {
    setPage(1)
  }, [authSignatureFilter])

  /** 删除或搜索后当前页可能超出总页数，回退到最后一页或第 1 页 */
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  /** 深链定位：服务端分页后同步页码、高亮行并去掉 query/state（对齐 ConsentManagementPage focusProtocolId）。
   *  用 useLayoutEffect 在绘制前完成消费，避免用户先点到「下一页」时仍带 focus 参数被服务端拉回第 1 页。 */
  useLayoutEffect(() => {
    if (focusWitnessStaffIdNum == null) return
    if (focusDeepLinkConsumed) return
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
      willSetPage: typeof dPage === 'number' ? dPage : null,
      itemIds,
      rowMatched: matched,
    })
    if (typeof dPage === 'number') {
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
      { replace: true, state: focusStateId != null ? {} : undefined, preventScrollReset: true },
    )
    clearWitnessStaffListFocusStorage()
    setSessionBackedFocusId(null)
    setFocusDeepLinkConsumed(true)
  }, [focusWitnessStaffIdNum, focusDeepLinkConsumed, staffListRes, navigate, location.pathname, focusStateId])

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

  /** 页码变化后把列表区域对齐到视口上方，便于直接看到「当前页」内容顶部 */
  useLayoutEffect(() => {
    if (skipPageScrollIntoViewOnMountRef.current) {
      skipPageScrollIntoViewOnMountRef.current = false
      return
    }
    witnessStaffListTopRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [page])

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
    abandonDeepLinkFocus()
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
            <strong className="text-slate-700"> QA质量管理</strong>
            ）。治理台侧请维护账号与角色后「同步」；无账号者请点「添加」在弹窗内填写姓名与工作邮箱。「认证签名」邮件中的人脸环节由本人填写身份证、手机号等实名信息并回写档案。
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

      <div
        ref={witnessStaffListTopRef}
        className="bg-white rounded-xl border border-slate-200 overflow-hidden scroll-mt-4"
      >
        <div className="p-5 border-b border-slate-100 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
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
            <div className="shrink-0 w-[13.5rem]">
              <AuthSignatureFilterSelect
                value={authSignatureFilter}
                onChange={(v) => {
                  abandonDeepLinkFocus()
                  setAuthSignatureFilter(v)
                }}
              />
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
                variant="secondary"
                size="md"
                className="min-h-10 whitespace-nowrap gap-1.5"
                onClick={() => setBatchImportOpen(true)}
              >
                批量导入
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
              key: 'id_card_no',
              title: '身份证号',
              width: 168,
              render: (_, r) => {
                const masked = maskIdCardNoForDisplay(r.id_card_no)
                return masked ? (
                  <span className="font-mono text-sm tabular-nums tracking-tight" title="已脱敏展示">
                    {masked}
                  </span>
                ) : (
                  '—'
                )
              },
            },
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
              width: 128,
              render: (_, r) => (
                <WitnessStaffSignatureCell staffId={Number(r.id)} hasSignatureFile={!!(r.signature_file || '').trim()} />
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
              title: '认证签名',
              width: 112,
              render: (_, r) => {
                const s = resolveAuthSignatureStatus(r)
                if (s === 'completed') {
                  return <Badge variant="success">已完成</Badge>
                }
                if (s === 'pending_reauth') {
                  return <Badge variant="info">待重新认证</Badge>
                }
                if (s === 'pending_mail') {
                  return <Badge variant="default">待发送邮件</Badge>
                }
                return <Badge variant="warning">待认证签名</Badge>
              },
            },
            {
              key: 'op',
              title: '操作',
              width: 168,
              render: (_, r) => {
                const label = !r.identity_verified ? '认证签名' : '重新认证'
                return (
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
                    {label}
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
                );
              },
            },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-white px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-slate-500">共 {total} 条</span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="text-sm text-slate-500">每页</span>
            <select
              value={pageSize}
              onChange={(e) => {
                abandonDeepLinkFocus()
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500/30"
              aria-label="每页条数"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm text-slate-500">条</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => {
                abandonDeepLinkFocus()
                setPage((p) => Math.max(1, p - 1))
              }}
              disabled={page <= 1 || totalPages <= 1}
              className="px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
            >
              上一页
            </button>
            <span className="text-sm text-slate-600">
              第 {page} / {totalPages} 页
            </span>
            <button
              type="button"
              onClick={() => {
                abandonDeepLinkFocus()
                setPage((p) => Math.min(totalPages, p + 1))
              }}
              disabled={page >= totalPages || totalPages <= 1}
              className="px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
            >
              下一页
            </button>
            <span className="text-sm text-slate-500">跳转至</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJumpPage()}
              className="w-14 px-2 py-1 text-sm border border-slate-200 rounded text-center"
              placeholder="页"
              disabled={totalPages <= 1}
              aria-label="跳转页码"
            />
            <button
              type="button"
              onClick={handleJumpPage}
              disabled={totalPages <= 1}
              className="px-2 py-1 text-sm rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              跳转
            </button>
          </div>
        </div>
      </div>

      <WitnessStaffBatchImportModal
        open={batchImportOpen}
        onClose={() => setBatchImportOpen(false)}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ['witness-staff'] })
          setPage(1)
        }}
      />

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
                placeholder="用于接收认证签名邮件"
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
