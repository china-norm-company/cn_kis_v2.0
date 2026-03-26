import { useState, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { taroApiClient, taroAuthProvider } from '@/adapters/subject-core'
import { MiniEmpty } from '@/components/ui'
import { PAGE_COPY } from '@/constants/copy'
import { getLocalRoles } from '@/utils/auth'
import { isFieldExecutor, isQA, isManagement } from '@cn-kis/subject-core'
import './index.scss'

interface WorkOrderItem {
  id: number
  title: string
  status: string
  work_order_type: string
  scheduled_date: string | null
  subject_name: string
  protocol_title: string
  visit_node_name: string
  activity_name: string
  due_date: string | null
}

interface QRResolveResult {
  label?: string
  today_work_orders?: Array<{ id: number }>
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: '#94a3b8' },
  assigned: { label: '已分配', color: '#3b82f6' },
  in_progress: { label: '进行中', color: '#f59e0b' },
  completed: { label: '已完成', color: '#22c55e' },
  review: { label: '待审核', color: '#f59e0b' },
  approved: { label: '已批准', color: '#22c55e' },
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'wo-status--pending',
  assigned: 'wo-status--assigned',
  in_progress: 'wo-status--in-progress',
  completed: 'wo-status--completed',
  review: 'wo-status--review',
  approved: 'wo-status--approved',
}

export default function TechnicianPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrderItem[]>([])
  const [loading, setLoading] = useState(false)

  const loadTodayOrders = useCallback(async () => {
    if (!taroAuthProvider.isLoggedIn()) {
      Taro.redirectTo({ url: '/pages/index/index' })
      return
    }
    // 角色守卫：只有 FIELD_EXECUTOR 角色才能访问技术员工作台
    const roles = getLocalRoles()
    if (!isFieldExecutor(roles)) {
      Taro.showToast({ title: '暂无权限', icon: 'none', duration: 2000 })
      Taro.redirectTo({ url: '/pages/index/index' })
      return
    }
    setLoading(true)
    try {
      const res = await taroApiClient.get('/workorder/my-today')
      const woData = res.data as WorkOrderItem[] | null
      if (res.code === 200 && woData) {
        setWorkOrders(woData)
      }
    } catch (e) {
      console.error('加载工单失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(() => {
    loadTodayOrders()
  })

  const handleScan = async () => {
    try {
      const result = await Taro.scanCode({ onlyFromCamera: false })
      if (result.result) {
        const match = result.result.match(/\/qr\/([a-f0-9]+)/)
        if (match) {
          const res = await taroApiClient.post('/qrcode/resolve', { qr_hash: match[1] })
          const qrData = res.data as QRResolveResult | null
          if (res.code === 200 && qrData) {
            const record = qrData
            if (record.today_work_orders?.length === 1) {
              Taro.navigateTo({
                url: `/subpackages/pkg/pages/technician/workorder-detail?id=${record.today_work_orders[0].id}`,
              })
            } else {
              Taro.showToast({ title: `识别：${record.label}`, icon: 'success' })
            }
          }
        }
      }
    } catch {
      Taro.showToast({ title: '扫码取消', icon: 'none' })
    }
  }

  const navigateToDetail = (woId: number) => {
    Taro.navigateTo({ url: `/subpackages/pkg/pages/technician/workorder-detail?id=${woId}` })
  }

  return (
    <View className="tech-workbench">
      <View className="header">
        <Text className="title">技术员工作台</Text>
        <Text className="subtitle">今日工单</Text>
      </View>

      {/* 快捷操作 */}
      <View className="actions">
        <View className="action-btn scan" onClick={handleScan}>
          <Text className="action-icon">📷</Text>
          <Text className="action-label">扫码执行</Text>
        </View>
        <View className="action-btn refresh" onClick={loadTodayOrders}>
          <Text className="action-icon">🔄</Text>
          <Text className="action-label">刷新</Text>
        </View>
        {(isQA(getLocalRoles()) || isManagement(getLocalRoles())) && (
          <View
            className="action-btn qa"
            onClick={() => Taro.navigateTo({ url: '/subpackages/pkg/pages/qa-patrol/index' })}
          >
            <Text className="action-icon">📋</Text>
            <Text className="action-label">质量巡查</Text>
          </View>
        )}
      </View>

      {/* 工单列表 */}
      <ScrollView scrollY className="wo-list">
        {loading && (
          <View className="empty-state">
            <Text>加载中...</Text>
          </View>
        )}

        {!loading && workOrders.length === 0 && (
          <View className="empty-state">
            <MiniEmpty
              title={PAGE_COPY.technician.empty.title}
              description={PAGE_COPY.technician.empty.description}
              icon={PAGE_COPY.technician.empty.icon}
              actionText={PAGE_COPY.technician.empty.actionText}
              onAction={handleScan}
            />
          </View>
        )}

        {workOrders.map((wo) => {
          const st = STATUS_LABELS[wo.status] || { label: wo.status, color: '#94a3b8' }
          const statusClass = STATUS_CLASS[wo.status] || 'wo-status--pending'
          const isOverdue = wo.due_date && new Date(wo.due_date) < new Date()
            && !['completed', 'approved', 'cancelled'].includes(wo.status)
          return (
            <View
              key={wo.id}
              className={`wo-card ${isOverdue ? 'overdue' : ''}`}
              onClick={() => navigateToDetail(wo.id)}
            >
              <View className="wo-card-header">
                <Text className="wo-title">{wo.title}</Text>
                <View className={`wo-status ${statusClass}`}>
                  <Text>{st.label}</Text>
                </View>
                {isOverdue && (
                  <View className="wo-overdue-tag">
                    <Text>逾期</Text>
                  </View>
                )}
              </View>
              <View className="wo-card-body">
                {wo.protocol_title && (
                  <Text className="wo-info">项目: {wo.protocol_title}</Text>
                )}
                {wo.subject_name && (
                  <Text className="wo-info">受试者: {wo.subject_name}</Text>
                )}
                {wo.visit_node_name && (
                  <Text className="wo-info">访视: {wo.visit_node_name}</Text>
                )}
                {wo.activity_name && (
                  <Text className="wo-info">活动: {wo.activity_name}</Text>
                )}
              </View>
              <View className="wo-card-footer">
                <Text className="wo-date">
                  {wo.scheduled_date || '未排程'}
                </Text>
                <Text className="wo-type">{wo.work_order_type || 'visit'}</Text>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}
