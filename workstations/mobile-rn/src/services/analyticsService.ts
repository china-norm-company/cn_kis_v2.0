/**
 * 埋点与 A/B 测试框架（P3.5）
 *
 * 功能：
 * 1. 页面 PV / 按钮点击事件上报
 * 2. A/B 实验分桶（基于 subject_id hash）
 * 3. 轻量本地缓存，离线时批量上报
 */
import type { ApiClient } from '@cn-kis/subject-core'

export type EventType =
  | 'page_view'
  | 'button_click'
  | 'form_submit'
  | 'error_shown'
  | 'feature_expose'

export interface AnalyticsEvent {
  event_type: EventType
  page: string
  element?: string
  extra?: Record<string, string | number | boolean>
  timestamp: string
  session_id?: string
}

const eventQueue: AnalyticsEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

export function trackEvent(
  eventType: EventType,
  page: string,
  element?: string,
  extra?: Record<string, string | number | boolean>,
) {
  eventQueue.push({
    event_type: eventType,
    page,
    element,
    extra,
    timestamp: new Date().toISOString(),
  })

  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    void flushEvents(null)
  }, 5000)
}

export async function flushEvents(apiClient: ApiClient | null): Promise<void> {
  if (eventQueue.length === 0) return
  const batch = eventQueue.splice(0, 50)
  if (!apiClient) return

  try {
    await apiClient.post('/analytics/events', { events: batch })
  } catch {
    eventQueue.unshift(...batch)
  }
}

export function trackPageView(page: string, extra?: Record<string, string | number | boolean>) {
  trackEvent('page_view', page, undefined, extra)
}

export function trackButtonClick(page: string, element: string, extra?: Record<string, string | number | boolean>) {
  trackEvent('button_click', page, element, extra)
}

// ---- A/B 测试 ----

export type ExperimentVariant = 'control' | 'treatment_a' | 'treatment_b'

export interface Experiment {
  id: string
  variants: ExperimentVariant[]
  weights: number[]
}

function hashSubjectId(subjectId: number): number {
  let h = 5381
  const s = String(subjectId)
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i)
    h = h & h
  }
  return Math.abs(h) % 100
}

export function getExperimentVariant(
  experiment: Experiment,
  subjectId: number,
): ExperimentVariant {
  const bucket = hashSubjectId(subjectId)
  let cumulative = 0
  for (let i = 0; i < experiment.variants.length; i++) {
    cumulative += experiment.weights[i] ?? 0
    if (bucket < cumulative) {
      return experiment.variants[i] as ExperimentVariant
    }
  }
  return experiment.variants[0] as ExperimentVariant
}

export const EXPERIMENTS: Record<string, Experiment> = {
  diary_reminder_time: {
    id: 'diary_reminder_time',
    variants: ['control', 'treatment_a'],
    weights: [50, 50],
  },
  gamification_display: {
    id: 'gamification_display',
    variants: ['control', 'treatment_a', 'treatment_b'],
    weights: [34, 33, 33],
  },
}
