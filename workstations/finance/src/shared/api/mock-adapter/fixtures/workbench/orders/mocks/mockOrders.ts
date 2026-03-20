import type { Opportunity } from "@/entities/sales/domain";

export type MockOrderStage = "草稿" | "确认" | "执行中" | "已完成" | "已取消";

export interface MockOrder {
  id: string;
  /**
   * 关联来源商机（用于从赢单商机立项生成订单）
   */
  source_opportunity_id: string;

  // ===== 商务信息（可从商机自动生成/预填）=====
  opportunity_code?: string;
  opportunity_name?: string;
  sales_stage?: string;
  business_segment?: string;
  business_type?: string;
  estimated_amount?: number;
  sales_amount?: number;
  expected_start_date?: string;
  schedule_time?: string;
  opportunity_source?: string;
  research_group?: string;
  efficacy_claims?: string;
  customer_name?: string;
  contact_name?: string;
  owner?: string;
  remarks?: string;
  created_time?: string;
  updated_time?: string;

  // ===== 订单信息（需填写）=====
  project_code: string;
  inquiry_code?: string;
  project_name: string;
  applicant_code: string;
  applicant_name: string;
  client_expected_start_date?: string;
  client_expected_delivery_date?: string;
  order_stage: MockOrderStage;
  order_status: MockOrderStage;

  // 执行信息
  researcher?: string;
  principal_investigator?: string; // 研究负责人（表单用）
  project_manager?: string; // 项目经理（表单用）
  center?: string;
  execution_site?: string;
  delivery_date?: string; // 交付日期（表单用）
  internal_remarks?: string; // 内部备注（表单用）
  contract_amount?: number; // 合同金额（表单用）
  prepayment_ratio?: number; // 预付款比例 %（表单用）

  // 外场地要求
  outdoor_site_requirements?: string;
  compliance_management_method?: string;
  compliance_management_frequency?: string;

  // 样本信息
  sample_group_count?: string;
  sample_expected_arrival_date?: string;
  sample_randomized?: "是" | "否";
  sample_name?: string;
  sample_category?: string;
  sample_storage_requirements?: string;
  sample_usage_method?: string;
  sample_standard_dosage?: string;
  sample_notes?: string;

  // 受试者信息
  subject_min_count?: string;
  subject_backup_count?: string;
  subject_age_range?: string;
  subject_age_quota?: string;
  subject_gender_quota?: string;
  subject_skin_type?: string;
  subject_skin_type_quota?: string;
  subject_sensitive?: "是" | "否";
  subject_sensitive_judgement?: string;
  subject_sensitive_quota?: string;
  subject_skin_state_requirements?: string;
  subject_grouped?: "是" | "否";
  subject_group_requirements?: string;
  subject_group_conditions?: string;
  subject_sample_special_requirements?: string;

  // 入排标准
  inclusion_criteria?: string;
  exclusion_criteria?: string;
  dropout_criteria?: string;

  // 访视计划
  visit_count?: string;
  visit_timepoints?: string;
  followup_requirements?: string;

  // 测试/评估
  test_type?: string;
  test_method?: string;
  test_metrics?: string;
  test_location?: string;
  test_requirements?: string;
  test_description?: string;
  test_sample_count_each_timepoint?: string;

  // 伦理审查
  ethics_required?: "是" | "否";
  ethics_channel?: string;
  ethics_material_date?: string;

  // PI要求
  pi_requirement?: string;
  pi_requirement_description?: string;

  // 交付要求
  delivery_milestones?: string;
  delivery_format?: string;
  delivery_notes?: string;

  // 随单提交附件（仅前端占位）
  attachments_note?: string;

  // 执行排期
  execution_schedule_range?: string;
  execution_schedule?: string;

  created_at: string;
  updated_at: string;
}

export const MOCK_ORDERS_STORAGE_KEY = "mock_orders_store_v1";

let mockOrdersStore: MockOrder[] | null = null;

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function initMockOrdersStore() {
  if (mockOrdersStore) return;
  if (canUseLocalStorage()) {
    const parsed = safeParseJson<MockOrder[]>(window.localStorage.getItem(MOCK_ORDERS_STORAGE_KEY));
    if (Array.isArray(parsed)) {
      mockOrdersStore = parsed;
      return;
    }
  }
  mockOrdersStore = [];
}

function persistMockOrdersStore() {
  if (!canUseLocalStorage() || !mockOrdersStore) return;
  try {
    window.localStorage.setItem(MOCK_ORDERS_STORAGE_KEY, JSON.stringify(mockOrdersStore));
  } catch {
    // ignore quota/serialization errors in mock mode
  }
}

export function toYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nextOrderCode(existingOrders: MockOrder[] = listMockOrders()): string {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const nums = existingOrders
    .map((o) => o.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.replace(prefix, "")))
    .filter((n) => Number.isFinite(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export function listMockOrders(): MockOrder[] {
  initMockOrdersStore();
  return [...(mockOrdersStore || [])];
}

export function addMockOrder(order: MockOrder) {
  initMockOrdersStore();
  mockOrdersStore = [order, ...(mockOrdersStore || [])];
  persistMockOrdersStore();
}

export function createMockOrderFromOpportunity(opp: Opportunity): Omit<MockOrder, "id" | "created_at" | "updated_at"> {
  const today = new Date().toISOString().split("T")[0];
  const suffix = String(opp.id || "").replace(/^OPP-/, "");
  const projectCode = suffix ? `PJ-${suffix}` : `PJ-${today.split("-").join("")}`;
  const inquiryCode = suffix ? `XQ-${suffix}` : undefined;

  return {
    source_opportunity_id: opp.id,
    opportunity_code: opp.id,
    opportunity_name: opp.title,
    sales_stage: opp.stage,
    business_segment: opp.business_segment,
    business_type: opp.business_type,
    estimated_amount: Number(opp.amount) || 0,
    sales_amount: Number(opp.sales_amount) || 0,
    expected_start_date: opp.expected_start_date,
    research_group: opp.research_group,
    efficacy_claims: opp.efficacy_claims,
    customer_name: opp.customerName,
    contact_name: opp.contact_name,
    owner: opp.owner,
    remarks: opp.remarks,
    created_time: opp.updated_at || opp.lastActivity,
    updated_time: opp.updated_at || opp.lastActivity,

    project_code: projectCode,
    inquiry_code: inquiryCode,
    project_name: `${opp.customerName || ""}${opp.title ? ` - ${opp.title}` : ""}`.trim() || opp.title,
    applicant_code: opp.customerId || "",
    applicant_name: opp.customerName || "",
    client_expected_start_date: opp.expected_start_date,
    order_stage: "草稿",
    order_status: "草稿",
  };
}

export function createAndStoreMockOrder(
  draft: Omit<MockOrder, "id" | "created_at" | "updated_at">
): MockOrder {
  const now = new Date();
  const created: MockOrder = {
    ...draft,
    id: nextOrderCode(),
    created_at: toYmd(now),
    updated_at: toYmd(now),
  };
  addMockOrder(created);
  return created;
}
