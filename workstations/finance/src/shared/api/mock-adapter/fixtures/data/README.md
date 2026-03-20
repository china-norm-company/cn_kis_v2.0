# Mock数据管理说明

## 概述

本目录包含基于真实方案数据生成的Mock数据，用于前端开发和演示。

## 数据流

```
真实方案txt文件
    ↓
mockDataParser.ts (解析)
    ↓
mockDataGenerator.ts (生成3个变体)
    ↓
mockProtocols.ts (统一数据源)
    ↓
├─→ 方案管理 (protocols/)
└─→ 排程工作台 (scheduler/)
```

## 文件说明

### mockDataParser.ts
- **功能**: 解析真实方案txt文件，提取结构化信息
- **输出**: `RealProtocolData` 对象
- **关键数据**:
  - 基本信息（研究编号、申办方等）
  - 分组信息（3组，每组30人）
  - 访视计划（11个访视点）
  - 仪器设备（6种设备）
  - 评估计划（临床评估、自我评估）

### mockDataGenerator.ts
- **功能**: 基于真实数据生成3个方案变体
- **变体说明**:
  1. **原始方案**: 精华液+水光针研究（XXX公司，高优先级）
  2. **变体1**: 美白精华临床验证（资生堂，中优先级）
  3. **变体2**: 保湿霜功效评估（雅诗兰黛，低优先级）
- **输出**: `MockProtocolData[]`

### mockProtocols.ts
- **功能**: 提供统一的Mock方案数据访问接口
- **主要导出**:
  - `MOCK_PROTOCOLS`: 3个方案变体数组
  - `getMockProtocolById()`: 根据ID获取方案
  - `getMockProtocolsFromLocalStorage()`: 从localStorage读取
  - `updateMockProtocolsInLocalStorage()`: 更新localStorage

### mockSchedulerProjects.ts
- **功能**: 将Mock方案转换为排程工作台所需格式
- **主要导出**:
  - `MOCK_SCHEDULER_PROJECTS`: 排程项目数组
  - `generateSchedulerProjects()`: 从方案生成项目
  - `getSchedulerProjectById()`: 根据ID获取项目

## 使用方法

### 在方案管理中使用

```typescript
import { 
  getMockProtocolsFromLocalStorage, 
  updateMockProtocolsInLocalStorage 
} from '@/shared/api/mock-adapter/fixtures/data/mockProtocols';

// 读取Mock数据
const protocols = getMockProtocolsFromLocalStorage();

// 更新Mock数据
const updatedProtocols = protocols.map(p => 
  p.id === targetId ? { ...p, status: 'approved' } : p
);
updateMockProtocolsInLocalStorage(updatedProtocols);
```

### 在排程工作台中使用

```typescript
import { MOCK_SCHEDULER_PROJECTS } from '@/shared/api/mock-adapter/fixtures/data/mockSchedulerProjects';

// 获取排程项目列表
const projects = MOCK_SCHEDULER_PROJECTS;
```

## 数据联动

### 方案审批 → 排程工作台

1. **方案管理**: 审批通过后触发事件
```typescript
window.dispatchEvent(new CustomEvent('schedulerProjectsUpdated'));
```

2. **排程工作台**: 监听事件并更新
```typescript
useEffect(() => {
  const handleUpdate = () => {
    // 重新加载项目列表
  };
  window.addEventListener('schedulerProjectsUpdated', handleUpdate);
  return () => window.removeEventListener('schedulerProjectsUpdated', handleUpdate);
}, []);
```

## 访视点映射

真实方案的访视点映射到系统格式：

| 真实数据 | 系统格式 | 说明 |
|---------|---------|------|
| T-2W | V0 | 筛选访视 |
| T0 | V1 | 基线访视 |
| Timm | V1 | 即刻访视（仅组1） |
| T1h | V1 | 1小时后 |
| T1D | V2 | 第1天 |
| T3D | V3 | 第3天 |
| T7D | V4 | 第7天 |
| T14D | V5 | 第14天 |
| T21D | V6 | 第21天 |
| T28D | V7 | 第28天 |
| T56D | V8 | 第56天（仅组1） |

## 设备资源映射

| 真实数据设备 | 资源类型 | 说明 |
|------------|---------|------|
| VISIA-7 | equipment | 面部皮肤图像分析仪 |
| Vectra-H2/M3 | equipment | 3D成像系统 |
| Antera 3D | equipment | 皱纹和毛孔测量 |
| Corneometer CM825 | equipment | 皮肤水分测试 |
| Vapometer | equipment | 经皮水分流失 |
| Cutometer | equipment | 皮肤弹性测试 |
| 皮肤科医生 | person | 临床评估师 |

## 注意事项

1. **数据持久化**: Mock数据存储在localStorage，刷新页面不会丢失
2. **向后兼容**: 保留了现有的审批流、质疑等功能的localStorage存储
3. **自动初始化**: 首次加载时自动将Mock数据写入localStorage
4. **数据更新**: 通过统一的更新函数确保数据一致性
5. **事件驱动**: 使用自定义事件实现模块间的数据同步

## 开发建议

- 修改Mock数据时，优先修改 `mockDataGenerator.ts` 中的生成逻辑
- 新增字段时，确保在 `MockProtocolData` 接口中定义类型
- 数据转换逻辑集中在 `visitPlanConverter.ts` 中
- 保持数据结构与后端API一致，便于后续对接
