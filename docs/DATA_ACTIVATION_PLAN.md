# 数据激活执行计划
> 充分利用已采集数据，不等待新数据生成

**制定时间**：2026-03-21  
**执行原则**：优先调用现有管理命令和数据，零额外采集成本

---

## 一、现有数据资产盘点

### 1.1 知识条目（KnowledgeEntry）—— 901,238 条

| source_type | 总数 | 已向量化 | 已发布 | 当前状态 |
|---|---|---|---|---|
| `feishu_mail` | 655,180 | 266,052 (41%) | 0 | **待激活** — 大量邮件通信未发布 |
| `feishu_im` | 162,646 | 64,004 (39%) | 0 | **待激活** — IM 协作上下文未发布 |
| `feishu_task` | 22,413 | 11,577 (52%) | 0 | **待激活** — 任务工单上下文未发布 |
| `feishu_approval` | 22,021 | 11,065 (50%) | 0 | **待激活** — 审批流程历史未发布 |
| `feishu_doc` | 14,163 | 11,009 (78%) | 0 | **待激活** — 文档知识未发布 |
| `subject_full_lifecycle` | 11,019 | 11,017 | **11,019** | ✅ 已就绪 |
| `subject_beauty_profile` | 5,460 | 5,460 | **5,460** | ✅ 已就绪 |
| `project_profile` | 4,184 | 4,184 | **4,104** | ✅ 已就绪 |
| `subject_profile` | 2,030 | 2,030 | **2,030** | ✅ 已就绪 |
| `person_profile` | 434 | 401 | 152 (35%) | ⚠️ 待发布 282 条 |
| `client_profile` | 60 | 60 | **43** | ⚠️ 待发布 17 条 |
| `approval_flow_profile` | 7 | 7 | 0 | **待发布** |

**关键发现**：已向量化的 387K 条中，有 **266K 邮件 + 64K IM + 11K 任务 = 341K 条**带有业务上下文的内容，未发布也未纳入智能体检索范围。

### 1.2 知识图谱（KnowledgeRelation）—— 33,470 条

| 谓词 | 数量 | 语义 | 状态 |
|---|---|---|---|
| `cnkis:enrolled_in` | 11,415 | 受试者→项目参与 | ✅ 完整 |
| `cnkis:has_skin_type` | 5,460 | 受试者皮肤类型 | ✅ 完整 |
| `cnkis:sponsors` | 3,556 | 客户→项目赞助 | ✅ 完整 |
| `cnkis:related_to` | 3,096 | 弱关联 | ⚠️ 语义模糊 |
| `cnkis:belongs_to_age_group` | 2,593 | 受试者年龄段 | ✅ 完整 |
| `cnkis:has_cost_item` | 2,300 | 项目财务明细 | ✅ 完整 |
| `cnkis:financially_involved_in` | 1,253 | 人员财务参与 | ✅ 完整 |
| `cnkis:manages` | 449 | 人员管理项目 | ✅ 可用 |
| `cnkis:collaborates_with` | 251 | 人员协作关系 | ⚠️ 偏少，需扩充 |
| 其他（通信/报告/执行等） | ~5,000 | 运营关联 | ⚠️ 待补充 |

**缺口**：当前图谱对 655K 邮件和 940K IM 中蕴含的**人员协作网络、项目推进时序、客户沟通模式**几乎没有关系化表达。

### 1.3 原始上下文（PersonalContext）—— 1,354,349 条

| source_type | 数量 | 说明 |
|---|---|---|
| `im` | 940,139 | 全量飞书 IM 消息，含项目讨论、受试者沟通、内部协作 |
| `mail` | 136,936 | 业务邮件，含客户往来、协议讨论、报告交付 |
| `task` | 25,555 | 工作任务记录 |
| `approval` | 21,370 | 审批申请及历史 |
| `calendar` | 7,233 | 日历/会议记录 |
| `wiki` | 2,200 | Wiki 文档 |

### 1.4 邮件信号（MailSignalEvent）—— 106,572 条

| 状态 | 数量 | 说明 |
|---|---|---|
| 已分类（非 unknown） | 15,560 (15%) | `project_followup`、`inquiry`、`contract_review` 等 |
| 未分类（unknown） | 91,012 (85%) | **最大待挖掘资产** — 高价值邮件信号被搁置 |

### 1.5 画像数据（Profile）—— 随时可用

- **受试者**：11,224 条（全部有姓名，7K 有性别，3K 有年龄，11K 有完整生命周期档案）
- **项目画像**：4,184 条（含项目编号、类型、项目经理、方法、场地）
- **人员画像**：434 条（含部门、岗位、业务角色）
- **客户画像**：60 条（含客户品牌名称）
- **审批流程**：7 条（含节点顺序、历史使用次数）

