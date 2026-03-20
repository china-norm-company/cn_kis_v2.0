/**
 * 项目预算管理 API
 */

import { apiClient } from "@/shared/api/client";
import { createMockAdapterCaller } from "@/shared/api/mock-adapter";
import { getApiMode } from "@/shared/config/env";
import type { ProjectBudget, BudgetItem } from "@/entities/finance/domain";
import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";

// 财务模块：即使real模式也允许fallback到mock（因为后端API可能还未实现）
const callWithMock = createMockAdapterCaller({ 
  fallbackToMockOnError: true // 允许fallback，确保后端不可用时仍可使用mock数据
});

// ============= 后端响应类型 =============

interface BudgetResponse {
  data: ProjectBudget;
}

interface BudgetListResponse {
  data: {
    budgets: ProjectBudget[];
    total_records: number;
    total_pages: number;
    current_page: number;
  };
}

// ============= 请求类型 =============

export interface CreateBudgetRequest {
  project_code?: string;
  project_id?: number;
  project_name?: string;
  customer_name?: string;
  sales_manager?: string;
  budget_total?: number;
  budget_items?: Omit<BudgetItem, 'id' | 'budget_id' | 'actual_amount' | 'remaining_amount'>[];
  project_start_date?: string;
  project_end_date?: string;
  sample_count?: number;
  business_sector?: string;
}

export interface UpdateBudgetRequest extends Partial<CreateBudgetRequest> {
  id: number;
}

// ============= 持久化存储 =============

const BUDGETS_STORAGE_KEY = "mock_finance_budgets_store_v1";

const SEED_BUDGETS: ProjectBudget[] = [];

let budgetsStore: ProjectBudget[] | null = null;

function initBudgetsStore() {
  if (budgetsStore) return;
  
  if (canUseLocalStorage()) {
    const stored = safeParseJson<ProjectBudget[]>(
      window.localStorage.getItem(BUDGETS_STORAGE_KEY)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      budgetsStore = stored;
      return;
    }
  }
  
  budgetsStore = [...SEED_BUDGETS];
  persistBudgetsStore();
}

function persistBudgetsStore() {
  if (!canUseLocalStorage() || !budgetsStore) return;
  try {
    window.localStorage.setItem(BUDGETS_STORAGE_KEY, JSON.stringify(budgetsStore));
  } catch (error) {
    console.error("保存预算数据到localStorage失败:", error);
  }
}

function getBudgetsStore(): ProjectBudget[] {
  initBudgetsStore();
  return [...(budgetsStore || [])];
}

function addBudgetToStore(budget: ProjectBudget) {
  initBudgetsStore();
  if (!budgetsStore) budgetsStore = [];
  
  const maxId = budgetsStore.length > 0 
    ? Math.max(...budgetsStore.map(b => b.id))
    : 0;
  budget.id = maxId + 1;
  
  // 确保 budget_items 存在
  if (!budget.budget_items) {
    budget.budget_items = [];
  }
  
  // 计算统计字段
  calculateBudgetStats(budget);
  
  budgetsStore = [budget, ...budgetsStore];
  persistBudgetsStore();
  return budget;
}

