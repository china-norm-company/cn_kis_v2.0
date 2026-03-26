import { View, Text, Slider, Textarea } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { taroApiClient } from '../../adapters/subject-core'

async function submitMyNps(data: { plan_id: number; score: number; comment: string }) {
  return taroApiClient.post('/my/nps', data)
}
import './index.scss'

const NPS_LABELS = ['完全不可能', '', '', '', '', '中立', '', '', '', '', '非常可能']

export default function NpsPage() {
  const router = useRouter()
  const planId = router.params.plan_id || ''
  const [score, setScore] = useState(8)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (loading) return
    setLoading(true)
    try {
      await submitMyNps({ plan_id: Number(planId) || 0, score, comment })
      setSubmitted(true)
      Taro.showToast({ title: '感谢您的反馈', icon: 'success' })
    } catch {
      Taro.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <View className="nps-page">
        <View className="success-card">
          <Text className="success-icon">✓</Text>
          <Text className="success-title">感谢您的反馈！</Text>
          <Text className="success-desc">您的意见对我们非常重要</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="nps-page">
      <View className="nps-card">
        <Text className="question">您有多大可能向朋友推荐参与我们的研究项目？</Text>

        <View className="score-display">
          <Text className="score-number">{score}</Text>
          <Text className="score-label">{NPS_LABELS[score] || ''}</Text>
        </View>

        <View className="slider-container">
          <View className="slider-labels">
            <Text>0</Text>
            <Text>5</Text>
            <Text>10</Text>
          </View>
          <Slider
            min={0}
            max={10}
            step={1}
            value={score}
            activeColor="#2B6CB0"
            onChange={(e) => setScore(e.detail.value)}
          />
        </View>

        <View className="comment-section">
          <Text className="comment-label">请告诉我们原因（选填）</Text>
          <Textarea
            className="comment-input"
            placeholder="您的建议将帮助我们改进服务..."
            value={comment}
            onInput={(e) => setComment(e.detail.value)}
            maxlength={500}
          />
        </View>

        <View className="submit-btn" onClick={handleSubmit}>
          <Text>{loading ? '提交中...' : '提交评分'}</Text>
        </View>
      </View>
    </View>
  )
}
