"""
迁移 0009: 将 embedding_vector 契约统一到 512 维。

背景：
- 生产检索已统一使用本地 BAAI/bge-small-zh-v1.5 作为主 embedding 通道
- Qdrant collection 已切换为 512 维
- pgvector 仍停留在历史 2048 维，导致 fallback 与主向量层契约分裂

本迁移会：
1. 重建 t_knowledge_entry.embedding_vector 为 vector(512)
2. 将全部知识条目标记为 pending，等待统一回填
"""
from django.db import migrations


FORWARD_SQL = """
    DROP INDEX IF EXISTS idx_knowledge_entry_embedding_vector;

    ALTER TABLE t_knowledge_entry
    DROP COLUMN IF EXISTS embedding_vector;

    ALTER TABLE t_knowledge_entry
    ADD COLUMN embedding_vector vector(512);

    UPDATE t_knowledge_entry
    SET embedding_id = '',
        index_status = 'pending',
        indexed_at = NULL
    WHERE is_deleted = false;
"""

REVERSE_SQL = """
    DROP INDEX IF EXISTS idx_knowledge_entry_embedding_vector;

    ALTER TABLE t_knowledge_entry
    DROP COLUMN IF EXISTS embedding_vector;

    ALTER TABLE t_knowledge_entry
    ADD COLUMN embedding_vector vector(2048);
"""


def resize_embedding_vector_contract(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(FORWARD_SQL)


def reverse_resize_embedding_vector_contract(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(REVERSE_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0008_add_topic_package_and_reranker_fields'),
    ]

    operations = [
        migrations.RunPython(
            resize_embedding_vector_contract,
            reverse_code=reverse_resize_embedding_vector_contract,
        ),
    ]
