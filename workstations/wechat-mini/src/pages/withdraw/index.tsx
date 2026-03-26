import { useState } from 'react'
import { View, Text, Picker, Textarea, CheckboxGroup, Checkbox } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniPage, MiniCard, MiniButton } from '../../components/ui'
import './index.scss'

const REASON_OPTIONS = ['个人原因', '搬迁', '不良反应', '时间冲突', '其他']

function toPickerIndex(value: string | number): number {
  return typeof value === 'number' ? value : parseInt(value, 10)
}

export default function WithdrawPage() {
  const [reason, setReason] = useState('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (!reason) {
      Taro.showToast({ title: '请选择退出原因', icon: 'none' })
      return
    }
    if (!confirmed) {
      Taro.showToast({ title: '请确认已阅读并同意相关说明', icon: 'none' })
      return
    }

    Taro.showModal({
      title: '确认退出',
      content: '退出研究后不可恢复，您确定要提交申请吗？',
      confirmColor: '#e53e3e',
      confirmText: '确定退出',
    }).then(async (modalRes) => {
      if (!modalRes.confirm) return

      setSubmitting(true)
      const res = await taroApiClient.post('/my/withdraw', {
        reason,
        reason_detail: reasonDetail,
      })
      setSubmitting(false)

      if (res.code === 200) {
        setSubmitted(true)
        Taro.showToast({ title: '申请已提交', icon: 'success' })
      } else {
        Taro.showToast({ title: res.msg || '提交失败', icon: 'none' })
      }
    })
  }

  if (submitted) {
    return (
      <MiniPage title='退出研究'>
        <MiniCard className='withdraw-success text-center'>
          <Text className='withdraw-success__icon'>✓</Text>
          <Text className='withdraw-success__title'>
            退出申请已提交
          </Text>
          <Text className='withdraw-success__desc'>
            工作人员将尽快与您联系，办理相关手续。如有未归还的研究产品，请按工作人员指引归还。
          </Text>
          <View className='withdraw-success__action'>
            <MiniButton onClick={() => Taro.navigateBack()}>返回</MiniButton>
          </View>
        </MiniCard>
      </MiniPage>
    )
  }

  return (
    <MiniPage title='退出研究'>
      <MiniCard className='withdraw-alert'>
        <Text className='withdraw-alert__text'>
          ⚠️ 退出研究后不可恢复，您将无法继续参与本研究。请慎重考虑。
        </Text>
      </MiniCard>

      <MiniCard>
        <Text className='withdraw-label'>
          退出原因 <Text className='withdraw-required'>*</Text>
        </Text>
        <Picker
          mode='selector'
          range={REASON_OPTIONS}
          onChange={(e) => {
            const idx = toPickerIndex(e.detail.value)
            setReason(REASON_OPTIONS[idx] || '')
          }}
        >
          <View className={`withdraw-picker ${reason ? 'withdraw-picker--filled' : ''}`}>
            {reason || '请选择退出原因'}
          </View>
        </Picker>

        <Text className='withdraw-label withdraw-label--detail'>
          详细说明（选填）
        </Text>
        <Textarea
          className='withdraw-textarea'
          value={reasonDetail}
          onInput={(e) => setReasonDetail(e.detail.value)}
          placeholder='请简要说明退出原因'
          maxlength={500}
        />

        <CheckboxGroup onChange={(e) => setConfirmed((e.detail.value?.length ?? 0) > 0)} className='withdraw-confirm'>
          <View className='withdraw-confirm__row'>
            <Checkbox value="agree" checked={confirmed} color="#2B6CB0" className='withdraw-confirm__checkbox' />
            <Text className='withdraw-confirm__text'>
              我确认已归还或承诺归还研究产品，并理解退出研究后不可恢复。
            </Text>
          </View>
        </CheckboxGroup>
      </MiniCard>

      <View className='withdraw-submit'>
        <MiniButton
          variant='danger'
          onClick={() => !submitting && handleSubmit()}
          disabled={submitting}
        >
          {submitting ? '提交中...' : '提交退出申请'}
        </MiniButton>
      </View>
    </MiniPage>
  )
}
