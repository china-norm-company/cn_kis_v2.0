# CN KIS V2.0 全量数据集成测试报告

> **生成时间**：2026-03-25 16:07  
> **分支**：feature/common/4-ops-briefing  
> **覆盖数据源**：NAS 历史数据 / LIMS / 飞书全量 / 易快报

---

## 执行摘要

| 项目 | 值 |
|------|-----|
| 整体状态 | ⚠️ 6 个 Phase 有问题 |
| Phase 通过数 | 0/6 |
| 断言通过数 | 2/35 |
| 总耗时 | 0s (0.0 分钟) |

---

## 各 Phase 执行结果

### Phase 0：运行前基线快照  ❌

**耗时**：0s  **摘要**：0/1 断言通过

**断言结果**：

| BSC 参考 | 断言名称 | 实际值 | 期望 | 结果 |
|----------|---------|--------|------|------|
| `` | Django ORM 可用 | `不可用` | `可用` | ❌ |

### Phase 1：NAS 历史数据注入验证  ❌

**耗时**：0s  **摘要**：1/6 断言通过

**断言结果**：

| BSC 参考 | 断言名称 | 实际值 | 期望 | 结果 |
|----------|---------|--------|------|------|
| `BSC-A03` | 受试者总数存在 _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |
| `BSC-A01/A03` | 受试者记录存在（含新增） _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |
| `BSC-E03` | 礼金支付记录存在 _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |
| `BSC-B01` | 受试者问卷记录存在 _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |
| `BSC-E01` | 注入幂等性（content_hash 去重） | `两次查询: -1 = -1` | `两次查询结果相同` | ✅ |
| `BSC-E01/E02` | LearningReport 写入 KnowledgeEntry（import_learning） _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |

### Phase 2：LIMS 业务规则验证  ❌

**耗时**：0s  **摘要**：1/3 断言通过

**执行命令**：

| 命令 | 返回码 | 耗时(s) |
|------|--------|---------|
| `python manage.py verify_p0_injection --no-rollback --batch latest` | ✅ 0 | 0 |
| `python manage.py verify_lims_business_logic --check role_access equipment gate3 ` | ✅ 0 | 0 |

**断言结果**：

| BSC 参考 | 断言名称 | 实际值 | 期望 | 结果 |
|----------|---------|--------|------|------|
| `BSC-H02/系统运维` | LIMS 原始记录存在 (RawLimsRecord) _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |
| `BSC-H02` | LIMS 注入日志存在 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-H02/系统运维` | LIMS 业务逻辑 6 项全部 PASS | `returncode=0` | `returncode=0, 无 FAIL 关键词` | ✅ |

### Phase 3：飞书数据激活（A1/A2/A3 Gate）  ❌

**耗时**：0s  **摘要**：0/6 断言通过

**断言结果**：

| BSC 参考 | 断言名称 | 实际值 | 期望 | 结果 |
|----------|---------|--------|------|------|
| `BSC-D01/D02` | A1: KnowledgeRelation 数量 > 基线（协作关系增加） _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-D01` | A1: IM 类型 KnowledgeEntry 已发布 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-D02/KPI-K-F3` | A1: collaborates_with 类型关系存在 _Django 未初始化_ | `ORM不可用` | `>=251` | ❌ |
| `BSC-C01` | A2: MailSignalEvent 记录存在 | `0` | `>0` | ❌ |
| `BSC-A05` | A3: 受试者智能 KnowledgeEntry 存在 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-G01/KPI-K-G1` | ProactiveInsight 已由 GapReporter 生成 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |

### Phase 4：易快报跨源融合（身份缝合+知识图谱）  ❌

**耗时**：0s  **摘要**：0/5 断言通过

**断言结果**：

| BSC 参考 | 断言名称 | 实际值 | 期望 | 结果 |
|----------|---------|--------|------|------|
| `BSC-X03/跨域` | 身份缝合：同时有飞书和易快报 ID 的账号 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-X03` | 跨源 KnowledgeRelation（mentioned_in）存在 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-F01` | 财务知识 KnowledgeEntry 存在 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-F01` | 业务画像 KnowledgeEntry 存在 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-H02` | 易快报原始记录存在（不可变层） _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |

### Phase 5：全链路验收 + KPI + 报告生成  ❌

