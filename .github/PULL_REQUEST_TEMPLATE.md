## 关联 Issue

Closes #

## 变更说明

### 业务目标

<简要说明此 PR 解决了什么问题>

### 影响范围

- 涉及工作台：
- 涉及接口：
- 涉及数据库迁移：[ ] 是  [ ] 否

### 工作台上线波次

> 本 PR 所属工作台当前处于哪个上线波次？（参考 `docs/WORKSTATION_LAUNCH_WAVES.md`）

[ ] **Wave A — 可推广**（secretary / research / recruitment / admin）
[ ] **Wave B — 试点陪跑**（execution / quality / finance / digital-workforce）
[ ] **Wave C — 继续建设**（其余工作台）
[ ] **中枢台联动**（同时涉及 secretary + admin + digital-workforce + control-plane 中的 ≥2 个）
[ ] **基础设施/公共**（CI/CD、配置、文档，不直接归属某个工作台）

### 角色价值验证（Wave A/B 必填，Wave C 可选）

- 本 PR 服务的第一角色：（如：项目经理、招募专员）
- 该角色的受益场景：（如：30 秒内看到今日待跟进受试者清单）
- 验证方式：（如：截图 / curl 输出 / Django shell 验证）

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

## 截图/日志（可选）

<粘贴测试截图或关键日志片段>
