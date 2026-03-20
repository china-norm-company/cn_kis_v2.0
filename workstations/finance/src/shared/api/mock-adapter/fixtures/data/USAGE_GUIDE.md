# Mock数据系统使用指南

## 📋 系统概述

本系统使用**随机模板填充**的方式来模拟AI方案解析功能。用户上传方案文件时，系统会自动从预设的3个真实数据模板中随机选择一个，将其数据填充到新方案中。

## 🎲 工作流程

### 1. 用户上传方案
```
用户操作：选择文件 → 点击"上传"
系统行为：创建空方案（parsed_data = null）
```

### 2. 用户进入详情页
```
用户操作：点击方案名称 → 进入详情页
页面显示：
- 基本信息（文件名、上传时间等）
- "AI解析"按钮（醒目显示）
- 提示：请点击AI解析按钮进行数据解析
```

### 3. 用户点击AI解析
```
用户操作：点击"AI解析"按钮
系统行为：
1. 显示"AI解析已启动"提示
2. 模拟解析延迟（2.5秒）
3. 🎲 从3个模板中随机选择一个
4. 获取模板的parsed_data
5. 填充到方案的parsed_data字段
6. 保存到localStorage
7. 刷新页面
8. 显示"AI解析完成"提示
```

### 4. 数据已解析完成
```
页面显示：
✅ 11个访视点（或9/7个，取决于随机到的模板）
✅ 6种设备需求（或5/4种）
✅ 3个组别及样本量
✅ 评估计划
✅ 耗材计划
✅ 时间轴
✅ 可以生成访视计划
✅ 可以提交审批
```

## 🗂️ 三个数据模板

### 模板 1: 精华液+水光针研究
- **客户**: XXX（中国）有限公司
- **优先级**: 高
- **访视点**: 11个
- **设备**: 6种（VISIA、Cutometer等）
- **样本量**: 90人（每组30人）
- **研究周期**: 4周

### 模板 2: 美白精华验证研究
- **客户**: 资生堂
- **优先级**: 中
- **访视点**: 9个
- **设备**: 5种
- **样本量**: 75人
- **研究周期**: 3周

### 模板 3: 保湿霜功效评估
- **客户**: 雅诗兰黛
- **优先级**: 低
- **访视点**: 7个
- **设备**: 4种
- **样本量**: 60人
- **研究周期**: 2周

## 💻 技术实现

### 核心文件

1. **`mockDataGenerator.ts`**
   - 提供 `getRandomTemplateParsedData()` 函数
   - 随机选择模板并返回parsed_data
   - 包含3个模板的配置信息

2. **`UploadProtocolDialog.tsx`**
   - 在 `onSubmit()` 中调用随机选择函数
   - 创建方案时直接包含parsed_data
   - 状态设为 "pending"（待审核）

3. **`mockProtocols.ts`**
   - 不再预设方案
   - localStorage初始为空
   - 所有方案都由用户上传生成

4. **`mockSchedulerProjects.ts`**
   - 动态从localStorage读取方案
   - 转换为排程项目格式

### 关键函数

```typescript
// 1. 上传时创建空方案
const mockProtocol = {
  id: Date.now(),
  name: fileName,
  parsed_data: null,  // ❌ 初始为null
  status: "pending",
  // ... 其他字段
};

// 2. 点击AI解析按钮时
const handleAIParse = async () => {
  // 模拟解析延迟
  await new Promise(resolve => setTimeout(resolve, 2500));
  
  // 🎲 随机选择模板并获取数据
  const parsedData = getRandomTemplateParsedData(protocolName);
  
  // 更新localStorage中的方案
  const protocols = getMockProtocolsFromLocalStorage();
  const updated = protocols.map(p => 
    p.id === protocolId 
      ? { ...p, parsed_data: parsedData }  // ✅ 填充数据
      : p
  );
  updateMockProtocolsInLocalStorage(updated);
  
  // 刷新页面显示结果
  window.location.reload();
};
```

## 🔄 数据流转

### 方案 → 访视计划
```typescript
// detail.tsx 中
const handleGenerateVisitPlan = () => {
  const visitPlan = convertToVisitPlan(protocol.parsed_data);
  // ... 保存访视计划
};
```

