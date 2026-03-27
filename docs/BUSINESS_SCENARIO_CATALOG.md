# CN KIS V2.0 全业务场景目录

> **文档用途**：描述系统在每个核心业务场景下的三类结果预期（成功 / 失败 / 不确定），
> 作为测试用例基线、智能体训练集、验收标准和开发优先级依据。
>
> **最后更新**：2026-03-25  
> **覆盖版本**：V2.0（学习型数据进化闭环 + 知识图谱 Phase 1）

---

## 目录

1. [场景分类与阅读方式](#场景分类与阅读方式)
2. [Domain A：受试者招募与管理](#domain-a受试者招募与管理)
3. [Domain B：项目执行与监控](#domain-b项目执行与监控)
4. [Domain C：邮件信号处理](#domain-c邮件信号处理)
5. [Domain D：飞书 IM 与知识激活](#domain-d飞书-im-与知识激活)
6. [Domain E：历史数据导入与学习](#domain-e历史数据导入与学习)
7. [Domain F：知识库构建与检索](#domain-f知识库构建与检索)
8. [Domain G：智能体策略进化](#domain-g智能体策略进化)
9. [Domain H：系统运维与健康监控](#domain-h系统运维与健康监控)
10. [跨域场景矩阵](#跨域场景矩阵)
11. [KPI 对照表](#kpi-对照表)

---

## 场景分类与阅读方式

每个场景用如下结构描述：

```
BSC-XXX  场景名称
触发条件     → 什么事件或操作触发该场景
输入特征     → 输入数据的关键特征（字段、质量、来源）
✅ 成功情形  → 系统按预期完成，输出正确，KPI 向好
❌ 失败情形  → 系统报错、数据丢失、逻辑错误，需人工干预
⚠️ 不确定情形 → 数据不完整、模糊，系统需降级处理或等待确认
处理策略     → 系统在各情形下的标准动作
关联 KPI    → 直接影响的可测量指标
```

**场景优先级标注**：
- 🔴 P0：核心路径，必须 100% 覆盖测试
- 🟡 P1：重要路径，影响 KPI 的主要变量
- 🟢 P2：边缘路径，发现后优化

---

## Domain A：受试者招募与管理

### BSC-A01 🔴 受试者匹配——身份证号精确匹配

**触发条件**：NAS 导入脚本处理一条受试者记录，记录中含有效身份证号  
**输入特征**：`idcard` 字段 = 18 位合法身份证，系统 `t_subject_questionnaire` 中存在相同值

```
✅ 成功情形
   - 精确匹配到唯一受试者记录
   - update_or_create 更新字段（皮肤类型、省份、项目记录）
   - _IMPORT_STATS['matched_phase1'] +1
   - 日志：[MATCH] idcard_exact subject_id=XXX

❌ 失败情形
   - 身份证格式校验失败（位数/校验码错误）
   - 数据库查询抛出 MultipleObjectsReturned（身份证重复录入）
   - 触发：schema_gap 记录 + GitHub Issue "受试者身份证重复" (P1)

⚠️ 不确定情形
   - 身份证匹配到 2 条以上（数据录入错误的多条记录）
   - 身份证对应受试者已被软删除（is_active=False）
   - 处理：标记为 idcard_ambiguous，写入 MatchFailure，不更新任何记录，待人工审核
```

**处理策略**：失败时跳过当条，记入 `_IMPORT_STATS['idcard_ambiguous']`；不确定时降级到手机号匹配  
**关联 KPI**：身份证精确匹配率目标 ≥ 85%

---

### BSC-A02 🔴 受试者匹配——手机号降级匹配

**触发条件**：身份证匹配失败（字段缺失/格式错误），记录中含手机号  
**输入特征**：`phone` 字段存在，但 `idcard` 字段为空或格式无效

```
✅ 成功情形
   - 手机号唯一匹配到一条受试者记录
   - update_or_create 仅更新允许手机号匹配时覆盖的字段
   - _IMPORT_STATS['phone_only_match'] +1
   - 日志：[MATCH] phone_only subject_id=XXX

❌ 失败情形
   - 手机号对应多条受试者（同一手机被多人登记）
   - 手机号包含非数字字符且无法清洗
   - 触发：MatchFailure 记录 reason='phone_multi_hit'

⚠️ 不确定情形
   - 手机号格式疑似有效（11 位数字）但未收到手机验证
   - 手机号匹配但受试者归属项目与当前导入项目不一致
   - 处理：记为 phone_only_match，在 ProactiveInsight 中生成"手机号可靠性较低"洞察
```

**处理策略**：手机号降级匹配成功但有歧义时，创建候补关联记录等待人工确认  
**关联 KPI**：手机号匹配覆盖率，目标配合身份证使整体匹配率 ≥ 90%

---

### BSC-A03 🟡 全新受试者首次入库

**触发条件**：导入记录通过身份证和手机号均无匹配，为系统未知受试者  
**输入特征**：所有字段均为首次出现，无历史记录

```
✅ 成功情形
   - 创建新受试者记录（create=True）
   - _IMPORT_STATS['created_phase1'] +1
   - 自动生成 ProactiveInsight type=project_recommendation "新受试者资源扩充"
   - 如肤质/年龄/省份分布均衡，自动更新受试者库质量评分

❌ 失败情形
   - 必填字段（姓名、性别、手机）全部缺失，无法创建最小化记录
   - 数据库 IntegrityError（手机号唯一约束已存在同号码）

⚠️ 不确定情形
   - 姓名疑似是代称或昵称（如"小红"、"张女士"）
   - 年龄字段为区间（"25-30岁"）而非精确值
   - 处理：按可用字段创建，标记 data_quality_flag='incomplete'，
     写入 LearningReport.schema_gaps["name_format_inconsistency"]
```

**处理策略**：最小化字段创建，不完整字段进入 schema_gap 跟踪，定期补全  
**关联 KPI**：新受试者入库成功率；每次导入新增受试者数量趋势

---

### BSC-A04 🟡 受试者黑名单检测

**触发条件**：导入脚本调用 `update_blacklist()` 或受试者匹配后进行黑名单比对  
**输入特征**：黑名单来源（Excel 手工维护 / 前台投诉记录 / 项目中途退出标记）

```
✅ 成功情形
   - 在黑名单文件中找到匹配（身份证或手机号）
   - 将对应受试者标记 is_blacklisted=True，记录原因和来源
   - _IMPORT_STATS['blacklisted_count'] +1，阻止该受试者进入新项目

❌ 失败情形
   - 黑名单文件不存在或格式损坏
   - 黑名单更新事务中途失败，导致部分更新（需回滚保护）

⚠️ 不确定情形
   - 同名不同身份证（真实同名人，非同一受试者）
   - 黑名单中的原因为空，无法判断是否仍有效
   - 处理：仅标记"待审核黑名单"，不自动阻止，发 ProactiveInsight 待 PM 确认
```

**处理策略**：黑名单比对必须在匹配成功后立即执行，不得跳过；疑似情形降级为"软黑名单"  
**关联 KPI**：黑名单命中率趋势（异常增高需触发质量审查）

---

### BSC-A05 🟡 受试者价值分层评估

**触发条件**：`build_subject_intelligence` 命令执行 tier 阶段，处理问卷完成数据  
**输入特征**：受试者问卷记录，字段包含项目参与次数、完成率、退出原因

```
✅ 成功情形
   - 根据 TIER_THRESHOLDS 正确分配 gold/silver/bronze/new 层级
   - 创建 KnowledgeEntry (source_type='subject_intelligence', entry_type='lesson_learned')
   - 向量化后可被语义检索命中（如"高配合度受试者"）

❌ 失败情形
   - 问卷数据中参与次数为 NULL（历史录入问题）
   - 阈值配置文件被意外修改，导致所有受试者分配到同一层级
   - LLM 摘要生成超时或返回空

⚠️ 不确定情形
   - 受试者只参与过 1 个项目，样本量不足以评分
   - 参与率 50%（完成 vs 未完成各半），处于层级边界
   - 处理：单项目受试者标记 tier='insufficient_data'，保留原始数据待积累后重评
```

**处理策略**：dry_run 模式下输出分层报告不写库；边界情形取下界层级  
**关联 KPI**：Gold 层受试者占比；分层覆盖率（有层级记录的受试者 / 总受试者数）

---

## Domain B：项目执行与监控

### BSC-B01 🔴 项目预约排期——正常预约

**触发条件**：NAS 项目预约数据导入，项目存在且受试者已在库  
**输入特征**：项目编号、受试者 ID、预约时间、检测时间点、操作员

```
✅ 成功情形
   - 创建预约记录，关联项目和受试者实体
   - 在知识图谱中创建 KnowledgeRelation (subject→project, type=CUSTOM, predicate='participated_in')
   - 自动更新项目参与率统计

❌ 失败情形
   - 项目编号不存在于系统（项目尚未在 V2 中创建）
   - 受试者已在该项目中存在相同时间点的预约（重复导入）

⚠️ 不确定情形
   - 预约时间与项目执行期不符（疑似历史补录或调期）
   - 受试者在预约日期前被标记为黑名单（时序问题）
   - 处理：创建预约但标记 status='needs_review'，生成 ProactiveInsight
```

**处理策略**：幂等导入（content_hash 去重），重复导入跳过不报错  
**关联 KPI**：预约记录导入成功率；项目参与人数知识图谱覆盖率

---

### BSC-B02 🟡 筛查结果分析——筛查通过率

**触发条件**：`build_subject_intelligence` 执行 participation_graph 阶段  
**输入特征**：预约记录中含 screening_result 字段（pass/fail/dropout/pending）

```
✅ 成功情形
   - 计算项目级筛查通过率，写入 KnowledgeEntry 作为项目经验
   - 通过率 < 60% 时，自动生成 ProactiveInsight type=trend_alert "筛查通过率偏低"
   - 高通过率项目（> 85%）写入"最佳实践"知识条目

❌ 失败情形
   - screening_result 字段枚举值不在预定义范围（历史数据有自定义值如"初筛通过"）
   - 计算基数（分母）为 0，除零错误

⚠️ 不确定情形
   - 大量 pending 记录（项目仍在执行中，筛查未完成）
   - 同一受试者在同一项目有多条记录（重复筛查）
   - 处理：标注为"数据收集中，指标暂不可用"，设置 next_review_at 为项目结束日期
```

**处理策略**：pending 比例 > 30% 时，该项目的通过率指标降级为"参考值"  
**关联 KPI**：知识图谱中有效项目经验条目数；平均筛查通过率趋势

---

### BSC-B03 🟡 项目生命周期节点检测

**触发条件**：`build_im_project_graph` 命令处理飞书 IM 消息  
**输入特征**：IM 消息包含项目编号关键词、状态词（"开始""完成""中止"等）

```
✅ 成功情形
   - LLM 识别出项目状态变更节点（立项/启动/完成/中止）
   - 在知识图谱创建 KnowledgeRelation (project→timepoint, type=PRECEDES)
   - 自动更新项目进度看板数据

❌ 失败情形
   - IM 消息中项目编号格式与系统不一致（如手输"20240153"vs 系统"2024-0153"）
   - LLM 提取结果返回空或 JSON 格式不符
   - 飞书 IM API token 过期，消息获取失败

⚠️ 不确定情形
   - 同一条消息含多个项目编号（跨项目协调消息）
   - 消息明确提到项目但状态语义模糊（"项目差不多了"）
   - 处理：多项目时每个项目各自创建关联；模糊状态标记 confidence=low 暂存
```

**处理策略**：LLM 提取置信度低于阈值时，写入 ProactiveInsight 待人工确认  
**关联 KPI**：IM 消息激活率（PersonalContext → KnowledgeRelation 转化率）

---

## Domain C：邮件信号处理

### BSC-C01 🔴 邮件分类——明确业务信号

**触发条件**：`reconcile_mail_signals` 命令处理 MailSignalType=UNKNOWN 的邮件记录  
**输入特征**：邮件主题含明确关键词（"询价""报价""合同""投诉""退出"等）

```
✅ 成功情形
   - LLM 置信度 ≥ confidence_threshold（默认 0.7）
   - 将 mail_signal_type 从 UNKNOWN 更新为具体类型
   - 若为 COMPLAINT，自动生成 P0 ProactiveInsight "客户投诉信号"
   - 若为 INQUIRY，创建 ProactiveInsight type=project_recommendation "潜在新项目线索"

❌ 失败情形
   - LLM API 调用失败（网络超时/内网 GPU 不可达）
   - 分类结果不在 _TYPE_MAP 定义范围内（LLM 幻觉返回无效类型）
   - 批处理事务失败导致部分 UNKNOWN 被标记但部分未处理

⚠️ 不确定情形
   - LLM 置信度 0.4-0.7（低置信度区间）
   - 邮件同时包含投诉和新询价（混合信号）
   - 处理：低置信度记录标记为 UNKNOWN+suggestion 字段存储 LLM 建议类型，
     入 ProactiveInsight pending_review 队列
```

**处理策略**：每批次结束后发布 LearningReport（命中率、LLM 置信分布）；失败时 Celery 重试最多 3 次  
**关联 KPI**：UNKNOWN 邮件比例（当前基线待测量，目标 8 周内降至 ≤ 25%）

---

### BSC-C02 🟡 邮件分类——内部行政邮件识别

**触发条件**：邮件来源域名为内部域（如 china-norm.com），或发件人为已知内部账号  
**输入特征**：发件人邮箱域名已知，邮件主题含"通知""请假""报销"等行政词汇

```
✅ 成功情形
   - 快速识别为 INTERNAL_ADMIN，无需 LLM 深度分析
   - 不生成业务 ProactiveInsight（内部行政无需主动跟进）
   - 减少 LLM 调用成本，提升批处理速度

❌ 失败情形
   - 内部域名白名单未包含所有公司域名（如子公司域名未配置）
   - 伪装成内部邮件的外部邮件被错误分类为 INTERNAL_ADMIN

⚠️ 不确定情形
   - 内部员工转发外部客户邮件（发件人是内部，内容是外部业务）
   - CC 链中同时有内部和外部人员
   - 处理：发件人为内部但邮件正文含外部公司名称时，降级为 LLM 二次判断
```

**处理策略**：内部域名白名单配置化，支持正则匹配；转发邮件通过主题前缀"Fwd:"检测  
**关联 KPI**：内部邮件分类准确率；误分类导致的业务信号遗漏数量

---

### BSC-C03 🔴 投诉信号紧急响应

**触发条件**：邮件被分类为 COMPLAINT，或含关键词"投诉""法律""律师函""媒体曝光"  
**输入特征**：邮件主题/正文含强烈负面词汇，发件人可能是受试者或客户

```
✅ 成功情形
   - 立即创建 ProactiveInsight (insight_type=trend_alert, priority=P0)
   - 通过飞书 Bot 推送到 CN_KIS_PLATFORM开发小组 (chat_id: oc_cdfad80d9deb950414e8b4033f5ac1ff)
   - 关联到相关受试者/客户记录，生成处理建议
   - 24h 内未处理自动升级提醒

❌ 失败情形
   - 飞书 Bot 推送失败（token 过期、网络问题）
   - ProactiveInsight 创建失败（DB 约束错误）
   - 关联记录查找失败（发件人邮箱未关联到任何受试者/客户）

⚠️ 不确定情形
   - 投诉措辞强烈但可能是误发（如"投诉你们太好了！"等口语表达）
   - 邮件语言不是中文（LLM 情感分析可能不准确）
   - 处理：所有含"投诉"关键词的邮件均触发 pending_review，
     人工 30 分钟内确认是否升级为 P0
```

**处理策略**：投诉分类永远触发通知，宁可误报不可漏报；置信度低时仍通知但降级为"疑似投诉"  
**关联 KPI**：投诉响应时效（从信号识别到 ProactiveInsight 创建 ≤ 5 分钟）

---

### BSC-C04 🟡 询价信号转化追踪

**触发条件**：邮件分类为 INQUIRY，含客户公司名称和测试需求描述  
**输入特征**：发件人为外部客户域名，邮件正文含测试类型/成分/功效描述

```
✅ 成功情形
   - 创建 ProactiveInsight (type=project_recommendation) 含提取的测试需求
   - 与客户知识实体 (KnowledgeEntity, type=CLIENT) 建立关联
   - 3 个月后若未转化为项目，自动创建"线索未跟进"洞察

❌ 失败情形
   - LLM 提取的测试需求为空（邮件内容过于简短或全是附件）
   - 客户名称无法匹配到系统已知客户（新客户首次接触）

⚠️ 不确定情形
   - 询价来自竞争对手伪装（域名疑似但不确定）
   - 同一客户在 14 天内重复询价（是否合并为同一线索）
   - 处理：新客户自动创建 KnowledgeEntity (CLIENT) + "待验证客户"标签；
     重复询价自动合并，不新建 ProactiveInsight
```

**处理策略**：所有 INQUIRY 进入"线索池"，每周一汇总输出追踪摘要  
**关联 KPI**：询价信号识别数量；询价→项目转化率（季度追踪）

---

## Domain D：飞书 IM 与知识激活

### BSC-D01 🔴 IM 消息批量激活

**触发条件**：`activate_im_data.sh` 执行，调用 `process_pending_contexts`  
**输入特征**：PersonalContext 记录，source_type='feishu_im'，status='pending'

```
✅ 成功情形
   - PersonalContext 通过 ingestion_pipeline 处理
   - 创建 KnowledgeEntry，质量评分 ≥ 0.6
   - KPI 快照显示 KnowledgeEntry 数量增加
   - 日志：processed=N, skipped=M, failed=0

❌ 失败情形
   - IM 消息内容为空或仅含表情（无法提炼知识）
   - LLM 摘要生成失败，pipeline 10 个阶段中第 3 阶段以后出错
   - Qwen3 embedding 不可达（内网 GPU 算力中心故障），抛出 RuntimeError

⚠️ 不确定情形
   - IM 消息包含敏感个人信息（手机、身份证截图描述）
   - 消息涉及多个业务域（质量+财务+人事混合讨论群）
   - 处理：含敏感关键词的消息标记 requires_review，不自动向量化；
     多域消息按主要话题分配 namespace
```

**处理策略**：Qwen3 失败时抛出不降级；embedding 失败的条目状态设为 draft 不发布  
**关联 KPI**：PersonalContext → KnowledgeEntry 激活率（目标 ≥ 60%）；平均质量评分

---

### BSC-D02 🟡 IM 项目关系图谱构建

**触发条件**：`build_im_project_graph` 命令运行  
**输入特征**：已激活的 IM 类型 KnowledgeEntry，含项目编号、人员姓名

```
✅ 成功情形
   - 提取人员-项目参与关系，创建 KnowledgeRelation (type=CUSTOM)
   - 发现隐性协作模式（A 和 B 经常共同讨论同一项目）
   - 知识图谱边数增加，关系密度提升

❌ 失败情形
   - 项目编号格式不标准，无法匹配到 KnowledgeEntity (type=PROJECT)
   - 大量消息中的姓名无法消歧（"王总""张哥"等非正式称呼）

⚠️ 不确定情形
   - IM 群中有外部访客（非公司员工），无法确认关系归属
   - 私聊消息包含项目信息（是否应进入公司知识图谱存在隐私争议）
   - 处理：外部访客关系标记 source='external_unverified'；
     私聊消息仅提取项目信息，不提取个人互动关系
```

**处理策略**：关系提取时优先匹配 URI 精确命中，降级到模糊匹配时 confidence < 0.6 不写入  
**关联 KPI**：知识图谱关系数量（KnowledgeRelation 总数，目标 8 周 ≥ 500 条）

---

### BSC-D03 🟢 核心用户档案丰富

**触发条件**：`enrich_core_users` 命令对核心人员（PM、QM、Lab 负责人）进行档案补全  
**输入特征**：IM/邮件/日历中的人员行为数据，已存在 KnowledgeEntity (type=PERSON)

```
✅ 成功情形
   - 为核心人员档案补充专长领域、常用术语、协作网络
   - 丰富后的 PERSON 实体可被 "找熟悉XX领域的人" 类查询命中

❌ 失败情形
   - 人员已离职但仍有历史数据，丰富后造成误导性档案

⚠️ 不确定情形
   - 同名同部门两人（如两个"李明"），无法区分行为归属
   - 处理：同名人员创建独立实体，通过 employee_id 字段区分
```

**关联 KPI**：核心人员档案完整度（有 3 个以上丰富字段的人员占比）

---

## Domain E：历史数据导入与学习

### BSC-E01 🔴 NAS 综合导入——高匹配率场景

**触发条件**：运行 `import_nas_comprehensive.py`，数据质量良好  
**输入特征**：Phase1 身份证匹配率 > 80%；字段完整度 > 90%

```
✅ 成功情形
   - 三个阶段（身份证/主名单/受试者清单）均完成
   - 生成 LearningReport 记录匹配模式
   - GapReporter 发布到 KnowledgeEntry (source_type='import_learning')
   - 无 GitHub Issue 创建（质量良好不需要关注）
   - 学习报告 KPI：match_rate ≥ 80%

❌ 失败情形
   - 数据库连接中断（SSH 隧道断开）
   - NAS 文件权限拒绝访问
   - Phase2/Phase3 的 Excel 文件格式被修改（列名变更）

⚠️ 不确定情形
   - Phase1 匹配率正常，但 Phase2 发现大量 Phase1 未收录的受试者
   - 皮肤类型分布异常（90% 同一类型，疑似录入错误）
   - 处理：分布异常时生成 trend_alert ProactiveInsight "皮肤类型录入质量警告"
```

**处理策略**：每个 Phase 独立事务，Phase N 失败不影响 Phase N-1 结果；失败写入 error log  
**关联 KPI**：整体匹配率；LearningReport 发布成功率

---

### BSC-E02 🟡 NAS 综合导入——低匹配率场景

**触发条件**：运行 `import_nas_comprehensive.py`，匹配率低于阈值（< 60%）  
**输入特征**：大量记录 idcard=空、phone=空，或格式混乱

```
✅ 成功情形（低匹配率的最佳处理）
   - 识别为"历史数据质量问题"，不强行匹配
   - LearningReport 记录 MatchFailure (reason='no_idcard_no_phone', count=N)
   - GapReporter 创建 GitHub Issue：
     "data-insight: NAS 导入匹配率偏低（{rate}%）——建议补充身份证/手机字段"
   - 生成 AgentOpportunity：
     "建立 NAS 历史受试者与新系统的模糊匹配规则（姓名+生日组合）"

❌ 失败情形
   - 低匹配率但系统仍强行创建大量重复受试者
   - LearningReport 未发布，问题无法追踪

⚠️ 不确定情形
   - 匹配率低是因为当次导入是新地区数据（合理的新增而非质量问题）
   - 处理：在 LearningReport 中标记 context='new_region_expansion'，
     降低 GitHub Issue 优先级为 P2
```

**处理策略**：匹配率 < 50% 必须触发 GitHub Issue；Issue 必须关联到 `data-insight` label  
**关联 KPI**：历次导入匹配率趋势（应随系统成熟而提升）

---

### BSC-E03 🟡 礼金档案导入——加密字段处理

**触发条件**：运行 `import_nas_honorarium_standalone.py`，处理含银行卡/身份证的敏感字段  
**输入特征**：Excel 中银行卡号字段可能已加密（***）或明文

```
✅ 成功情形
   - 加密字段正确识别，不写入明文银行卡号
   - 仅写入加密值（last4 或 hash），满足数据合规要求
   - 支付记录关联到受试者，用于可靠性评分

❌ 失败情形
   - 明文银行卡号意外写入数据库（合规红线违反）
   - 触发：立即停止导入，发送 P0 安全警报到飞书开发群

⚠️ 不确定情形
   - 同一受试者有多个银行卡号（换卡历史），哪个是当前有效卡
   - 处理：保留所有历史银行卡号的时间戳记录，以最新记录为主

```

**处理策略**：合规检查优先于导入速度；明文检测是不可绕过的前置步骤  
**关联 KPI**：礼金记录导入成功率；支付历史覆盖受试者比例

---

### BSC-E04 🟢 渠道注册数据导入——渠道质量评分

**触发条件**：`import_channel_registration.py` 处理渠道合作注册数据  
**输入特征**：渠道来源（微信/抖音/线下）、注册时间、转化记录

```
✅ 成功情形
   - 按渠道分组计算转化率
   - 高转化渠道自动生成 KnowledgeEntry "优质渠道经验"
   - 低转化渠道触发 ProactiveInsight "渠道效率优化建议"

❌ 失败情形
   - 渠道标识字段在历史数据中有 3-4 种不同的命名（schema_gap）

⚠️ 不确定情形
   - 渠道标识缺失（直接来源无法追溯）
   - 处理：无渠道标识记录归类为 channel_unknown，单独统计，不影响其他渠道评分
```

**关联 KPI**：各渠道转化率追踪；渠道质量 KnowledgeEntry 数量

---

## Domain F：知识库构建与检索

### BSC-F01 🔴 知识条目——完整 10 阶段 Pipeline 处理

**触发条件**：调用 `run_pipeline(RawKnowledgeInput(...))` 处理一条知识输入  
**输入特征**：content 非空，entry_type 有效，source_type 有效

```
✅ 成功情形
   - 10 阶段全部完成，PipelineResult.success=True
   - quality_score ≥ 0.6（达到发布阈值）
   - KnowledgeEntry 状态 = published，embedding_id 已生成
   - 可被语义检索命中

❌ 失败情形
   - Qwen3 embedding 不可达，RuntimeError 中断 pipeline
   - LLM 阶段（摘要/关键词提取）超时，partial result
   - content_hash 重复，entry 已存在（UniqueConstraint 触发）

⚠️ 不确定情形
   - quality_score 在 0.4-0.6 之间（低质量但有信息价值）
   - 内容语言混合（中英日文混排）
   - 处理：低质量条目状态 = pending_review，不自动发布；
     混合语言条目按主要语言处理，保留原文
```

**处理策略**：重复 content_hash 返回已有 entry_id（幂等）；不降级 embedding 引擎  
**关联 KPI**：Pipeline 成功率（目标 ≥ 85%）；平均 quality_score；向量化覆盖率

---

### BSC-F02 🔴 语义检索——高相关度命中

**触发条件**：用户或智能体发起语义查询（如"过去3个月哪些项目有投诉"）  
**输入特征**：查询文本，命名空间过滤条件

```
✅ 成功情形
   - Top-K 结果均 similarity ≥ 0.75
   - 检索结果涵盖问题所有相关维度
   - 响应时间 ≤ 500ms

❌ 失败情形
   - pgvector 索引未建立，全表扫描超时
   - 查询向量生成失败（Qwen3 不可达）

⚠️ 不确定情形
   - Top-1 相似度仅 0.55（相关但不精确）
   - 检索结果跨越多个命名空间（用户意图模糊）
   - 处理：低相似度结果附带置信度标注；多命名空间结果分组展示
```

**处理策略**：相似度阈值可配置，默认 0.7；低于阈值时返回空列表而非低质量结果  
**关联 KPI**：检索命中率；平均相似度；P95 响应时间

---

### BSC-F03 🟡 知识健康度定期评估

**触发条件**：`evaluate_knowledge_health` 定时命令每日运行  
**输入特征**：KnowledgeEntry 全量记录，含 quality_score、next_review_at、embedding_id

```
✅ 成功情形
   - 生成健康度报告（各状态条目分布、待审核/即将过期数量）
   - 向量化率 ≥ 70% 时报告健康
   - 通过 api_system_pulse 暴露健康指标

❌ 失败情形
   - 数据库连接超时导致报告部分数据缺失

⚠️ 不确定情形
   - 大量条目 next_review_at 已过期（未被审核）
   - 处理：过期 > 30 天的条目批量标记为 pending_review，推送数量摘要到飞书
```

**关联 KPI**：知识库健康评分（sys_pulse API 返回值）；知识条目总数趋势

---

## Domain G：智能体策略进化

### BSC-G01 🔴 数据洞察转化为智能体策略

**触发条件**：`sync_learning_to_agent` 命令运行，处理 GapReporter 生成的 ProactiveInsight  
**输入特征**：ProactiveInsight (trigger_source='GapReporter', status='draft')，detail 含 agent_opportunities 字段

```
✅ 成功情形
   - AGENT_OPPORTUNITY_MAP 命中，找到对应 worker_code 和 policy_key
   - 创建 WorkerPolicyUpdate (status='pending_review')
   - 同一 policy_key 在 7 天内已有 pending 记录时，跳过不重复创建（幂等）
   - 管理员通过审核后，train_agent 命令应用新策略

❌ 失败情形
   - AGENT_OPPORTUNITY_MAP 无匹配（新类型的 AgentOpportunity）
   - WorkerPolicyUpdate 创建失败（缺少关联的 Worker 实例）

⚠️ 不确定情形
   - 同一数据来源生成多个相互矛盾的 AgentOpportunity
   - 新策略与已批准的现有策略存在逻辑冲突
   - 处理：矛盾策略时两者均进入 pending_review，人工决策哪个优先；
     未知类型 AgentOpportunity 写入日志，纳入下次 AGENT_OPPORTUNITY_MAP 扩展计划
```

**处理策略**：策略更新不自动应用，必须经过 pending_review → approved 流程  
**关联 KPI**：WorkerPolicyUpdate 创建数量（累计体现系统学习效率）；策略审核通过率

---

### BSC-G02 🟡 智能体批量训练

**触发条件**：`train_agent` 命令运行，处理 approved 状态的 WorkerPolicyUpdate  
**输入特征**：已审核的策略更新列表，关联的知识条目和历史数据

```
✅ 成功情形
   - 策略更新成功应用到对应 Worker
   - 训练后 Worker 在相关场景的响应质量提升（可通过 A/B 测试验证）
   - 训练记录写入审计日志

❌ 失败情形
   - Worker 模型文件损坏或不兼容
   - 训练数据集为空（knowledge entries 尚未向量化）

⚠️ 不确定情形
   - 策略更新后 Worker 响应准确率短暂下降（新旧策略过渡期）
   - 训练样本不足（相关知识条目 < 10 条）
   - 处理：样本不足时标记"数据积累中"，延后训练；过渡期内保留旧策略回退路径
```

**关联 KPI**：WorkerPolicyUpdate 已应用数量；训练周期（从 insight 生成到策略应用的天数）

---

### BSC-G03 🟢 智能体策略回滚

**触发条件**：新策略应用后，关键业务指标出现异常下降  
**输入特征**：监控告警，WorkerPolicyUpdate 记录，回滚请求

```
✅ 成功情形
   - 快速定位变更的 WorkerPolicyUpdate 记录
   - 回滚到前一个 approved 版本
   - 通知飞书群并记录回滚原因

❌ 失败情形
   - 无法确定是哪个策略更新导致问题（多个策略同期应用）
   - 回滚操作本身失败

⚠️ 不确定情形
   - 指标下降可能是外部因素（不是策略导致）
   - 处理：回滚前先暂停新的策略应用，观察 24h 确认因果关系
```

**关联 KPI**：平均故障恢复时间（MTTR）；策略回滚频率（高频说明审核流程不完善）

---

## Domain H：系统运维与健康监控

### BSC-H01 🔴 早晨简报生成

**触发条件**：GitHub Actions `feishu-notify.yml` cron 触发（工作日 08:30）  
**输入特征**：GitHub API 数据（PR、Issue）+ `api_system_pulse` 端点返回数据

```
✅ 成功情形
   - 成功获取 GitHub 数据（open PR 数量、data-insight Issues）
   - 成功获取系统脉搏数据（知识健康、KPI 达标情况、待处理洞察）
   - 飞书卡片推送到开发群，格式正确，数据新鲜（< 10 分钟）

❌ 失败情形
   - GH_TOKEN_ISSUES 失效，GitHub API 返回 401
   - `api_system_pulse` 返回非 200（服务宕机）
   - 飞书 webhook 失效或网络超时

⚠️ 不确定情形
   - SYSTEM_PULSE_TOKEN 未配置（新部署环境）
   - 服务器凌晨有大规模 Celery 任务仍在执行，数据未更新
   - 处理：脉搏数据获取失败时降级为"系统脉搏暂不可用"文字，
     不因此阻断整个简报的推送
```

**处理策略**：各数据源独立获取，任一失败不影响其他部分；失败原因写入 GitHub Actions 日志  
**关联 KPI**：简报推送成功率（目标 100%）；简报数据新鲜度

---

### BSC-H02 🔴 系统脉搏 API 访问

**触发条件**：GitHub Actions 或 Cursor AI 请求 `GET /api/internal/system-pulse/`  
**输入特征**：Bearer Token 请求头

```
✅ 成功情形
   - InternalTokenAuth 验证通过
   - 返回结构化 JSON（知识健康、学习 KPI、待处理洞察、推荐行动）
   - 响应时间 ≤ 3 秒

❌ 失败情形
   - SYSTEM_PULSE_TOKEN 环境变量未配置，所有请求返回 401
   - 数据库查询超时（表数据量过大，未命中索引）

⚠️ 不确定情形
   - 某个子查询返回 NULL（如 WorkerPolicyUpdate 表尚无记录）
   - 处理：各子模块独立 try-except，返回 null 值而非让整个 API 500
```

**处理策略**：API 必须幂等且只读；数据库查询均使用索引字段过滤  
**关联 KPI**：API 可用率；P95 响应时间

---

### BSC-H03 🟡 飞书 Token 刷新与持久化

**触发条件**：Celery Beat 定时任务（每 6 小时）或 `get_valid_user_token` 检测到 token 即将过期  
**输入特征**：FeishuUserToken 记录，refresh_expires_at 字段

```
✅ 成功情形
   - token 在过期前 1 小时自动刷新
   - 新 refresh_token 被写入（仅当飞书返回非空 refresh_token 时才覆盖）
   - 日志：feishu_token_saved refresh_len=NNN (NNN > 0)

❌ 失败情形
   - 飞书 refresh_token 本身已过期（30 天超期未刷新）
   - 服务器网络断开，无法访问飞书 API
   - 触发：推送飞书消息给对应账号，请求重新授权

⚠️ 不确定情形
   - refresh_token 刷新成功但新 refresh_token 为空字符串（飞书偶发问题）
   - 处理：记录 refresh_len=0 警告，保留旧 refresh_token 不覆盖（防覆盖逻辑）
```

**处理策略**：空字符串不覆盖有效 refresh_token（已实现防覆盖逻辑）；Celery Beat 必须常驻  
**关联 KPI**：活跃 token 持有账号数量；token 刷新成功率

---

### BSC-H04 🟢 每周知识稳定性报告生成

**触发条件**：每周一执行`check-system-pulse` Skill，或手动触发  
**输入特征**：`docs/LEARNING_LOOP_STATUS.md` 当前 KPI 数据；api_system_pulse 返回数据

```
✅ 成功情形
   - 生成本周 KPI 变化对比（上周 vs 本周）
   - 识别达标和未达标的 KPI，给出优先行动建议
   - 保存到 docs/weekly-reports/YYYY-WXX.md

❌ 失败情形
   - LEARNING_LOOP_STATUS.md 格式被意外修改，无法解析 KPI 数值

⚠️ 不确定情形
   - KPI 连续 2 周无变化（系统停滞）
   - 处理：自动生成"注意：学习循环暂停"警告，列出可能原因和重启步骤
```

**关联 KPI**：（自参照）周报生成率；KPI 覆盖率

---

## 跨域场景矩阵

以下是覆盖多个业务域的复合场景，是系统集成测试的重点。

| 场景 ID | 描述 | 涉及域 | 类型 | 优先级 |
|--------|------|--------|------|--------|
| BSC-X01 | 受试者投诉 → 邮件信号 → 黑名单联动 | A + C | 流程链 | 🔴 P0 |
| BSC-X02 | IM 消息 → 项目知识提炼 → 智能体学习 | D + F + G | 进化链 | 🟡 P1 |
| BSC-X03 | 导入匹配失败 → GapReporter → GitHub Issue → 开发计划 | E + G + H | 反馈环 | 🟡 P1 |
| BSC-X04 | 询价邮件 → 线索追踪 → 受试者画像推荐 | C + A + F | 业务链 | 🟡 P1 |
| BSC-X05 | Token 过期 → 飞书采集中断 → 晨报数据缺失 → 自动恢复 | H + D | 故障恢复 | 🔴 P0 |

---

### BSC-X01 🔴 受试者投诉 → 黑名单联动完整流程

```
触发：收到投诉邮件（含受试者手机号或姓名）

完整流程：
1. reconcile_mail_signals 分类 → COMPLAINT (confidence=0.85)
2. 创建 ProactiveInsight P0，推送飞书通知
3. 人工确认（30min 内）：确认为有效投诉
4. 人工标记受试者为黑名单（触发 BSC-A04 成功情形）
5. LearningReport 记录投诉模式 → GapReporter 生成洞察
6. 下次同类项目招募时，黑名单自动过滤

✅ 成功：全程 < 2 小时完成，无人工遗漏步骤
❌ 失败：步骤 1 分类错误 → 投诉未被识别 → 受试者继续参与项目
⚠️ 不确定：投诉已发送但邮件延迟到达（T+24h），受试者已完成项目
处理：投诉记录追溯标记，在项目复盘中注明，不回滚已完成数据
```

---

### BSC-X03 🟡 学习循环反馈完整链路

```
触发：import_nas_comprehensive.py 执行，匹配率 42%（严重偏低）

完整流程：
1. 导入完成，_IMPORT_STATS['no_idcard_no_phone'] = 237
2. generate_learning_report() 创建 LearningReport
3. GapReporter.report() 执行：
   a. run_pipeline() 写入 KnowledgeEntry (import_learning)
   b. _create_github_issue() 创建 Issue "NAS 导入匹配率仅 42%"
      label: [data-insight, P1, auto-generated]
4. Cursor AI 下次开启会话时（check-system-pulse skill）
   → 读取 LEARNING_LOOP_STATUS.md + pending data-insight Issues
   → 主动推荐：「建议本周处理 #XX data-insight：NAS 匹配率优化」
5. 开发者认领 Issue → 实现姓名+生日模糊匹配 → 匹配率提升至 71%
6. 关闭 Issue，更新 LEARNING_LOOP_STATUS.md KPI 基线

✅ 成功：Issue 被认领并解决，KPI 提升可量化
❌ 失败：Issue 创建成功但无人关注（积压），匹配率不提升
⚠️ 不确定：Issue 存在但开发者判断提升成本 > 价值，选择关闭不解决
处理：关闭时必须填写"关闭原因"，系统记录该决策用于未来类似问题参考
```

---

## KPI 对照表

以下 KPI 与上述场景直接关联，用于验收评估：

| KPI 编号 | 指标名称 | 基线（当前） | 8周目标 | 关联场景 |
|---------|---------|------------|--------|---------|
| K-A1 | 受试者匹配率（身份证+手机） | 待测量 | ≥ 90% | A01, A02, E01 |
| K-A2 | 受试者价值分层覆盖率 | 0% | ≥ 60% | A05 |
| K-C1 | 邮件 UNKNOWN 比例 | 待测量 | ≤ 25% | C01, C02, C03 |
| K-D1 | PersonalContext 激活率 | ≈ 0% | ≥ 60% | D01 |
| K-F1 | KnowledgeEntry 总数 | 待测量 | ≥ 1000 条 | F01, D01, E01 |
| K-F2 | KnowledgeEntry 向量化率 | 待测量 | ≥ 70% | F01 |
| K-F3 | 知识图谱关系数（KnowledgeRelation） | 待测量 | ≥ 500 条 | D02, B01 |
| K-G1 | WorkerPolicyUpdate 累计创建数 | 0 | ≥ 10 条 | G01, G02 |
| K-H1 | 飞书早晚报推送成功率 | 待验证 | 100% | H01 |
| K-H2 | 系统脉搏 API 可用率 | 待验证 | ≥ 99% | H02 |

---

## 文档维护说明

- **更新频率**：每次 Gate 验收后更新对应场景状态
- **新场景添加**：发现 UNKNOWN 处理场景时，优先更新本文档再开发
- **关联文档**：
  - `docs/LEARNING_LOOP_STATUS.md` — KPI 实际数值追踪
  - `docs/TEST_ACCEPTANCE_FRAMEWORK.md` — 测试验收标准
  - `.cursor/skills/check-system-pulse/SKILL.md` — 日常晨检
  - `.github/ISSUE_TEMPLATE/data-insight.yml` — 场景落地的 Issue 模板

---

*由 CN KIS AI 开发助手（子衿）生成 · 2026-03-25*
