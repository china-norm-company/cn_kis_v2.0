"""
迁移 0007: 将 embedding_vector 重建为 2048 维，并重置旧索引状态。

背景：
- 历史实现按 1536 维设计，且曾使用降级哈希向量
- 当前火山方舟可用 endpoint 返回 2048 维向量
- 为保证检索质量，需要清空旧向量并全量重建
"""
from django.db import migrations


FORWARD_SQL = """
    DROP INDEX IF EXISTS idx_knowledge_entry_embedding_vector;

    ALTER TABLE t_knowledge_entry
    DROP COLUMN IF EXISTS embedding_vector;

    ALTER TABLE t_knowledge_entry
    ADD COLUMN embedding_vector vector(2048);

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
    ADD COLUMN embedding_vector vector(1536);
"""


def resize_embedding_vector(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(FORWARD_SQL)


def reverse_resize_embedding_vector(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(REVERSE_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0006_add_embedding_vector'),
    ]

    operations = [
        migrations.RunPython(resize_embedding_vector, reverse_code=reverse_resize_embedding_vector),
    ]
