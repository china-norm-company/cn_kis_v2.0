import { useQuery } from '@tanstack/react-query'
import { recruitmentApi } from '@cn-kis/api-client'
import type { RecruitmentPlan } from '@cn-kis/api-client'

/** 与初筛「全部计划」、预约管理「项目编号」共用，便于同步与失效刷新 */
export const RECRUITMENT_PLANS_SELECT_QUERY_KEY = ['recruitment', 'plans', 'select-active'] as const

/**
 * 进行中的招募计划（含 protocol_code，与预约 project_code 对齐）。
 * 短 stale + 轮询 + 窗口聚焦刷新，减少多页数据陈旧感。
 */
export function useActiveRecruitmentPlans() {
  return useQuery({
    queryKey: RECRUITMENT_PLANS_SELECT_QUERY_KEY,
    queryFn: async () => {
      const res = await recruitmentApi.listPlans({ status: 'active', page_size: 200 })
      return (res?.data?.items ?? []) as RecruitmentPlan[]
    },
    staleTime: 20 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 45 * 1000,
    refetchOnWindowFocus: true,
  })
}
