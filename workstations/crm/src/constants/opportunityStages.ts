import { FALLBACK_SALES_STAGE_OPTIONS } from './opportunityFormFallback'

/** 列表 / 详情 / 看板共用的商机阶段文案（含历史阶段兼容） */
export const OPPORTUNITY_STAGE_LABELS: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const o of FALLBACK_SALES_STAGE_OPTIONS) {
    m[o.value] = o.label
  }
  Object.assign(m, {
    contact: '接洽中',
    evaluation: '需求评估',
    proposal: '方案提交',
    negotiation: '商务谈判',
    initial_contact: '初步接触',
    requirement: '需求确认',
    quotation: '报价中',
    contract: '签约中',
  })
  return m
})()

export function opportunityStageLabel(stage: string): string {
  return OPPORTUNITY_STAGE_LABELS[stage] ?? stage
}
