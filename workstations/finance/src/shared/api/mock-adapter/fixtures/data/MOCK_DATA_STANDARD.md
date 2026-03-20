# Mock数据规范文档

> **文档说明**：本文档统一管理所有Mock数据相关的规范、审计、设计方案和实施计划。后续所有关于Mock数据的更新都将在本文档中进行。

## 📋 目录

- [概述](#概述)
- [核心原则](#核心原则)
- [实现规范](#实现规范)
- [当前状态审计](#当前状态审计)
- [物资/标准/环境管理模块设计方案](#物资标准环境管理模块设计方案)
- [实施计划](#实施计划)

---

## 📋 概述

本文档定义了KIS原型项目中Mock数据的规范，确保在build+部署之后，所有用户都能看到演示数据，不会出现空白页面。

## 🎯 核心原则

### 1. **Seed数据必须存在**
- 所有Mock数据模块都应该有**Seed数据**（初始种子数据）
- Seed数据应该**硬编码在代码中**，随代码一起打包到build产物
- 确保首次访问的用户也能看到数据

### 2. **localStorage作为持久化层**
- localStorage用于**保存用户操作后的数据变更**
- 首次访问时，如果localStorage为空，应该**自动从Seed数据初始化**
- 用户的操作（增删改）应该保存到localStorage，刷新页面后仍然保留

### 3. **数据初始化模式**
所有Mock数据模块都应该遵循以下模式：

```typescript
// ✅ 正确模式：有Seed数据 + 自动初始化
const SEED_DATA: DataType[] = [
  // ... 初始数据
];

function initMockDataStore() {
  if (mockDataStore) return;
  if (canUseLocalStorage()) {
    const stored = safeParseJson<DataType[]>(
      window.localStorage.getItem(STORAGE_KEY)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      mockDataStore = stored;
      return;
    }
  }
  // 如果localStorage为空，使用Seed数据初始化
  mockDataStore = [...SEED_DATA];
  persistMockDataStore(); // 保存到localStorage
}
```

## 📁 目录结构规范

### Mock数据文件位置

```
src/
├── shared/api/mock-adapter/ # 统一 Mock 入口（种子数据 + 适配器）
│   ├── fixtures/            # 种子数据（resources/work-orders/...）
│   ├── handlers/            # Mock API 封装
│   └── mockStore.ts         # 通用工具函数
├── data/                    # 历史全局Mock数据（逐步迁移中）
│   ├── mockProtocols.ts     # 方案数据
│   ├── mockLeads.ts         # 线索数据
│   ├── mockSchedulerProjects.ts  # 排程项目数据
│   └── mockStore.ts         # 兼容层（转发至 mock-adapter/mockStore）
│
└── pages/workbench/
    └── [module]/
        └── mocks/           # 模块级Mock数据
            ├── [module]Store.ts  # 主存储文件（Seed数据+持久化）
            └── ...
```

## 🔧 实现规范

### 1. Seed数据定义

```typescript
// ✅ 好的示例：mockLeads.ts
import { LEADS as LEADS_SEED } from "@/features/sales/api/salesMocks";

// ✅ 好的示例：workOrdersStorage.ts
const createSeedStore = (): WorkOrdersStoreV1 => {
  const seeded = createTechnicianWorkOrdersFromSchedule({
    projectId: SCHEDULER_NEW_SEED_PROJECT_1003.projectCode,
    // ... 使用Seed数据
  });
  return {
    version: 1,
    workOrders: applyDemoProgress(seeded),
  };
};
```

### 2. 初始化函数

```typescript
// ✅ 标准初始化模式
function initMockDataStore() {
  if (mockDataStore) return; // 已初始化，直接返回
  
  if (canUseLocalStorage()) {
    const stored = safeParseJson<DataType[]>(
      window.localStorage.getItem(STORAGE_KEY)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      mockDataStore = stored;
      return;
    }
  }
  
  // localStorage为空或不可用，使用Seed数据
  mockDataStore = [...SEED_DATA];
  persistMockDataStore(); // 立即保存到localStorage
}
```

### 3. 持久化函数

```typescript
function persistMockDataStore() {
  if (!canUseLocalStorage() || !mockDataStore) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockDataStore));
}
```

### 4. 公共API函数

```typescript
// 读取数据（自动初始化）
export function listMockData(): DataType[] {
  initMockDataStore();
  return [...(mockDataStore || [])];
}

// 添加数据
export function addMockData(item: DataType) {
  initMockDataStore();
  mockDataStore = [item, ...(mockDataStore || [])];
  persistMockDataStore();
}

// 更新数据
export function updateMockData(id: number, patch: Partial<DataType>) {
  initMockDataStore();
  // ... 更新逻辑
  persistMockDataStore();
}

// 删除数据
export function deleteMockData(id: number) {
  initMockDataStore();
  // ... 删除逻辑
  persistMockDataStore();
}
```

## ✅ 最佳实践示例

### 示例1：线索数据（mockLeads.ts）

```typescript
import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";
import { LEADS as LEADS_SEED } from "@/features/sales/api/salesMocks";

export const MOCK_CRM_LEADS_STORAGE_KEY = "mock_crm_leads_store_v1";

let mockCrmLeadsStore: Lead[] | null = null;

function initMockCrmLeadsStore() {
  if (mockCrmLeadsStore) return;
  if (canUseLocalStorage()) {
    const parsed = safeParseJson<Lead[]>(
      window.localStorage.getItem(MOCK_CRM_LEADS_STORAGE_KEY)
    );
    if (Array.isArray(parsed) && parsed.length > 0) {
      mockCrmLeadsStore = parsed;
      return;
    }
  }
  // ✅ 使用Seed数据初始化
  mockCrmLeadsStore = [...LEADS_SEED];
  persistMockCrmLeadsStore();
}

function persistMockCrmLeadsStore() {
  if (!canUseLocalStorage() || !mockCrmLeadsStore) return;
  window.localStorage.setItem(
    MOCK_CRM_LEADS_STORAGE_KEY,
    JSON.stringify(mockCrmLeadsStore)
  );
}

export function listMockCrmLeads(): Lead[] {
  initMockCrmLeadsStore(); // ✅ 自动初始化
  return [...(mockCrmLeadsStore || [])];
}
```

### 示例2：工单数据（workOrdersStorage.ts）

```typescript
const createSeedStore = (): WorkOrdersStoreV1 => {
  // ✅ 使用Seed数据创建初始存储
  const seeded = createTechnicianWorkOrdersFromSchedule({
    projectId: SCHEDULER_NEW_SEED_PROJECT_1003.projectCode,
    // ...
  });
  return {
    version: 1,
    workOrders: applyDemoProgress(seeded),
  };
};

export const ensureWorkOrdersStore = (): WorkOrdersStoreV1 => {
  if (!isBrowser()) return createSeedStore();
  
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    // ✅ localStorage为空，使用Seed数据初始化
    const seed = createSeedStore();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
  
  // 解析已有数据
  try {
    const parsed = JSON.parse(existing) as WorkOrdersStoreV1;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.workOrders)) {
      return parsed;
    }
  } catch {
    // 解析失败，重置为Seed数据
  }
  
  // ✅ 数据格式错误，重置为Seed数据
  const seed = createSeedStore();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
};
```

## ❌ 常见错误

### 错误1：没有Seed数据，只依赖localStorage

```typescript
// ❌ 错误：如果localStorage为空，用户看不到任何数据
export function getMockProtocolsFromLocalStorage(): MockProtocolData[] {
  try {
    const data = localStorage.getItem('mock_protocols');
    if (data) {
      return JSON.parse(data);
    }
    return []; // ❌ 返回空数组，首次访问看不到数据
  } catch {
    return [];
  }
}
```

**修复方案**：
```typescript
// ✅ 正确：提供Seed数据
const SEED_PROTOCOLS: MockProtocolData[] = [
  // ... 初始数据
];

export function getMockProtocolsFromLocalStorage(): MockProtocolData[] {
  try {
    const data = localStorage.getItem('mock_protocols');
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // ✅ localStorage为空，返回Seed数据并保存
    updateMockProtocolsInLocalStorage(SEED_PROTOCOLS);
    return SEED_PROTOCOLS;
  } catch {
    return SEED_PROTOCOLS; // ✅ 出错时也返回Seed数据
  }
}
```

### 错误2：Seed数据在运行时生成，不在代码中

```typescript
// ❌ 错误：Seed数据依赖运行时环境
function createSeedData() {
  // 如果某些条件不满足，可能返回空数组
  if (!someCondition) return [];
  return generateData();
}
```

**修复方案**：
```typescript
// ✅ 正确：Seed数据硬编码在代码中
const SEED_DATA: DataType[] = [
  { id: 1, name: "示例数据1", ... },
  { id: 2, name: "示例数据2", ... },
  // ... 确保有足够的数据供演示
];
```

## 📊 数据量建议

### Seed数据应该包含：

1. **足够的演示数据**：每个列表页面至少3-10条数据
2. **多样化的状态**：包含不同状态的数据（待审核、已通过、已拒绝等）
3. **完整的数据结构**：确保所有字段都有示例值
4. **关联数据**：如果有数据关联，确保关联关系完整

## 🔍 检查清单

在创建或修改Mock数据模块时，请确保：

- [ ] **有Seed数据**：代码中定义了初始数据
- [ ] **自动初始化**：首次访问时自动从Seed数据初始化
- [ ] **持久化**：用户操作后保存到localStorage
- [ ] **错误处理**：localStorage不可用或数据损坏时有降级方案
- [ ] **数据量充足**：Seed数据足够演示功能
- [ ] **数据完整性**：Seed数据包含所有必要字段
- [ ] **状态多样性**：包含不同状态的数据示例

---

## 📊 当前状态审计

### ✅ 符合规范的模块

#### 1. **线索数据 (mockLeads.ts)**
- ✅ 有Seed数据：`LEADS_SEED`
- ✅ 自动初始化：`initMockCrmLeadsStore()`函数
- ✅ 持久化：`persistMockCrmLeadsStore()`函数
- ✅ 符合规范

#### 2. **工单数据 (workOrdersStorage.ts)**
- ✅ 有Seed数据：`createSeedStore()`函数
- ✅ 自动初始化：`ensureWorkOrdersStore()`函数
- ✅ 持久化：`writeWorkOrdersStore()`函数
- ✅ 符合规范

#### 3. **HR模块数据**
- ✅ 有Seed函数：`seedTrainingPlanMockData()`、`seedPersonnelCreateMockData()`等
- ✅ 在页面加载时自动初始化：`my-todo.tsx`中的`useEffect`
- ✅ 符合规范

### ⚠️ 需要改进的模块

#### 1. **方案数据 (mockProtocols.ts)**

**当前问题**：
- localStorage为空时返回空数组，没有Seed数据
- 首次访问看不到数据

**设计说明**：
根据`USAGE_GUIDE.md`，方案数据的设计是"所有方案都由用户上传时动态生成"，所以可能不需要预设Seed数据。

**建议**：
- **选项1**：保持当前设计，但需要在页面上提供明显的"上传示例方案"功能
- **选项2**：添加1-2个示例方案作为Seed数据，确保首次访问能看到数据

### ❓ 需要检查的模块

1. **客户数据 (customers.ts)** - 需要确认是否有Seed数据
2. **订单数据 (mockOrders.ts)** - 需要确认是否有Seed数据
3. **设备管理模块 (equipment-lims/mocks/)** - 需要确认各个子模块是否有Seed数据
4. **物资管理模块 (materials/)** - ⏳ **待设计**（见下方设计方案）
5. **环境管理模块 (environment/)** - ⏳ **待设计**（见下方设计方案）
6. **标准管理模块 (quality/standards/)** - ⏳ **待设计**（见下方设计方案）

---

## 📦 物资/标准/环境管理模块设计方案

> **说明**：以下3个模块是当前重点设计的模块，确保build+部署后所有用户都能看到演示数据。

### 🎯 设计原则

遵循上述规范：
- ✅ Seed数据必须存在（硬编码在代码中）
- ✅ 自动初始化（首次访问时从Seed数据初始化）
- ✅ localStorage持久化（用户操作后保存）
- ✅ 错误降级（localStorage不可用时仍能工作）

---

### 📦 模块1：物资管理模块

#### 当前状态
- ✅ 已有 `src/shared/api/mock-adapter/fixtures/resources/materials.ts` 文件
- ✅ 有基础数据结构和部分mock数据
- ❌ 数据存储在内存中，没有localStorage持久化
- ❌ 没有Seed数据初始化机制

#### 需要改造的内容

**1. 创建Mock数据存储文件**
- **文件路径**：`src/features/materials/testing/fixtures/materialsStore.ts`
- **功能**：定义Seed数据、实现localStorage持久化、提供统一的API接口

**2. 改造现有文件**
- **文件路径**：`src/shared/api/mock-adapter/fixtures/resources/materials.ts`
- **改造内容**：保留类型定义和工具函数，移除内存存储的数据，改为从 `materialsStore.ts` 导入数据

**3. Seed数据结构**
```typescript
// Seed数据包含：
- 标准物质分类数据（3-5个分类）
- 标准物质台账数据（10-15条记录）
- 易耗品台账数据（10-15条记录）
- 物资需求数据（5-8条需求）
- 需求清单数据（3-5条清单）
- 采购记录（5-8条）
- 验收记录（标准物质、易耗品各5-8条）
- 出库记录（8-10条）
- 期间核查计划（3-5条）
- 期间核查流程（2-3条）
- 信息变更流程（2-3条）
- 审核人员配置（3-5个配置）
```

**4. 子页面mock数据文件**
- ✅ `standardMaterialClassificationMocks.ts` - 标准物质分类（**已完成**）
- ✅ `standardMaterialLedgerMocks.ts` - 标准物质台账（**已完成**）
- `consumablesLedgerMocks.ts` - 易耗品台账
- `materialDemandMocks.ts` - 物资需求
- `demandListMocks.ts` - 需求清单
- `materialPurchaseMocks.ts` - 物资采购
- `consumablesAcceptanceMocks.ts` - 易耗品验收
- `standardMaterialAcceptanceMocks.ts` - 标准物质验收
- `materialOutboundMocks.ts` - 物资出库
- `standardMaterialVerificationPlanMocks.ts` - 期间核查计划
- `standardMaterialVerificationFlowMocks.ts` - 期间核查流程
- `standardMaterialChangeFlowMocks.ts` - 信息变更流程
- `demandAuditConfigMocks.ts` - 审核人员配置

**5. 标准物质分类数据结构（已实现）**

**文件路径**：`src/features/materials/testing/fixtures/standardMaterialClassificationMocks.ts`

**数据结构**：
```typescript
interface StandardMaterialClassification {
  id: string;
  categoryNo: string; // 标品分类编号（如：BYFL-030）
  categoryName: string; // 标品分类名称（如：雷磁电导率溶液14...）
  inventoryQuantity: number; // 库存数量（可为负数）
  safetyStockQuantity: number | null; // 安全库存数量（可为空）
  safetyStockReminderPerson: string | null; // 安全库存提醒人（可为空）
  createdAt: string;
  updatedAt: string;
}
```

**Seed数据说明**：
- ✅ 包含14条标准物质分类数据
- ✅ 数据包含不同的库存状态：
  - 存量库存（inventoryQuantity > 0）
  - 无存量库存（inventoryQuantity === 0）
  - 低存量库存（inventoryQuantity < 0 或 inventoryQuantity < safetyStockQuantity）
- ✅ 安全库存提醒人字段使用仿真环境中的角色人员姓名（如：张明、李华、王芳等）
- ✅ 部分数据设置了安全库存数量，部分数据安全库存为空

**功能特性**：
- ✅ 支持按标样分类编号、标样分类名称搜索
- ✅ 支持Tab切换查看不同库存状态（全部、存量库存、低存量库存、无存量库存）
- ✅ 支持表格列排序（标品分类编号、标品分类名称、库存数量、安全库存数量、安全库存提醒人）
- ✅ 支持复选框多选
- ✅ 支持新建、刷新、查询、重置操作
- ✅ 支持下载和打印功能（UI已实现，功能待完善）

**页面路径**：`/workbench/materials/standard-material-classification`

**6. 标准物质台账数据结构（已实现）**

**文件路径**：`src/features/materials/testing/fixtures/standardMaterialLedgerMocks.ts`

**数据结构**：
```typescript
interface StandardMaterialLedger {
  id: string;
  materialNo: string; // 标品编号（如：BY-292）
  materialName: string; // 标品名称（如：7%VC）
  categoryNo: string; // 标品分类编号（如：BYFL-022）
  categoryName: string; // 标品分类名称（如：7%VC）
  owningDepartment: string; // 归属部门
  usingDepartment: string | null; // 使用部门（可为空）
  detectionMethod: string; // 检测方法（如：不检测、性能比对、其他）
  inventoryQuantity: number; // 库存数量
  unit: string; // 单位（如：瓶、支、盒等）
  supplier: string; // 供应商
  storageLocation: string; // 存放位置
  isPeriodCheck: boolean; // 是否期间核查
  productionDate: string | null; // 生产日期
  expiryDate: string | null; // 有效期至
  lastVerificationDate: string | null; // 上次核查日期
  nextVerificationDate: string | null; // 下次核查日期
  verificationStatus: "normal" | "overdue" | "extended" | null; // 核查状态：正常、已过期、延期
  createdAt: string;
  updatedAt: string;
}
```

**Seed数据说明**：
- ✅ 包含45条标准物质台账数据
- ✅ 数据包含CRO和化妆品临床功效检测相关的标品：
  - 临床测试相关标品（19条）：7%VC、P2、S1、KCL溶液、pH标准溶液等
  - 化妆品功效检测相关标品（10条）：透明质酸钠、胶原蛋白、烟酰胺、视黄醇、维生素C、熊果苷、神经酰胺、多肽、胜肽、玻尿酸等
  - CRO相关标品（16条）：人血清白蛋白、葡萄糖、胆固醇、肌酐、尿素、ALT、AST、总蛋白、白蛋白、胆红素、肌酸激酶、乳酸脱氢酶、碱性磷酸酶、γ-谷氨酰转肽酶、C反应蛋白等
- ✅ 数据包含不同的保质期状态：
  - 保质期内（expiryDate >= 今天）
  - 已过期（expiryDate < 今天）
- ✅ 数据包含不同的期间核查状态：
  - 期间核查（isPeriodCheck === true）
  - 期间核查延期（verificationStatus === "extended"）
  - 核查已过期（verificationStatus === "overdue"）
- ✅ 归属部门包括：临床测试、特化测试、功效检测
- ✅ 使用部门包括：功效检测、化妆品检测、CRO检测（部分为空）
- ✅ 检测方法包括：不检测、性能比对、其他

**功能特性**：
- ✅ 支持按标品编号、标品名称、归属部门、使用部门搜索
- ✅ 支持Tab切换查看不同状态（全部、保质期内、已过期、期间核查、期间核查延期）
- ✅ 支持表格列排序（标品编号、标品名称、标品分类编号、标品分类名称、归属部门、使用部门、检测方法、库存数量、单位、是否期间核查）
- ✅ 支持复选框多选
- ✅ 支持新建、刷新、查询、重置、展开、数据导入操作
- ✅ 支持下载和打印功能（UI已实现，功能待完善）

**页面路径**：`/workbench/materials/standard-material-ledger`

---

### 📦 模块2：标准管理模块

#### 当前状态
- ❌ 没有mock数据文件
- ❌ 所有页面都是占位页面

#### 需要创建的内容

**1. 创建Mock数据存储文件**
- **文件路径**：`src/features/quality/standards/testing/fixtures/standardsStore.ts`
- **功能**：定义Seed数据、实现localStorage持久化、提供统一的API接口

**2. Seed数据结构**
```typescript
// Seed数据包含：
- 标准信息台账（10-15条标准记录）
- 方法信息台账（10-15条方法记录）
- 标准查新流程（3-5条流程）
- 标准查新记录（8-10条记录）
- 标准变更评估（3-5条评估）
- 检测项目评审（5-8条评审）
- 方法验证流程（3-5条流程）
- 认证上传流程（2-3条流程）
- 检测项目信息（10-15条项目）
- 验证事项配置（5-8个配置）
- 查新网址配置（3-5个网址）
- 查新审核配置（3-5个配置）
```

**3. 子页面mock数据文件**
- `standardLedgerMocks.ts` - 标准信息台账
- `methodLedgerMocks.ts` - 方法信息台账
- `standardUpdateFlowMocks.ts` - 标准查新流程
- `standardUpdateRecordsMocks.ts` - 标准查新记录
- `standardChangeAssessmentMocks.ts` - 标准变更评估
- `testItemReviewMocks.ts` - 检测项目评审
- `methodVerificationFlowMocks.ts` - 方法验证流程
- `certificationUploadFlowMocks.ts` - 认证上传流程
- `testItemInfoMocks.ts` - 检测项目信息
- `verificationConfigMocks.ts` - 验证事项配置
- `updateUrlConfigMocks.ts` - 查新网址配置
- `updateAuditConfigMocks.ts` - 查新审核配置

---

### 📦 模块3：环境管理模块

#### 当前状态
- ❌ 没有mock数据文件
- ❌ 所有页面都是占位页面

#### 需要创建的内容

**1. 创建Mock数据存储文件**
- **文件路径**：`src/pages/workbench/environment/mocks/environmentStore.ts`
- **功能**：定义Seed数据、实现localStorage持久化、提供统一的API接口

**2. Seed数据结构**
```typescript
// Seed数据包含：
- 内部温湿度监控数据（最近30天的数据，每小时一条）
  - 不同实验室/房间的监控点（5-8个监控点）
  - 温度、湿度数据
  - 时间序列数据
- 外部天气数据（最近30天的数据，每天一条）
  - 城市/地区（3-5个地区）
  - 温度、湿度、风速、天气状况等
```

**3. 子页面mock数据文件**
- `internalMonitoringMocks.ts` - 内部温湿度监控数据
- `externalWeatherMocks.ts` - 外部天气数据

---

## 📁 文件结构规划

```
src/
├── pages/workbench/
│   ├── materials/
│   │   └── mocks/
│   │       ├── materialsStore.ts          # 主存储文件（Seed数据+持久化）
│   │       ├── standardMaterialClassificationMocks.ts
│   │       ├── standardMaterialLedgerMocks.ts
│   │       ├── consumablesLedgerMocks.ts
│   │       ├── materialDemandMocks.ts
│   │       ├── demandListMocks.ts
│   │       ├── materialPurchaseMocks.ts
│   │       ├── consumablesAcceptanceMocks.ts
│   │       ├── standardMaterialAcceptanceMocks.ts
│   │       ├── materialOutboundMocks.ts
│   │       ├── standardMaterialVerificationPlanMocks.ts
│   │       ├── standardMaterialVerificationFlowMocks.ts
│   │       ├── standardMaterialChangeFlowMocks.ts
│   │       └── demandAuditConfigMocks.ts
│   │
│   ├── quality/
│   │   └── standards/
│   │       └── mocks/
│   │           ├── standardsStore.ts      # 主存储文件（Seed数据+持久化）
│   │           ├── standardLedgerMocks.ts
│   │           ├── methodLedgerMocks.ts
│   │           ├── standardUpdateFlowMocks.ts
│   │           ├── standardUpdateRecordsMocks.ts
│   │           ├── standardChangeAssessmentMocks.ts
│   │           ├── testItemReviewMocks.ts
│   │           ├── methodVerificationFlowMocks.ts
│   │           ├── certificationUploadFlowMocks.ts
│   │           ├── testItemInfoMocks.ts
│   │           ├── verificationConfigMocks.ts
│   │           ├── updateUrlConfigMocks.ts
│   │           └── updateAuditConfigMocks.ts
│   │
│   └── environment/
│       └── mocks/
│           ├── environmentStore.ts         # 主存储文件（Seed数据+持久化）
│           ├── internalMonitoringMocks.ts
│           └── externalWeatherMocks.ts
│
└── mocks/
    └── materials.ts                       # 改造：改为从store导入
```

## 🔧 技术实现细节

### 统一的Store模式

每个模块的主存储文件都遵循相同的模式：

```typescript
// 示例：materialsStore.ts
import { canUseLocalStorage, safeParseJson } from "@/shared/api/mock-adapter/mockStore";

// 1. 定义Storage Key
export const MATERIALS_STORAGE_KEY = "mock_materials_store_v1";

// 2. 定义Seed数据
const SEED_MATERIALS: Material[] = [
  // ... 10-15条标准物质和易耗品数据
];

// 3. 内存缓存
let materialsStore: Material[] | null = null;

// 4. 初始化函数
function initMaterialsStore() {
  if (materialsStore) return;
  if (canUseLocalStorage()) {
    const stored = safeParseJson<Material[]>(
      window.localStorage.getItem(MATERIALS_STORAGE_KEY)
    );
    if (Array.isArray(stored) && stored.length > 0) {
      materialsStore = stored;
      return;
    }
  }
  // localStorage为空，使用Seed数据初始化
  materialsStore = [...SEED_MATERIALS];
  persistMaterialsStore();
}

// 5. 持久化函数
function persistMaterialsStore() {
  if (!canUseLocalStorage() || !materialsStore) return;
  window.localStorage.setItem(
    MATERIALS_STORAGE_KEY,
    JSON.stringify(materialsStore)
  );
}

// 6. 公共API
export function listMaterials(): Material[] {
  initMaterialsStore();
  return [...(materialsStore || [])];
}

export function addMaterial(material: Material) {
  initMaterialsStore();
  materialsStore = [material, ...(materialsStore || [])];
  persistMaterialsStore();
}

// ... 其他CRUD函数
```

## ⚠️ 注意事项

1. **不影响其他模块**
   - 所有文件都在各自模块目录下
   - 不修改全局文件（除非是改造 `shared/api/mock-adapter/fixtures/resources/materials.ts`）
   - 使用独立的Storage Key

2. **数据量控制**
   - Seed数据要有足够的演示数据（每个列表至少5-10条）
   - 但不要过多，避免影响性能
   - 时间序列数据（如环境监控）可以生成最近30天的数据

3. **数据关联**
   - 确保数据之间的关联关系正确
   - 例如：物资出库记录要关联到物资台账

4. **时间数据**
   - 使用相对时间（如 `dateOffset(-30)`）生成数据
   - 确保数据看起来是"最近"的

---

## 📝 实施计划

### 阶段1：物资管理模块（优先级最高）
1. 创建 `materialsStore.ts`
2. 创建各子页面的mock数据文件
3. 改造 `shared/api/mock-adapter/fixtures/resources/materials.ts`

### 阶段2：标准管理模块
1. 创建 `standardsStore.ts`
2. 创建各子页面的mock数据文件

### 阶段3：环境管理模块
1. 创建 `environmentStore.ts`
2. 创建各子页面的mock数据文件

## ✅ 验收标准

每个模块完成后，需要验证：

1. ✅ 清除localStorage后刷新页面，能看到Seed数据
2. ✅ 用户操作（增删改）后，数据保存到localStorage
3. ✅ 刷新页面后，用户操作的数据仍然保留
4. ✅ 所有子页面都有对应的mock数据
5. ✅ 数据量充足，能完整演示功能

## 🎯 下一步

**等待确认后开始实施**：
1. 确认设计方案是否符合要求
2. 确认文件结构是否合理
3. 确认数据量是否合适
4. 确认实施顺序是否合理

确认后，我将按照计划逐步实施，确保不影响其他模块。

---

## 📚 相关文档

- [Mock数据管理说明](./README.md)
- [Mock数据使用指南](./USAGE_GUIDE.md)
- [通用工具函数](./mockStore.ts)

---

**最后更新时间**：2025-01-XX  
**文档版本**：v1.0
