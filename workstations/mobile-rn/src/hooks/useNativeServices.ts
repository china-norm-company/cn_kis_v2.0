import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import type { Device } from 'react-native-ble-plx'
import { rnApiClient } from '../adapters/rnApiClient'
import { scanBleDevices, connectBleDevice } from '../services/native/ble'
import { requestHealthPermissions as requestHealthPerms } from '../services/native/health'
import { registerPushToken } from '../services/native/push'

export interface UseNativeServicesResult {
  /** 扫描到的 BLE 设备列表 */
  bleDevices: Device[]
  /** 是否正在扫描 BLE */
  bleScanning: boolean
  /** 扫描 BLE 设备 */
  scanBle: (durationMs?: number) => Promise<void>
  /** 连接指定 BLE 设备 */
  connectBle: (deviceId: string) => Promise<Device>
  /** 请求健康数据权限 */
  requestHealthPermissions: () => Promise<void>
  /** 推送 token 是否已注册到后端 */
  pushRegistered: boolean
}

export function useNativeServices(): UseNativeServicesResult {
  const [bleDevices, setBleDevices] = useState<Device[]>([])
  const [bleScanning, setBleScanning] = useState(false)
  const [pushRegistered, setPushRegistered] = useState(false)
  const pushRegisteredRef = useRef(false)

  const registerPush = useCallback(async () => {
    if (pushRegisteredRef.current) return
    try {
      const token = await registerPushToken()
      if (token) {
        const platform = Platform.OS === 'ios' ? 'ios' : 'android'
        const res = await rnApiClient.post<unknown>(
          '/notification/register-device',
          { token, platform }
        )
        if (res.code === 200 || res.code === 201) {
          pushRegisteredRef.current = true
          setPushRegistered(true)
        }
      }
    } catch {
      // 静默失败，后端可能尚未实现该端点
    }
  }, [])

  useEffect(() => {
    void registerPush()
  }, [registerPush])

  const scanBle = useCallback(async (durationMs = 6000) => {
    setBleScanning(true)
    try {
      const devices = await scanBleDevices(durationMs)
      setBleDevices(devices)
    } finally {
      setBleScanning(false)
    }
  }, [])

  const connectBle = useCallback(async (deviceId: string) => {
    return connectBleDevice(deviceId)
  }, [])

  const requestHealthPermissions = useCallback(async () => {
    await requestHealthPerms()
  }, [])

  return {
    bleDevices,
    bleScanning,
    scanBle,
    connectBle,
    requestHealthPermissions,
    pushRegistered,
  }
}
