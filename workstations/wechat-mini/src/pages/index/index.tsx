import { useState, useCallback, useEffect } from 'react'
import { View, Text, Button, Input, Checkbox } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { buildSubjectEndpoints, type VisitNodeItem } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '../../adapters/subject-core'
import { get, getCurrentApiBaseUrl, getCurrentChannel, getMyEnrollments, getMyBindingStatus, type MyEnrollmentsData } from '../../utils/api'
import { PAGE_COPY } from '../../constants/copy'
import type { UserInfo } from '@cn-kis/subject-core'
import HeroBrandAnimation from '../../components/ui/HeroBrandAnimation'
import { bindPhone, getLocalRouteTarget, needsPhoneBind, refreshRolesFromProfile } from '../../utils/auth'
import './index.scss'

const LOGIN_PAGE_BUILD = 'login-build-2026-02-28-hero-css-hi-fi'

/**
 * 根据角色跳转到对应工作台页面
 * 返回 true 表示发生了跳转（非受试者），false 表示留在首页
 */
function redirectByRole(): boolean {
  const target = getLocalRouteTarget()
  if (target === 'technician_workbench') {
    Taro.reLaunch({ url: '/pages/technician/index' })
    return true
  }
  if (target === 'reception_board') {
    Taro.reLaunch({ url: '/pages/reception-board/index' })
    return true
  }
  if (target === 'staff_home') {
    Taro.reLaunch({ url: '/pages/technician/index' })
    return true
  }
  return false
}

/** 下一次访视信息 */
interface NextVisit {
  name: string
  date: string
  windowInfo: string
}

interface QueuePositionInfo {
  position: number
  wait_minutes: number
  status: string
}

type LoginTraceEntry = { ts?: string; stage?: string; detail?: string; traceId?: string }

function toLoginTraceEntries(value: unknown): LoginTraceEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      ts: typeof item.ts === 'string' ? item.ts : undefined,
      stage: typeof item.stage === 'string' ? item.stage : undefined,
      detail: typeof item.detail === 'string' ? item.detail : undefined,
      traceId: typeof item.traceId === 'string' ? item.traceId : undefined,
    }))
}

const FLOW_STEPS = ['报名', '筛选', '预约', '访视', '反馈']
const FLOW_STEP_URLS: Record<string, string> = {
  报名: '/pages/register/index',
  筛选: '/pages/screening-status/index',
  预约: '/pages/appointment/index',
  访视: '/pages/visit/index',
  反馈: '/pages/support/index',
}
const GUEST_ACTIONS: Array<{ title: string; sub: string; url: string }> = [
  { title: '浏览可参与项目', sub: '先了解研究内容', url: '/pages/projects/index' },
  { title: '查看参与流程', sub: '了解完整服务步骤', url: '/pages/visit/index' },
  { title: '联系咨询支持', sub: '先提问再决定是否登录', url: '/pages/support/index' },
  { title: '研究类型', sub: '临床测试/消费者研究/HUT/真实世界研究', url: '/pages/study-types/index' },
  { title: '权益保障', sub: '知情同意与受试者权益', url: '/pages/rights/index' },
  { title: 'FAQ', sub: '常见问题解答', url: '/pages/faq/index' },
]

const subjectApi = buildSubjectEndpoints(taroApiClient)
const SHOW_DEBUG_INFO = process.env.NODE_ENV !== 'production'

