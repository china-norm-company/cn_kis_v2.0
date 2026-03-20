/**
 * 易快报集成 API
 *
 * 对接 backend/apps/ekuaibao_integration/api.py 的所有端点。
 * 供管仲·财务台、采苓·研究台、维周·执行台、怀瑾·质量台使用。
 */
import { api } from '../client';

const BASE = '/api/v1/ekuaibao';

// ============ 类型定义 ============

export interface EkbStatus {
  total_batches: number;
  total_raw_records: number;
  injected_count: number;
  pending_count: number;
  conflict_count: number;
  latest_batch: string | null;
  latest_batch_status: string | null;
  local_backup_batches: number;
}

export interface EkbBatch {
  id: number;
  batch_no: string;
  phase: string;
  status: 'collecting' | 'collected' | 'injecting' | 'injected' | 'partial' | 'rolled_back' | 'failed';
  total_records: number;
  injected_records: number;
  conflict_count: number;
  skipped_count: number;
  created_at: string;
  collected_at?: string;
  injected_at?: string;
}

export interface EkbConflict {
  id: number;
  batch_no: string;
  module: string;
  ekb_id: string;
  conflict_type: 'exact_id' | 'exact_name' | 'fuzzy_name' | 'duplicate' | 'dual_track';
  similarity_score: number;
  resolution: 'pending' | 'use_ekb' | 'use_existing' | 'manual_merge' | 'skip';
  existing_table: string;
  diff_fields_count: number;
  diff_fields: Array<{ field: string; ekb: string; existing: string }>;
}

export interface EkbReconcileResult {
  module: string;
  generated_at: string;
  summary: {
    only_in_ekb_count: number;
    only_in_new_count: number;
    both_match_count: number;
    both_mismatch_count: number;
  };
  only_in_ekb: Array<{ ekb_id: string; flow_no?: string; amount?: number }>;
  only_in_new: Array<{ id: number; request_no: string; amount: number }>;
  both_mismatch: Array<{ ekb_id: string; ekb_amount: number; sys_amount: number }>;
}

export interface EkbInjectionLog {
  id: number;
  batch_no: string;
  module: string;
  ekb_id: string;
  action: 'created' | 'updated' | 'linked';
  target_table: string;
  target_id: number;
  target_workstation: string;
  rolled_back: boolean;
  created_at: string;
}

// ============ API 调用 ============

