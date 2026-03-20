"""
迁移 0006: 添加 embedding_vector 列（pgvector）

使用 RunSQL 直接通过原生 SQL 添加 vector 类型列，
避免依赖 django-pgvector 包。

维度选择：2048（与当前火山方舟 embedding endpoint 返回维度一致）

注意：执行此迁移前需先确保 pgvector 扩展已安装：
  psql -d cn_kis -U aksu -c "CREATE EXTENSION IF NOT EXISTS vector;"
"""
from django.db import migrations


FORWARD_SQL = """
    DO $$
    BEGIN
        -- 确保 pgvector 扩展已安装
        IF NOT EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) THEN
            CREATE EXTENSION vector;
        END IF;

        -- 添加 embedding_vector 列（幂等）
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 't_knowledge_entry'
              AND column_name = 'embedding_vector'
        ) THEN
            ALTER TABLE t_knowledge_entry
            ADD COLUMN embedding_vector vector(2048);
        END IF;
    END
    $$;

    -- 2048 维向量先不创建 ivfflat 索引；
    -- pgvector 的 ivfflat 对 >2000 维会失败。
"""

REVERSE_SQL = """
    DROP INDEX IF EXISTS idx_knowledge_entry_embedding_vector;
    ALTER TABLE t_knowledge_entry
    DROP COLUMN IF EXISTS embedding_vector;
"""


def apply_pgvector_column(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(FORWARD_SQL)


def reverse_pgvector_column(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(REVERSE_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0005_extend_label_length'),
    ]

    operations = [
        migrations.RunPython(apply_pgvector_column, reverse_code=reverse_pgvector_column),
    ]
