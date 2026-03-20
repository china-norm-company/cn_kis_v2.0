/**
 * 知识库 API 模块
 *
 * 对应后端：/api/v1/knowledge/
 */
import { api } from '../client'
import type { ApiListResponse } from '../types'

export type KnowledgeEntryType =
  | 'regulation'
  | 'sop'
  | 'proposal_template'
  | 'method_reference'
  | 'lesson_learned'
  | 'faq'

export interface KnowledgeEntry {
  id: number
  entry_type: KnowledgeEntryType
  title: string
  content: string
  summary: string
  tags: string[]
  source_type: string
  source_id: number | null
  source_key?: string
  version?: string
  status?: string
  quality_score?: number
  uri?: string
  namespace?: string
  superseded_by_id?: number | null
  embedding_id: string
  view_count: number
  is_published: boolean
  created_by_id: number | null
  owner_id?: number | null
  owner_name?: string
  reviewer_id?: number | null
  reviewer_name?: string
  next_review_at?: string | null
  create_time: string
  update_time: string
}

export interface KnowledgeTag {
  id: number
  name: string
  category: string
  usage_count: number
  create_time: string
}

export interface EntryCreateIn {
  entry_type: string
  title: string
  content: string
  summary?: string
  tags?: string[]
  source_type?: string
  source_id?: number
}

export interface HybridSearchParams {
  q: string
  entry_type?: string
  channels?: string
  top_k?: number
  graph_max_hops?: number
  graph_relation_types?: string
  graph_min_confidence?: number
}

export const knowledgeApi = {
  /** 创建知识条目 */
  createEntry(data: EntryCreateIn) {
    return api.post<KnowledgeEntry>('/knowledge/entries/create', data)
  },

  /** 知识条目列表 */
  listEntries(params?: {
    entry_type?: string; tags?: string; page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<KnowledgeEntry>['data']>('/knowledge/entries/list', { params })
  },

  /** 知识条目详情 */
  getEntry(id: number) {
    return api.get<KnowledgeEntry>(`/knowledge/entries/${id}`)
  },

  /** 更新知识条目 */
  updateEntry(id: number, data: Partial<EntryCreateIn> & { is_published?: boolean }) {
    return api.put<KnowledgeEntry>(`/knowledge/entries/${id}`, data)
  },

  /** 删除知识条目 */
  deleteEntry(id: number) {
    return api.delete(`/knowledge/entries/${id}`)
  },

  /** 搜索知识条目 */
  searchEntries(params: {
    query: string; entry_type?: string; tags?: string;
    page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<KnowledgeEntry>['data']>('/knowledge/entries/search', { params })
  },

  /** 从复盘沉淀 */
  depositFromRetrospective(retrospectiveId: number) {
    return api.post<KnowledgeEntry[]>('/knowledge/entries/deposit-from-retrospective', {
      retrospective_id: retrospectiveId,
    })
  },

  /** 从 SOP 沉淀 */
  depositFromSop(sopId: number) {
    return api.post<KnowledgeEntry[]>('/knowledge/entries/deposit-from-sop', { sop_id: sopId })
  },

  /** 标签列表 */
  listTags(category?: string) {
    return api.get<KnowledgeTag[]>('/knowledge/tags/list', { params: { category } })
  },

  /** 混合检索 */
  hybridSearch(params: HybridSearchParams) {
    return api.get('/knowledge/hybrid-search', { params })
  },
}
