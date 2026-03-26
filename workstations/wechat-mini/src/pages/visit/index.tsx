import { useState, useCallback } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useVisitData, type VisitNodeItem } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '../../adapters/subject-core'
import { MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'
import './index.scss'

interface Visit {
  id: string
  name: string
  date: string
  status: 'pending' | 'confirmed' | 'completed' | 'expired'
  baselineDay?: number
  windowBefore?: number
  windowAfter?: number
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: '待确认', className: 'badge-pending' },
  confirmed: { label: '已确认', className: 'badge-confirmed' },
  completed: { label: '已完成', className: 'badge-completed' },
  expired: { label: '已过期', className: 'badge-expired' },
}

function formatDateText(value?: string | null): string {
  if (!value) return '--'
  if (value.length >= 10) return value.slice(0, 10)
  return value
}

function formatTimeText(value?: string | null): string {
  if (!value) return '待定'
  return value.slice(0, 5)
}

function getUpcomingBadge(status?: string): { label: string; className: string } {
  if (status === 'confirmed') return { label: '已确认', className: 'badge-confirmed' }
  if (status === 'completed') return { label: '已完成', className: 'badge-completed' }
  if (status === 'expired') return { label: '已过期', className: 'badge-expired' }
  return { label: '待确认', className: 'badge-pending' }
}

function mapNodeToVisit(node: VisitNodeItem, enrollDate?: string): Visit {
  let date = '--'
  if (enrollDate) {
    const base = new Date(enrollDate)
    base.setDate(base.getDate() + (node.baseline_day ?? 0))
    date = base.toISOString().split('T')[0]
  }
  const statusMap: Record<string, Visit['status']> = {
    active: 'confirmed', completed: 'completed', draft: 'pending',
  }
  return {
    id: String(node.id), name: node.name, date,
    status: (node.status ? statusMap[node.status] : undefined) || 'pending',
    baselineDay: node.baseline_day,
    windowBefore: node.window_before, windowAfter: node.window_after,
  }
}

