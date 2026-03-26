## 关联 Issue

Closes #

## 变更说明

### 业务目标

<简要说明此 PR 解决了什么问题>

### 影响范围

- 涉及工作台：
- 涉及接口：
- 涉及数据库迁移：[ ] 是  [ ] 否

### V2 迁移波次

[ ] Wave 0 — 治理底座  
[ ] Wave 1 — 认证权限底座  
[ ] Wave 2 — 核心业务主干  
[ ] Wave 3 — 知识数据平面  
[ ] Wave 4 — 企业扩展域  
[ ] Wave 5 — AI 与治理台  
[ ] 非迁移任务（新功能/修复/优化）

---

## 检查清单（必须全部勾选才能合并）

- [ ] 已完成本地自测
- [ ] 代码已通过 lint 检查
- [ ] 无敏感信息（密钥、.env、token）被提交

### 认证权限域（如本 PR 涉及 identity/ 或 feishu_fetcher）

- [ ] 本 PR 不破坏飞书主授权链路
- [ ] refresh_token 防覆盖逻辑已保留
- [ ] token 健康检查 Celery Beat 任务未被移除

### 知识资产域（如本 PR 涉及 knowledge/ 或 ekuaibao/lims models）

- [ ] 本 PR 不向生产知识资产执行无保护写操作
- [ ] content_hash 去重逻辑已保留

### 工作台注册表（如本 PR 涉及 workstations.yaml / identity/api.py / seed_roles.py）

- [ ] 已运行 `python3 ops/scripts/workstation_consistency_check.py` 并通过（19 个工作台全部一致）

---

## 测试步骤与结果

1. 
2. 
3. 

---

## 风险点与回滚方案

风险点：<描述可能的风险>

回滚方案：<如何回滚，例如 `git revert` 或 migration rollback 命令>

---

### 学习循环影响（如本 PR 涉及数据导入、知识库或智能体）

- [ ] 此 PR 改进了导入管线的学习能力（新增/改进 LearningReport 字段）
- [ ] 此 PR 关闭了一个 `data-insight` Issue（请在"关联 Issue"中填写）
- [ ] 此 PR 更新了 `docs/LEARNING_LOOP_STATUS.md` 中的 KPI 基线

关闭的数据洞察 Issue：#  
预期 KPI 变化（如适用）：

---

## 截图/日志（可选）

<粘贴测试截图或关键日志片段>
