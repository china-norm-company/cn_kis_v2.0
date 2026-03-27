import { createElement, type PropsWithChildren } from 'react'
import { View } from '@tarojs/components'
import Taro, { useLaunch, useError } from '@tarojs/taro'
import { applyDevApiBaseOverrideFromStorage } from './utils/api'
import './app.scss'

/** 尽早应用本地联调基址，避免首屏请求仍走 127.0.0.1 */
applyDevApiBaseOverrideFromStorage()

function App({ children }: PropsWithChildren) {
  useError((err) => {
    console.error('[App] 捕获错误:', err)
    setTimeout(() => {
      try {
        Taro.showToast({ title: '页面加载异常，请重试', icon: 'none', duration: 3000 })
      } catch {
        /* ignore */
      }
    }, 0)
  })

  useLaunch(() => {
    applyDevApiBaseOverrideFromStorage()
    console.log('UTest 启动')
  })
  return createElement(View, { className: 'taro-app-root' }, children)
}

export default App