function updateBudgetInStore(id: number, updates: Partial<ProjectBudget>) {
  initBudgetsStore();
  if (!budgetsStore) return null;
  
  const index = budgetsStore.findIndex(b => b.id === id);
  if (index === -1) return null;
  
  budgetsStore[index] = {
    ...budgetsStore[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  
  // 重新计算统计字段
  calculateBudgetStats(budgetsStore[index]);
  
  persistBudgetsStore();
  return budgetsStore[index];
}

function deleteBudgetFromStore(id: number) {
  initBudgetsStore();
  if (!budgetsStore) return false;
  
  const index = budgetsStore.findIndex(b => b.id === id);
  if (index === -1) return false;
  
  budgetsStore.splice(index, 1);
  persistBudgetsStore();
  return true;
}

// 计算预算统计字段
function calculateBudgetStats(budget: ProjectBudget) {
  // 计算实际总支出（从费用数据，暂时为0）
  const actualTotal = budget.budget_items.reduce((sum, item) => sum + (item.actual_amount || 0), 0);
  budget.actual_total = actualTotal;
  
  // 计算剩余预算
  budget.remaining_total = budget.budget_total - actualTotal;
  
  // 计算预算执行率
  budget.budget_execution_rate = budget.budget_total > 0 
    ? (actualTotal / budget.budget_total) * 100 
    : 0;
  
  // 更新每个预算项的剩余金额
  budget.budget_items.forEach(item => {
    item.remaining_amount = item.budget_amount - (item.actual_amount || 0);
  });
}

initBudgetsStore();

// ============= Mock 实现 =============

const mockBudgetsApi = {
  getBudgets: async (params?: {
    page?: number;
    page_size?: number;
    project_code?: string;
    customer_name?: string;
  }) => {
    try {
      const allBudgets = getBudgetsStore();
      console.log('[预算API] 获取到的预算数据:', allBudgets);
      let filtered = [...allBudgets];
      
      if (params?.project_code) {
        filtered = filtered.filter(b => b.project_code.includes(params.project_code!));
      }
      if (params?.customer_name) {
        filtered = filtered.filter(b => b.customer_name?.includes(params.customer_name!));
      }
      
      const page = params?.page || 1;
      const pageSize = params?.page_size || 20;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      
      const result = {
        budgets: filtered.slice(start, end),
        total_records: filtered.length,
        total_pages: Math.ceil(filtered.length / pageSize),
        current_page: page,
      };
      
      console.log('[预算API] 返回结果:', result);
      return result;
    } catch (error) {
      console.error('[预算API] 获取预算列表失败:', error);
      // 返回空列表，避免显示错误
      return {
        budgets: [],
        total_records: 0,
        total_pages: 0,
        current_page: 1,
      };
    }
  },
  
  getBudgetById: async (id: number): Promise<ProjectBudget | null> => {
    return getBudgetsStore().find(b => b.id === id) || null;
  },
  
  createBudget: async (data: CreateBudgetRequest): Promise<ProjectBudget> => {
    // 确保 budget_items 存在
    if (!data || !data.budget_items || !Array.isArray(data.budget_items)) {
      throw new Error('budget_items is required and must be an array');
    }
    
    const budgetItems: BudgetItem[] = data.budget_items.map((item, index) => ({
      id: index + 1,
      budget_id: 0, // 会在创建后更新
      item_name: item.item_name,
      item_type: item.item_type,
      budget_amount: item.budget_amount,
      actual_amount: 0,
      remaining_amount: item.budget_amount,
    }));
    
    const newBudget: ProjectBudget = {
      id: 0, // 会在addBudgetToStore中自动生成
      ...data,
      budget_total: data.budget_total ?? 0,
      budget_items: budgetItems,
      project_code: data.project_code ?? '',
      project_start_date: data.project_start_date ?? '',
      project_end_date: data.project_end_date ?? '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const created = addBudgetToStore(newBudget);
    
    // 更新预算项的budget_id
    created.budget_items.forEach(item => {
      item.budget_id = created.id;
    });
    persistBudgetsStore();
    
    return created;
  },
  
  updateBudget: async (data: UpdateBudgetRequest): Promise<ProjectBudget> => {
    if (!data || !data.id) {
      throw new Error('Budget id is required');
    }
    
    const { id, ...updates } = data;
    
    // 如果更新了 budget_items，需要处理
    if (updates.budget_items && Array.isArray(updates.budget_items)) {
      const budgetItems: BudgetItem[] = updates.budget_items.map((item: any, index: number) => ({
        id: index + 1,
        budget_id: id,
        item_name: item.item_name,
        item_type: item.item_type,
        budget_amount: item.budget_amount,
        actual_amount: item.actual_amount || 0,
        remaining_amount: (item.budget_amount || 0) - (item.actual_amount || 0),
      }));
      updates.budget_items = budgetItems;
    }
    
    const updated = updateBudgetInStore(id, updates as Partial<ProjectBudget>);
    if (!updated) {
      throw new Error('Budget not found');
    }
    return updated;
  },
  
  deleteBudget: async (id: number): Promise<void> => {
    const success = deleteBudgetFromStore(id);
    if (!success) {
      throw new Error('Budget not found');
    }
  },
};

// ============= API 实现 =============

export const budgetsApi = {
  /**
   * 获取预算列表
   */
  getBudgets: (params?: {
    page?: number;
    page_size?: number;
    project_code?: string;
    customer_name?: string;
  }) =>
    callWithMock(
      "finance.budgets.list",
      async () => {
        const response = await apiClient.get<BudgetListResponse>("/finance/budgets", { params: params as Record<string, unknown> });
        return response.data.data;
      },
      () => mockBudgetsApi.getBudgets(params)
    ),
  
  /**
   * 获取预算详情
   */
  getBudgetById: (id: number) =>
    callWithMock(
      "finance.budgets.getById",
      async () => {
        const response = await apiClient.get<BudgetResponse>(`/finance/budgets/${id}`);
        return response.data.data;
      },
      () => mockBudgetsApi.getBudgetById(id)
    ),
  
  /**
   * 创建预算
   */
  createBudget: (data: CreateBudgetRequest) =>
    callWithMock(
      "finance.budgets.create",
      async () => {
        const response = await apiClient.post<BudgetResponse>("/finance/budgets", data);
        return response.data.data;
      },
      () => mockBudgetsApi.createBudget(data)
    ),
  
  /**
   * 更新预算
   */
  updateBudget: (data: UpdateBudgetRequest) =>
    callWithMock(
      "finance.budgets.update",
      async () => {
        const { id, ...updateData } = data;
        const response = await apiClient.put<BudgetResponse>(`/finance/budgets/${id}`, updateData);
        return response.data.data;
      },
      () => mockBudgetsApi.updateBudget(data)
    ),
  
  /**
   * 删除预算
   */
  deleteBudget: (id: number) =>
    callWithMock(
      "finance.budgets.delete",
      async () => {
        await apiClient.delete(`/finance/budgets/${id}`);
      },
      () => mockBudgetsApi.deleteBudget(id)
    ),
};
