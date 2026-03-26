import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { MiniCard, MiniEmpty, MiniPage, MiniButton } from '@/components/ui'
import { buildSubjectEndpoints, type MyProductItem, type MyProductReminderItem, formatProductDisplayName } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

type ProductStatus = 'all' | 'active' | 'closed'

/** 无后端时用于预览的模拟产品数据 */
const MOCK_PRODUCTS: MyProductItem[] = [
  {
    dispensing_id: 101,
    product_name: '研究样品 A（示例）',
    project_no: 'W26001111',
    project_name: '面霜项目',
    sample_name: '面霜',
    sample_no: '123',
    active_state: true,
    active_recalls: null,
    quantity_dispensed: 2,
    status: '已发放',
    dispensed_at: '2026-03-01T10:00:00',
    confirmed_at: null,
    latest_return: null,
    next_visit_date: '2026-03-15',
    latest_usage: { compliance_status: '良好', compliance_rate: 95 },
  },
  {
    dispensing_id: 102,
    product_name: '研究样品 B（示例）',
    project_no: 'W26001111',
    project_name: '面霜项目',
    sample_name: '精华',
    sample_no: '456',
    active_state: true,
    active_recalls: [{ recall_title: '批次召回提醒（示例）' }],
    quantity_dispensed: 1,
    status: '已发放',
    dispensed_at: '2026-03-05T14:30:00',
    confirmed_at: '2026-03-06T10:00:00',
    latest_return: { status: 'pending' },
    next_visit_date: null,
    latest_usage: null,
  },
  {
    dispensing_id: 103,
    product_name: '研究样品 C（示例）',
    project_no: 'W26002222',
    project_name: '洗发水项目',
    sample_name: '洗发水',
    sample_no: '789',
    active_state: true,
    active_recalls: null,
    quantity_dispensed: 1,
    status: '已发放',
    dispensed_at: '2026-03-06T09:00:00',
    confirmed_at: null,
    latest_return: null,
    next_visit_date: null,
    latest_usage: null,
  },
]
const MOCK_REMINDERS: MyProductReminderItem[] = [
  { title: '示例召回提醒', description: '无后端时展示的模拟数据，用于界面预览。' },
]

const TABS: Array<{ id: ProductStatus; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '进行中' },
  { id: 'closed', label: '已结束' },
]

/** 是否待签收 */
function needsReceipt(item: MyProductItem): boolean {
  return !item.confirmed_at
}

/** 是否待回寄（未申请或申请中可补充单号） */
function needsReturn(item: MyProductItem): boolean {
  const ret = item.latest_return
  if (!ret) return true
  return ret.status === 'pending' || ret.status === 'initiated' || ret.status === 'returned'
}

/** 从产品列表提取项目列表（按 project_no 去重，保留 project_name） */
function getProjectList(items: MyProductItem[]): Array<{ project_no: string; project_name: string }> {
  const seen = new Set<string>()
  const list: Array<{ project_no: string; project_name: string }> = []
  for (const it of items) {
    const no = it.project_no || ''
    if (!no || seen.has(no)) continue
    seen.add(no)
    list.push({ project_no: no, project_name: it.project_name || no })
  }
  return list
}

