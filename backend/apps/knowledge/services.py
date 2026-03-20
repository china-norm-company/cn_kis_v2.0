"""
知识库服务

封装知识条目管理、搜索、沉淀的业务逻辑。
"""
import logging
import hashlib
from typing import Optional, List
from django.db import transaction
from django.db.models import F

from .models import KnowledgeEntry, KnowledgeTag, EntryType
from libs.db_utils import paginate_queryset
from .retrieval_gateway import hybrid_search
from .search_index import build_search_vector_text

logger = logging.getLogger(__name__)


def _normalize_tags(tags: list) -> list:
    """清洗标签：去空白、去重并保留原顺序。"""
    normalized = []
    seen = set()
    for tag_name in tags or []:
        clean_name = str(tag_name).strip()
        if not clean_name or clean_name in seen:
            continue
        normalized.append(clean_name)
        seen.add(clean_name)
    return normalized


# ============================================================================
# 标签管理（内部）
# ============================================================================
def _sync_tags(tags: list):
    """
    同步标签：确保标签存在并更新使用次数
    """
    for tag_name in _normalize_tags(tags):
        if not tag_name:
            continue
        tag, created = KnowledgeTag.objects.get_or_create(
            name=tag_name,
            defaults={'usage_count': 1},
        )
        if not created:
            tag.usage_count = F('usage_count') + 1
            tag.save(update_fields=['usage_count'])


def _desync_tags(tags: list):
    """
    反向同步：减少标签使用次数
    """
    for tag_name in _normalize_tags(tags):
        if not tag_name:
            continue
        KnowledgeTag.objects.filter(name=tag_name, usage_count__gt=0).update(
            usage_count=F('usage_count') - 1,
        )


# ============================================================================
# 知识条目 CRUD
# ============================================================================
@transaction.atomic
def create_entry(
    entry_type: str,
    title: str,
    content: str,
    tags: list = None,
    source_type: str = '',
    source_id: int = None,
    source_key: str = '',
    created_by_id: int = None,
    summary: str = '',
) -> KnowledgeEntry:
    """创建知识条目（带来源幂等保护）。"""
    tags = _normalize_tags(tags)
    source_type = (source_type or '').strip()
    source_key = (source_key or '').strip()

    if source_type and source_id is not None and source_key:
        existing = KnowledgeEntry.objects.select_for_update().filter(
            source_type=source_type,
            source_id=source_id,
            source_key=source_key,
            is_deleted=False,
        ).first()
        if existing:
            old_tags = _normalize_tags(existing.tags or [])
            existing.entry_type = entry_type
            existing.title = title
            existing.content = content
            existing.summary = summary
            existing.tags = tags
            existing.created_by_id = created_by_id
            existing.is_published = True
            existing.search_vector_text = build_search_vector_text(title, summary, content)
            existing.save(update_fields=[
                'entry_type', 'title', 'content', 'summary',
                'tags', 'created_by_id', 'is_published', 'search_vector_text', 'update_time',
            ])
            if old_tags != tags:
                _desync_tags(old_tags)
                _sync_tags(tags)
            logger.info(f'知识条目#{existing.id} 幂等更新: {title}')
            return existing

    entry = KnowledgeEntry.objects.create(
        entry_type=entry_type,
        title=title,
        content=content,
        summary=summary,
        tags=tags,
        source_type=source_type,
        source_id=source_id,
        source_key=source_key,
        created_by_id=created_by_id,
        search_vector_text=build_search_vector_text(title, summary, content),
    )
    _sync_tags(tags)
    logger.info(f'知识条目#{entry.id} 已创建: {title}')
    return entry


@transaction.atomic
def update_entry(entry_id: int, **kwargs) -> Optional[KnowledgeEntry]:
    """更新知识条目"""
    entry = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
    if not entry:
        return None

    old_tags = _normalize_tags(entry.tags or [])
    new_tags = kwargs.get('tags')
    if new_tags is not None:
        new_tags = _normalize_tags(new_tags)
        kwargs['tags'] = new_tags

    for key, value in kwargs.items():
        if value is not None and hasattr(entry, key):
            setattr(entry, key, value)
    if any(key in kwargs for key in ('title', 'summary', 'content')):
        entry.search_vector_text = build_search_vector_text(entry.title, entry.summary, entry.content)
    entry.save()

    # 标签变更时同步
    if new_tags is not None:
        _desync_tags(old_tags)
        _sync_tags(new_tags)

    logger.info(f'知识条目#{entry_id} 已更新')
    return entry


def delete_entry(entry_id: int) -> bool:
    """软删除知识条目"""
    entry = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
    if not entry:
        return False
    entry.is_deleted = True
    entry.save(update_fields=['is_deleted', 'update_time'])
    if entry.tags:
        _desync_tags(entry.tags)
    logger.info(f'知识条目#{entry_id} 已删除')
    return True


def get_entry(entry_id: int) -> Optional[KnowledgeEntry]:
    """获取知识条目详情，并增加浏览次数"""
    entry = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
    if entry:
        KnowledgeEntry.objects.filter(id=entry_id).update(view_count=F('view_count') + 1)
        entry.view_count += 1
    return entry


