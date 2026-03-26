import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { bindPhone } from '@/utils/api'
import './index.scss'

export default function BindPhonePage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleBind = async () => {
    const p = phone.trim()
    if (!/^1\d{10}$/.test(p)) {
      setError('请输入正确的11位手机号')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await bindPhone(p)
      if (res.code === 200) {
        Taro.showToast({ title: '绑定成功', icon: 'success' })
        setTimeout(() => {
          Taro.switchTab({ url: '/pages/index/index' })
        }, 800)
      } else {
        setError(res.msg || '绑定失败，请重试')
      }
    } catch {
      setError('网络异常，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='bind-phone-page'>
      <View className='bind-phone-card'>
        <Text className='bind-phone-title'>绑定手机号</Text>
        <Text className='bind-phone-sub'>
          请输入您预约时登记的手机号，完成绑定后即可扫码签到/签出
        </Text>
        <Input
          className='bind-phone-input'
          type='number'
          maxlength={11}
          placeholder='请输入11位手机号'
          value={phone}
          onInput={(e) => {
            setPhone(e.detail.value)
            setError('')
          }}
          data-testid='phone-input'
        />
        {error ? <Text className='bind-phone-error'>{error}</Text> : null}
        <Button
          className='bind-phone-btn'
          onClick={handleBind}
          disabled={loading}
          data-testid='bind-btn'
        >
          {loading ? '绑定中...' : '确认绑定'}
        </Button>
        <Text className='bind-phone-hint'>
          若手机号未收到提示，请联系现场工作人员
        </Text>
      </View>
    </View>
  )
}
