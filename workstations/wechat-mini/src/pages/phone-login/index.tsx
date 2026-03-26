import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '../../adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

export default function PhoneLoginPage() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const startCooldown = (seconds: number) => {
    setCooldown(seconds)
    const timer = setInterval(() => {
      setCooldown((v) => {
        if (v <= 1) {
          clearInterval(timer)
          return 0
        }
        return v - 1
      })
    }, 1000)
  }

  const onSendCode = async () => {
    if (sending || cooldown > 0) return
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入11位手机号', icon: 'none' })
      return
    }
    setSending(true)
    try {
      const res = await subjectApi.sendSmsVerifyCode({ phone, scene: 'cn_kis_login' })
      if (res.code === 200 && res.data) {
        startCooldown(Number((res.data as { cooldown_seconds?: number })?.cooldown_seconds || 60))
        Taro.showToast({ title: '验证码已发送', icon: 'success' })
      } else {
        Taro.showToast({ title: res.msg || '发送失败', icon: 'none' })
      }
    } finally {
      setSending(false)
    }
  }

  const onLogin = async () => {
    if (submitting) return
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入11位手机号', icon: 'none' })
      return
    }
    if (!/^\d{4,6}$/.test(code)) {
      Taro.showToast({ title: '请输入正确验证码', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const user = await taroAuthProvider.loginWithSms({ phone, code })
      if (user) {
        Taro.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => {
          Taro.switchTab({ url: '/pages/index/index' })
        }, 300)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='phone-login-page'>
      <View className='phone-login-card'>
        <Text className='phone-login-title'>手机号验证码登录</Text>
        <Text className='phone-login-sub'>用于完成 L1 手机认证</Text>

        <View className='field'>
          <Text className='label'>手机号</Text>
          <Input
            className='input'
            type='number'
            maxlength={11}
            value={phone}
            placeholder='请输入11位手机号'
            onInput={(e) => setPhone(e.detail.value)}
          />
        </View>

        <View className='field'>
          <Text className='label'>验证码</Text>
          <View className='code-row'>
            <Input
              className='input code-input'
              type='number'
              maxlength={6}
              value={code}
              placeholder='请输入验证码'
              onInput={(e) => setCode(e.detail.value)}
            />
            <Button className='send-btn' onClick={onSendCode} disabled={sending || cooldown > 0}>
              {cooldown > 0 ? `${cooldown}s` : (sending ? '发送中' : '获取验证码')}
            </Button>
          </View>
        </View>

        <Button className='login-btn' onClick={onLogin} disabled={submitting}>
          {submitting ? '登录中...' : '验证码登录'}
        </Button>
      </View>
    </View>
  )
}
