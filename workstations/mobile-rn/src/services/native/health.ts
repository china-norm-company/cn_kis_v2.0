import AppleHealthKit from 'react-native-health'
import { requestPermission } from 'react-native-health-connect'

export async function requestHealthPermissions() {
  await requestPermission([
    { accessType: 'read', recordType: 'HeartRate' },
    { accessType: 'read', recordType: 'Steps' },
  ]).catch(() => undefined)
  await new Promise<void>((resolve) => {
    AppleHealthKit.initHealthKit(
      {
        permissions: {
          read: [AppleHealthKit.Constants.Permissions.HeartRate, AppleHealthKit.Constants.Permissions.Steps],
          write: [],
        },
      },
      () => resolve()
    )
  })
}
