import { useCallback, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import './index.scss'

const subjectApi = buildSubjectEndpoints(taroApiClient)

interface ConsentItemRow {
  id: number
  icf_version_id: number
  protocol_id?: number | null
  protocol_code?: string
  protocol_title?: string
  is_signed: boolean
  staff_audit_status?: string
}

type ProjectConsentStatus = 'signed' | 'pending' | 'resign'

interface ProjectRow {
  protocol_id: number
  protocol_code: string
  protocol_title: string
  status: ProjectConsentStatus
}

function summarizeProjectStatus(group: ConsentItemRow[]): ProjectConsentStatus {
  const unsigned = group.filter((c) => !c.is_signed && c.icf_version_id)
  if (unsigned.length === 0) return 'signed'
  const hasReturned = unsigned.some(
    (c) => (c.staff_audit_status || '').trim().toLowerCase() === 'returned',
  )
  if (hasReturned) return 'resign'
  return 'pending'
}

function buildProjectRows(items: ConsentItemRow[]): ProjectRow[] {
  const byPid = new Map<number, ConsentItemRow[]>()
  for (const c of items) {
    const pid = c.protocol_id
    if (pid == null || !Number.isFinite(Number(pid))) continue
    if (!byPid.has(pid)) byPid.set(pid, [])
    byPid.get(pid)!.push(c)
  }
  const order: number[] = []
  const seen = new Set<number>()
  for (const c of items) {
    const pid = c.protocol_id
    if (pid == null || !Number.isFinite(Number(pid)) || seen.has(pid)) continue
    seen.add(pid)
    order.push(pid)
  }
  return order.map((pid) => {
    const group = byPid.get(pid) || []
    const first = group[0]
    const code = (first?.protocol_code || '').trim() || `项目${pid}`
    const title = (first?.protocol_title || '').trim()
    return {
      protocol_id: pid,
      protocol_code: code,
      protocol_title: title,
      status: summarizeProjectStatus(group),
    }
  })
}

const STATUS_LABEL: Record<ProjectConsentStatus, string> = {
  signed: '已签署',
  pending: '待签署',
  resign: '重签中',
}

const STATUS_CLASS: Record<ProjectConsentStatus, string> = {
  signed: 'consent-records-item__badge--signed',
  pending: 'consent-records-item__badge--pending',
  resign: 'consent-records-item__badge--resign',
}

export default function ConsentRecordsPage() {
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    subjectApi
      .getMyConsents()
      .then((res) => {
        if (res.code === 401) {
          Taro.showToast({ title: '请先登录', icon: 'none' })
          setRows([])
          return
        }
        const raw = res.data as { items?: ConsentItemRow[] } | null | undefined
        const items = Array.isArray(raw?.items) ? raw.items : []
        setRows(buildProjectRows(items))
      })
      .catch(() => {
        Taro.showToast({ title: '加载失败', icon: 'none' })
        setRows([])
      })
      .finally(() => setLoading(false))
  }, [])

  useDidShow(() => {
    load()
  })

  const onTapProject = (row: ProjectRow) => {
    if (row.status === 'signed') {
      void Taro.navigateTo({
        url: `/pages/consent/index?protocol_id=${encodeURIComponent(String(row.protocol_id))}`,
      }).catch(() => {
        Taro.showToast({ title: '页面打开失败', icon: 'none' })
      })
      return
    }
    if (row.status === 'pending') {
      void Taro.showModal({
        title: '待签署',
        content: '您当前有待签署的知情同意书，请从首页「签署知情同意书」进入完成签署。',
        showCancel: false,
        confirmText: '我知道了',
      })
      return
    }
    void Taro.showModal({
      title: '重签中',
      content:
        '执行台已退回部分节点，请从首页「签署知情同意书」进入，仅对需重签的节点完成签署即可。',
      showCancel: false,
      confirmText: '我知道了',
    })
  }

  if (loading) {
    return (
      <View className='consent-records-page'>
        <Text className='consent-records-loading'>加载中…</Text>
      </View>
    )
  }

  return (
    <View className='consent-records-page'>
      <Text className='consent-records-hint'>
        以下为已发布知情配置的项目。点击项目可查看已签署文档或了解待办说明。
      </Text>
      {rows.length === 0 ? (
        <Text className='consent-records-empty'>暂无知情项目记录</Text>
      ) : (
        <View className='consent-records-list'>
          {rows.map((row) => (
            <View
              key={row.protocol_id}
              className='consent-records-item'
              onClick={() => onTapProject(row)}
            >
              <View className='consent-records-item__main'>
                <Text className='consent-records-item__code'>{row.protocol_code}</Text>
                {row.protocol_title ? (
                  <Text className='consent-records-item__title'>{row.protocol_title}</Text>
                ) : null}
              </View>
              <Text className={`consent-records-item__badge ${STATUS_CLASS[row.status]}`}>
                {STATUS_LABEL[row.status]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