export default function VisitPage() {
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  const [activeTab, setActiveTab] = useState<'timeline' | 'upcoming' | 'schedule'>('timeline')
  const userInfo = taroAuthProvider.getLocalUserInfo()
  const planId = userInfo?.planId ? Number(userInfo.planId) : undefined
  const { visitNodes, upcoming, schedule: scheduleItems, loading, error, reload } = useVisitData(taroApiClient, planId)
  const visits = visitNodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(node => mapNodeToVisit(node, userInfo?.enrollDate))
  const completedCount = visits.filter(v => v.status === 'completed').length
  const pendingCount = visits.filter(v => v.status === 'pending' || v.status === 'confirmed').length
  const nextUpcoming = upcoming[0]

  const fetchAll = useCallback(async () => {
    await reload()
  }, [reload])

  useDidShow(() => { fetchAll() })

  const handleVisitTap = (visit: Visit) => {
    setSelectedVisit(selectedVisit?.id === visit.id ? null : visit)
  }

  if (loading) {
    return (
      <View className='visit-page'>
        <View className='page-header'><Text className='page-title'>我的访视</Text></View>
        <View className='loading-container'><Text className='loading-text'>加载中...</Text></View>
      </View>
    )
  }

  if (error) {
    return (
      <View className='visit-page'>
        <View className='page-header'><Text className='page-title'>我的访视</Text></View>
        <View className='error-container'>
          <Text className='error-text'>{error}</Text>
          <View className='retry-btn' onClick={fetchAll}><Text className='retry-text'>重试</Text></View>
        </View>
      </View>
    )
  }

  return (
    <View className='visit-page'>
      <View className='page-header'>
        <Text className='page-title'>我的访视</Text>
        {upcoming.length > 0 && (
          <Text className='page-desc'>近期有 {upcoming.length} 个预约</Text>
        )}
      </View>

      <View className='visit-focus-card'>
        <Text className='visit-focus-card__title'>当前重点</Text>
        {nextUpcoming ? (
          <View className='visit-focus-card__content'>
            <Text className='visit-focus-card__main'>
              下次安排：{nextUpcoming.date} {nextUpcoming.time ? nextUpcoming.time.slice(0, 5) : '待定'}
            </Text>
            <Text className='visit-focus-card__sub'>
              事项：{nextUpcoming.purpose || '访视预约'}，请提前 10 分钟到达
            </Text>
          </View>
        ) : (
          <View className='visit-focus-card__content'>
            <Text className='visit-focus-card__main'>本周暂无已确认访视</Text>
            <Text className='visit-focus-card__sub'>建议前往预约页查看可用时段</Text>
          </View>
        )}
        <View
          className='visit-focus-card__action'
          onClick={() => Taro.navigateTo({ url: '/subpackages/pkg/pages/appointment/index' })}
        >
          <Text className='visit-focus-card__action-text'>管理预约</Text>
        </View>
      </View>

      <View className='visit-overview'>
        <View className='visit-overview__item'>
          <Text className='visit-overview__value'>{visits.length}</Text>
          <Text className='visit-overview__label'>总访视</Text>
        </View>
        <View className='visit-overview__item'>
          <Text className='visit-overview__value'>{pendingCount}</Text>
          <Text className='visit-overview__label'>待执行</Text>
        </View>
        <View className='visit-overview__item'>
          <Text className='visit-overview__value'>{completedCount}</Text>
          <Text className='visit-overview__label'>已完成</Text>
        </View>
      </View>

      <View className='visit-shortcuts'>
        <View className={`visit-shortcuts__item ${activeTab === 'timeline' ? 'visit-shortcuts__item--active' : ''}`} onClick={() => setActiveTab('timeline')}>
          <Text className='visit-shortcuts__text'>查看流程</Text>
        </View>
        <View className={`visit-shortcuts__item ${activeTab === 'upcoming' ? 'visit-shortcuts__item--active' : ''}`} onClick={() => setActiveTab('upcoming')}>
          <Text className='visit-shortcuts__text'>近期安排</Text>
        </View>
        <View className={`visit-shortcuts__item ${activeTab === 'schedule' ? 'visit-shortcuts__item--active' : ''}`} onClick={() => setActiveTab('schedule')}>
          <Text className='visit-shortcuts__text'>执行工单</Text>
        </View>
      </View>

      {/* Tab 切换 */}
      <View className='tab-bar'>
        <View className={`tab-item ${activeTab === 'timeline' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('timeline')}>
          <Text>时间线</Text>
        </View>
        <View className={`tab-item ${activeTab === 'upcoming' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('upcoming')}>
          <Text>即将到来</Text>
        </View>
        <View className={`tab-item ${activeTab === 'schedule' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('schedule')}>
          <Text>排程详情</Text>
        </View>
      </View>

      {/* Tab: 时间线 */}
      {activeTab === 'timeline' && (
        <View className='visit-list'>
          {visits.length === 0 ? (
            <View className='empty-container'>
              <MiniEmpty
                title={PAGE_COPY.visit.timelineEmpty.title}
                description={PAGE_COPY.visit.timelineEmpty.description}
                icon={PAGE_COPY.visit.timelineEmpty.icon}
                actionText={PAGE_COPY.visit.timelineEmpty.actionText}
                onAction={() => Taro.navigateTo({ url: '/subpackages/pkg/pages/projects/index' })}
              />
            </View>
          ) : visits.map((visit, index) => {
            const statusInfo = STATUS_MAP[visit.status] || STATUS_MAP.pending
            const isLast = index === visits.length - 1
            const isSelected = selectedVisit?.id === visit.id
            return (
              <View key={visit.id} className='visit-item' onClick={() => handleVisitTap(visit)}>
                <View className='timeline'>
                  <View className={`timeline-dot dot-${visit.status}`} />
                  {!isLast && <View className='timeline-line' />}
                </View>
                <View className={`visit-card ${isSelected ? 'visit-card-active' : ''}`}>
                  <View className='visit-header'>
                    <View className='visit-main'>
                      <Text className='visit-name'>{visit.name}</Text>
                      <Text className='visit-date'>{visit.date}</Text>
                    </View>
                    <View className={`badge ${statusInfo.className}`}>
                      <Text className='badge-text'>{statusInfo.label}</Text>
                    </View>
                  </View>
                  {isSelected && (
                    <View className='visit-detail'>
                      <View className='detail-divider' />
                      <View className='detail-row'>
                        <Text className='detail-label'>基线天数</Text>
                        <Text className='detail-value'>第 {visit.baselineDay} 天</Text>
                      </View>
                      <View className='detail-row'>
                        <Text className='detail-label'>窗口期</Text>
                        <Text className='detail-value'>-{visit.windowBefore} ~ +{visit.windowAfter} 天</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      )}

      {/* Tab: 即将到来的预约/随访 */}
      {activeTab === 'upcoming' && (
        <View className='upcoming-list'>
          {upcoming.length === 0 ? (
            <View className='empty-container'>
              <MiniEmpty
                title={PAGE_COPY.visit.upcomingEmpty.title}
                description={PAGE_COPY.visit.upcomingEmpty.description}
                icon={PAGE_COPY.visit.upcomingEmpty.icon}
                actionText={PAGE_COPY.visit.upcomingEmpty.actionText}
                onAction={() => Taro.navigateTo({ url: '/subpackages/pkg/pages/appointment/index' })}
              />
            </View>
          ) : upcoming.map(item => {
            const badgeInfo = getUpcomingBadge(item.status)
            return (
              <View key={item.id} className='upcoming-card'>
                <View className='upcoming-date'>
                  <Text className='upcoming-day'>{formatDateText(item.date).slice(8, 10) || '--'}</Text>
                  <Text className='upcoming-month'>{formatDateText(item.date).slice(5, 7) || '--'}月</Text>
                </View>
                <View className='upcoming-info'>
                  <Text className='upcoming-purpose'>{item.purpose || '访视预约'}</Text>
                  <Text className='upcoming-time'>{formatTimeText(item.time)}</Text>
                </View>
                <View className={`badge ${badgeInfo.className}`}>
                  <Text className='badge-text'>{badgeInfo.label}</Text>
                </View>
              </View>
            )
          })}
          <View className='action-row'>
            <View className='action-btn' onClick={() => Taro.navigateTo({ url: '/subpackages/pkg/pages/appointment/index' })}>
              <Text>预约新访视</Text>
            </View>
          </View>
        </View>
      )}

      {/* Tab: 排程详情（工单维度） */}
      {activeTab === 'schedule' && (
        <View className='schedule-list'>
          {scheduleItems.length === 0 ? (
            <View className='empty-container'>
              <MiniEmpty
                title={PAGE_COPY.visit.scheduleEmpty.title}
                description={PAGE_COPY.visit.scheduleEmpty.description}
                icon={PAGE_COPY.visit.scheduleEmpty.icon}
              />
            </View>
          ) : scheduleItems.map(item => (
            <View key={item.id} className='schedule-card'>
              <View className='schedule-header'>
                <Text className='schedule-visit'>{item.visit_name}</Text>
                <Text className={`schedule-status status-${item.status}`}>
                  {item.status === 'completed' ? '已完成' : item.status === 'in_progress' ? '进行中' : '待执行'}
                </Text>
              </View>
              <Text className='schedule-activity'>{item.activity_name || item.title}</Text>
              <Text className='schedule-date'>
                {item.scheduled_date || '待排期'} {item.start_time ? item.start_time.slice(0, 5) : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
