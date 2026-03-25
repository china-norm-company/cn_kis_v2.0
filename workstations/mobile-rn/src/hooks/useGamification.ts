/**
 * 积分体系与游戏化 Hook（P2.3）
 *
 * 功能：
 * - 获取当前用户积分和徽章
 * - 完成日记后触发积分增加动画
 * - 显示连续打卡天数和徽章
 */
import { useState, useCallback } from 'react'
import type { ApiClient } from '@cn-kis/subject-core'

export interface LoyaltyScore {
  total_score: number
  participation_count: number
  completion_count: number
  compliance_avg: string
  last_activity_date: string | null
  risk_level: string
}

export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  earned: boolean
  earned_at?: string
}

export interface GamificationData {
  score: LoyaltyScore | null
  badges: Badge[]
  streak_days: number
  loading: boolean
  error: string | null
}

const BADGES: Badge[] = [
  {
    id: 'first_diary',
    name: '初探之笔',
    description: '第一次完成日记打卡',
    icon: '✍️',
    earned: false,
  },
  {
    id: 'streak_7',
    name: '七日坚持',
    description: '连续 7 天完成日记',
    icon: '🌟',
    earned: false,
  },
  {
    id: 'streak_30',
    name: '月度冠军',
    description: '连续 30 天完成日记',
    icon: '🏆',
    earned: false,
  },
  {
    id: 'perfect_visit',
    name: '零迟到',
    description: '准时完成 5 次访视',
    icon: '⏰',
    earned: false,
  },
  {
    id: 'questionnaire_master',
    name: '问卷达人',
    description: '完成 10 份问卷',
    icon: '📋',
    earned: false,
  },
  {
    id: 'referral_star',
    name: '推荐之星',
    description: '成功推荐 3 位朋友',
    icon: '⭐',
    earned: false,
  },
]

/**
 * 根据积分数据计算获得的徽章
 */
function computeBadges(score: LoyaltyScore): Badge[] {
  return BADGES.map((badge) => {
    let earned = false
    switch (badge.id) {
      case 'first_diary':
        earned = score.participation_count > 0
        break
      case 'streak_7':
        earned = score.participation_count >= 7
        break
      case 'streak_30':
        earned = score.participation_count >= 30
        break
      case 'perfect_visit':
        earned = score.completion_count >= 5
        break
      case 'questionnaire_master':
        earned = score.completion_count >= 10
        break
      case 'referral_star':
        earned = false // 由后端单独判断
        break
    }
    return { ...badge, earned }
  })
}

/**
 * 计算连续打卡天数（简单估算：根据 participation_count 和 last_activity_date）
 */
function computeStreakDays(score: LoyaltyScore): number {
  if (!score.last_activity_date) return 0
  const lastDate = new Date(score.last_activity_date)
  const today = new Date()
  const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays > 1) return 0
  return Math.min(score.participation_count, 30)
}

export function useGamification(apiClient: ApiClient, subjectId?: number) {
  const [data, setData] = useState<GamificationData>({
    score: null,
    badges: BADGES,
    streak_days: 0,
    loading: false,
    error: null,
  })

  const reload = useCallback(async () => {
    if (!subjectId) return
    setData((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const res = await apiClient.get<LoyaltyScore>(`/loyalty/subject/${subjectId}`)
      if (res.code === 200 && res.data) {
        const score = res.data as LoyaltyScore
        const badges = computeBadges(score)
        const streak_days = computeStreakDays(score)
        setData({ score, badges, streak_days, loading: false, error: null })
      } else {
        setData((prev) => ({ ...prev, loading: false, error: '加载积分数据失败' }))
      }
    } catch {
      setData((prev) => ({ ...prev, loading: false, error: '网络错误' }))
    }
  }, [apiClient, subjectId])

  return { ...data, reload }
}

export const SCORE_REWARDS = {
  diary_checkin: 10,
  visit_completed: 50,
  questionnaire_completed: 20,
  referral_success: 100,
  first_login: 5,
}
