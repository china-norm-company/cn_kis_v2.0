import type { FinanceCustomer } from "@/entities/finance/customer-domain";

const STORAGE_KEY = "finance_customers";

/**
 * 初始化客户数据（种子数据）
 */
const SEED_CUSTOMERS: FinanceCustomer[] = [
  {
    id: 1,
    customer_code: "CUST001",
    customer_name: "上海家化联合股份有限公司",
    short_name: "上海家化",
    payment_term_days: 30,
    payment_term_description: "月结30天",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    customer_code: "CUST002",
    customer_name: "欧莱雅（中国）有限公司",
    short_name: "欧莱雅",
    payment_term_days: 60,
    payment_term_description: "月结60天",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 3,
    customer_code: "CUST003",
    customer_name: "宝洁（中国）有限公司",
    short_name: "宝洁",
    payment_term_days: 90,
    payment_term_description: "月结90天",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let customersStore: FinanceCustomer[] | null = null;

/**
 * 初始化客户存储
 */
export function initCustomersStore(): void {
  if (customersStore !== null) return;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      customersStore = JSON.parse(stored);
    } else {
      customersStore = [...SEED_CUSTOMERS];
      persistCustomersStore();
    }
  } catch (error) {
    console.error("[客户存储] 初始化失败:", error);
    customersStore = [...SEED_CUSTOMERS];
    persistCustomersStore();
  }
}

/**
 * 持久化客户数据
 */
function persistCustomersStore(): void {
  if (customersStore === null) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customersStore));
  } catch (error) {
    console.error("[客户存储] 持久化失败:", error);
  }
}

/**
 * 获取所有客户
 */
export function getCustomersStore(): FinanceCustomer[] {
  initCustomersStore();
  return customersStore || [];
}

/**
 * 添加客户
 * 注意：客户编号不要求唯一性，允许一个客户编号对应多个客户名称（同一客户的不同公司，如：欧莱雅中国和欧莱雅日本）
 */
export function addCustomerToStore(customer: Omit<FinanceCustomer, "id" | "created_at" | "updated_at">): FinanceCustomer {
  initCustomersStore();
  if (!customersStore) throw new Error("客户存储未初始化");
  
  // 如果没有提供客户编号，自动生成
  let customerCode = customer.customer_code;
  if (!customerCode) {
    const existingCodes = customersStore.map(c => c.customer_code).filter(Boolean);
    const maxNum = existingCodes
      .map(code => {
        const match = code.match(/\d+$/);
        return match ? parseInt(match[0]) : 0;
      })
      .reduce((max, num) => Math.max(max, num), 0);
    customerCode = `CUST${String(maxNum + 1).padStart(3, '0')}`;
  }
  
  const newId = Math.max(0, ...customersStore.map(c => c.id)) + 1;
  const newCustomer: FinanceCustomer = {
    ...customer,
    customer_code: customerCode, // 确保客户编号被设置
    id: newId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  customersStore.push(newCustomer);
  persistCustomersStore();
  return newCustomer;
}

/**
 * 更新客户
 */
export function updateCustomerInStore(id: number, updates: Partial<FinanceCustomer>): FinanceCustomer | null {
  initCustomersStore();
  if (!customersStore) return null;
  
  const index = customersStore.findIndex(c => c.id === id);
  if (index === -1) return null;
  
  customersStore[index] = {
    ...customersStore[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  persistCustomersStore();
  return customersStore[index];
}

/**
 * 删除客户
 */
export function deleteCustomerFromStore(id: number): boolean {
  initCustomersStore();
  if (!customersStore) return false;
  
  const index = customersStore.findIndex(c => c.id === id);
  if (index === -1) return false;
  
  customersStore.splice(index, 1);
  persistCustomersStore();
  return true;
}

/** 规范化名称用于匹配：去空格、转小写、去掉重音等，避免 "Comptabilité" 与 "Comptabilite" 不匹配 */
function normalizeForMatch(s: string): string {
  const t = (s || "").trim().toLowerCase();
  return t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * 根据客户名称查找客户（支持精确匹配、包含匹配、双向包含；忽略大小写与重音）
 */
export function findCustomerByName(customerName: string): FinanceCustomer | null {
  const trimmed = (customerName || "").trim();
  if (!trimmed) return null;
  const normalizedInput = normalizeForMatch(trimmed);
  const customers = getCustomersStore();
  return customers.find(c => {
    const name = (c.customer_name || "").trim();
    const short = (c.short_name || "").trim();
    if (name === trimmed || short === trimmed) return true;
    if (name && name.includes(trimmed)) return true;
    if (short && short.includes(trimmed)) return true;
    if (trimmed.includes(name) && name) return true;
    if (short && trimmed.includes(short)) return true;
    const normName = normalizeForMatch(name);
    const normShort = short ? normalizeForMatch(short) : "";
    if (normName && normalizedInput === normName) return true;
    if (normShort && normalizedInput === normShort) return true;
    if (normName && normName.includes(normalizedInput)) return true;
    if (normShort && normShort.includes(normalizedInput)) return true;
    if (normalizedInput.includes(normName) && normName) return true;
    if (normShort && normalizedInput.includes(normShort)) return true;
    return false;
  }) || null;
}
