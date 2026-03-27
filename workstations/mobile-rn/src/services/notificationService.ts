/**
 * RN App 推送通知服务（P1.3）
 *
 * 功能：
 * 1. 本地推送：每日 20:00 日记打卡提醒
 * 2. 远程推送：访视提醒（后端触发）
 * 3. 推送令牌注册：将 Expo Push Token 发送到后端
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

// 通知处理器：在前台时显示通知
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export interface NotificationConfig {
  onNotificationReceived?: (notification: Notifications.Notification) => void
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
}

/**
 * 请求推送权限并注册推送令牌
 * 返回 Expo Push Token（用于后端发送远程推送）
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!__DEV__ && Platform.OS === 'web') {
    console.warn('[Notifications] 仅在真机上支持推送通知')
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] 用户未授权推送通知')
    return null
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2B6CB0',
    })

    await Notifications.setNotificationChannelAsync('visit-reminders', {
      name: '访视提醒',
      importance: Notifications.AndroidImportance.HIGH,
      description: '研究访视安排和提醒',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2B6CB0',
    })

    await Notifications.setNotificationChannelAsync('diary-reminders', {
      name: '日记提醒',
      importance: Notifications.AndroidImportance.DEFAULT,
      description: '每日日记打卡提醒',
    })
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PROJECT_ID || undefined,
    })
    return token.data
  } catch (error) {
    console.error('[Notifications] 获取 Push Token 失败:', error)
    return null
  }
}

/**
 * 安排每日日记打卡提醒（每晚 20:00）
 */
export async function scheduleDailyDiaryReminder(): Promise<string | null> {
  // 取消已有的日记提醒，避免重复
  await cancelDiaryReminder()

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '日记打卡提醒',
        body: '今天的身体感受记录了吗？按时填写有助于研究质量 📝',
        data: { type: 'diary_reminder', screen: 'Diary' },
        sound: 'default',
        categoryIdentifier: 'diary-reminders',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      },
    })
    return identifier
  } catch (error) {
    console.error('[Notifications] 安排日记提醒失败:', error)
    return null
  }
}

/**
 * 安排访视提醒（提前 1 天提醒）
 */
export async function scheduleVisitReminder(
  visitDate: Date,
  visitName: string,
  visitId: number,
): Promise<string | null> {
  const reminderDate = new Date(visitDate)
  reminderDate.setDate(reminderDate.getDate() - 1)
  reminderDate.setHours(9, 0, 0, 0) // 前一天早上 9 点

  if (reminderDate <= new Date()) {
    return null // 已过期
  }

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '访视提醒',
        body: `明天是您的 "${visitName}" 访视，请提前准备好证件 🏥`,
        data: { type: 'visit_reminder', visitId, screen: 'Visit' },
        sound: 'default',
        categoryIdentifier: 'visit-reminders',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    })
    return identifier
  } catch (error) {
    console.error('[Notifications] 安排访视提醒失败:', error)
    return null
  }
}

/**
 * 取消所有日记提醒
 */
export async function cancelDiaryReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  const diaryReminders = scheduled.filter(
    (n) => (n.content.data as Record<string, unknown>)?.type === 'diary_reminder'
  )
  await Promise.all(diaryReminders.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)))
}

/**
 * 初始化通知监听器
 */
export function initNotificationListeners(config: NotificationConfig) {
  const { onNotificationReceived, onNotificationResponse } = config

  const receiveSubscription = onNotificationReceived
    ? Notifications.addNotificationReceivedListener(onNotificationReceived)
    : null

  const responseSubscription = onNotificationResponse
    ? Notifications.addNotificationResponseReceivedListener(onNotificationResponse)
    : null

  return () => {
    receiveSubscription?.remove()
    responseSubscription?.remove()
  }
}
