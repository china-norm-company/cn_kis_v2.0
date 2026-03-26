import { useState, useEffect } from 'react'
import { Text } from '@tarojs/components'
import { buildSubjectEndpoints, type MyResultItem } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import { MiniPage, MiniCard, MiniEmpty } from '@/components/ui'
import { PAGE_COPY } from '@/constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)

export default function ResultsPage() {
  const [results, setResults] = useState<MyResultItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    subjectApi.getMyResults().then((res) => {
      const resData = res.data as { items?: MyResultItem[] } | null
      if (res.code === 200 && resData?.items) {
        setResults(resData.items)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <MiniPage title='检测结果' subtitle='查看您已完成的 CRF 记录'>

      {loading ? (
        <Text className='results-loading'>加载中...</Text>
      ) : results.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.results.empty.title}
          description={PAGE_COPY.results.empty.description}
          icon={PAGE_COPY.results.empty.icon}
        />
      ) : (
        results.map((item) => (
          <MiniCard key={item.id}>
            <Text className='results-item__title'>
              {item.template_name || 'CRF 记录'}
            </Text>
            <Text className='results-item__time'>
              完成日期: {(item.completed_at || '').replace('T', ' ').slice(0, 16) || '--'}
            </Text>
          </MiniCard>
        ))
      )}
    </MiniPage>
  )
}
