import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import { buildSubjectEndpoints, type MyComplianceData } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniPage, MiniCard, MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

const RATING_CLASS: Record<string, string> = {
  优秀: 'rating--excellent',
  良好: 'rating--good',
  一般: 'rating--normal',
  较差: 'rating--bad',
  不合规: 'rating--bad',
}

export default function CompliancePage() {
  const [data, setData] = useState<MyComplianceData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    subjectApi.getMyCompliance().then((res) => {
      if (res.code === 200 && res.data) {
        setData(res.data as MyComplianceData)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <MiniPage title='依从性反馈'><Text className='compliance-loading'>加载中...</Text></MiniPage>
  }

  const score = data?.latest_score ?? 0
  const rating = data?.latest_rating ?? '--'
  const items = data?.history ?? []

  return (
    <MiniPage title='依从性反馈'>
      <MiniCard className='text-center'>
        <Text className='compliance-score__label'>
          综合评分
        </Text>
        <Text className={`compliance-score__value ${RATING_CLASS[rating] || ''}`}>
          {score}
        </Text>
        <View className={`compliance-score__badge ${RATING_CLASS[rating] || ''}`}>
          <Text className='compliance-score__badge-text'>
            {rating}
          </Text>
        </View>
      </MiniCard>

      <Text className='compliance-section-title'>
        历史评估
      </Text>

      {items.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.compliance.empty.title}
          description={PAGE_COPY.compliance.empty.description}
          icon={PAGE_COPY.compliance.empty.icon}
        />
      ) : (
        items.map((item) => (
          <MiniCard key={item.id} className='compliance-row'>
            <View>
              <Text className={`compliance-item__rating ${RATING_CLASS[item.rating || ''] || ''}`}>
                {item.rating || '--'}
              </Text>
              <Text className='compliance-item__date'>
                {item.evaluation_date || '--'}
              </Text>
            </View>
            {item.overall_score != null && (
              <Text className='compliance-item__score'>
                {item.overall_score}分
              </Text>
            )}
          </MiniCard>
        ))
      )}
    </MiniPage>
  )
}
