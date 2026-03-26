import { BleManager, Device } from 'react-native-ble-plx'

const manager = new BleManager()

export async function scanBleDevices(durationMs = 6000): Promise<Device[]> {
  return new Promise((resolve) => {
    const found: Record<string, Device> = {}
    manager.startDeviceScan(null, null, (_error, device) => {
      if (device?.id) found[device.id] = device
    })
    setTimeout(() => {
      manager.stopDeviceScan()
      resolve(Object.values(found))
    }, durationMs)
  })
}

export async function connectBleDevice(deviceId: string): Promise<Device> {
  const device = await manager.connectToDevice(deviceId, { timeout: 15000 })
  await device.discoverAllServicesAndCharacteristics()
  return device
}
