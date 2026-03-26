/// <reference types="@tarojs/taro" />
declare interface WxCloudLike {
  init?: (options: { env: string; traceUser?: boolean }) => void
  callContainer?: (options: Record<string, unknown>) => Promise<{
    statusCode?: number
    errCode?: number
    data?: unknown
  }>
}

declare interface WxFsLike {
  readFileSync: (filePath: string, encoding?: string) => string | ArrayBuffer
}

declare interface WxLike {
  cloud?: WxCloudLike
  request?: (...args: unknown[]) => unknown
  getFileSystemManager?: () => WxFsLike
}

declare const wx:
  | WxLike
  | undefined

declare module '*.png'
declare module '*.gif'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.svg'
declare module '*.css'
declare module '*.less'
declare module '*.scss'
declare module '*.sass'
declare module '*.styl'

declare namespace NodeJS {
  interface ProcessEnv {
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'quickapp' | 'qq' | 'jd'
  }
}