export const ekuaibaoApi = {
  getStatus: () =>
    api.get<{ data: EkbStatus }>(`${BASE}/status`),

  listBatches: (params?: { page?: number; page_size?: number }) =>
    api.get<{ data: { total: number; items: EkbBatch[] } }>(`${BASE}/batches`, { params }),

  getBatchDetail: (batchNo: string) =>
    api.get<{ data: EkbBatch & { raw_stats: Record<string, number>; modules: string[] } }>(
      `${BASE}/batches/${batchNo}`
    ),

  listConflicts: (params?: {
    batch_no?: string;
    module?: string;
    resolution?: string;
    page?: number;
    page_size?: number;
  }) =>
    api.get<{ data: { total: number; items: EkbConflict[] } }>(`${BASE}/conflicts`, { params }),

  resolveConflict: (conflictId: number, payload: {
    resolution: 'use_ekb' | 'use_existing' | 'manual_merge' | 'skip';
    note?: string;
    merged_data?: Record<string, unknown>;
  }) =>
    api.post(`${BASE}/conflicts/${conflictId}/resolve`, payload),

  getReconcile: (params?: { module?: string; batch_no?: string }) =>
    api.get<{ data: EkbReconcileResult }>(`${BASE}/reconcile`, { params }),

  listInjectionLogs: (params?: {
    batch_no?: string;
    workstation?: string;
    module?: string;
    rolled_back?: boolean;
    page?: number;
    page_size?: number;
  }) =>
    api.get<{ data: { total: number; items: EkbInjectionLog[] } }>(
      `${BASE}/injection-logs`,
      { params }
    ),

  listAttachments: (params?: {
    flow_id?: string;
    download_status?: string;
    page?: number;
    page_size?: number;
  }) =>
    api.get(`${BASE}/attachments`, { params }),

  // ── 财务知识图谱视图 ──

  /** 按客户汇总（进思·客户台）*/
  viewByClient: (params?: { client_name?: string }) =>
    api.get<{ data: Array<{
      client_id: number; client_name: string; project_count: number;
      expense_count: number; total_amount: number; by_status: Record<string, number>;
      projects: Array<{ code: string; title: string; expense_count: number; total_amount: number }>;
    }> }>(`${BASE}/views/by-client`, { params }),

  /** 按项目汇总（采苓·研究台 / 维周·执行台）*/
  viewByProject: (params?: { project_code?: string; client_name?: string }) =>
    api.get<{ data: Array<{
      protocol_id: number; code: string; title: string; client_name: string;
      budget_total: number; expense_total: number; execution_rate: number;
      expense_count: number; pending_count: number; rejected_count: number;
      by_department: Record<string, number>; by_template: Record<string, number>;
      // 飞书财务信号
      feishu_total: number; feishu_quotes: number; feishu_contracts: number;
      feishu_invoices: number; feishu_stipends: number; feishu_budgets: number;
      feishu_people: number;
    }> }>(`${BASE}/views/by-project`, { params }),

  /** 按部门汇总（时雨·人事台 / 管仲·财务台）*/
  viewByDepartment: (params?: { dept_name?: string }) =>
    api.get(`${BASE}/views/by-department`, { params }),

  /** 按申请人汇总（时雨·人事台）*/
  viewByPerson: (params?: { person_name?: string }) =>
    api.get(`${BASE}/views/by-person`, { params }),

  /** 单据完整详情含审批链 */
  viewExpenseDetail: (requestNo: string) =>
    api.get(`${BASE}/views/expense-detail/${requestNo}`),

  /** 组织架构树 */
  viewOrgTree: () =>
    api.get(`${BASE}/views/org-tree`),

  /** 审批流模板 */
  viewApprovalFlows: () =>
    api.get(`${BASE}/views/approval-flows`),

  // ── 财务知识图谱（飞书历史数据挖掘）──

  /** 项目财务信号（报价/合同/发票/礼金历史）*/
  viewFinancialSignals: (params?: {
    project_code?: string;
    signal_type?: 'quote' | 'contract' | 'invoice' | 'payment' | 'stipend' | 'budget';
    min_mentions?: number;
    page?: number;
    page_size?: number;
  }) =>
    api.get<{
      data: {
        items: Array<{
          project_code: string; project_title: string; protocol_id?: number;
          total_mentions: number;
          by_signal: { quote: number; contract: number; invoice: number;
                        payment: number; stipend: number; budget: number; };
          clients: string[]; source_types: string[]; people_count: number;
        }>;
      };
    }>(`${BASE}/views/financial-signals`, { params }),

  /** 受试者礼金信号汇总 */
  viewStipendSummary: (params?: { project_code?: string }) =>
    api.get<{
      data: Array<{
        project_code: string; project_title: string;
        stipend_mentions: number; sources: string[]; context_samples: string[];
      }>;
    }>(`${BASE}/views/financial-signals/stipend-summary`, { params }),

  /** 费用科目结构分析（报价/预算参考）*/
  viewCostStructure: (params?: { project_code?: string }) =>
    api.get<{
      data: Array<{
        cost_item: string; project_count: number;
        total_mentions: number; sample_projects: string[];
      }>;
    }>(`${BASE}/views/financial-signals/cost-structure`, { params }),

  /** 知识图谱查询 */
  viewKnowledgeGraph: (params?: {
    entity_type?: string; label_contains?: string;
    page?: number; page_size?: number;
  }) =>
    api.get(`${BASE}/views/knowledge-graph`, { params }),
};
