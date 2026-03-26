import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import {
  API_BASE_URL,
  allowsDevApiBaseStorageOverride,
  getCurrentApiBaseUrl,
  getDevApiBaseOverrideRaw,
  setDevApiBaseOverride,
} from '@/utils/api'
import './index.scss'

export default function DevApiPage() {
  const [value, setValue] = useState('')
  const [hint, setHint] = useState('')

  useLoad(() => {
    if (!allowsDevApiBaseStorageOverride()) {
      Taro.showToast({ title: '当前为正式 API 构建', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }
    setValue(getDevApiBaseOverrideRaw() || getCurrentApiBaseUrl())
    setHint(`编译默认：${API_BASE_URL}`)
  })

  const handleSave = () => {
    const r = setDevApiBaseOverride(value)
    if (r.ok) {
      Taro.showToast({ title: '已保存，请返回重试请求', icon: 'success' })
      setHint(`当前生效：${getCurrentApiBaseUrl()}`)
    } else {
      Taro.showToast({ title: r.msg || '保存失败', icon: 'none', duration: 3000 })
    }
  }

  const handleClear = () => {
    setDevApiBaseOverride(null)
    setValue(getCurrentApiBaseUrl())
    setHint(`已恢复编译默认：${API_BASE_URL}`)
    Taro.showToast({ title: '已清除覆盖', icon: 'none' })
  }

  if (!allowsDevApiBaseStorageOverride()) {
    return (
      <View className='dev-api-page'>
        <Text>当前构建不支持联调覆盖</Text>
      </View>
    )
  }

  return (
    <View className='dev-api-page'>
      <View className='dev-api-card'>
        <Text className='dev-api-title'>联调 API 基址</Text>
        <Text className='dev-api-sub'>
          真机无法访问 127.0.0.1。请填本机在局域网中的地址（与电脑 ifconfig / ipconfig 一致），端口与 Django 一致（默认
          8001），路径需含 /api/v1。
        </Text>
        <Text className='dev-api-example'>示例：http://192.168.1.10:8001/api/v1</Text>
        <Input
          className='dev-api-input'
          placeholder='http://192.168.x.x:8001/api/v1'
          value={value}
          onInput={(e) => setValue(e.detail.value)}
        />
        {hint ? <Text className='dev-api-hint'>{hint}</Text> : null}
        <Button className='dev-api-btn' onClick={handleSave}>
          保存并生效
        </Button>
        <Button className='dev-api-btn dev-api-btn--secondary' onClick={handleClear}>
          清除覆盖（恢复编译默认）
        </Button>
        <Text className='dev-api-foot'>
          请在微信开发者工具中勾选「不校验合法域名」。后端建议：python manage.py runserver 0.0.0.0:8001
        </Text>
      </View>
    </View>
  )
}
