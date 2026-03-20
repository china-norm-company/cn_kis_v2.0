# Wave 3 规划：知识与原始数据平面迁移

> 波次状态：规划完成，待 Wave 2 验收后执行
> 交付门槛：V2 可读取并校验既有知识资产，原始层完整性核对通过

---

## 一、Wave 3 目标

1. 迁移知识图谱与向量化能力
2. 迁移飞书个人上下文（PersonalContext）
3. 迁移易快报原始层（EkbRawRecord）
4. 迁移 LIMS 原始层（RawLimsRecord）
5. 建立资产保护层（只读保护 + 一致性校验脚本）
6. 建立受控写策略（明确 V2 何时可以接管写入）

---

## 二、受保护资产清单

| 资产 | 模型 | 数量级 | 保护级别 | 迁移策略 |
|------|------|-------|---------|---------|
| 飞书邮件 | `PersonalContext(source_type='mail')` | ~6,224 条 | 只读（V2 Wave 3 前）| 先校验再复用 |
| 飞书 IM | `PersonalContext(source_type='im')` | ~3,033 条 | 只读 | 同上 |
| 飞书任务 | `PersonalContext(source_type='task')` | ~1,305 条 | 只读 | 同上 |
| 飞书文档 | `PersonalContext(source_type='doc')` | ~1,241 条 | 只读 | 同上 |
| 飞书日历 | `PersonalContext(source_type='calendar')` | ~862 条 | 只读 | 同上 |
| 知识条目 | `KnowledgeEntry` | 含 1024-dim 向量 | 只读 | 先对等验证 |
| 知识图谱节点 | `KnowledgeEntity` | 语义本体节点 | 只读 | 同上 |
| 知识图谱关系 | `KnowledgeRelation` | 实体关系 | 只读 | 同上 |
| 易快报原始层 | `EkbRawRecord` | 34,723 条 | **不可变**（永久只读） | 校验后复用 |
| LIMS 原始层 | `RawLimsRecord` | 不可变 | **不可变**（永久只读） | 校验后复用 |

---

## 三、迁移文件清单

### 核心迁移文件

| V1 模块 | V2 路径 | 迁移策略 |
|---------|---------|---------|
| `apps/knowledge/models.py` | `apps/knowledge/models.py` | **完整原样迁移** |
| `apps/knowledge/ingestion_pipeline.py` | `apps/knowledge/ingestion_pipeline.py` | 完整迁移 |
| `apps/knowledge/retrieval_gateway.py` | `apps/knowledge/retrieval_gateway.py` | 完整迁移，含 5 层检索逻辑 |
| `apps/knowledge/feishu_knowledge_fetcher.py` | 同上 | 迁移 |
| `apps/knowledge/feishu_doc_knowledge_extractor.py` | 同上 | 迁移 |
| `apps/knowledge/tasks.py` | 同上 | **测试环境下受 `CELERY_PRODUCTION_TASKS_DISABLED` 保护** |
| `apps/secretary/models.py` | `apps/secretary/models.py` | PersonalContext + 相关采集模型 |
| `apps/ekuaibao_integration/models.py` | `apps/integrations/ekuaibao/models.py` | 完整迁移 |
| `apps/lims_integration/models.py` | `apps/integrations/lims/models.py` | 完整迁移 |

### 向量化配置

```python
# V2 必须保持与 V1 一致的向量化配置
EMBEDDING_MODEL = 'jinaai/jina-embeddings-v3'
EMBEDDING_DIM = 1024
JINA_API_KEY = os.getenv('JINA_API_KEY', '')
```

---

## 四、资产保护层设计

### 只读保护机制

在 V2 Wave 3 初期，通过以下机制保护生产知识资产：

```python
# backend/apps/knowledge/guards.py
import os
from django.conf import settings


class KnowledgeAssetGuard:
    """
    知识资产只读保护守卫
    
    在 V2 正式接管写入链路前，防止无保护写操作。
    通过环境变量 KNOWLEDGE_WRITE_ENABLED=true 解锁。
    """
    
    @staticmethod
    def assert_write_allowed():
        if not getattr(settings, 'KNOWLEDGE_WRITE_ENABLED', False):
            raise PermissionError(
                "Knowledge asset write is not enabled in this environment. "
                "Set KNOWLEDGE_WRITE_ENABLED=true to unlock."
            )
    
    @staticmethod
    def assert_raw_record_immutable(model_name: str):
        """原始层（EkbRawRecord/RawLimsRecord）永远不可修改"""
        raise PermissionError(
            f"{model_name} is an immutable raw record layer. "
            "Never modify or delete raw records."
        )
```

### 一致性校验脚本