---

## 一补、执行状态（实时更新）

| 任务 | 状态 | 实际结果 |
|---|---|---|
| P1-1 批量发布已向量化内容 | ✅ **已完成** | 激活 363,900 条（feishu系列）+ 273 条画像，published 总数从 ~34K → **387,507 条** |
| P0-3 enrich_topic_relations | ✅ 已完成 | created=0（已全部创建过）|
| P0-1 stitch_cross_source | ✅ **已完成** | 扫描 50K PersonalContext，发现 79,985 项目引用 + 6,012 客户引用，新建 **646 条** `mentioned_project_in_feishu` 关系 |
| P0-2 build_operations_graph dry-run | ✅ 已完成 | 预估新增关系：locates_in 30K、sponsors 13K、tested_by 15K、requires 26K、manages 6.6K、related_to 9.7K = **约 10.7 万条** |
| P0-2 build_operations_graph 正式执行 | ✅ **已完成** | 新建 12,933 条关系；collaborates_with 629、manages 6,814、tested_by 15,909 等 |
| 修复 hybrid_search execution_context 缺失 | ✅ **已修复** | API 未传 execution_context 导致 fail-closed 返回 0 结果，已修复 |
| 修复 AI agent 知识注入 dict→SkillExecutionContext | ✅ **已修复** | dict 未正确还原为对象，导致知识检索静默失败，已修复 |
| fastembed 安装到生产 venv | ~~已完成~~ **[已废弃]** | fastembed 已被移除，改为使用公司内网 Qwen3-embedding |

---

## 二、执行计划

### 阶段 P0：图谱连通性激活（1-2 天）— 零新采集，直接运行现有命令

**目标**：将已有数据中隐含的关系显性化，让智能体能够回答跨实体的业务问题。

#### P0-1：跨源知识融合（立即可执行）

```bash
# 服务器执行（后台运行，约 2-4 小时）
cd /data/cn-kis-app
nohup python manage.py stitch_cross_source_knowledge > /tmp/stitch_log.txt 2>&1 &
echo $! > /tmp/stitch.pid
```

**预期产出**：
- 将 PersonalContext（136K 邮件 + 940K IM）中出现的项目编号（M/C/W/A开头）与 Protocol 关联
- 将提到客户名称的消息与 Client 实体关联
- 新增约 **5,000-15,000 条**跨源 KnowledgeRelation（人员↔项目↔客户）

#### P0-2：运营知识图谱提取（立即可执行）

```bash
# dry-run 先统计，约 30 分钟
nohup python manage.py build_operations_graph --dry-run > /tmp/ops_graph_dry.txt 2>&1 &

# 正式执行（约 4-8 小时）
nohup python manage.py build_operations_graph > /tmp/ops_graph_log.txt 2>&1 &
```

**预期产出**：
- 从 PersonalContext 中提取人员、项目、客户、仪器、方法实体
- 构建：提交立项→受理分配→排程→执行→汇报→审核 的流程关系链
- 显著补充当前 `collaborates_with`（251条）和 `manages`（449条）的稀疏问题

#### P0-3：Topic 关系密度加密（15 分钟）

```bash
python manage.py enrich_topic_relations --per-facet-limit 200
```

**预期产出**：在同专题实体之间补充 `related_to` 关系，改善知识图谱连通性

---

### 阶段 P1：知识激活与智能体联通（2-3 天）

#### P1-1：发布待激活的高价值 KnowledgeEntry（批量操作）

当前 `feishu_mail`（655K）、`feishu_im`（162K）等大批已向量化但未发布的内容，通过数据库直接激活：

```sql
-- 将已向量化的飞书数据批量激活为 published（在 Django shell 中执行）
-- 策略：indexed = 有向量，状态改为 published 使其进入检索范围
UPDATE t_knowledge_entry 
SET status = 'published'
WHERE source_type IN ('feishu_mail', 'feishu_im', 'feishu_task', 'feishu_approval', 'feishu_doc')
  AND index_status = 'indexed'
  AND status != 'published';
-- 预计影响约 341,000 条
```

> **注意**：此操作将使智能体可以检索到历史邮件/IM 内容。建议先在测试环境验证检索质量后再执行。

#### P1-2：完成剩余向量化（批量补齐 460K 空缺）

```bash
# 按 source_type 分批向量化（使用公司内网 Qwen3-embedding，唯一授权通道）
nohup python manage.py vectorize_bulk --batch-size 20 --status pending > /tmp/vec_pending.txt 2>&1 &
```

**预期产出**：460K 待向量化条目完成索引，向量化覆盖率从 43% 提升到 100%

#### P1-3：激活智能体知识域配置

将 V2 的 `AgentKnowledgeDomain` 配置更新，指向已激活的 KnowledgeEntry：