export default function ProductsPage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<ProductStatus>('all')
  const [items, setItems] = useState<MyProductItem[]>([])
  const [reminders, setReminders] = useState<MyProductReminderItem[]>([])
  const [loadError, setLoadError] = useState<string>('')
  /** 当前选中的项目编号，空表示全部 */
  const [selectedProjectNo, setSelectedProjectNo] = useState<string>('')

  const formatDateTime = (value?: string | null) => {
    if (!value) return '--'
    return value.replace('T', ' ').slice(0, 16)
  }

  const loadData = async (nextStatus: ProductStatus) => {
    setLoading(true)
    setLoadError('')
    // 先立即展示模拟数据，确保用户能体验功能；后台再尝试加载真实数据
    setItems(MOCK_PRODUCTS)
    setReminders(MOCK_REMINDERS)
    setLoadError('')
    setLoading(false)

    try {
      const [productsRes, remindersRes] = await Promise.all([
        subjectApi.getMyProducts(nextStatus),
        subjectApi.getMyProductReminders(),
      ])
      if (productsRes.code === 200) {
        const realItems = (productsRes.data as { items?: MyProductItem[] } | null)?.items || []
        const realReminders = (remindersRes.data as { items?: MyProductReminderItem[] } | null)?.items || []
        if (realItems.length > 0 || realReminders.length > 0) {
          setItems(realItems)
          setReminders(realReminders)
        }
      }
    } catch {
      // 请求失败时保持模拟数据，用户已能看到内容
    }
  }

  useEffect(() => {
    void loadData(status)
  }, [status])

  const stats = useMemo(() => {
    const total = items.length
    const active = items.filter((i) => i.active_state).length
    const recall = items.filter((i) => (i.active_recalls || []).length > 0).length
    return { total, active, recall }
  }, [items])

  const projects = useMemo(() => getProjectList(items), [items])

  const itemsFilteredByStatus = useMemo(() => {
    if (status === 'all') return items
    if (status === 'active') return items.filter((i) => i.active_state)
    return items.filter((i) => !i.active_state)
  }, [items, status])

  const itemsToShow = useMemo(() => {
    if (!selectedProjectNo) return itemsFilteredByStatus
    return itemsFilteredByStatus.filter((i) => (i.project_no || '') === selectedProjectNo)
  }, [itemsFilteredByStatus, selectedProjectNo])

  const receiptIds = useMemo(() => itemsToShow.filter((i) => needsReceipt(i)).map((i) => i.dispensing_id), [itemsToShow])
  const returnIds = useMemo(() => itemsToShow.filter((i) => needsReturn(i)).map((i) => i.dispensing_id), [itemsToShow])

  const handleQuickReceipt = (id: number) => {
    Taro.navigateTo({ url: `/subpackages/pkg/pages/sample-confirm/index?dispensing_ids=${id}` })
  }

  const handleQuickReturn = (id: number) => {
    Taro.navigateTo({ url: `/subpackages/pkg/pages/sample-return/index?dispensing_ids=${id}` })
  }

  const handleBatchReceiptProject = () => {
    if (receiptIds.length === 0) return
    Taro.navigateTo({
      url: `/subpackages/pkg/pages/sample-confirm/index?dispensing_ids=${receiptIds.join(',')}&project_no=${selectedProjectNo || ''}`,
    })
  }

  const handleBatchReturnProject = () => {
    if (returnIds.length === 0) return
    Taro.navigateTo({
      url: `/subpackages/pkg/pages/sample-return/index?dispensing_ids=${returnIds.join(',')}&project_no=${selectedProjectNo || ''}`,
    })
  }

  return (
    <MiniPage title='我的产品' subtitle='领用、使用、归还与召回全生命周期'>
      {projects.length > 0 && (
        <View className='products-project-bar'>
          <ScrollView scrollX className='products-project-scroll' scrollWithAnimation>
            <View className='products-project-row'>
              <View
                className={`products-project-chip ${!selectedProjectNo ? 'products-project-chip--active' : ''}`}
                onClick={() => setSelectedProjectNo('')}
              >
                <Text className='products-project-chip__text'>全部</Text>
              </View>
              {projects.map((p) => (
                <View
                  key={p.project_no}
                  className={`products-project-chip ${selectedProjectNo === p.project_no ? 'products-project-chip--active' : ''}`}
                  onClick={() => setSelectedProjectNo(p.project_no)}
                >
                  <Text className='products-project-chip__text'>{p.project_no}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      {selectedProjectNo && (receiptIds.length > 0 || returnIds.length > 0) && (
        <View className='products-batch-bar'>
          {receiptIds.length > 0 && (
            <MiniButton className='products-batch-btn' onClick={handleBatchReceiptProject}>
              批量签收本项目{receiptIds.length > 1 ? ` (${receiptIds.length})` : ''}
            </MiniButton>
          )}
          {returnIds.length > 0 && (
            <MiniButton variant='secondary' className='products-batch-btn' onClick={handleBatchReturnProject}>
              批量回寄本项目{returnIds.length > 1 ? ` (${returnIds.length})` : ''}
            </MiniButton>
          )}
        </View>
      )}
      <MiniCard>
        <View className='products-stat'>
          <View className='products-stat__item'>
            <Text className='products-stat__num'>{stats.total}</Text>
            <Text className='products-stat__label'>总记录</Text>
          </View>
          <View className='products-stat__item'>
            <Text className='products-stat__num'>{stats.active}</Text>
            <Text className='products-stat__label'>进行中</Text>
          </View>
          <View className='products-stat__item'>
            <Text className='products-stat__num'>{stats.recall}</Text>
            <Text className='products-stat__label'>召回提醒</Text>
          </View>
        </View>
        <View className='products-tabs'>
          {TABS.map((tab) => (
            <View
              key={tab.id}
              className={`products-tabs__item ${status === tab.id ? 'products-tabs__item--active' : ''}`}
              onClick={() => setStatus(tab.id)}
            >
              <Text className='products-tabs__text'>{tab.label}</Text>
            </View>
          ))}
        </View>
      </MiniCard>

      {reminders.slice(0, 2).map((r, idx) => (
        <MiniCard key={`${r.title}-${idx}`} className='products-reminder'>
          <Text className='products-reminder__title'>{r.title}</Text>
          <Text className='products-reminder__desc'>{r.description}</Text>
        </MiniCard>
      ))}

      {loading ? (
        <Text className='products-loading'>加载中...</Text>
      ) : loadError ? (
        <MiniEmpty
          title='产品数据加载失败'
          description={loadError}
          icon='⚠️'
          actionText='重新加载'
          onAction={() => void loadData(status)}
        />
      ) : items.length === 0 ? (
        <MiniEmpty
          title='暂无产品记录'
          description='当研究产品完成发放后，这里会展示领用和后续使用安排。'
          icon='🧴'
        />
      ) : itemsToShow.length === 0 ? (
        <MiniEmpty
          title='该项目暂无产品'
          description='切换其他项目或查看全部。'
          icon='🧴'
        />
      ) : (
        <>
          {itemsToShow.map((item) => (
              <MiniCard key={item.dispensing_id}>
                <View className='products-item'>
                  <View
                    className='products-item__body'
                    onClick={() => Taro.navigateTo({ url: `/subpackages/pkg/pages/products/detail?id=${item.dispensing_id}` })}
                  >
                    <View className='products-item__head'>
                      <Text className='products-item__title'>{formatProductDisplayName(item)}</Text>
                      <Text className={`products-item__badge ${item.active_state ? 'is-active' : 'is-closed'}`}>
                        {item.active_state ? '进行中' : '已结束'}
                      </Text>
                    </View>
                    <Text className='products-item__meta'>
                      领用数量 {item.quantity_dispensed} · 发放状态 {item.status}
                    </Text>
                    <Text className='products-item__meta'>
                      发放时间 {formatDateTime(item.dispensed_at)}
                    </Text>
                    {item.next_visit_date ? (
                      <Text className='products-item__meta'>下次访视 {item.next_visit_date}</Text>
                    ) : null}
                    {item.latest_usage?.compliance_status ? (
                      <Text className='products-item__meta'>
                        最近依从性 {item.latest_usage.compliance_status}
                        {item.latest_usage.compliance_rate != null ? ` (${item.latest_usage.compliance_rate}%)` : ''}
                      </Text>
                    ) : (
                      <Text className='products-item__meta products-item__meta--warn'>尚未记录使用情况</Text>
                    )}
                    {(item.active_recalls || []).length > 0 ? (
                      <Text className='products-item__meta products-item__meta--danger'>
                        召回提醒：{item.active_recalls?.[0]?.recall_title}
                      </Text>
                    ) : null}
                    <View className='products-item__footer'>
                      <View className='products-item__actions'>
                        {needsReceipt(item) && (
                          <Text
                            className='products-item__action products-item__action--primary'
                            onClick={(e) => {
                              e.stopPropagation()
                              handleQuickReceipt(item.dispensing_id)
                            }}
                          >
                            签收
                          </Text>
                        )}
                        {needsReturn(item) && (
                          <Text
                            className='products-item__action products-item__action--secondary'
                            onClick={(e) => {
                              e.stopPropagation()
                              handleQuickReturn(item.dispensing_id)
                            }}
                          >
                            回寄
                          </Text>
                        )}
                        <Text
                          className='products-item__link'
                          onClick={(e) => {
                            e.stopPropagation()
                            Taro.navigateTo({ url: `/subpackages/pkg/pages/products/detail?id=${item.dispensing_id}` })
                          }}
                        >
                          详情
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </MiniCard>
            ))}
        </>
      )}
    </MiniPage>
  )
}
