import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniPage, MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'
import './index.scss'

const SEVERITY_LABELS: Record<string, string> = { mild: '轻度', moderate: '中度', severe: '重度' }
const STATUS_LABELS: Record<string, string> = {
  reported: '已上报', under_review: '审核中', approved: '已确认', following: '随访中', closed: '已关闭',
}
interface AERecord {
  id: number
  description: string
  severity: string
  status: string
  is_sae: boolean
  start_date: string
  report_date: string
  outcome: string
}

interface AEHistoryResponse {
  items?: AERecord[]
}

export default function AEHistoryPage() {
  const [records, setRecords] = useState<AERecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    taroApiClient.get('/my/adverse-events').then((res) => {
      const data = res.data as AEHistoryResponse | null
      if (res.code === 200 && data) {
        setRecords(data.items || [])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <MiniPage title='上报记录'>
        <View className='report-history-loading'>
          <Text className='report-history-loading__text'>加载中...</Text>
        </View>
      </MiniPage>
    )
  }

  return (
    <MiniPage title='上报记录'>
      <View className='form-header'>
        <Text className='form-title'>我的上报记录</Text>
        <Text className='form-desc'>查看您提交的不良反应上报及处理进度</Text>
      </View>

      {records.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.report.history.empty.title}
          description={PAGE_COPY.report.history.empty.description}
          icon={PAGE_COPY.report.history.empty.icon}
        />
      ) : (
        records.map((r) => (
          <View
            key={r.id}
            className='form-card report-history-card'
          >
            <View className='report-history-row'>
              <View className='report-history-main'>
                <View className='report-history-meta'>
                  {r.is_sae && (
                    <Text className='report-history-sae'>SAE</Text>
                  )}
                  <Text className={`report-history-status report-history-status--${r.status}`}>
                    {STATUS_LABELS[r.status] || r.status}
                  </Text>
                  <Text className='report-history-date'>{r.report_date}</Text>
                </View>
                <Text className='report-history-desc'>
                  {r.description.length > 60 ? r.description.slice(0, 60) + '...' : r.description}
                </Text>
                <View className='report-history-extra'>
                  <Text className='report-history-extra-text'>
                    严重程度: {SEVERITY_LABELS[r.severity]}
                  </Text>
                  <Text className='report-history-extra-text'>
                    发生日期: {r.start_date}
                  </Text>
                </View>
              </View>
              <Text className='report-history-tip'>仅支持列表查看</Text>
            </View>
          </View>
        ))
      )}
    </MiniPage>
  )
}