| 智能体 | 当前知识域 | 应激活的 source_type |
|---|---|---|
| `secretary-orchestrator` | 未激活 | `feishu_mail`, `feishu_im`, `feishu_task` |
| `subject-coordinator` | 未激活 | `subject_full_lifecycle`, `subject_beauty_profile`, `feishu_im` |
| `project-manager` | 未激活 | `project_profile`, `feishu_mail`, `feishu_approval` |
| `crf-validator` | 已有 | `feishu_doc`, `system_rule` |
| `client-liaison` | 未激活 | `client_profile`, `feishu_mail` |

```bash
# V1 服务器执行
python manage.py seed_agent_knowledge_domains --reset
```

#### P1-4：邮件信号重分类（91K "unknown" 价值挖掘）

```bash
# 对 unknown 信号进行 AI 重分类（利用已有 LLM 能力）
python manage.py reconcile_feishu_data --reclassify-signals --limit 10000
```

或创建专项命令，批量调用 LLM 对 `MailSignalEvent.subject + sender_email` 进行类型推断。

**预期产出**：将 91K 未分类邮件中约 30-50% 转化为可用业务信号

---

### 阶段 P2：业务场景智能化（3-5 天）

**目标**：基于已激活的知识和关系，构建可用的端到端业务智能场景。

#### P2-1：受试者全生命周期智能查询

**已有数据**：11,019 条 `subject_full_lifecycle`，11,415 条 `enrolled_in` 关系，5,460 条 `has_skin_type`

**实现**：配置 `subject-coordinator` 智能体能够回答：
- "王梅目前参与了哪些项目？"
- "找出年龄在30-40岁之间、干性皮肤的受试者"
- "哪些受试者参与了 SPF26002 项目？"

测试命令（通过 API）：
```bash
curl -X POST http://118.196.64.48/v2/api/v1/agents/chat \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"agent_id": "subject-coordinator", "message": "SPF26002项目有哪些受试者？", "context_window": 5}'
```

#### P2-2：项目-客户-人员协作全景查询

**已有数据**：4,184 条 `project_profile`，60 条 `client_profile`，434 条 `person_profile`，3,556 条 `sponsors` 关系

**实现**：`project-manager` 智能体能够回答：
- "薇诺娜目前有几个在研项目？"
- "顾晶负责哪些项目？"
- "SPF25006 的项目团队是谁？"

#### P2-3：审批流程智能导航

**已有数据**：7 条 `approval_flow_profile`（含节点顺序、历史使用次数），22,021 条 `feishu_approval`

**实现**：智能体能够回答：
- "功效测试项目的报销单需要经过哪些审批节点？"
- "报销单历史使用最多的审批流程是什么？"

#### P2-4：IM 协作网络分析

**已有数据**：940K `im` PersonalContext，164K `feishu_im` KnowledgeEntry（待激活）

运行跨源融合后，可实现：
- "顾晶在过去一个月的项目沟通中主要涉及哪些项目？"
- "SPF26002 项目的主要沟通成员是谁？"

---

### 阶段 P3：深度价值挖掘（持续优化）

#### P3-1：人员协作网络构建

**来源**：PersonalContext IM 中的 `from_user`/`to_chatters` 字段已结构化，可以直接提取人员协作网络图谱

操作：
1. 解析 IM PersonalContext 中的 JSON 结构（已有 `from_user`、`to_chatters` 字段）
2. 按群组/项目聚合协作频次
3. 写入 `KnowledgeRelation`（`collaborates_with` + `mentions` 谓词）

**预期产出**：`collaborates_with` 关系从 251 条扩充到 **5,000+ 条**，完整描绘协作网络

#### P3-2：邮件主题聚类与业务流程识别

**来源**：15,560 条已分类 `MailSignalEvent`（`project_followup`、`inquiry`、`contract_review`）

操作：
1. 按 `mail_signal_type` + 发件人域名聚类，识别客户沟通模式
2. 提取报价→立项→执行→报告→回款的完整业务流程时序
3. 为每个项目生成"沟通里程碑时间线"

#### P3-3：财务-项目-人员三维关联

**来源**：2,300 条 `has_cost_item`，1,253 条 `financially_involved_in` 关系已存在

操作：
```bash
python manage.py rebuild_ekuaibao_relations  # 重建易快报关联
python manage.py build_business_profiles     # 重建业务画像
```

---

## 三、执行优先级矩阵