### 方案 → 排程项目
```typescript
// mockSchedulerProjects.ts 中
export function generateSchedulerProjects() {
  const protocols = getMockProtocolsFromLocalStorage();
  return protocols.map(protocol => ({
    projectId: protocol.project_id,
    visits: protocol.parsed_data.visit_plan.map(...),
    equipments: protocol.parsed_data.equipment_plan.map(...),
    // ... 其他转换
  }));
}
```

### 方案审批通过 → 创建排程项目
```typescript
// detail.tsx 中
const handleApprove = () => {
  // 1. 更新方案状态为 approved
  // 2. 触发 schedulerProjectsUpdated 事件
  // 3. 排程工作台监听事件并刷新项目列表
};
```

## 📊 数据结构

### 方案数据结构
```typescript
interface MockProtocolData {
  id: number;              // 唯一ID，使用时间戳
  name: string;            // 用户上传的文件名
  code: string;            // 自动生成编号
  status: string;          // pending | approved | rejected
  parsed_data: {           // ✅ 从模板随机生成
    project_info: {...},
    visit_plan: [...],
    equipment_plan: [...],
    evaluation_plan: [...],
    // ... 更多字段
  };
}
```

## 🧪 测试示例

### 上传多个方案测试随机性

1. **上传方案A** → 可能得到模板1（11个访视点）
2. **上传方案B** → 可能得到模板3（7个访视点）
3. **上传方案C** → 可能得到模板2（9个访视点）

每次上传都是随机的，数据各不相同！

### 验证数据完整性

```typescript
// 在浏览器控制台执行
const protocols = JSON.parse(localStorage.getItem('mock_protocols'));
console.log('方案数量:', protocols.length);
console.log('第一个方案的访视点:', protocols[0].parsed_data.visit_plan.length);
console.log('设备需求:', protocols[0].parsed_data.equipment_plan.length);
```

## 🎯 使用场景

### 场景1: 演示完整流程
```
1. 上传方案 → 自动随机模板
2. 查看详情 → 数据已解析完成
3. 生成访视计划 → 基于parsed_data
4. 提交审批 → 状态流转
5. 审批通过 → 创建排程项目
6. 排程工作台 → 显示项目和访视点
```

### 场景2: 测试不同数据规模
```
- 上传多个方案
- 每个方案随机到不同模板
- 访视点数量：7/9/11个
- 设备需求：4/5/6种
- 验证系统在不同规模下的表现
```

### 场景3: 数据联动测试
```
方案管理 → 审批通过
  ↓
触发事件（schedulerProjectsUpdated）
  ↓
排程工作台 → 监听事件
  ↓
刷新项目列表 → 显示新项目
  ↓
访视点、设备、评估需求 → 全部同步
```

## ⚠️ 注意事项

1. **localStorage限制**
   - 数据仅存储在浏览器本地
   - 清除浏览器数据会丢失所有方案
   - 不同浏览器的数据不共享

2. **随机性说明**
   - 每次上传都是独立的随机选择
   - 可能连续随机到同一个模板
   - 这是正常的随机行为

3. **数据一致性**
   - 方案的parsed_data在上传时确定
   - 后续访视计划、排程项目都基于此数据
   - 确保全流程数据一致

4. **性能考虑**
   - localStorage有大小限制（通常5-10MB）
   - 建议不要上传过多方案
   - 必要时可手动清理localStorage

## 🔧 调试技巧

### 查看随机选择日志
```typescript
// 在 mockDataGenerator.ts 中会输出
🎲 为文件 "测试方案.pdf" 随机选择了模板 2: 美白精华临床功效验证研究
```

### 手动清理数据
```javascript
// 在浏览器控制台
localStorage.removeItem('mock_protocols');
location.reload();
```

### 查看完整数据
```javascript
// 在浏览器控制台
const protocols = JSON.parse(localStorage.getItem('mock_protocols'));
console.table(protocols.map(p => ({
  ID: p.id,
  名称: p.name,
  访视点: p.parsed_data.visit_plan.length,
  设备: p.parsed_data.equipment_plan.length
})));
```

## 📚 相关文档

- [数据解析器说明](./mockDataParser.ts) - 如何解析真实方案文本
- [数据生成器说明](./mockDataGenerator.ts) - 如何生成模板数据
- [README](./README.md) - 系统整体架构说明