**耗时**：0s  **摘要**：0/14 断言通过

**断言结果**：

| BSC 参考 | 断言名称 | 实际值 | 期望 | 结果 |
|----------|---------|--------|------|------|
| `BSC-A01/A02` | BSC-A01/A02: 受试者库有效记录 _Django 未初始化_ | `ORM不可用` | `>=100` | ❌ |
| `BSC-A04` | BSC-A04: 黑名单机制存在（字段可查） _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |
| `BSC-C01` | BSC-C01: 非UNKNOWN邮件信号存在 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-C03` | BSC-C03: COMPLAINT 类型邮件有对应 ProactiveInsight _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-D01` | BSC-D01: PersonalContext IM 类型存在 _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |
| `BSC-D01` | BSC-D01: PersonalContext Mail 类型存在 _Django 未初始化_ | `ORM不可用` | `>=1` | ❌ |
| `BSC-E03` | BSC-E03: 礼金支付记录关联受试者 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-F01` | BSC-F01: KnowledgeEntry 已发布记录存在 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-F01/KPI-K-F2` | BSC-F01: KnowledgeEntry 向量化记录存在 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-G01` | BSC-G01: WorkerPolicyUpdate 策略进化记录 _Django 未初始化_ | `ORM不可用` | `>=0` | ❌ |
| `BSC-D02` | KPI-K-F3: KnowledgeRelation 总数 _-0.0% 达成率_ | `-1 (+0 vs 运行前)` | `>= 251（目标 10,000）` | ❌ |
| `BSC-F01` | KPI-K-F1: KnowledgeEntry 总数 _-0.1% 达成率_ | `-1 (+0 vs 运行前)` | `>= 0（目标 1,000）` | ❌ |
| `BSC-F01` | KPI-K-F2: KnowledgeEntry 已发布数 _-0.0% 达成率_ | `-1 (+0 vs 运行前)` | `>= 0（目标 200,000）` | ❌ |
| `BSC-G01` | KPI-K-G1: WorkerPolicyUpdate 累计 _-5.0% 达成率_ | `-1 (+0 vs 运行前)` | `>= 0（目标 20）` | ❌ |

---

## 数据量 Before / After 对比

| 数据模型 | 运行前 | 运行后 | 变化 |
|---------|--------|--------|------|

---

## Learning Loop KPI 达成状态

| KPI | 基线 | 当前 | 8 周目标 | 达成率 |
|-----|------|------|---------|--------|
| collaborates_with 关系数 | 251 | 0 | 10000 | 0.0% |
| IM KnowledgeEntry published | 0 | 0 | 200000 | 0.0% |
| MailSignalEvent UNKNOWN 比例 | 85% | 85.0% | <15% | — |
| ProactiveInsight 自动生成 | 0 | 0 | 200 | 0.0% |
| WorkerPolicyUpdate 累计 | 0 | 0 | 20 | 0.0% |
| KnowledgeEntry 总数 | 0 | 0 | 1000 | 0.0% |

---

## 未通过项汇总

| Phase | 断言 | 实际值 | 期望 | BSC |
|-------|------|--------|------|-----|
| Phase 0 | Django ORM 可用 | `不可用` | `可用` | `` |
| Phase 1 | 受试者总数存在 | `ORM不可用` | `>=1` | `BSC-A03` |
| Phase 1 | 受试者记录存在（含新增） | `ORM不可用` | `>=1` | `BSC-A01/A03` |
| Phase 1 | 礼金支付记录存在 | `ORM不可用` | `>=1` | `BSC-E03` |
| Phase 1 | 受试者问卷记录存在 | `ORM不可用` | `>=1` | `BSC-B01` |
| Phase 1 | LearningReport 写入 KnowledgeEntry（import_learning） | `ORM不可用` | `>=0` | `BSC-E01/E02` |
| Phase 2 | LIMS 原始记录存在 (RawLimsRecord) | `ORM不可用` | `>=1` | `BSC-H02/系统运维` |
| Phase 2 | LIMS 注入日志存在 | `ORM不可用` | `>=0` | `BSC-H02` |
| Phase 3 | A1: KnowledgeRelation 数量 > 基线（协作关系增加） | `ORM不可用` | `>=0` | `BSC-D01/D02` |
| Phase 3 | A1: IM 类型 KnowledgeEntry 已发布 | `ORM不可用` | `>=0` | `BSC-D01` |
| Phase 3 | A1: collaborates_with 类型关系存在 | `ORM不可用` | `>=251` | `BSC-D02/KPI-K-F3` |
| Phase 3 | A2: MailSignalEvent 记录存在 | `0` | `>0` | `BSC-C01` |
| Phase 3 | A3: 受试者智能 KnowledgeEntry 存在 | `ORM不可用` | `>=0` | `BSC-A05` |
| Phase 3 | ProactiveInsight 已由 GapReporter 生成 | `ORM不可用` | `>=0` | `BSC-G01/KPI-K-G1` |
| Phase 4 | 身份缝合：同时有飞书和易快报 ID 的账号 | `ORM不可用` | `>=0` | `BSC-X03/跨域` |
| Phase 4 | 跨源 KnowledgeRelation（mentioned_in）存在 | `ORM不可用` | `>=0` | `BSC-X03` |
| Phase 4 | 财务知识 KnowledgeEntry 存在 | `ORM不可用` | `>=0` | `BSC-F01` |
| Phase 4 | 业务画像 KnowledgeEntry 存在 | `ORM不可用` | `>=0` | `BSC-F01` |
| Phase 4 | 易快报原始记录存在（不可变层） | `ORM不可用` | `>=1` | `BSC-H02` |
| Phase 5 | BSC-A01/A02: 受试者库有效记录 | `ORM不可用` | `>=100` | `BSC-A01/A02` |
| Phase 5 | BSC-A04: 黑名单机制存在（字段可查） | `ORM不可用` | `>=1` | `BSC-A04` |
| Phase 5 | BSC-C01: 非UNKNOWN邮件信号存在 | `ORM不可用` | `>=0` | `BSC-C01` |
| Phase 5 | BSC-C03: COMPLAINT 类型邮件有对应 ProactiveInsight | `ORM不可用` | `>=0` | `BSC-C03` |
| Phase 5 | BSC-D01: PersonalContext IM 类型存在 | `ORM不可用` | `>=1` | `BSC-D01` |
| Phase 5 | BSC-D01: PersonalContext Mail 类型存在 | `ORM不可用` | `>=1` | `BSC-D01` |
| Phase 5 | BSC-E03: 礼金支付记录关联受试者 | `ORM不可用` | `>=0` | `BSC-E03` |
| Phase 5 | BSC-F01: KnowledgeEntry 已发布记录存在 | `ORM不可用` | `>=0` | `BSC-F01` |
| Phase 5 | BSC-F01: KnowledgeEntry 向量化记录存在 | `ORM不可用` | `>=0` | `BSC-F01/KPI-K-F2` |
| Phase 5 | BSC-G01: WorkerPolicyUpdate 策略进化记录 | `ORM不可用` | `>=0` | `BSC-G01` |
| Phase 5 | KPI-K-F3: KnowledgeRelation 总数 | `-1 (+0 vs 运行前)` | `>= 251（目标 10,000）` | `BSC-D02` |
| Phase 5 | KPI-K-F1: KnowledgeEntry 总数 | `-1 (+0 vs 运行前)` | `>= 0（目标 1,000）` | `BSC-F01` |
| Phase 5 | KPI-K-F2: KnowledgeEntry 已发布数 | `-1 (+0 vs 运行前)` | `>= 0（目标 200,000）` | `BSC-F01` |
| Phase 5 | KPI-K-G1: WorkerPolicyUpdate 累计 | `-1 (+0 vs 运行前)` | `>= 0（目标 20）` | `BSC-G01` |

---

## 下一步行动建议

根据未通过项，建议：
- 排查 ``：Django ORM 可用（实际=不可用，期望=可用）
- 排查 `BSC-A03`：受试者总数存在（实际=ORM不可用，期望=>=1）
- 排查 `BSC-A01/A03`：受试者记录存在（含新增）（实际=ORM不可用，期望=>=1）
- 排查 `BSC-E03`：礼金支付记录存在（实际=ORM不可用，期望=>=1）
- 排查 `BSC-B01`：受试者问卷记录存在（实际=ORM不可用，期望=>=1）

---

*由 `full_integration_validation.py` 自动生成 — 2026-03-25 16:07*