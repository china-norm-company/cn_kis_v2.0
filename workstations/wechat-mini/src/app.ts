import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import './app.scss'

const CLOUD_ENV_ID = 'prod-3gfhkz1551e76534'

function resolveWxCloud(raw: unknown): WxCloudLike | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const initFn = Reflect.get(raw, 'init')
  const callContainerFn = Reflect.get(raw, 'callContainer')
  const cloud: WxCloudLike = {}
  if (typeof initFn === 'function') {
    cloud.init = (options) => {
      Reflect.apply(initFn, raw, [options])
    }
  }
  if (typeof callContainerFn === 'function') {
    cloud.callContainer = async (options) => {
      const result = Reflect.apply(callContainerFn, raw, [options])
      const data = await Promise.resolve(result)
      if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
      const statusCode = Reflect.get(data, 'statusCode')
      const errCode = Reflect.get(data, 'errCode')
      return {
        statusCode: typeof statusCode === 'number' ? statusCode : undefined,
        errCode: typeof errCode === 'number' ? errCode : undefined,
        data: Reflect.get(data, 'data'),
      }
    }
  }
  return cloud.init || cloud.callContainer ? cloud : undefined
}

/**
 * 严格按微信开放文档：使用 callContainer 前必须先 wx.cloud.init()，全局执行一次。
 * 文档：https://developers.weixin.qq.com/minigame/dev/wxcloudrun/src/development/call/mini.html
 */
function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('UTest 启动')
    // Taro.cloud 在不同平台声明不一致，这里统一桥接到最小可用云能力接口。
    const cloud = (typeof wx !== 'undefined' ? resolveWxCloud(wx?.cloud) : undefined) ?? resolveWxCloud(Taro.cloud)
    if (cloud?.init) {
      cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
      console.log(`wx.cloud.init done, env=${CLOUD_ENV_ID} (云托管 callContainer 可用)`)
    } else {
      console.warn(
        '[云托管] wx.cloud 不可用：请在微信开发者工具中开通「云开发」并关联环境',
        CLOUD_ENV_ID,
        '详见 docs/WECHAT_MINI_CLOUDRUN_GUIDE.md'
      )
    }
  })
  return children
}

export default App
