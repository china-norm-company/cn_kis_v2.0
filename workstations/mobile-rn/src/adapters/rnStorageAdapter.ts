import type { StorageAdapter } from '@cn-kis/subject-core'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const rnStorageAdapter: StorageAdapter = {
  get: (key: string) => AsyncStorage.getItem(key),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value),
  remove: (key: string) => AsyncStorage.removeItem(key),
}