export default function IndexPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [needsBind, setNeedsBind] = useState(false)
  const [binding, setBinding] = useState(false)
  const [bindPhoneVal, setBindPhoneVal] = useState('')
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [inputFocus, setInputFocus] = useState(true)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [nextVisit, setNextVisit] = useState<NextVisit | null>(null)
  const [queueInfo, setQueueInfo] = useState<QueuePositionInfo | null>(null)
  const [homeDataError, setHomeDataError] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginTrace, setLoginTrace] = useState('')
  const [enrollmentsData, setEnrollmentsData] = useState<MyEnrollmentsData | null>(null)

  const refreshLoginTrace = () => {
    try {
      const raw = Taro.getStorageSync('wechat_login_trace') || '[]'
      const traces = toLoginTraceEntries(JSON.parse(String(raw)))
      const latest = traces.length > 0 ? traces[traces.length - 1] : null
      if (latest) {
        setLoginTrace(`${latest.ts || ''} | ${latest.stage || ''} | ${latest.detail || ''} | ${latest.traceId || ''}`)
      } else {
        setLoginTrace('')
      }
    } catch {
      setLoginTrace('')
    }
  }

  useEffect(() => {
    setNeedsBind(needsPhoneBind())
  }, [])

  /** 获取下次访视提醒：优先用 /my/upcoming-visits（受试者有权限），否则用 visit/nodes */
  const fetchNextVisit = useCallback(async (user: UserInfo) => {
    try {
      // 受试者用 my.profile.read，/visit/nodes 需 visit.node.read 可能 403
      const upcomingRes = await get<{ items: Array<{ date: string; time?: string; purpose?: string }> }>('/my/upcoming-visits', { silent: true })
      if (upcomingRes.code === 200 && upcomingRes.data?.items?.length) {
        const first = upcomingRes.data.items[0]
        const dateStr = first.date
        const weekday = dateStr ? ['日', '一', '二', '三', '四', '五', '六'][new Date(dateStr).getDay()] : ''
        setNextVisit({
          name: first.purpose || '访视',
          date: dateStr ? `${dateStr} (周${weekday})` : '',
          windowInfo: first.time ? `预约时间: ${first.time}` : '',
        })
        return
      }
      const planId = user.planId
      const res = await subjectApi.getVisitNodes(planId ? Number(planId) : undefined)

      if (res.code === 200 && (res.data as { items?: VisitNodeItem[] })?.items?.length) {
        const nodes = ((res.data as { items: VisitNodeItem[] }).items).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

        const nextNode = nodes.find((n) => n.status === 'draft' || n.status === 'active')

        if (nextNode && user.enrollDate) {
          const base = new Date(user.enrollDate)
          base.setDate(base.getDate() + (nextNode.baseline_day ?? 0))
          const dateStr = base.toISOString().split('T')[0]
          const weekday = ['日', '一', '二', '三', '四', '五', '六'][base.getDay()]

          setNextVisit({
            name: nextNode.name,
            date: `${dateStr} (周${weekday})`,
            windowInfo: nextNode.window_before || nextNode.window_after
              ? `窗口期: -${nextNode.window_before} ~ +${nextNode.window_after} 天`
              : '',
          })
        }
      }
    } catch {
      // 静默处理，首页不阻塞展示
    }
  }, [])

  const fetchHomeData = useCallback(async (user: UserInfo) => {
    setHomeDataError('')
    try {
      // 检查手机号绑定状态，未绑定则跳转绑定页
      const bindRes = await getMyBindingStatus()
      if (bindRes.code === 200 && bindRes.data && !bindRes.data.is_bound) {
        Taro.navigateTo({ url: '/pages/bind-phone/index' })
        return
      }

      // 加载入组数据
      const enrollRes = await getMyEnrollments()
      if (enrollRes.code === 200 && enrollRes.data) {
        setEnrollmentsData(enrollRes.data)
      }

      await fetchNextVisit(user)
      const queueRes = await subjectApi.getQueuePosition()
      const queueData = queueRes.data as QueuePositionInfo | null
      if (queueRes.code === 200 && queueData && queueData.status !== 'none') {
        setQueueInfo(queueData)
      } else {
        setQueueInfo(null)
      }
    } catch {
      setQueueInfo(null)
      setHomeDataError('首页信息刷新失败，可点击重试')
    }
  }, [fetchNextVisit])

  useDidShow(() => {
    const lastLoginError = Taro.getStorageSync('last_login_error') || ''
    setLoginError(String(lastLoginError))
    refreshLoginTrace()

    if (needsPhoneBind()) {
      setNeedsBind(true)
      setLoggedIn(false)
      setUserInfo(null)
      setNextVisit(null)
      setQueueInfo(null)
      return
    }

    const tokenExists = taroAuthProvider.isLoggedIn()
    const user = taroAuthProvider.getLocalUserInfo()
    const logged = !!tokenExists && !!user

    if (!logged) {
      setLoggedIn(false)
      setUserInfo(null)
      setNextVisit(null)
      setQueueInfo(null)
      return
    }
    setNeedsBind(false)
    void refreshRolesFromProfile().then(() => {
      if (redirectByRole()) return
    })
    if (redirectByRole()) return
    setLoggedIn(true)
    setUserInfo(user!)
    void fetchHomeData(user!)
  })

  const handleLogin = async () => {
    if (loginSubmitting) return
    setLoginSubmitting(true)
    Taro.removeStorageSync('last_login_error')
    setLoginError('')
    refreshLoginTrace()
    try {
      const user = await taroAuthProvider.loginWithWechat()
      refreshLoginTrace()
      if (user) {
        if (needsPhoneBind()) {
          setNeedsBind(true)
          setLoggedIn(false)
          return
        }
        if (redirectByRole()) return
        setNeedsBind(false)
        setLoggedIn(true)
        setUserInfo(user)
        await fetchHomeData(user)
      } else {
        const lastLoginError = Taro.getStorageSync('last_login_error') || ''
        setLoginError(String(lastLoginError))
      }
    } finally {
      setLoginSubmitting(false)
    }
  }

  const handleBindPhone = async () => {
    const phone = bindPhoneVal.trim()
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入正确手机号', icon: 'none' })
      return
    }
    if (!privacyAgreed) {
      Taro.showToast({ title: '请先同意隐私说明', icon: 'none' })
      return
    }
    setBinding(true)
    try {
      const user = await bindPhone(phone)
      if (!user) return
      setNeedsBind(false)
      setBindPhoneVal('')
      setLoggedIn(true)
      setUserInfo(user)
      await fetchHomeData(user)
    } finally {
      setBinding(false)
    }
  }

  const navigateTo = (url: string) => {
    const isTabPage = url === '/pages/index/index' || url === '/pages/visit/index' || url === '/pages/profile/index'
    const navTask = isTabPage ? Taro.switchTab({ url }) : Taro.navigateTo({ url })
    navTask.catch(() => {
      Taro.showToast({ title: '页面打开失败，请重试', icon: 'none' })
    })
  }

  const renderHeroMedia = () => <HeroBrandAnimation />

  const renderHeroMiniMedia = () => <HeroBrandAnimation compact />

  const renderDebugInfo = () => (
    <View className='home-debug'>
      {loginError ? (
        <Text className='home-debug__error'>
          {loginError}
        </Text>
      ) : null}
      <Text className='home-debug__line'>{LOGIN_PAGE_BUILD}</Text>
      <Text className='home-debug__line'>
        CH: {getCurrentChannel()} | API: {getCurrentApiBaseUrl()}
      </Text>
      {loginTrace ? (
        <Text className='home-debug__line'>
          TRACE: {loginTrace}
        </Text>
      ) : null}
    </View>
  )

  // 未登录状态
  if (!loggedIn) {
    return (
      <View className='home-page'>
        <View className='home-hero-card'>
          <Text className='home-hero-card__badge'>Utest Research Service</Text>
          <View className='hero'>
            {renderHeroMedia()}
            <Text className='hero-title'>UTest</Text>
            <Text className='hero-subtitle'>临床研究受试者服务平台</Text>
            <Text className='hero-quote'>some day U bloom, some day U grow roots</Text>
          </View>
        </View>

        <View className='home-intro-card'>
          <Text className='home-intro-card__title'>机构介绍</Text>
          <Text className='home-intro-card__org'>优试消费者研究中心</Text>
          <Text className='home-intro-card__desc'>
            临床测试 · 消费者研究 · HUT · 真实世界研究
          </Text>
        </View>

        <View className='home-login-panel'>
          <Button className='home-login-panel__btn login-btn' onClick={handleLogin} disabled={loginSubmitting}>
            {loginSubmitting ? '登录中...' : '微信快捷登录'}
          </Button>
          <Button
            className='home-login-panel__btn home-login-panel__btn-secondary'
            onClick={() => navigateTo('/pages/phone-login/index')}
          >
            手机验证码登录
          </Button>
          <Text className='home-login-panel__tip'>{PAGE_COPY.index.loginTip}</Text>
          <Text className='home-login-panel__note'>
            登录用于预约、签到、问卷等个性化功能；你也可以先浏览服务内容后再决定是否登录
          </Text>
        </View>

        <View className='home-guest-actions'>
          <Text className='home-guest-actions__title'>先浏览，再决定是否登录</Text>
          <Text className='home-guest-actions__desc'>以下功能无需先授权即可体验</Text>
          <View className='home-guest-actions__grid'>
            {GUEST_ACTIONS.map((action) => (
              <View
                key={action.title}
                className='home-guest-actions__item'
                onClick={() => navigateTo(action.url)}
              >
                <Text className='home-guest-actions__item-title'>{action.title}</Text>
                <Text className='home-guest-actions__item-sub'>{action.sub}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className='home-flow-card'>
          <Text className='home-flow-card__title'>参与流程</Text>
          <Text className='home-flow-card__desc'>清晰了解每一步进度，减少等待与遗漏</Text>
          <View className='home-flow'>
            {FLOW_STEPS.map((step, index) => (
              <View className='home-flow__item' key={step} onClick={() => navigateTo(FLOW_STEP_URLS[step])}>
                <View className='home-flow__dot'>
                  <Text className='home-flow__num'>{index + 1}</Text>
                </View>
                <Text className='home-flow__label'>{step}</Text>
              </View>
            ))}
          </View>
        </View>
        {SHOW_DEBUG_INFO ? renderDebugInfo() : null}
      </View>
    )
  }

  // 需绑定手机号（首次登录）
  if (needsBind) {
    return (
      <View className='container'>
        <View className='hero'>
          <View className='hero-icon'>
            <Text className='hero-icon-text'>CN</Text>
          </View>
          <Text className='hero-title'>首次登录，请绑定手机号</Text>
          <Text className='hero-subtitle'>请输入您预约时登记的手机号，完成身份关联</Text>
        </View>
        <View className='px-6 mt-6'>
          <View className='privacy-notice mb-4 p-3 rounded-lg bg-slate-50 text-slate-600 text-sm'>
            <Text className='font-medium text-slate-700'>隐私与数据使用说明</Text>
            <Text className='block mt-1'>我们收集您的手机号仅用于关联预约、签到签出及研究相关通知，不会向第三方出售或泄露。绑定即表示您知悉并同意上述使用方式。</Text>
          </View>
          <View className='flex items-start mb-4' onClick={() => setPrivacyAgreed(!privacyAgreed)}>
            <Checkbox
              value='agree'
              checked={privacyAgreed}
              onClick={() => setPrivacyAgreed(!privacyAgreed)}
              className='mr-2 mt-0.5'
            />
            <Text className='text-sm text-slate-600' onClick={() => setPrivacyAgreed(!privacyAgreed)}>我已阅读并同意上述隐私与数据使用说明</Text>
          </View>
          <Input
            type='number'
            placeholder='请输入11位手机号'
            value={bindPhoneVal}
            onInput={(e) => setBindPhoneVal(e.detail.value)}
            onFocus={() => setInputFocus(false)}
            focus={inputFocus}
            adjustPosition
            maxlength={11}
            className='w-full h-12 px-4 border border-slate-200 rounded-lg text-base'
          />
          <Button
            className='btn-primary mt-4'
            onClick={handleBindPhone}
            disabled={binding || !bindPhoneVal.trim() || !privacyAgreed}
          >
            {binding ? '绑定中...' : '确认绑定'}
          </Button>
          <Text className='block mt-4 text-center text-slate-500 text-sm'>
            绑定后即可关联预约、查看项目信息、扫码签到，后续登录无需重复输入
          </Text>
        </View>
      </View>
    )
  }

  // 已登录状态
  return (
    <View className='home-page'>
      <View className='home-top-card'>
        <View className='home-hero-mini'>
          {renderHeroMiniMedia()}
        </View>
        <View className='home-top-card__main'>
          <Text className='home-top-card__title'>您好，{userInfo?.name || '受试者'}</Text>
          <Text className='home-top-card__sub'>编号: {userInfo?.subjectNo || '--'}</Text>
          <Text className='home-top-card__quote'>some day U bloom, some day U grow roots</Text>
        </View>
      </View>

      <View className='care-banner'>
        <Text className='care-banner__title'>温馨提醒</Text>
        <Text className='care-banner__text'>
          {nextVisit
            ? `下一次访视 ${nextVisit.date}，请提前准备证件与随访问卷。`
            : '当前暂无近期访视安排，建议关注项目通知。'}
        </Text>
        {homeDataError ? (
          <View className='care-banner__retry' onClick={() => userInfo && void fetchHomeData(userInfo)}>
            <Text className='care-banner__retry-text'>重新加载首页信息</Text>
          </View>
        ) : null}
      </View>

      <View className='home-task-card'>
        <Text className='home-task-card__title'>本周关键任务</Text>
        {nextVisit ? (
          <View className='home-task-card__item' onClick={() => navigateTo('/pages/visit/index')}>
            <Text className='home-task-card__name'>确认下一次访视时间</Text>
            <Text className='home-task-card__meta'>{nextVisit.date} · {nextVisit.name}</Text>
          </View>
        ) : null}
        {queueInfo ? (
          <View className='home-task-card__item' onClick={() => navigateTo('/pages/queue/index')}>
            <Text className='home-task-card__name'>查看现场排队状态</Text>
            <Text className='home-task-card__meta'>
              {queueInfo.status === 'waiting'
                ? `当前第${queueInfo.position}位，预计${queueInfo.wait_minutes}分钟`
                : '当前正在服务，请留意现场通知'}
            </Text>
          </View>
        ) : null}
        <View className='home-task-card__item' onClick={() => navigateTo('/pages/notifications/index')}>
          <Text className='home-task-card__name'>检查最新消息通知</Text>
          <Text className='home-task-card__meta'>避免错过预约调整与项目动态</Text>
        </View>
      </View>

      <View className='home-primary-actions'>
        <View className='home-primary-actions__btn' onClick={() => navigateTo('/pages/appointment/index')}>
          <Text className='home-primary-actions__title'>预约管理</Text>
          <Text className='home-primary-actions__sub'>预约/改期</Text>
        </View>
        <View className='home-primary-actions__btn' onClick={() => navigateTo('/pages/visit/index')}>
          <Text className='home-primary-actions__title'>访视进度</Text>
          <Text className='home-primary-actions__sub'>时间线/窗口期</Text>
        </View>
        <View className='home-primary-actions__btn' onClick={() => navigateTo('/pages/report/index')}>
          <Text className='home-primary-actions__title'>情况反馈</Text>
          <Text className='home-primary-actions__sub'>不良反应/问题</Text>
        </View>
      </View>

      {/* 入组状态卡片 */}
      {enrollmentsData && enrollmentsData.items.length > 0 ? (
        <View className='card status-card' data-testid='enrollment-card'>
          <View className='card-header'>
            <Text className='card-title'>入组状态</Text>
            <View className='badge badge-confirmed'>已入组</View>
          </View>
          <View className='status-info'>
            <View className='status-row'>
              <Text className='status-label'>项目名称</Text>
              <Text className='status-value'>{enrollmentsData.items[0]?.protocol_title || userInfo?.projectName || '--'}</Text>
            </View>
            {enrollmentsData.items[0]?.project_code ? (
              <View className='status-row'>
                <Text className='status-label'>项目编号</Text>
                <Text className='status-value'>{enrollmentsData.items[0].project_code}</Text>
              </View>
            ) : null}
            <View className='status-row'>
              <Text className='status-label'>入组日期</Text>
              <Text className='status-value'>{enrollmentsData.items[0]?.enrolled_at?.split('T')[0] || userInfo?.enrollDate || '--'}</Text>
            </View>
          </View>
        </View>
      ) : enrollmentsData?.has_appointment && enrollmentsData.pending_appointment ? (
        <View className='card status-card pending-card' data-testid='pending-appointment-card'>
          <View className='card-header'>
            <Text className='card-title'>入组状态</Text>
            <View className='badge badge-pending'>预约待确认</View>
          </View>
          <View className='status-info'>
            <View className='status-row'>
              <Text className='status-label'>项目</Text>
              <Text className='status-value'>{enrollmentsData.pending_appointment.project_name || '--'}</Text>
            </View>
            {enrollmentsData.pending_appointment.project_code ? (
              <View className='status-row'>
                <Text className='status-label'>项目编号</Text>
                <Text className='status-value'>{enrollmentsData.pending_appointment.project_code}</Text>
              </View>
            ) : null}
            {enrollmentsData.pending_appointment.visit_point ? (
              <View className='status-row'>
                <Text className='status-label'>访视点</Text>
                <Text className='status-value'>{enrollmentsData.pending_appointment.visit_point}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View className='card status-card' data-testid='no-enrollment-card'>
          <View className='card-header'>
            <Text className='card-title'>入组状态</Text>
            <View className='badge badge-waiting'>待入组</View>
          </View>
          <View className='status-info'>
            <Text className='status-placeholder'>暂无参与项目记录，如有预约请到现场报到</Text>
          </View>
        </View>
      )}

      {/* 下次访视提醒卡片 */}
      <View className='card visit-card'>
        <View className='card-header'>
          <Text className='card-title'>下次访视提醒</Text>
        </View>
        {nextVisit ? (
          <View className='visit-info'>
            <Text className='visit-date'>{nextVisit.date}</Text>
            <Text className='visit-name'>{nextVisit.name}</Text>
            {nextVisit.windowInfo ? (
              <Text className='visit-location'>{nextVisit.windowInfo}</Text>
            ) : null}
          </View>
        ) : (
          <View className='visit-info'>
            <Text className='visit-location'>暂无即将到来的访视</Text>
          </View>
        )}
      </View>

      {/* 排队状态卡片 */}
      {queueInfo && queueInfo.status === 'waiting' && (
        <View className='card queue-card queue-card--waiting'
          onClick={() => navigateTo('/pages/queue/index')}
        >
          <View className='card-header'>
            <Text className='card-title'>排队中</Text>
            <View className='badge queue-badge queue-badge--waiting'>
              第{queueInfo.position}位
            </View>
          </View>
          <View className='queue-card__row'>
            <Text className='queue-card__desc queue-card__desc--waiting'>
              预计等待约{queueInfo.wait_minutes}分钟
            </Text>
            <Text className='queue-card__hint'>点击查看详情 ›</Text>
          </View>
        </View>
      )}
      {queueInfo && queueInfo.status === 'serving' && (
        <View className='card queue-card queue-card--serving'>
          <View className='card-header'>
            <Text className='card-title'>正在为您服务</Text>
            <View className='badge queue-badge queue-badge--serving'>服务中</View>
          </View>
          <Text className='queue-card__desc queue-card__desc--serving'>
            请前往指定窗口
          </Text>
        </View>
      )}

      {/* 快捷操作 */}
      <View className='quick-actions'>
        <Text className='section-title'>快捷操作</Text>
        <Text className='section-subtitle'>高频服务入口，支持签到、随访、依从、不良反应上报与消息管理</Text>
        <View className='action-grid'>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/consent/index')}
          >
            <View className='action-icon action-icon-consent'>
              <Text className='action-icon-text'>签</Text>
            </View>
            <Text className='action-label'>签署知情同意书</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/questionnaire/index')}
          >
            <View className='action-icon action-icon-questionnaire'>
              <Text className='action-icon-text'>问</Text>
            </View>
            <Text className='action-label'>填写问卷</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/report/index')}
          >
            <View className='action-icon action-icon-report'>
              <Text className='action-icon-text'>报</Text>
            </View>
            <Text className='action-label'>不良反应上报</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/checkin/index')}
          >
            <View className='action-icon action-icon-checkin'>
              <Text className='action-icon-text'>到</Text>
            </View>
            <Text className='action-label'>扫码签到/签出</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/projects/index')}
          >
            <View className='action-icon action-icon-projects'>
              <Text className='action-icon-text'>找</Text>
            </View>
            <Text className='action-label'>项目发现</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/referral/index')}
          >
            <View className='action-icon action-icon-referral'>
              <Text className='action-icon-text'>荐</Text>
            </View>
            <Text className='action-label'>推荐朋友</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/screening-status/index')}
          >
            <View className='action-icon action-icon-screening'>
              <Text className='action-icon-text'>筛</Text>
            </View>
            <Text className='action-label'>筛选进度</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/notifications/index')}
          >
            <View className='action-icon action-icon-notify'>
              <Text className='action-icon-text'>通</Text>
            </View>
            <Text className='action-label'>消息通知</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/diary/index')}
          >
            <View className='action-icon action-icon-diary'>
              <Text className='action-icon-text'>记</Text>
            </View>
            <Text className='action-label'>每日日记</Text>
          </View>
          <View
            className='action-item'
            onClick={() => navigateTo('/pages/products/index')}
          >
            <View className='action-icon action-icon-products'>
              <Text className='action-icon-text'>产</Text>
            </View>
            <Text className='action-label'>我的产品</Text>
          </View>
        </View>
      </View>
      {SHOW_DEBUG_INFO ? renderDebugInfo() : null}
    </View>
  )
}
