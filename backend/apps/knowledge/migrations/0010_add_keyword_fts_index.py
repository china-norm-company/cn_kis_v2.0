from django.db import migrations, models


FTS_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_knowledge_entry_keyword_fts
ON t_knowledge_entry
USING GIN (
    (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(content, '')), 'C')
    )
)
WHERE is_deleted = false AND is_published = true;
"""

DROP_FTS_INDEX_SQL = "DROP INDEX IF EXISTS idx_knowledge_entry_keyword_fts;"


def backfill_search_vector_text(apps, schema_editor):
    KnowledgeEntry = apps.get_model('knowledge', 'KnowledgeEntry')
    try:
        from apps.knowledge.search_index import build_search_vector_text
    except Exception:
        def build_search_vector_text(title='', summary='', content=''):
            return ' '.join(part for part in [title or '', summary or '', content or ''] if part).strip()

    for entry in KnowledgeEntry.objects.all().iterator():
        entry.search_vector_text = build_search_vector_text(
            getattr(entry, 'title', ''),
            getattr(entry, 'summary', ''),
            getattr(entry, 'content', ''),
        )
        entry.save(update_fields=['search_vector_text'])


def create_fts_index(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(FTS_INDEX_SQL)


def clear_search_vector_text(apps, schema_editor):
    KnowledgeEntry = apps.get_model('knowledge', 'KnowledgeEntry')
    KnowledgeEntry.objects.all().update(search_vector_text='')


def drop_fts_index(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute(DROP_FTS_INDEX_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ('knowledge', '0009_resize_embedding_vector_512'),
    ]

    operations = [
        migrations.AddField(
            model_name='knowledgeentry',
            name='search_vector_text',
            field=models.TextField(blank=True, default='', help_text='供 PostgreSQL FTS 使用的预分词文本缓存', verbose_name='预分词检索文本'),
        ),
        migrations.RunPython(backfill_search_vector_text, reverse_code=clear_search_vector_text),
        migrations.RunPython(create_fts_index, reverse_code=drop_fts_index),
    ]
