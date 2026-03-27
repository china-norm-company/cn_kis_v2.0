import type { UIAdapter } from '@cn-kis/subject-core'
import { Alert } from 'react-native'
import Toast from 'react-native-toast-message'

export const rnUIAdapter: UIAdapter = {
  toast: ({ title, icon = 'none' }) => {
    Toast.show({
      type: icon === 'success' ? 'success' : 'error',
      text1: title,
    })
  },
  modal: async ({ title, content }) => new Promise((resolve) => {
    Alert.alert(title, content, [
      { text: '取消', style: 'cancel', onPress: () => resolve({ confirm: false }) },
      { text: '确定', onPress: () => resolve({ confirm: true }) },
    ])
  }),
}
