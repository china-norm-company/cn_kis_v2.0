import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { AuthContextProvider } from './src/contexts/AuthContext'
import { AppNavigator } from './src/navigation/AppNavigator'
import {
  registerForPushNotifications,
  initNotificationListeners,
  scheduleDailyDiaryReminder,
} from './src/services/notificationService'
import { initOfflineDB, startAutoSync } from './src/services/offlineWorkorderService'
import { rnApiClient } from './src/adapters/rnApiClient'

function AppBootstrap({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void registerForPushNotifications()
    void scheduleDailyDiaryReminder()
    void initOfflineDB()
    const stopSync = startAutoSync(rnApiClient)
    const cleanupListeners = initNotificationListeners({})
    return () => {
      stopSync()
      cleanupListeners()
    }
  }, [])

  return <>{children}</>
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthContextProvider>
        <AppBootstrap>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </AppBootstrap>
      </AuthContextProvider>
      <Toast />
    </SafeAreaProvider>
  )
}
