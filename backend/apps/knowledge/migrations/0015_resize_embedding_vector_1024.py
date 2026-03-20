"""
迁移 0015: 将 embedding_vector 从 512 维升级到 1024 维。

背景：
- 当前使用 Jina jina-embeddings-v3，默认截断到 512 维
- jina-embeddings-v3 原生输出 1024 维；取消截断可直接翻倍语义密度
- 理论检索质量提升 ~10-15%（NDCG@10，专业领域文本）
- 无额外费用：Jina 免费额度 1B tokens，按 token 数计费而非维度

本迁移会：
1. 重建 t_knowledge_entry.embedding_vector 为 vector(1024)
2. 将全部知识条目标记为 pending，等待以 1024 维全量回填
3. Qdrant collection 需同步重建（在向量化命令执行前手动操作）

注意：执行此迁移前，确保当前正在进行的 512 维向量化任务已完成，
否则新写入的 512 维向量无法存入 1024 维列。
"""
from django.db import migrations


FORWARD_SQL = """
    DROP INDEX IF EXISTS idx_knowledge_entry_embedding_vector;

    ALTER TABLE t_knowledge_entry
    DROP COLUMN IF EXISTS embedding_vector;

    ALTER TABLE t_knowledge_entry
    ADD COLUMN embedding_vector vector(1024);

    UPDATE t_knowledge_entry
    SET embedding_id = '',
        index_status = 'pending',
        indexed_at = NULL
    WHERE is_deleted = false;

    COMMENT ON COLUMN t_knowledge_entry.embedding_vector
        IS 'Jina jina-embeddings-v3 1024维语义向量（升级自512维）';
"""

REVERSE_SQL = """
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


def resize_to_1024(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(FORWARD_SQL)


def reverse_to_512(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(REVERSE_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0013_knowledge_quality_snapshot'),
    ]

    operations = [
        migrations.RunPython(
            resize_to_1024,
            reverse_code=reverse_to_512,
        ),
    ]
