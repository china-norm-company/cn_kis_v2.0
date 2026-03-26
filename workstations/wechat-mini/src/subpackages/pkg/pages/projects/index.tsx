import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints, type AvailablePlanItem } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import { MiniPage, MiniCard, MiniEmpty, MiniButton } from '@/components/ui'
import { PAGE_COPY } from '@/constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

export default function ProjectsPage() {
  const [plans, setPlans] = useState<AvailablePlanItem[]>([])
  const [selectedPlan, setSelectedPlan] = useState<AvailablePlanItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadPlans = () => {
    setLoading(true)
    setLoadError('')
    subjectApi.getAvailablePlans()
      .then(res => {
        const planData = res.data as { items?: AvailablePlanItem[] } | null
        if (res.code === 200 && planData?.items) {
          setPlans(planData.items)
        } else {
          setLoadError(res.msg || '项目加载失败，请稍后重试')
        }
        setLoading(false)
      })
      .catch(() => {
        setLoadError('网络异常，暂时无法获取项目列表，请稍后重试')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadPlans()
  }, [])

  const handleViewDetail = async (plan: AvailablePlanItem) => {
    if (selectedPlan?.id === plan.id) {
      setSelectedPlan(null)
      return
    }
    try {
      const res = await subjectApi.getPlanDetail(plan.id)
      if (res.code === 200 && res.data) {
        setSelectedPlan(res.data as AvailablePlanItem)
      } else {
        setSelectedPlan(plan)
        Taro.showToast({ title: res.msg || '详情加载失败，已展示基础信息', icon: 'none' })
      }
    } catch {
      setSelectedPlan(plan)
      Taro.showToast({ title: '详情加载失败，已展示基础信息', icon: 'none' })
    }
  }

  if (loading) {
    return (
      <MiniPage title='招募项目'>
        <MiniEmpty
          title={PAGE_COPY.projects.loading.title}
          description={PAGE_COPY.projects.loading.description}
          icon={PAGE_COPY.projects.loading.icon}
        />
      </MiniPage>
    )
  }

  return (
    <MiniPage title='招募项目' subtitle='选择项目了解详情或报名参加'>
      {loadError ? (
        <MiniCard>
          <Text className='projects-loading'>{loadError}</Text>
          <Text className='projects-item__toggle' onClick={loadPlans}>点击重试 ›</Text>
        </MiniCard>
      ) : null}
      {plans.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.projects.empty.title}
          description={PAGE_COPY.projects.empty.description}
          icon={PAGE_COPY.projects.empty.icon}
          actionText={PAGE_COPY.projects.empty.actionText}
          onAction={loadPlans}
        />
      ) : (
        plans.map((plan) => {
          const isExpanded = selectedPlan?.id === plan.id
          return (
            <MiniCard key={plan.id}>
              <View onClick={() => handleViewDetail(plan)}>
                <Text className='projects-item__title'>
                  {plan.title}
                </Text>
                {plan.protocol_title && (
                  <Text className='projects-item__protocol'>
                    协议: {plan.protocol_title}
                  </Text>
                )}
                {plan.description && (
                  <Text className='projects-item__desc'>
                    {plan.description}
                  </Text>
                )}
                <View className='projects-item__meta'>
                  {plan.remaining_slots != null && (
                    <Text className={`projects-item__slots ${plan.remaining_slots > 0 ? 'projects-item__slots--ok' : 'projects-item__slots--empty'}`}>
                      剩余名额: {plan.remaining_slots}
                    </Text>
                  )}
                  {plan.start_date && (
                    <Text className='projects-item__date'>
                      {plan.start_date} ~ {plan.end_date}
                    </Text>
                  )}
                </View>
              </View>

              {isExpanded && selectedPlan && (
                <View className='projects-item__detail'>
                  <View className='projects-item__meta-block'>
                    <Text className='projects-item__meta-title'>研究类型</Text>
                    <Text className='projects-item__meta-text'>临床测试 / 消费者研究（以项目说明为准）</Text>
                  </View>
                  <View className='projects-item__meta-block'>
                    <Text className='projects-item__meta-title'>参与流程</Text>
                    <Text className='projects-item__meta-text'>报名 → 初筛 → 正式筛选 → 入组 → 访视</Text>
                  </View>
                  <View className='projects-item__meta-block'>
                    <Text className='projects-item__meta-title'>补偿说明</Text>
                    <Text className='projects-item__meta-text'>根据项目方案，具体以工作人员告知为准</Text>
                  </View>
                  {selectedPlan.description ? (
                    <View className='projects-item__meta-block'>
                      <Text className='projects-item__meta-title'>项目说明</Text>
                      <Text className='projects-item__meta-text'>{selectedPlan.description}</Text>
                    </View>
                  ) : null}
                  {selectedPlan.criteria && selectedPlan.criteria.length > 0 && (
                    <View className='projects-item__criteria'>
                      <Text className='projects-item__criteria-title'>入排标准</Text>
                      {selectedPlan.criteria.map((c, i) => (
                        <View key={i} className='projects-item__criteria-row'>
                          <Text className={`projects-item__criteria-flag ${c.is_mandatory ? 'projects-item__criteria-flag--must' : ''}`}>
                            {c.is_mandatory ? '必须' : '可选'}
                          </Text>
                          <Text className='projects-item__criteria-text'>
                            [{c.type === 'inclusion' ? '入选' : '排除'}] {c.description}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View className='projects-item__actions'>
                <Text
                  className='projects-item__toggle'
                  onClick={() => handleViewDetail(plan)}
                >
                  {isExpanded ? '收起详情 ‹' : '查看详情 ›'}
                </Text>
                <View className='projects-item__apply'>
                  <MiniButton onClick={() => Taro.navigateTo({ url: `/subpackages/pkg/pages/register/index?plan_id=${plan.id}` })}>
                    立即报名
                  </MiniButton>
                </View>
              </View>
            </MiniCard>
          )
        })
      )}
    </MiniPage>
  )
}
