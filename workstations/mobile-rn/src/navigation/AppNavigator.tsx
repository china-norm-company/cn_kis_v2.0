import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../contexts/AuthContext'
import { isFieldExecutor, resolveLoginRoute } from '@cn-kis/subject-core'
import { HomeScreen } from '../screens/HomeScreen'
import { VisitScreen } from '../screens/VisitScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { LoginScreen } from '../screens/LoginScreen'
import { QuestionnaireScreen } from '../screens/QuestionnaireScreen'
import { ConsentScreen } from '../screens/ConsentScreen'
import { NotificationsScreen } from '../screens/NotificationsScreen'
import { AiChatScreen } from '../screens/AiChatScreen'
import { AppointmentScreen } from '../screens/AppointmentScreen'
import { CheckinScreen } from '../screens/CheckinScreen'
import { ReportScreen } from '../screens/ReportScreen'
import { ResultsScreen } from '../screens/ResultsScreen'
import { SupportScreen } from '../screens/SupportScreen'
import { IdentityVerifyScreen } from '../screens/IdentityVerifyScreen'
import { PaymentScreen } from '../screens/PaymentScreen'
import { ProjectsScreen } from '../screens/ProjectsScreen'
import { RegisterScreen } from '../screens/RegisterScreen'
import { QueueScreen } from '../screens/QueueScreen'
import { DiaryScreen } from '../screens/DiaryScreen'
import { ProductDetailScreen } from '../screens/ProductDetailScreen'
import { WorkorderDetailScreen } from '../screens/WorkorderDetailScreen'
import { MyQRCodeScreen } from '../screens/MyQRCodeScreen'
import { ReferralScreen } from '../screens/ReferralScreen'
import { ComplianceScreen } from '../screens/ComplianceScreen'
import { WithdrawScreen } from '../screens/WithdrawScreen'
import { NpsScreen } from '../screens/NpsScreen'
import { ScreeningStatusScreen } from '../screens/ScreeningStatusScreen'
import { SampleConfirmScreen } from '../screens/SampleConfirmScreen'
import { ProductsScreen } from '../screens/ProductsScreen'
import { TechnicianScreen } from '../screens/TechnicianScreen'
import { StudyTypesScreen } from '../screens/StudyTypesScreen'
import { RightsScreen } from '../screens/RightsScreen'
import { FaqScreen } from '../screens/FaqScreen'
import { DemoHeroScreen } from '../screens/DemoHeroScreen'

export type RootStackParamList = {
  Tabs: undefined
  StaffTabs: undefined
  Login: undefined
  Questionnaire: undefined
  Consent: undefined
  Notifications: undefined
  AiChat: undefined
  Appointment: undefined
  Checkin: undefined
  Report: undefined
  Results: undefined
  Support: undefined
  IdentityVerify: undefined
  Payment: undefined
  Projects: undefined
  Register: undefined
  Queue: undefined
  Diary: undefined
  ProductDetail: { dispensing_id?: number; id?: number }
  WorkorderDetail: { workorder_id?: number; id?: number }
  MyQRCode: undefined
  Referral: undefined
  Compliance: undefined
  Withdraw: undefined
  Nps: undefined
  ScreeningStatus: undefined
  SampleConfirm: undefined
  Products: undefined
  Technician: undefined
  StudyTypes: undefined
  Rights: undefined
  Faq: undefined
  DemoHero: undefined
}

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator<RootStackParamList>()

/** 受试者底部导航 */
function SubjectTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: '首页' }} />
      <Tab.Screen name="Visit" component={VisitScreen} options={{ title: '访视' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: '我的' }} />
    </Tab.Navigator>
  )
}

/** 员工（技术员/执行员）底部导航 */
function StaffTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Technician" component={TechnicianScreen} options={{ title: '工单' }} />
      <Tab.Screen name="Checkin" component={CheckinScreen} options={{ title: '扫码' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: '我的' }} />
    </Tab.Navigator>
  )
}

function SubjectStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={SubjectTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} options={{ title: '问卷' }} />
      <Stack.Screen name="Consent" component={ConsentScreen} options={{ title: '知情同意' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: '通知' }} />
      <Stack.Screen name="AiChat" component={AiChatScreen} options={{ title: 'AI 对话' }} />
      <Stack.Screen name="Appointment" component={AppointmentScreen} options={{ title: '预约' }} />
      <Stack.Screen name="Checkin" component={CheckinScreen} options={{ title: '扫码签到' }} />
      <Stack.Screen name="Report" component={ReportScreen} options={{ title: '报告' }} />
      <Stack.Screen name="Results" component={ResultsScreen} options={{ title: '检测结果' }} />
      <Stack.Screen name="Support" component={SupportScreen} options={{ title: '客服支持' }} />
      <Stack.Screen name="IdentityVerify" component={IdentityVerifyScreen} options={{ title: '实名认证' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: '礼金' }} />
      <Stack.Screen name="Projects" component={ProjectsScreen} options={{ title: '项目' }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: '报名' }} />
      <Stack.Screen name="Queue" component={QueueScreen} options={{ title: '排队' }} />
      <Stack.Screen name="Diary" component={DiaryScreen} options={{ title: '日记' }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '产品详情' }} />
      <Stack.Screen name="WorkorderDetail" component={WorkorderDetailScreen} options={{ title: '工单详情' }} />
      <Stack.Screen name="MyQRCode" component={MyQRCodeScreen} options={{ title: '我的二维码' }} />
      <Stack.Screen name="Referral" component={ReferralScreen} options={{ title: '转介绍' }} />
      <Stack.Screen name="Compliance" component={ComplianceScreen} options={{ title: '依从性' }} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} options={{ title: '退出研究' }} />
      <Stack.Screen name="Nps" component={NpsScreen} options={{ title: 'NPS 评分' }} />
      <Stack.Screen name="ScreeningStatus" component={ScreeningStatusScreen} options={{ title: '筛选状态' }} />
      <Stack.Screen name="SampleConfirm" component={SampleConfirmScreen} options={{ title: '样品确认' }} />
      <Stack.Screen name="Products" component={ProductsScreen} options={{ title: '产品' }} />
      <Stack.Screen name="Technician" component={TechnicianScreen} options={{ title: '技术员' }} />
      <Stack.Screen name="StudyTypes" component={StudyTypesScreen} options={{ title: '研究类型' }} />
      <Stack.Screen name="Rights" component={RightsScreen} options={{ title: '权益保障' }} />
      <Stack.Screen name="Faq" component={FaqScreen} options={{ title: '常见问题' }} />
      <Stack.Screen name="DemoHero" component={DemoHeroScreen} options={{ title: '演示' }} />
    </Stack.Navigator>
  )
}

function StaffStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="StaffTabs" component={StaffTabs} options={{ headerShown: false }} />
      <Stack.Screen name="WorkorderDetail" component={WorkorderDetailScreen} options={{ title: '工单详情' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: '通知' }} />
      <Stack.Screen name="AiChat" component={AiChatScreen} options={{ title: 'AI 对话' }} />
      <Stack.Screen name="StudyTypes" component={StudyTypesScreen} options={{ title: '研究类型' }} />
      <Stack.Screen name="Faq" component={FaqScreen} options={{ title: '常见问题' }} />
    </Stack.Navigator>
  )
}

function UnauthenticatedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  )
}

export function AppNavigator() {
  const { isLoggedIn, roles, accountType, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6f8fb' }}>
        <ActivityIndicator size="large" color="#2B6CB0" />
      </View>
    )
  }

  if (!isLoggedIn) {
    return <UnauthenticatedStack />
  }

  // 根据角色决定展示受试者路由还是员工路由
  const routeTarget = resolveLoginRoute(accountType || undefined, roles)
  const isStaff = routeTarget === 'technician_workbench' || routeTarget === 'reception_board' || routeTarget === 'staff_home'

  return isStaff ? <StaffStack /> : <SubjectStack />
}
