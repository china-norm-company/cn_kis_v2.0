import { useState, useEffect } from 'react'
import { View, Text, Textarea, Button, RadioGroup, Radio, Picker, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { taroApiClient } from '@/adapters/subject-core'
import './index.scss'

interface AEProject {
  project_code: string
  project_name: string
  sc_number?: string
}

function formatProjectLabel(p: AEProject): string {
  const code = (p.project_code || '').trim()
  const name = (p.project_name || '').trim()
  if (code && name && name !== code) return `${code} · ${name}`
  return code || name || '未知项目'
}

const SEVERITY_OPTIONS = [
  { label: '轻微', value: 'mild', desc: '不影响日常活动' },
  { label: '中度', value: 'moderate', desc: '部分影响日常活动' },
  { label: '严重', value: 'severe', desc: '严重影响日常活动' },
  { label: '非常严重', value: 'very_severe', desc: '危及生命或需紧急医疗处置' },
]

export default function ReportPage() {
  const [symptom, setSymptom] = useState('')
  const [severity, setSeverity] = useState('')
  const [occurDate, setOccurDate] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projects, setProjects] = useState<AEProject[]>([])
  const [pickerIndex, setPickerIndex] = useState(0)
  const [selectedProjectCode, setSelectedProjectCode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProjectsLoading(true)
    taroApiClient
      .get('/my/ae-projects', undefined, { silent: true })
      .then((res) => {
        if (cancelled) return
        if (res.code !== 200 || !res.data) {
          setProjects([])
          return
        }
        const payload = res.data as { items?: AEProject[] }
        const rows = payload.items || []
        setProjects(rows)
        if (rows.length === 1) {
          setSelectedProjectCode(rows[0].project_code)
        } else if (rows.length > 1) {
          setPickerIndex(0)
          setSelectedProjectCode(rows[0].project_code)
        } else {
          setSelectedProjectCode(null)
        }
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleChoosePhoto = () => {
    Taro.chooseImage({
      count: 3 - photos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        setPhotos([...photos, ...res.tempFilePaths])
      },
    })
  }

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index))
  }

  const handleDateChange = (e: { detail: { value: string } }) => {
    setOccurDate(e.detail.value)
  }

  const handleSubmit = async () => {
    if (!symptom.trim()) {
      Taro.showToast({ title: '请描述症状', icon: 'none' })
      return
    }
    if (!severity) {
      Taro.showToast({ title: '请选择严重程度', icon: 'none' })
      return
    }
    if (!occurDate) {
      Taro.showToast({ title: '请选择发生时间', icon: 'none' })
      return
    }
    if (!projectsLoading && projects.length === 0) {
      Taro.showToast({
        title: '暂无已入组项目，请完成入组后再上报',
        icon: 'none',
        duration: 3500,
      })
      return
    }
    const projectCode =
      selectedProjectCode ?? (projects.length === 1 ? projects[0].project_code : null)
    if (!projectCode) {
      Taro.showToast({ title: '请选择所属项目', icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      const res = await taroApiClient.post(
        '/my/report-ae',
        {
          symptom_description: symptom.trim(),
          severity,
          occur_date: occurDate,
          project_code: projectCode,
        },
        { silent: true },
      )

      if (res.code === 200) {
        setSubmitted(true)
        Taro.showToast({ title: '上报成功', icon: 'success' })
      } else {
        Taro.showToast({
          title: res.msg || '上报失败',
          icon: 'none',
          duration: 4000,
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <View className='report-page'>
        <View className='success-container'>
          <View className='success-icon'>
            <Text className='success-icon-text'>✓</Text>
          </View>
          <Text className='success-title'>上报成功</Text>
          <Text className='success-desc'>
            研究团队将尽快处理您的不良反应报告。{'\n'}
            如有紧急情况，请立即联系研究医生。
          </Text>
          <Button
            className='btn-primary'
            onClick={() => Taro.navigateBack()}
          >
            返回
          </Button>
        </View>
      </View>
    )
  }

  return (
    <View className='report-page'>
      <View className='form-header'>
        <Text className='form-title'>不良反应上报</Text>
        <Text className='form-desc'>请如实描述您遇到的不良反应症状</Text>
      </View>

      <View className='form-card'>
        <Text className='field-label'>关联项目</Text>
        {projectsLoading ? (
          <Text className='report-enroll-hint'>正在加载您的项目信息…</Text>
        ) : projects.length === 0 ? (
          <View className='report-enroll-warning'>
            <Text className='report-enroll-warning__text'>
              您当前没有「正式入组」的项目记录。不良反应将记入具体项目，请待入组完成后再试，或联系研究中心。
            </Text>
          </View>
        ) : projects.length === 1 ? (
          <Text className='report-enroll-hint'>{formatProjectLabel(projects[0])}</Text>
        ) : (
          <>
            <Text className='report-enroll-hint'>您参与多个项目，请选择本次不良反应所属项目</Text>
            <Picker
              mode='selector'
              range={projects.map(formatProjectLabel)}
              value={pickerIndex}
              onChange={(e) => {
                const idx = Number(e.detail.value)
                if (Number.isFinite(idx) && projects[idx]) {
                  setPickerIndex(idx)
                  setSelectedProjectCode(projects[idx].project_code)
                }
              }}
            >
              <View className='date-picker'>
                <Text className='date-text'>
                  {formatProjectLabel(projects[pickerIndex] || projects[0])}
                </Text>
                <Text className='date-arrow'>›</Text>
              </View>
            </Picker>
          </>
        )}
      </View>

      {/* 症状描述 */}
      <View className='form-card'>
        <Text className='field-label'>
          症状描述 <Text className='required-mark'>*</Text>
        </Text>
        <Textarea
          className='symptom-textarea'
          placeholder='请详细描述您的症状，如：头痛、恶心、皮疹等...'
          value={symptom}
          onInput={e => setSymptom(e.detail.value)}
          maxlength={1000}
          autoHeight
        />
        <Text className='char-count'>{symptom.length}/1000</Text>
      </View>

      {/* 严重程度 */}
      <View className='form-card'>
        <Text className='field-label'>
          严重程度 <Text className='required-mark'>*</Text>
        </Text>
        <RadioGroup onChange={e => setSeverity(e.detail.value)}>
          <View className='severity-options'>
            {SEVERITY_OPTIONS.map(opt => (
              <View
                key={opt.value}
                className={`severity-item ${severity === opt.value ? 'severity-active' : ''}`}
              >
                <Radio
                  value={opt.value}
                  checked={severity === opt.value}
                  color='#2B6CB0'
                />
                <View className='severity-content'>
                  <Text className='severity-label'>{opt.label}</Text>
                  <Text className='severity-desc'>{opt.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </RadioGroup>
      </View>

      {/* 发生时间 */}
      <View className='form-card'>
        <Text className='field-label'>
          发生时间 <Text className='required-mark'>*</Text>
        </Text>
        <Picker
          mode='date'
          value={occurDate}
          onChange={handleDateChange}
          end={new Date().toISOString().split('T')[0]}
        >
          <View className='date-picker'>
            <Text className={`date-text ${occurDate ? '' : 'date-placeholder'}`}>
              {occurDate || '请选择发生日期'}
            </Text>
            <Text className='date-arrow'>›</Text>
          </View>
        </Picker>
      </View>

      {/* 照片上传 */}
      <View className='form-card'>
        <Text className='field-label'>照片（可选，最多3张）</Text>
        <View className='photo-grid'>
          {photos.map((p, i) => (
            <View key={i} className='photo-item'>
              <Image src={p} mode='aspectFill' className='photo-img' />
              <Text className='photo-remove' onClick={() => handleRemovePhoto(i)}>×</Text>
            </View>
          ))}
          {photos.length < 3 && (
            <View className='photo-add' onClick={handleChoosePhoto}>
              <Text className='photo-add-icon'>+</Text>
              <Text className='photo-add-text'>添加照片</Text>
            </View>
          )}
        </View>
      </View>

      {/* AE 历史记录入口 */}
      <View className='form-card' onClick={() => Taro.navigateTo({ url: '/pages/report/history' })}>
        <View className='report-history-entry'>
          <Text className='field-label report-history-entry__label'>查看我的上报记录</Text>
          <Text className='report-history-entry__arrow'>›</Text>
        </View>
      </View>

      {/* 提示信息 */}
      <View className='notice-card'>
        <Text className='notice-icon'>!</Text>
        <Text className='notice-text'>
          如遇严重不良反应或紧急情况，请立即拨打研究中心紧急联系电话。
        </Text>
      </View>

      {/* 提交按钮 */}
      <View className='form-footer'>
        <Button
          className='btn-primary'
          onClick={handleSubmit}
          disabled={submitting || projectsLoading || projects.length === 0}
        >
          {submitting ? '提交中...' : '提交上报'}
        </Button>
      </View>
    </View>
  )
}
