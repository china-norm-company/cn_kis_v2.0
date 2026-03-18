import { useState } from 'react'
import { View, Text, Textarea, Button, RadioGroup, Radio, Picker, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { taroApiClient } from '../../adapters/subject-core'
import './index.scss'

const SEVERITY_OPTIONS = [
  { label: '轻度', value: 'mild', desc: '不影响日常活动' },
  { label: '中度', value: 'moderate', desc: '部分影响日常活动' },
  { label: '重度', value: 'severe', desc: '严重影响日常活动' },
]

export default function ReportPage() {
  const [symptom, setSymptom] = useState('')
  const [severity, setSeverity] = useState('')
  const [occurDate, setOccurDate] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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
    // 表单校验
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

    setSubmitting(true)
    try {
      // 直接通过安全管理模块创建 AE 记录
      const res = await taroApiClient.post('/my/report-ae', {
        symptom_description: symptom.trim(),
        severity,
        occur_date: occurDate,
      })

      if (res.code === 200) {
        setSubmitted(true)
        Taro.showToast({ title: '上报成功', icon: 'success' })
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
          disabled={submitting}
        >
          {submitting ? '提交中...' : '提交上报'}
        </Button>
      </View>
    </View>
  )
}
