import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { buildSubjectEndpoints, AUTH_LEVEL, isL2 } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import { shouldUseIdentityVerifyDevBypass } from '@/utils/api'
import { useState, useRef, useEffect } from 'react'

const subjectApi = buildSubjectEndpoints(taroApiClient)

function isIdentityStatusOk(res: { code?: number; data?: { auth_level?: string } }): boolean {
  return res?.code === 200 && !!res?.data && typeof res.data.auth_level === 'string'
}
import './index.scss'

const RESULT_STATUS = { PENDING: 'pending', VERIFIED: 'verified', REJECTED: 'rejected', EXPIRED: 'expired' } as const
const POLL_INTERVAL_MS = 3000

export default function IdentityVerifyPage() {
  const [authLevel, setAuthLevel] = useState<string>(AUTH_LEVEL.GUEST)
  const [verifyId, setVerifyId] = useState<string>('')
  const [h5ConfigId, setH5ConfigId] = useState<string>('')
  const [resultStatus, setResultStatus] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState<string>('')
  const [startError, setStartError] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  const refreshStatus = () => {
    subjectApi.getMyIdentityStatus().then((res) => {
      const statusData = res.data as { auth_level?: string } | undefined
      const statusRes = { ...res, data: statusData }
      if (isIdentityStatusOk(statusRes) && statusData) setAuthLevel(statusData.auth_level || AUTH_LEVEL.GUEST)
    }).catch(() => {})
  }

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const pollResult = (vid: string) => {
    if (cancelledRef.current) return
    subjectApi.getIdentityVerifyResult(vid).then((res) => {
      if (cancelledRef.current) return
      if (res.code !== 200 || !res.data) return
      const verifyData = res.data as { status?: string; reject_reason?: string }
      const status = verifyData.status
      setResultStatus(status || null)
      if (status === RESULT_STATUS.VERIFIED) {
        stopPolling()
        setAuthLevel(AUTH_LEVEL.IDENTITY_VERIFIED)
        refreshStatus()
        Taro.showToast({ title: '认证成功', icon: 'success' })
      } else if (status === RESULT_STATUS.REJECTED) {
        stopPolling()
        setRejectReason(verifyData.reject_reason || '核验未通过')
      } else if (status === RESULT_STATUS.EXPIRED) {
        stopPolling()
      } else {
        pollTimerRef.current = setTimeout(() => pollResult(vid), POLL_INTERVAL_MS)
      }
    }).catch(() => {
      if (!cancelledRef.current) pollTimerRef.current = setTimeout(() => pollResult(vid), POLL_INTERVAL_MS)
    })
  }

  useDidShow(() => {
    cancelledRef.current = false
    refreshStatus()
    return () => {
      cancelledRef.current = true
      stopPolling()
    }
  })

  useEffect(() => {
    return () => { stopPolling() }
  }, [])

  const handleStartVerify = async () => {
    setSubmitting(true)
    setResultStatus(null)
    setRejectReason('')
    setStartError('')
    if (shouldUseIdentityVerifyDevBypass()) {
      try {
        const res = await subjectApi.devSkipIdentityVerify()
        if (res.code === 200) {
          setAuthLevel(AUTH_LEVEL.IDENTITY_VERIFIED)
          refreshStatus()
          Taro.showToast({ title: '本地开发：已跳过实名核验', icon: 'success' })
        } else if (res.code === 404) {
          const hint =
            '本地后端需 DEBUG=true 且 .env 设置 IDENTITY_VERIFY_ALLOW_MANUAL_COMPLETE=true'
          setStartError(hint)
          Taro.showToast({ title: '请配置后端开发跳过', icon: 'none' })
        } else {
          Taro.showToast({ title: res?.msg || '跳过失败', icon: 'none' })
        }
      } catch {
        setStartError('请求失败，请确认本地后端已启动且已配置开发跳过')
        Taro.showToast({ title: '开发跳过请求失败', icon: 'none' })
      } finally {
        setSubmitting(false)
      }
      return
    }
    const res = await subjectApi.startIdentityVerify()
    setSubmitting(false)
    const startData = res.data as { verify_id?: string; byted_token?: string; h5_config_id?: string } | null
    if (res.code === 200 && startData?.verify_id) {
      if (!startData.byted_token) {
        setStartError('实名认证服务暂未开通，请联系研究中心管理员配置核身服务。')
        Taro.showToast({ title: '实名认证服务暂未开通', icon: 'none' })
        return
      }
      const vid = startData.verify_id
      setVerifyId(vid)
      setH5ConfigId(startData.h5_config_id || '')
      setResultStatus(RESULT_STATUS.PENDING)
      Taro.setStorageSync('identity_face_verify_token', startData.byted_token)
      Taro.showToast({ title: '已发起核验', icon: 'none' })
      if (startData.h5_config_id) {
        Taro.showModal({
          title: '开始核验',
          content: '将前往实名认证服务完成身份证与人脸核验，完成后返回本页查看结果。',
          confirmText: '我知道了',
          cancelText: '取消',
        }).then(() => {})
      }
      pollResult(vid)
    } else {
      Taro.showToast({ title: res?.msg || '发起失败', icon: 'none' })
    }
  }

  const handleRefreshResult = async () => {
    if (!verifyId) return
    pollResult(verifyId)
  }

  const handleRetry = () => {
    setVerifyId('')
    setResultStatus(null)
    setRejectReason('')
    handleStartVerify()
  }

  const handleBack = () => {
    stopPolling()
    Taro.switchTab({ url: '/pages/profile/index' })
  }

  if (isL2(authLevel)) {
    return (
      <View className='identity-verify-page'>
        <Text className='page-title'>实名认证</Text>
        <View className='status-card status-done'>
          <Text className='status-label'>您已完成实名认证</Text>
          <Text className='status-desc'>可正常使用签署知情同意书与礼金相关功能</Text>
        </View>
      </View>
    )
  }

  const pending = resultStatus === RESULT_STATUS.PENDING
  const rejected = resultStatus === RESULT_STATUS.REJECTED
  const expired = resultStatus === RESULT_STATUS.EXPIRED

  return (
    <View className='identity-verify-page'>
      <Text className='page-title'>实名认证</Text>
      <Text className='page-desc'>为保障您的权益与礼金发放合规，需完成身份证+人脸核验</Text>

      {!pending && !rejected && !expired ? (
        <View className='placeholder-card'>
          <Text className='placeholder-title'>开始认证</Text>
          <Text className='placeholder-desc'>点击下方按钮发起实名核验，系统将引导您完成身份证与人脸核验。</Text>
          <Button className='primary-btn' onClick={handleStartVerify} disabled={submitting}>
            {submitting ? '提交中...' : '开始认证'}
          </Button>
          {startError ? <Text className='placeholder-action'>{startError}</Text> : null}
        </View>
      ) : null}

      {pending ? (
        <View className='placeholder-card'>
          <Text className='placeholder-title'>核验进行中</Text>
          <Text className='placeholder-desc'>会话号：{verifyId.slice(0, 12)}… 请完成身份证与人脸核验后返回本页刷新状态。</Text>
          <Button className='primary-btn' onClick={handleRefreshResult} disabled={submitting}>
            {submitting ? '处理中...' : '刷新认证结果'}
          </Button>
          {h5ConfigId ? <Text className='placeholder-action'>若未自动跳转，可联系管理员提供核验入口。</Text> : null}
          <Text className='placeholder-action' onClick={handleBack}>取消并返回我的</Text>
        </View>
      ) : null}

      {rejected ? (
        <View className='placeholder-card status-rejected'>
          <Text className='placeholder-title'>核验未通过</Text>
          <Text className='placeholder-desc'>{rejectReason || '请检查身份证与本人一致后重试。'}</Text>
          <Button className='primary-btn' onClick={handleRetry} disabled={submitting}>
            {submitting ? '提交中...' : '重新认证'}
          </Button>
          <Text className='placeholder-action' onClick={handleBack}>返回我的</Text>
        </View>
      ) : null}

      {expired ? (
        <View className='placeholder-card status-expired'>
          <Text className='placeholder-title'>会话已过期</Text>
          <Text className='placeholder-desc'>核验会话已超时，请重新发起认证。</Text>
          <Button className='primary-btn' onClick={handleRetry} disabled={submitting}>
            {submitting ? '提交中...' : '重新认证'}
          </Button>
          <Text className='placeholder-action' onClick={handleBack}>返回我的</Text>
        </View>
      ) : null}
    </View>
  )
}
