# CN KIS V2.0 运维命令手册

> 本文档记录所有 Django management commands 的**真实**可用参数、数据前提条件和已知限制。
> 基于 2026-03-25 服务器实际执行验证。

---

## 环境激活（必须）

```bash
source /opt/cn-kis-v2/backend/venv/bin/activate
cd /opt/cn-kis-v2/backend
DJANGO_SETTINGS_MODULE=settings   # 注意：不是 config.settings
```

---

## 数据基线（2026-03-25 服务器实测）

| 数据源 | 记录数 | 状态 |
|---|---|---|
| PersonalContext (IM) | 1,154,888 | 已采集 |
| PersonalContext (mail_attachment) | 107,341 | 已采集 |
| PersonalContext (mail) | 82,382 | 已采集，处理中 |
| PersonalContext (task) | 8,720 | 已采集 |
| PersonalContext (calendar) | 7,581 | 已采集 |
| PersonalContext (doc/wiki) | 3,592 | 已采集 |
| MailSignalEvent (total) | 71,350 | 其中 80.8% UNKNOWN |
| Subject (active) | 41,374 | 已注入 |
| SubjectQuestionnaire | 248,381 | 已注入 |
| SubjectVisitRecord | 119,803 | 已注入 |
| EkbRawRecord | 109,944 | 已采集（flows/expense_xlsx/invoice_flows等） |
| RawLimsRecord | 2,865 | 已采集（equipment/personnel 模块） |
| KnowledgeEntry | 410,000+ | 96% 未发布（pending_review） |
| KnowledgeRelation | 5,852 | 已由 build_operations_graph 生成 |
| KnowledgeEntity | 1,653 | 已由 build_operations_graph 生成 |

---

## Phase A：飞书数据激活

### A1 — IM/邮件 PersonalContext 知识入库

```bash
# 处理 IM 消息（全量，无 --limit 则处理所有未处理条目）
python manage.py process_pending_contexts --source-type im

# 处理邮件（全量）
python manage.py process_pending_contexts --source-type mail

# 其他来源：calendar / task / doc / wiki
python manage.py process_pending_contexts --source-type calendar
```

**参数**：`--source-type {im,mail,calendar,task,doc,wiki}`, `--limit N`（可选）
**前提**：PersonalContext 表有数据
**产出**：KnowledgeEntry（source_type=feishu_im/feishu_mail 等）

---

### A1-2 — 运营知识图谱构建（从邮件提取实体和关系）

```bash
# 全量处理 82,382 封邮件，无 --limit 参数
python manage.py build_operations_graph

# 重置后重建（慎用）
python manage.py build_operations_graph --reset
```

**参数**：`--reset`（清空重建）, `--dry-run`
**前提**：PersonalContext (mail) 有数据
**产出**（2026-03-25 实测）：
- KnowledgeEntity 1,653 个（project:1531, person:28, client:9, instrument:13, method:17, facility:9, role:13, timepoint:15）
- KnowledgeRelation 5,852 条（locates_in:15526→已去重, sponsors:7723, requires:14566...）
- 发现 439 个内部联系人邮箱
- 发现 1,531 个项目编号

---

### A2 — 邮件信号重分类

```bash
# 全量处理（57,633 条 UNKNOWN，约需 8-16 小时）
python manage.py reconcile_mail_signals \
  --limit 57633 --batch-size 30 --confidence-threshold 0.60

# 测试（5 条）
python manage.py reconcile_mail_signals --limit 5 --batch-size 5
```

**参数**：`--limit N`, `--batch-size N`, `--confidence-threshold 0.0-1.0`, `--dry-run`
**依赖**：ARK LLM API（火山引擎，endpoint ep-20260209161859-tcxwx）
**LLM 客户端**：`get_ark_client()`（不是 `get_llm_client`，该函数不存在）
**产出**：MailSignalEvent.mail_signal_type 从 unknown 分类为实际类型

---

### A3 — 受试者价值分层

```bash
# 全量处理（tier + graph + profile）
python manage.py build_subject_intelligence --phase all

# 只做价值分层
python manage.py build_subject_intelligence --phase tier

# 带限制
python manage.py build_subject_intelligence --phase all --limit 1000
```

**参数**：`--phase {all,tier,graph,profile}`, `--limit N`, `--dry-run`, `--skip-learning`
**前提**：Subject 表有数据（41,374 条）
**产出**：KnowledgeEntry（source_type=subject_intelligence）

---

## Phase B：LIMS 验证

### 业务逻辑验证（6 项）

```bash
python manage.py verify_lims_business_logic \
  --check role_access equipment gate3 gate4 dispatch client_link \
  --sample-size 5
```

**2026-03-25 结果**：5/6 通过（role_access 51人缺少角色）

### P0 注入验证

```bash
# 需要真实批次号（不接受 "latest"）
python manage.py verify_p0_injection \
  --batch incremental_20260325_104020 --no-rollback --report
```

**注意**：`--batch latest` 不存在，必须传真实批次号。获取方式：
```python
from apps.lims_integration.models import LimsImportBatch
LimsImportBatch.objects.order_by('-create_time').first().batch_no
```