| 任务 | 执行成本 | 预期价值 | 优先级 |
|---|---|---|---|
| P0-1 跨源知识融合（stitch） | 低（现有命令）| 高（5K+ 新关系）| **P0 立即执行** |
| P0-2 运营图谱提取（ops graph）| 低（现有命令）| 高（流程关系链）| **P0 立即执行** |
| P1-1 批量发布已向量化内容 | 极低（SQL）| 极高（341K 条激活）| **P1 今日执行** |
| P1-3 智能体知识域配置 | 低（配置）| 高（Agent 可用）| **P1 今日执行** |
| P0-3 Topic 关系加密 | 极低（15min）| 中（密度提升）| P0 今日执行 |
| P1-2 剩余向量化（460K）| 中（需 GPU/时间）| 高（覆盖率100%）| P1 今日启动 |
| P1-4 邮件信号重分类 | 中（LLM 成本）| 中（分类准确率提升）| P2 本周 |
| P2-x 业务场景智能查询 | 低（配置+测试）| 极高（可演示）| P2 本周 |
| P3-1 人员协作网络 | 中（开发）| 高（网络图谱）| P3 下周 |

---

## 四、立即可执行的命令清单

以下命令可在服务器上直接运行，**不依赖任何新数据采集**：

```bash
# ===== 今日（D+0）=====

# 1. 发布已向量化的飞书数据（5分钟）
cd /data/cn-kis-app && source venv/bin/activate
python manage.py shell -c "
from apps.knowledge.models import KnowledgeEntry
from django.db.models import Q
result = KnowledgeEntry.objects.filter(
    source_type__in=['feishu_mail','feishu_im','feishu_task','feishu_approval','feishu_doc'],
    index_status='indexed',
).exclude(status='published').update(status='published')
print('已激活:', result, '条')
"

# 2. Topic 关系密度加密（15分钟）
python manage.py enrich_topic_relations --per-facet-limit 200

# 3. 人员画像和客户画像发布（2分钟）
python manage.py shell -c "
from apps.knowledge.models import KnowledgeEntry
r1 = KnowledgeEntry.objects.filter(source_type='person_profile', index_status='indexed').exclude(status='published').update(status='published')
r2 = KnowledgeEntry.objects.filter(source_type='client_profile', index_status='indexed').exclude(status='published').update(status='published')
r3 = KnowledgeEntry.objects.filter(source_type='approval_flow_profile', index_status='indexed').exclude(status='published').update(status='published')
print('person_profile:', r1, 'client_profile:', r2, 'approval_flow_profile:', r3)
"

# ===== 今日（D+0，后台运行）=====

# 4. 跨源知识融合（2-4小时）
nohup python manage.py stitch_cross_source_knowledge > /tmp/stitch_log.txt 2>&1 &
echo "stitch PID: $!"

# 5. 运营图谱提取 dry-run（30分钟）
nohup python manage.py build_operations_graph --dry-run > /tmp/ops_graph_dry.txt 2>&1 &
echo "ops-graph-dry PID: $!"

# ===== 明日（D+1）=====

# 6. 正式运行运营图谱提取（4-8小时）
nohup python manage.py build_operations_graph > /tmp/ops_graph_log.txt 2>&1 &

# 7. 批量向量化剩余条目
nohup python manage.py vectorize_bulk --source-type feishu_mail --batch-size 300 > /tmp/vec_mail.txt 2>&1 &
nohup python manage.py vectorize_bulk --source-type feishu_im --batch-size 300 > /tmp/vec_im.txt 2>&1 &
```

---

## 五、验收指标

| 指标 | 当前值 | 目标值 | 验证方法 |
|---|---|---|---|
| KnowledgeEntry 发布数 | ~34,000 | **375,000+** | `KnowledgeEntry.objects.filter(status='published').count()` |
| KnowledgeRelation 总数 | 33,470 | **50,000+** | `KnowledgeRelation.objects.count()` |
| `collaborates_with` 关系 | 251 | **3,000+** | 按 relation_type 统计 |
| 智能体可检索文档数 | ~34,000 | **375,000+** | 混合检索返回结果数量 |
| 邮件信号分类率 | 15% | **40%+** | `MailSignalEvent.objects.exclude(mail_signal_type='unknown').count()` |
| 向量化覆盖率 | 43% | **85%+** | 按 index_status='indexed' 统计 |

---

## 六、风险与注意事项

1. **批量发布风险**：341K 条邮件/IM 内容激活后，智能体检索结果会包含原始通信内容（含姓名、项目细节）。建议配置 `AgentKnowledgeDomain` 的 `forbidden_scopes` 限制敏感内容。

2. **向量化资源**：460K 条向量化需要约 10-20 小时（Qwen3 内网 GPU，单进程，batch-size=20）。内网带宽足够时可适当增大批次。

3. **stitch_cross_source_knowledge 幂等性**：该命令应支持重复执行（去重写入），执行前确认。

4. **build_operations_graph --reset**：不要在已有关系时使用 `--reset`，否则会清空现有 33K 关系。默认增量模式即可。
