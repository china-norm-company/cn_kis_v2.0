import { useState, useEffect } from 'react'
import { View, Text, Input, Textarea, Picker } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

const STEPS = [
  { key: 'project', title: '确认项目' },
  { key: 'basic', title: '基础资料' },
  { key: 'profile', title: '美丽档案' },
  { key: 'confirm', title: '确认提交' },
] as const

const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
]

const SKIN_TYPE_OPTIONS = [
  { label: '请选择（可选）', value: '' },
  { label: 'I型', value: 'I' },
  { label: 'II型', value: 'II' },
  { label: 'III型', value: 'III' },
  { label: 'IV型', value: 'IV' },
  { label: 'V型', value: 'V' },
  { label: 'VI型', value: 'VI' },
]

const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const router = useRouter()
  const planIdFromUrl = router.params?.plan_id ? Number(router.params.plan_id) : null

  const [stepIndex, setStepIndex] = useState(0)
  const [planId, setPlanId] = useState<number | null>(planIdFromUrl)
  const [planTitle, setPlanTitle] = useState<string>('')
  const [planLoading, setPlanLoading] = useState(false)

  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [email, setEmail] = useState('')
  const [medicalHistory, setMedicalHistory] = useState('')
  const [skinType, setSkinType] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = planIdFromUrl ?? planId
    if (id && !planTitle) {
      setPlanLoading(true)
      subjectApi.getPlanDetail(id)
        .then((res) => {
          const planData = res.data as { title?: string; id?: number } | null
          if (res.code === 200 && planData) {
            setPlanTitle(planData.title || '')
            setPlanId(planData.id || id)
          }
        })
        .catch(() => setError('项目信息加载失败'))
        .finally(() => setPlanLoading(false))
    }
  }, [planIdFromUrl, planId, planTitle])

  function validateBasic(): string | null {
    if (!gender) return '请选择性别'
    if (!age.trim()) return '请填写年龄'
    const a = Number(age)
    if (Number.isNaN(a) || a < 1 || a > 120) return '请填写有效年龄（1-120）'
    if (email.trim() && !emailReg.test(email.trim())) return '请填写正确邮箱格式'
    return null
  }

  function goNext() {
    setError(null)
    if (stepIndex === 0) {
      if (!planId) {
        setError('请从项目页选择项目后报名')
        return
      }
      setStepIndex(1)
      return
    }
    if (stepIndex === 1) {
      const err = validateBasic()
      if (err) {
        setError(err)
        Taro.showToast({ title: err, icon: 'none' })
        return
      }
      setStepIndex(2)
      return
    }
    if (stepIndex === 2) {
      setStepIndex(3)
      return
    }
  }

  function goPrev() {
    setError(null)
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
    else Taro.navigateBack()
  }

  async function handleSubmit() {
    if (!planId) {
      Taro.showToast({ title: '请选择报名项目', icon: 'none' })
      return
    }
    const err = validateBasic()
    if (err) {
      Taro.showToast({ title: err, icon: 'none' })
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await subjectApi.registerForPlan({
        plan_id: planId,
        gender: gender || undefined,
        age: age ? Number(age) : undefined,
        email: email.trim() || undefined,
        medical_history: medicalHistory.trim() || undefined,
        skin_type: skinType || undefined,
      })
      const regData = res.data as { registration_no?: string } | null
      if (res.code === 200 && regData?.registration_no) {
        try {
          const subscribeOptions: Parameters<typeof Taro.requestSubscribeMessage>[0] = {
            tmplIds: [
              process.env.WX_TPL_REGISTRATION_CONFIRM || '',
              process.env.WX_TPL_SCREENING_RESULT || '',
              process.env.WX_TPL_VISIT_REMINDER || '',
              process.env.WX_TPL_PAYMENT_ARRIVAL || '',
            ].filter(Boolean),
            entityIds: [],
          }
          await Taro.requestSubscribeMessage(subscribeOptions)
        } catch {
          // 用户拒绝授权不影响报名流程
        }
        Taro.showModal({
          title: '报名成功',
          content: `您的报名编号为 ${regData!.registration_no}，我们将尽快与您联系。`,
          showCancel: false,
        }).then(() => Taro.navigateBack())
      } else {
        setError(res?.msg || '报名失败，请重试')
        Taro.showToast({ title: res?.msg || '报名失败', icon: 'none' })
      }
    } catch {
      setError('网络异常，请重试')
      Taro.showToast({ title: '报名失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const stepKey = STEPS[stepIndex].key
  const isLastStep = stepIndex === STEPS.length - 1

  if (planIdFromUrl === null && !planId) {
    return (
      <View className='register-page'>
        <Text className='page-title'>自助报名</Text>
        <View className='form-card'>
          <Text className='section-text'>请从招募项目页选择项目后再报名。</Text>
          <Text className='link' onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>去首页</Text>
          <Text className='link' onClick={() => Taro.navigateTo({ url: '/subpackages/pkg/pages/projects/index' })}>查看招募项目</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='register-page'>
      <Text className='page-title'>自助报名</Text>
      <View className='step-indicator'>
        {STEPS.map((s, i) => (
          <View key={s.key} className={`step-dot ${i <= stepIndex ? 'active' : ''}`} />
        ))}
      </View>

      {error ? (
        <View className='form-error'>
          <Text>{error}</Text>
        </View>
      ) : null}

      {/* Step 0: 确认项目 */}
      {stepKey === 'project' && (
        <View className='form-card'>
          {planLoading ? (
            <Text className='section-text'>加载中…</Text>
          ) : (
            <>
              <Text className='section-heading'>报名项目</Text>
              <Text className='section-text'>{planTitle || `计划 #${planId}`}</Text>
              <Text className='section-hint'>确认后进入下一步填写资料</Text>
            </>
          )}
        </View>
      )}

      {/* Step 1: 基础资料 */}
      {stepKey === 'basic' && (
        <View className='form-card'>
          <Text className='section-heading'>基础资料</Text>
          <View className='form-group'>
            <Text className='form-label'>性别 <Text className='required'>*</Text></Text>
            <Picker
              mode='selector'
              range={GENDER_OPTIONS.map((o) => o.label)}
              onChange={(e) => setGender(GENDER_OPTIONS[Number(e.detail.value)]?.value ?? '')}
            >
              <View className='picker-value'>
                {GENDER_OPTIONS.find((o) => o.value === gender)?.label || '请选择性别'}
              </View>
            </Picker>
          </View>
          <View className='form-group'>
            <Text className='form-label'>年龄 <Text className='required'>*</Text></Text>
            <Input
              value={age}
              onInput={(e) => setAge(e.detail.value)}
              placeholder='1-120'
              className='form-input'
              type='number'
            />
          </View>
          <View className='form-group'>
            <Text className='form-label'>邮箱</Text>
            <Input
              value={email}
              onInput={(e) => setEmail(e.detail.value)}
              placeholder='选填，用于接收通知'
              className='form-input'
            />
          </View>
          <View className='form-group'>
            <Text className='form-label'>既往病史</Text>
            <Textarea
              value={medicalHistory}
              onInput={(e) => setMedicalHistory(e.detail.value)}
              placeholder='选填，请简要描述'
              className='form-textarea'
              maxlength={500}
            />
          </View>
        </View>
      )}

      {/* Step 2: 美丽档案 */}
      {stepKey === 'profile' && (
        <View className='form-card'>
          <Text className='section-heading'>美丽档案</Text>
          <Text className='section-hint'>用于消费者研究/皮肤类项目匹配，选填</Text>
          <View className='form-group'>
            <Text className='form-label'>皮肤类型</Text>
            <Picker
              mode='selector'
              range={SKIN_TYPE_OPTIONS.map((o) => o.label)}
              onChange={(e) => setSkinType(SKIN_TYPE_OPTIONS[Number(e.detail.value)]?.value ?? '')}
            >
              <View className='picker-value'>
                {SKIN_TYPE_OPTIONS.find((o) => o.value === skinType)?.label || '请选择（可选）'}
              </View>
            </Picker>
          </View>
        </View>
      )}

      {/* Step 3: 确认提交 */}
      {stepKey === 'confirm' && (
        <View className='form-card'>
          <Text className='section-heading'>确认信息</Text>
          <View className='confirm-row'><Text className='confirm-label'>项目</Text><Text>{planTitle || `#${planId}`}</Text></View>
          <View className='confirm-row'><Text className='confirm-label'>性别</Text><Text>{GENDER_OPTIONS.find((o) => o.value === gender)?.label || '-'}</Text></View>
          <View className='confirm-row'><Text className='confirm-label'>年龄</Text><Text>{age || '-'}</Text></View>
          <View className='confirm-row'><Text className='confirm-label'>邮箱</Text><Text>{email || '-'}</Text></View>
          <View className='confirm-row'><Text className='confirm-label'>既往病史</Text><Text>{medicalHistory ? `${medicalHistory.slice(0, 50)}${medicalHistory.length > 50 ? '…' : ''}` : '-'}</Text></View>
          {skinType ? <View className='confirm-row'><Text className='confirm-label'>皮肤类型</Text><Text>{SKIN_TYPE_OPTIONS.find((o) => o.value === skinType)?.label}</Text></View> : null}
        </View>
      )}

      <View className='submit-area'>
        <View className='btn-row'>
          <View className='btn-secondary' onClick={goPrev}>
            <Text>{stepIndex === 0 ? '返回' : '上一步'}</Text>
          </View>
          {!isLastStep ? (
            <View className='btn-primary' onClick={goNext}>
              <Text>下一步</Text>
            </View>
          ) : (
            <View
              className={`btn-primary ${submitting ? 'disabled' : ''}`}
              onClick={() => !submitting && handleSubmit()}
            >
              <Text>{submitting ? '提交中...' : '提交报名'}</Text>
            </View>
          )}
        </View>
        <Text className='submit-note'>提交后工作人员将电话与您联系确认</Text>
      </View>
    </View>
  )
}
