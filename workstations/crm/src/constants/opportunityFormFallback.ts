/**
 * 与 backend/apps/crm/opportunity_constants.py 保持一致；
 * 当 form-meta 接口未返回数据时用于下拉兜底展示。
 */
export const FALLBACK_SALES_STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'lead', label: '线索' },
  { value: 'deal', label: '商机' },
  { value: 'won', label: '赢单' },
  { value: 'cancelled', label: '取消' },
  { value: 'lost', label: '输单' },
]

export const FALLBACK_RESEARCH_GROUPS = [
  'C01',
  'C02',
  'C03',
  'C04',
  'C05',
  'C06',
  'C07',
  'C08',
  'C09',
  'C10',
  'C11',
  'C12',
  'C15',
  '统计组',
  '临床公共组',
  '创新研究组',
  '创新研究院',
  'TBD',
]

export const FALLBACK_BUSINESS_SEGMENTS = [
  'E-情绪/感官',
  'C-功效-皮肤',
  'C-功效-头发',
  'S-法规',
  'W-综合',
  'M-彩妆',
  'A-医美',
  'K-口腔',
  'Y-CRO',
  'F-功能食品',
  '孵化',
]

export const FALLBACK_DEMAND_STAGE_OPTIONS = [
  '早期，只是先来问问可行性和大致的成本',
  '已经有初步的计划了，在比方案的过程中',
  '方案已经大致思路有了，在比价的过程中',
  '基本已经确定了，是常规测试',
  '公司有竞标流程，我们可能是陪标的',
]