### LIMS 关系补全

```bash
python manage.py backfill_lims_relations
python manage.py link_lims_ekb_to_protocol
```

---

## Phase C：易快报跨源融合

### 身份缝合（飞书账号 ↔ 易快报账号）

```bash
python manage.py stitch_identity
# 结果：28 个账号同时有飞书ID和易快报ID
```

**注意**：默认使用批次 `20260318_133425` 的 staffs 数据，可用 `--phase1-batch` 指定

### 跨源知识图谱融合（3步，依次执行）

```bash
# Step1：人员画像丰富（用 PersonalContext 统计写入 KnowledgeEntity.properties）
python manage.py stitch_cross_source_knowledge --step 1

# Step2：从飞书内容提取项目/客户引用（扫描50,000条 PersonalContext）
# 输出到 /tmp/mention_data.json
python manage.py stitch_cross_source_knowledge --step 2

# Step3：建立跨源 KnowledgeRelation
# 前提：必须先运行 build_operations_graph 建立 KnowledgeEntity(namespace=project_experience)
python manage.py stitch_cross_source_knowledge --step 3
```

**关键前提（Step3）**：
- `KnowledgeEntity(entity_type='project', namespace='cnkis')` 需存在
- `KnowledgeEntity(entity_type='person', namespace='cnkis')` 需存在
- `build_operations_graph` 创建的实体 namespace 为 `project_experience`（不是 `cnkis`）
- Step3 relations_created=0 的根因：entity namespace 不匹配

**修复路径**：在 `build_operations_graph` 建立实体后，`stitch_cross_source_knowledge` 需要
额外步骤将 `project_experience` namespace 的实体映射到 Step3 的查找逻辑中。

### 财务知识提取

```bash
python manage.py extract_financial_knowledge \
  --source-type all --phase all
# 参数：--source-type {mail,im,approval,doc,wiki,task,all}
# 参数：--phase {1,2,3,all}
# 参数：--limit N, --batch-size N, --dry-run
```

### 业务画像生成

```bash
python manage.py build_business_profiles --type all
# 参数：--type {person,project,client,approval,all}
# 参数：--dry-run
```

---

## Phase D：易快报全量采集与注入

```bash
# 全量采集 + 注入（四层安全架构）
python manage.py export_ekuaibao_full --all

# 从已有批次重新注入（跳过网络采集）
python manage.py export_ekuaibao_full --inject-from-batch BATCH_NO

# 查看批次列表
python manage.py export_ekuaibao_full --list-batches

# 只做差异报告
python manage.py export_ekuaibao_full --diff-only
```

**注意**：`--limit` 参数不存在，不能用 `--limit 500`

---

## Embedding 服务

| 函数 | 模块 | 用途 |
|---|---|---|
| `get_ark_embedding(text)` | `apps.agent_gateway.services` | 主通道：火山引擎 ARK API |
| `get_local_embedding(text)` | `apps.agent_gateway.services` | 备选：本机 jina-embeddings-v3（1024维）|

**注意**：`get_qwen3_embedding` 函数**不存在**，禁止引用。

---

## 数据路径约定

| 数据 | 服务器路径 | 说明 |
|---|---|---|
| NAS 受试者数据 | `/tmp/nas_cn_kis/受试者名单/` | 执行前需手动上传 |
| 易快报 Excel 备份 | `/opt/cn-kis-v2/backend/data/` | 自动生成 |
| 操作日志 | `/tmp/phase*.log` | 任务执行日志 |
| 集成测试报告 | `/tmp/integration_test_*.md` | 自动生成 |

---

## 已知限制与问题

| 问题 | 状态 | 根因 |
|---|---|---|
| `stitch_cross_source_knowledge Step3` 产出 0 关系 | 待修复 | Step3 查找 `namespace='cnkis'` 的实体，但 `build_operations_graph` 创建的是 `namespace='project_experience'` |
| LIMS role_access 51人缺少角色 | 数据问题 | 这些人员在LIMS有记录但系统内未分配角色 |
| NAS 数据文件不在服务器 | 需手动操作 | Excel文件需从本地上传到 `/tmp/nas_cn_kis/` |
| KnowledgeEntry 发布率仅 0.02% | 待优化 | ingestion pipeline 默认 pending_review，需发布流程 |

---

## 后台任务监控命令

```bash
# 查看所有 manage.py 进程
ps aux | grep "manage.py" | grep -v grep

# 实时跟踪日志
tail -f /tmp/process_mail_full.log
tail -f /tmp/reconcile_mail_full.log
tail -f /tmp/stitch_all.log

# 当前数据量快照
python manage.py shell -c "
from apps.knowledge.models import KnowledgeRelation, KnowledgeEntry, KnowledgeEntity
from apps.secretary.models import MailSignalEvent
print('KE:', KnowledgeEntry.objects.count(), 'KR:', KnowledgeRelation.objects.count())
unk = MailSignalEvent.objects.filter(mail_signal_type='unknown').count()
total = MailSignalEvent.objects.count()
print(f'UNKNOWN mail: {unk}/{total} ({unk/total*100:.1f}%)')
"
```
