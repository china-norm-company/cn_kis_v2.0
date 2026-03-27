import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { taroApiClient } from '@/adapters/subject-core'
import { get } from '@/utils/api'
import { MiniPage, MiniCard, MiniButton } from '@/components/ui'
import './index.scss'

type ScanAction = 'checkin' | 'checkout' | 'already_checked_out' | null
type ResultStatus = 'idle' | 'success' | 'already_out' | 'fail'
interface ScanCheckinData {
  action?: ScanAction
  project_name?: string
  visit_point?: string
  location?: string
}

interface DashboardProject {
  project_code: string
  project_name: string
  visit_point: string
  queue_checkin_today: 'none' | 'checked_in' | 'checked_out'
  is_primary?: boolean
}

interface DashboardData {
  projects_ordered: Array<DashboardProject & { is_primary: boolean }>
}

export default function CheckinPage() {
  const [resultStatus, setResultStatus] = useState<ResultStatus>('idle')
  const [message, setMessage] = useState('')
  const [action, setAction] = useState<ScanAction>(null)
  const [stationLabel, setStationLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastErrorCode, setLastErrorCode] = useState<number | undefined>(undefined)

  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [selectedProjectCode, setSelectedProjectCode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProjectsLoading(true)
    get<DashboardData>('/my/home-dashboard', { silent: true }).then((res) => {
      if (cancelled) return
      const items = res.code === 200 ? (res.data?.projects_ordered ?? []) : []
      setProjects(items)
      if (items.length === 1) setSelectedProjectCode(items[0].project_code)
    }).finally(() => {
      if (!cancelled) setProjectsLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const canScan = !!selectedProjectCode && !loading

  const handleScan = () => {
    if (!selectedProjectCode) return
    setLoading(true)
    setResultStatus('idle')
    setMessage('')
    setAction(null)
    setStationLabel('')
    setLastErrorCode(undefined)

    Taro.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: async (res) => {
        setLoading(false)
        const qrContent = res.result || ''
        try {
          const postRes = await taroApiClient.post('/my/scan-checkin', {
            qr_content: qrContent,
            project_code: selectedProjectCode,
          })
          const data = postRes.data as ScanCheckinData | undefined
          const a: ScanAction = (data?.action ?? null) as ScanAction
          setAction(a)

          if (postRes.code === 200) {
            if (a === 'already_checked_out') {
              setResultStatus('already_out')
              setMessage(postRes.msg || '今日已完成签出，无需重复操作')
              Taro.showToast({ title: '已签出', icon: 'none', duration: 2000 })
            } else if (a === 'checkout') {
              setResultStatus('success')
              setMessage('签出成功！感谢您今日的配合')
              Taro.showToast({ title: '签出成功', icon: 'success' })
            } else {
              setResultStatus('success')
              const projectName = (data?.project_name || '').trim()
              const visitPoint = (data?.visit_point || '').trim()
              const detail = [projectName, visitPoint].filter(Boolean).join(' ')
              setMessage(detail ? `您已签到成功，${detail}` : '签到成功！请前往等候区等待叫号')
              const location = data?.location || ''
              if (location) setStationLabel(location)
              Taro.showToast({ title: '签到成功', icon: 'success' })
              setTimeout(() => {
                Taro.navigateTo({ url: '/subpackages/pkg/pages/queue/index' })
              }, 800)
            }
          } else {
            setResultStatus('fail')
            const code = (postRes.code as number) ?? 0
            setLastErrorCode(code)
            const backendMsg = postRes.msg || ''
            const msg =
              code === 401 || code === 403
                ? '登录已过期或未登录，请重新登录后再试'
                : code === 404
                ? (backendMsg || '未找到受试者信息，请先在首页绑定预约时登记的手机号')
                : backendMsg || '操作失败，请扫描接待台当日二维码'
            setMessage(msg)
            Taro.showToast({ title: msg, icon: 'none', duration: 2500 })
          }
        } catch {
          setLoading(false)
          setResultStatus('fail')
          setMessage('网络异常，请稍后重试')
        }
      },
      fail: (res) => {
        setLoading(false)
        setResultStatus('fail')
        const errMsg = res?.errMsg || '未知错误'
        if (errMsg.includes('cancel')) {
          setMessage('扫码已取消')
        } else {
          setMessage(`扫码失败: ${errMsg}`)
        }
      },
    })

    setTimeout(() => {
      setLoading((prev) => (prev ? false : prev))
    }, 3000)
  }

  const scanBtnText = loading
    ? '扫码中...'
    : resultStatus === 'success' && action === 'checkout'
    ? '再次扫码'
    : '扫码签到 / 签出'

  function checkinStatusLabel(v: DashboardProject['queue_checkin_today']): string {
    if (v === 'checked_in') return '已签到'
    if (v === 'checked_out') return '已签出'
    return '未签到'
  }

  return (
    <MiniPage title='扫码签到 / 签出' subtitle='扫描接待台大屏展示的当日二维码'>
      {/* 项目选择 */}
      {projectsLoading ? (
        <MiniCard className='text-center'>
          <Text className='checkin-hint'>加载项目中...</Text>
        </MiniCard>
      ) : projects.length === 0 ? (
        <MiniCard className='text-center'>
          <Text className='checkin-hint'>暂无参与项目，请先完成预约或入组</Text>
        </MiniCard>
      ) : (
        <View className='project-picker' data-testid='project-picker'>
          <Text className='project-picker__title'>请选择签到项目</Text>
          {projects.map((p) => {
            const selected = selectedProjectCode === p.project_code
            return (
              <View
                key={p.project_code}
                className={`project-picker__item${selected ? ' project-picker__item--selected' : ''}`}
                onClick={() => setSelectedProjectCode(p.project_code)}
                data-testid={`project-${p.project_code}`}
              >
                <View className='project-picker__radio'>
                  <View className={`project-picker__dot${selected ? ' project-picker__dot--active' : ''}`} />
                </View>
                <View className='project-picker__info'>
                  <Text className='project-picker__name'>{p.project_name || p.project_code}</Text>
                  {p.visit_point ? <Text className='project-picker__meta'>{p.visit_point}</Text> : null}
                  <Text className='project-picker__status'>{checkinStatusLabel(p.queue_checkin_today)}</Text>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <MiniCard className='text-center'>
        <Text className='checkin-icon'>📷</Text>
        <Text className='checkin-hint'>
          {resultStatus === 'idle'
            ? (projects.length > 0 && !selectedProjectCode ? '请先选择项目' : '请扫描接待台当日签到码')
            : resultStatus === 'already_out'
            ? '今日已完成全部签到签出操作'
            : resultStatus === 'fail'
            ? '请重新扫描接待台当日签到码'
            : ''}
        </Text>
        <MiniButton onClick={handleScan} disabled={!canScan} data-testid='scan-btn'>
          {scanBtnText}
        </MiniButton>
      </MiniCard>

      {resultStatus === 'success' && (
        <View className='mini-card checkin-result checkin-result--success' data-testid='result-success'>
          <Text className='checkin-result__text checkin-result__text--success'>✓ {message}</Text>
          {stationLabel ? (
            <Text className='checkin-result__hint checkin-result__hint--success'>
              签到点：{stationLabel}
            </Text>
          ) : null}
          {action === 'checkin' ? (
            <Text className='checkin-result__hint checkin-result__hint--success'>
              即将跳转到排队页面...
            </Text>
          ) : null}
        </View>
      )}

      {resultStatus === 'already_out' && (
        <View className='mini-card checkin-result checkin-result--info' data-testid='result-already-out'>
          <Text className='checkin-result__text'>ℹ {message}</Text>
        </View>
      )}

      {resultStatus === 'fail' && message && (
        <View className='mini-card checkin-result checkin-result--fail' data-testid='result-fail'>
          <Text className='checkin-result__text checkin-result__text--fail'>✗ {message}</Text>
          <Text className='checkin-result__hint checkin-result__hint--fail'>
            {lastErrorCode === 401 || lastErrorCode === 403
              ? '请退出后重新登录，或确认本地调试已按文档配置（后端 DEBUG + 旁路构建）'
              : lastErrorCode === 404
              ? '绑定手机号需与招募台预约登记一致'
              : '请确认扫描的是接待台当日场所码，非过期码'}
          </Text>
        </View>
      )}

    </MiniPage>
  )
}
