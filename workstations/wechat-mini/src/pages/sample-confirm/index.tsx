import { useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniPage, MiniCard, MiniButton } from '../../components/ui'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

export default function SampleConfirmPage() {
  const router = Taro.useRouter()
  const initialDispensingId = useMemo(() => {
    const raw = router.params?.dispensing_id || router.params?.id || ''
    return String(raw)
  }, [router.params])
  const [dispensingId, setDispensingId] = useState(initialDispensingId)
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    const parsed = Number(dispensingId)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      Taro.showToast({ title: '请输入有效的发放记录ID', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const res = await subjectApi.getSampleConfirmUrl(parsed)
      if (res.code === 200) {
        Taro.showToast({ title: '签收确认成功', icon: 'success' })
      } else {
        Taro.showToast({ title: res.msg || '签收失败', icon: 'none' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MiniPage title='产品签收确认'>
      <MiniCard>
        {initialDispensingId ? (
          <Text className='sample-confirm__desc'>
            已关联发放记录 ID：{initialDispensingId}，点击下方按钮直接完成签收确认。
          </Text>
        ) : (
          <>
            <Text className='sample-confirm__desc'>
              请输入发放记录 ID，确认您已收到对应的研究产品。
            </Text>
            <Input
              type='number'
              value={dispensingId}
              onInput={(e) => setDispensingId(e.detail.value)}
              placeholder='请输入发放记录ID'
              className='sample-confirm__input'
            />
          </>
        )}
        <View className='sample-confirm__action'>
          <MiniButton onClick={handleConfirm} disabled={submitting}>
            {submitting ? '提交中...' : '确认签收'}
          </MiniButton>
        </View>
      </MiniCard>
    </MiniPage>
  )
}
