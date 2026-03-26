import { useState, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { taroApiClient, taroAuthProvider } from '@/adapters/subject-core'
import { getLocalRoles } from '@/utils/auth'
import { isQA, isManagement } from '@cn-kis/subject-core'
import './index.scss'

interface ChecklistItem {
  id: string
  category: string
  description: string
  result: 'pass' | 'fail' | 'na' | null
  note: string
}

const DEFAULT_CHECKLIST: Omit<ChecklistItem, 'result' | 'note'>[] = [
  { id: 'env_temp', category: '环境', description: '试验室温度在规定范围内（20-25°C）' },
  { id: 'env_humidity', category: '环境', description: '相对湿度在规定范围内（40-60%）' },
  { id: 'equip_cal', category: '设备', description: '所用设备均在校准有效期内' },
  { id: 'equip_clean', category: '设备', description: '设备清洁记录完整' },
  { id: 'doc_icf', category: '文件', description: '知情同意书版本与最新批准版本一致' },
  { id: 'doc_sop', category: '文件', description: 'SOP 文件已更新至最新版本' },
  { id: 'staff_qual', category: '人员', description: '当班人员资质证书在有效期内' },
  { id: 'sample_label', category: '样品', description: '样品标签信息完整（受试者ID/日期/编号）' },
  { id: 'sample_storage', category: '样品', description: '样品在规定条件下储存' },
  { id: 'crf_complete', category: 'CRF', description: '受试者数据录入无空缺关键字段' },
  { id: 'ae_report', category: '安全', description: '不良事件已在 24 小时内上报' },
]

const PATROL_TYPES = ['日常巡查', '专项检查', '设备检验', '文件审查', '人员资质', '样品检查']

export default function QaPatrolPage() {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    DEFAULT_CHECKLIST.map((item) => ({ ...item, result: null, note: '' }))
  )
  const [patrolType, setPatrolType] = useState(PATROL_TYPES[0])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [deviationPhoto, setDeviationPhoto] = useState<string | null>(null)

  const checkAccess = useCallback(() => {
    if (!taroAuthProvider.isLoggedIn()) {
      Taro.redirectTo({ url: '/pages/index/index' })
      return false
    }
    const roles = getLocalRoles()
    if (!isQA(roles) && !isManagement(roles)) {
      Taro.showToast({ title: '暂无权限，需要 QA 或管理层角色', icon: 'none' })
      Taro.redirectTo({ url: '/pages/index/index' })
      return false
    }
    return true
  }, [])

  useDidShow(() => {
    checkAccess()
  })

  const setResult = (id: string, result: 'pass' | 'fail' | 'na') => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, result } : item))
    )
  }

  const handlePhotoForDeviation = async (_itemId: string) => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['camera'],
      })
      if (res.tempFilePaths.length > 0) {
        setDeviationPhoto(res.tempFilePaths[0])
        Taro.showToast({ title: '照片已附加', icon: 'success' })
      }
    } catch {
      Taro.showToast({ title: '拍照失败', icon: 'none' })
    }
  }

  const handleSubmit = async () => {
    const unanswered = checklist.filter((item) => item.result === null)
    if (unanswered.length > 0) {
      Taro.showModal({
        title: '有未完成项',
        content: `还有 ${unanswered.length} 项未填写，是否继续提交？`,
        success: async (res) => {
          if (res.confirm) await doSubmit()
        },
      })
      return
    }
    await doSubmit()
  }

  const doSubmit = async () => {
    setSubmitting(true)
    try {
      const failedItems = checklist.filter((item) => item.result === 'fail')
      const hasDeviation = failedItems.length > 0

      const payload = {
        patrol_type: patrolType,
        patrol_date: new Date().toISOString().split('T')[0],
        checklist: checklist.map((item) => ({
          item_id: item.id,
          category: item.category,
          description: item.description,
          result: item.result || 'na',
          note: item.note,
        })),
        has_deviation: hasDeviation,
        deviation_count: failedItems.length,
        deviation_photo: deviationPhoto,
      }

      const res = await taroApiClient.post('/quality/deviations', payload)
      if (res.code === 200) {
        setSubmitted(true)
        Taro.showToast({ title: '巡查提交成功', icon: 'success' })
      } else {
        Taro.showToast({ title: (res as { msg?: string }).msg || '提交失败', icon: 'none' })
      }
    } catch {
      Taro.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const passCount = checklist.filter((i) => i.result === 'pass').length
  const failCount = checklist.filter((i) => i.result === 'fail').length
  const totalAnswered = checklist.filter((i) => i.result !== null).length

  if (submitted) {
    return (
      <View className='qa-patrol qa-patrol--done'>
        <View className='qa-patrol__success'>
          <Text className='qa-patrol__success-icon'>✅</Text>
          <Text className='qa-patrol__success-title'>巡查已提交</Text>
          <Text className='qa-patrol__success-sub'>
            通过 {passCount} 项 · 发现问题 {failCount} 项
          </Text>
          <View className='qa-patrol__back-btn' onClick={() => Taro.navigateBack()}>
            <Text className='qa-patrol__back-text'>返回</Text>
          </View>
        </View>
      </View>
    )
  }

  // 按类别分组
  const categories = [...new Set(checklist.map((i) => i.category))]

  return (
    <View className='qa-patrol'>
      <View className='qa-patrol__header'>
        <Text className='qa-patrol__title'>质量巡查</Text>
        <Text className='qa-patrol__progress'>
          {totalAnswered}/{checklist.length} 已完成
        </Text>
      </View>

      {/* 巡查类型选择 */}
      <View className='qa-patrol__type-row'>
        <ScrollView className='qa-patrol__type-scroll' scrollX>
          {PATROL_TYPES.map((type) => (
            <View
              key={type}
              className={`qa-patrol__type-chip ${patrolType === type ? 'qa-patrol__type-chip--active' : ''}`}
              onClick={() => setPatrolType(type)}
            >
              <Text className='qa-patrol__type-chip-text'>{type}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <ScrollView className='qa-patrol__list' scrollY>
        {categories.map((category) => (
          <View key={category} className='qa-patrol__category'>
            <Text className='qa-patrol__category-title'>{category}</Text>
            {checklist
              .filter((item) => item.category === category)
              .map((item) => (
                <View key={item.id} className={`qa-patrol__item ${item.result === 'fail' ? 'qa-patrol__item--fail' : ''}`}>
                  <Text className='qa-patrol__item-desc'>{item.description}</Text>
                  <View className='qa-patrol__item-actions'>
                    <View
                      className={`qa-patrol__btn ${item.result === 'pass' ? 'qa-patrol__btn--pass' : ''}`}
                      onClick={() => setResult(item.id, 'pass')}
                    >
                      <Text className='qa-patrol__btn-text'>通过</Text>
                    </View>
                    <View
                      className={`qa-patrol__btn ${item.result === 'fail' ? 'qa-patrol__btn--fail' : ''}`}
                      onClick={() => setResult(item.id, 'fail')}
                    >
                      <Text className='qa-patrol__btn-text'>不符</Text>
                    </View>
                    <View
                      className={`qa-patrol__btn ${item.result === 'na' ? 'qa-patrol__btn--na' : ''}`}
                      onClick={() => setResult(item.id, 'na')}
                    >
                      <Text className='qa-patrol__btn-text'>不适用</Text>
                    </View>
                  </View>
                  {item.result === 'fail' && (
                    <View className='qa-patrol__deviation-actions'>
                      <View
                        className='qa-patrol__photo-btn'
                        onClick={() => handlePhotoForDeviation(item.id)}
                      >
                        <Text className='qa-patrol__photo-text'>📷 拍照记录偏差</Text>
                      </View>
                      {deviationPhoto && (
                        <Text className='qa-patrol__photo-added'>照片已添加</Text>
                      )}
                    </View>
                  )}
                </View>
              ))}
          </View>
        ))}
      </ScrollView>

      <View className='qa-patrol__footer'>
        <View className='qa-patrol__summary'>
          <Text className='qa-patrol__summary-text'>
            通过 {passCount} · 问题 {failCount}
          </Text>
        </View>
        <View
          className={`qa-patrol__submit-btn ${submitting ? 'qa-patrol__submit-btn--loading' : ''}`}
          onClick={handleSubmit}
        >
          <Text className='qa-patrol__submit-text'>
            {submitting ? '提交中...' : '提交巡查报告'}
          </Text>
        </View>
      </View>
    </View>
  )
}