```python
# ops/scripts/verify_knowledge_assets.py
"""
知识资产完整性校验脚本
在 V2 迁移前后各执行一次，确认资产无丢失。
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
django.setup()

from apps.secretary.models import PersonalContext
from apps.knowledge.models import KnowledgeEntry, KnowledgeEntity, KnowledgeRelation
from apps.ekuaibao_integration.models import EkbRawRecord


def verify_assets():
    report = {
        'PersonalContext': {
            'total': PersonalContext.objects.count(),
            'by_source': dict(
                PersonalContext.objects.values_list('source_type')
                .annotate(count=Count('id'))
                .values_list('source_type', 'count')
            ),
        },
        'KnowledgeEntry': {
            'total': KnowledgeEntry.objects.count(),
            'published': KnowledgeEntry.objects.filter(is_published=True).count(),
            'with_embedding': KnowledgeEntry.objects.exclude(embedding_id='').count(),
        },
        'KnowledgeEntity': KnowledgeEntity.objects.count(),
        'KnowledgeRelation': KnowledgeRelation.objects.count(),
        'EkbRawRecord': {
            'total': EkbRawRecord.objects.count(),
        },
    }
    
    for key, value in report.items():
        print(f"{key}: {value}")
    
    return report


if __name__ == '__main__':
    verify_assets()
```

---

## 五、content_hash 去重保证

迁移时严格使用 `content_hash` 字段防止重复写入：

```python
# 迁移 PersonalContext 时的去重逻辑
existing_hashes = set(
    PersonalContext.objects.values_list('content_hash', flat=True)
)

for item in source_data:
    if item['content_hash'] in existing_hashes:
        continue  # 已存在，跳过
    PersonalContext.objects.create(**item)
    existing_hashes.add(item['content_hash'])
```

---

## 六、Celery Beat 任务保护

测试环境中，以下知识相关任务**禁止自动运行**：

```python
# backend/celery_app.py — 测试环境保护逻辑
import os

PRODUCTION_TASKS_DISABLED = os.getenv('CELERY_PRODUCTION_TASKS_DISABLED', '').lower() == 'true'

if not PRODUCTION_TASKS_DISABLED:
    # 仅在生产环境注册这些任务
    app.conf.beat_schedule.update({
        'feishu-incremental-sync': {
            'task': 'apps.secretary.tasks.incremental_feishu_sync',
            'schedule': crontab(minute='*/30'),
        },
        'knowledge-ingestion-pipeline': {
            'task': 'apps.knowledge.tasks.run_ingestion_pipeline',
            'schedule': crontab(hour='*/2'),
        },
        'knowledge-vectorize-bulk': {
            'task': 'apps.knowledge.tasks.vectorize_bulk',
            'schedule': crontab(hour='3', minute='0'),
        },
    })
```

---

## 七、Wave 3 执行步骤

### Step 1: 建立知识模块骨架
```bash
mkdir -p backend/apps/knowledge
mkdir -p backend/apps/integrations/ekuaibao
mkdir -p backend/apps/integrations/lims
mkdir -p ops/scripts
```

### Step 2: 复制模型文件（不可变层优先）
```bash
cp -r backend/apps/knowledge/* backend/apps/knowledge/  # 含 migrations
cp -r backend/apps/ekuaibao_integration/models.py backend/apps/integrations/ekuaibao/models.py
cp -r backend/apps/lims_integration/models.py backend/apps/integrations/lims/models.py
```

### Step 3: 建立 KnowledgeAssetGuard
```bash
# 创建 ops/scripts/verify_knowledge_assets.py
# 创建 backend/apps/knowledge/guards.py
```

### Step 4: 配置 CELERY_PRODUCTION_TASKS_DISABLED
```bash
# 在测试 .env 中确认：
CELERY_PRODUCTION_TASKS_DISABLED=true
KNOWLEDGE_WRITE_ENABLED=false
```

### Step 5: 运行一致性校验
```bash
# 连接生产数据库（只读），执行校验
python ops/scripts/verify_knowledge_assets.py

# 记录基准数字：
# PersonalContext: 12,665 条
# KnowledgeEntry: XXX 条
# EkbRawRecord: 34,723 条
```

---

## 八、Wave 3 验收标准

- [ ] V2 可读取并展示既有 `KnowledgeEntry` 列表（API `/knowledge/entries/` 返回数据）
- [ ] 知识检索（关键词+向量+图谱）在 V2 中可用，结果与 V1 抽样对比一致
- [ ] `PersonalContext` 记录数与 V1 基准一致（12,665 条）
- [ ] `EkbRawRecord` 记录数与 V1 基准一致（34,723 条）
- [ ] `KnowledgeAssetGuard` 在测试环境阻止意外写入
- [ ] `CELERY_PRODUCTION_TASKS_DISABLED=true` 时，采集类 Beat 任务不注册
- [ ] 一致性校验脚本执行通过，无报错
- [ ] V2 向生产资产的写入需要显式 `KNOWLEDGE_WRITE_ENABLED=true` 解锁