def get_entry_history(entry_id: int) -> List[KnowledgeEntry]:
    """返回知识条目的完整版本链，按旧 -> 新排序。"""
    current = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
    if not current:
        return []

    # 先回溯到最旧版本
    oldest = current
    while True:
        previous = KnowledgeEntry.objects.filter(
            superseded_by_id=oldest.id,
            is_deleted=False,
        ).order_by('-update_time').first()
        if not previous:
            break
        oldest = previous

    history = []
    cursor = oldest
    visited = set()
    while cursor and cursor.id not in visited:
        history.append(cursor)
        visited.add(cursor.id)
        if not cursor.superseded_by_id:
            break
        cursor = KnowledgeEntry.objects.filter(
            id=cursor.superseded_by_id,
            is_deleted=False,
        ).first()
    return history


# ============================================================================
# 列表与搜索
# ============================================================================
def list_entries(
    page: int = 1,
    page_size: int = 20,
    entry_type: str = None,
    tags: list = None,
) -> dict:
    """分页查询知识条目列表"""
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    qs = KnowledgeEntry.objects.filter(is_deleted=False, is_published=True)
    if entry_type:
        qs = qs.filter(entry_type=entry_type)
    if tags:
        for tag in tags:
            qs = qs.filter(tags__contains=tag)

    return paginate_queryset(qs, page=page, page_size=page_size, max_page_size=200)


def search_entries(
    query: str,
    entry_type: str = None,
    tags: list = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """
    全文搜索知识条目

    基础版：使用 Django ORM icontains 实现标题和内容搜索。
    """
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    return hybrid_search(
        query=query,
        entry_type=entry_type,
        tags=tags,
        page=page,
        page_size=page_size,
    )


# ============================================================================
# 知识沉淀
# ============================================================================
@transaction.atomic
def deposit_from_retrospective(retrospective_id: int) -> List[KnowledgeEntry]:
    """
    从项目复盘提取经验教训到知识库

    将复盘的 lessons_learned 逐条转化为知识条目。
    """
    from apps.closeout.models import ProjectRetrospective

    retro = ProjectRetrospective.objects.select_related('closeout__protocol').filter(
        id=retrospective_id,
    ).first()
    if not retro:
        logger.warning(f'复盘#{retrospective_id} 不存在')
        return []

    lessons = retro.lessons_learned or []
    if not lessons:
        logger.info(f'复盘#{retrospective_id} 无经验教训可沉淀')
        return []

    protocol_title = ''
    if retro.closeout and retro.closeout.protocol:
        protocol_title = retro.closeout.protocol.title

    entries = []
    for lesson in lessons:
        title = lesson if isinstance(lesson, str) else lesson.get('title', str(lesson))
        content = lesson if isinstance(lesson, str) else lesson.get('content', str(lesson))
        source_key = hashlib.sha1(f'{title}|{content}'.encode('utf-8')).hexdigest()[:40]

        entry = create_entry(
            entry_type=EntryType.LESSON_LEARNED,
            title=f'[经验教训] {title[:200]}',
            content=content,
            tags=['经验教训', '项目复盘'],
            source_type='retrospective',
            source_id=retrospective_id,
            source_key=source_key,
            created_by_id=retro.created_by_id,
            summary=f'来源项目: {protocol_title}',
        )
        entries.append(entry)

    logger.info(f'复盘#{retrospective_id} 沉淀了 {len(entries)} 条经验教训')
    return entries


@transaction.atomic
def deposit_from_sop(sop_id: int) -> Optional[KnowledgeEntry]:
    """
    从 SOP 沉淀到知识库
    """
    from apps.quality.models import SOP

    sop = SOP.objects.filter(id=sop_id, is_deleted=False).first()
    if not sop:
        logger.warning(f'SOP#{sop_id} 不存在')
        return None

    from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline

    previous_entry = None
    if getattr(sop, 'previous_version_id', None):
        previous_entry = KnowledgeEntry.objects.filter(
            entry_type=EntryType.SOP,
            source_id=sop.previous_version_id,
            is_deleted=False,
        ).filter(source_type__in=['sop', 'sop_sync']).order_by('-update_time').first()

    raw = RawKnowledgeInput(
        title=f'[SOP] {sop.code} - {sop.title}',
        content=sop.description or f'{sop.code} - {sop.title} (版本 {sop.version})',
        entry_type=EntryType.SOP,
        tags=['SOP', sop.category],
        source_type='sop_sync',
        source_id=sop_id,
        source_key=f'sop:{sop_id}:v{sop.version}',
        created_by_id=sop.created_by_id,
        summary=f'SOP编号: {sop.code}, 版本: {sop.version}, 分类: {sop.category}',
        namespace='internal_sop',
        uri=f'sop://{sop.code}',
        version=str(sop.version or ''),
        previous_entry_id=previous_entry.id if previous_entry else None,
        properties={
            'sop_code': sop.code,
            'version': str(sop.version or ''),
            'status': sop.status,
            'next_review': str(getattr(sop, 'next_review', '')),
        },
    )
    result = run_pipeline(raw)
    if not result.success or not result.entry_id:
        logger.warning(f'SOP#{sop_id} 沉淀失败: {result.stage_errors}')
        return None

    entry = KnowledgeEntry.objects.filter(id=result.entry_id, is_deleted=False).first()
    if not entry:
        return None

    logger.info(f'SOP#{sop_id} 已沉淀到知识库: 条目#{entry.id}')
    return entry


# ============================================================================
# 标签查询
# ============================================================================
def list_tags(category: str = None) -> list:
    """查询标签列表"""
    qs = KnowledgeTag.objects.all()
    if category:
        qs = qs.filter(category=category)
    return list(qs)
