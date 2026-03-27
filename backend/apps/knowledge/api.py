"""
知识库 API

端点：
- POST /knowledge/entries/create                创建知识条目
- GET  /knowledge/entries/list                   知识条目列表
- GET  /knowledge/entries/{id}                   知识条目详情
- GET  /knowledge/entries/{id}/history           知识条目版本历史
- PUT  /knowledge/entries/{id}                   更新知识条目
- GET  /knowledge/entries/search                 搜索知识条目
- POST /knowledge/entries/deposit-from-retrospective  从复盘沉淀
- GET  /knowledge/tags/list                      标签列表
"""
from ninja import Router, Schema, Query, File, UploadedFile
from typing import Optional, List
from django.db.models import Q

from . import services
from .models import KnowledgeEntry, KnowledgeTag
from apps.identity.decorators import _get_account_from_request, require_permission

router = Router()


# ============================================================================
# Schema
# ============================================================================
class EntryCreateIn(Schema):
    entry_type: str
    title: str
    content: str
    summary: Optional[str] = ''
    tags: List[str] = []
    source_type: Optional[str] = ''
    source_id: Optional[int] = None
    source_key: Optional[str] = ''


class EntryUpdateIn(Schema):
    title: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[List[str]] = None
    entry_type: Optional[str] = None
    is_published: Optional[bool] = None


class EntryListParams(Schema):
    entry_type: Optional[str] = None
    tags: Optional[str] = None
    page: int = 1
    page_size: int = 20


class EntrySearchParams(Schema):
    query: str = ''
    entry_type: Optional[str] = None
    tags: Optional[str] = None
    page: int = 1
    page_size: int = 20


class DepositFromRetroIn(Schema):
    retrospective_id: int


class DepositFromSopIn(Schema):
    sop_id: int


class TagListParams(Schema):
    category: Optional[str] = None


# ============================================================================
# 辅助函数
# ============================================================================
def _entry_to_dict(e: KnowledgeEntry) -> dict:
    return {
        'id': e.id,
        'entry_type': e.entry_type,
        'title': e.title,
        'content': e.content,
        'summary': e.summary,
        'tags': e.tags,
        'source_type': e.source_type,
        'source_id': e.source_id,
        'source_key': e.source_key,
        'version': e.version,
        'status': e.status,
        'quality_score': e.quality_score,
        'uri': e.uri,
        'namespace': e.namespace,
        'owner_id': e.owner_id,
        'owner_name': e.owner.display_name if e.owner_id and e.owner else '',
        'reviewer_id': e.reviewer_id,
        'reviewer_name': e.reviewer.display_name if e.reviewer_id and e.reviewer else '',
        'next_review_at': e.next_review_at.isoformat() if e.next_review_at else None,
        'superseded_by_id': e.superseded_by_id,
        'embedding_id': e.embedding_id,
        'view_count': e.view_count,
        'is_published': e.is_published,
        'created_by_id': e.created_by_id,
        'create_time': e.create_time.isoformat(),
        'update_time': e.update_time.isoformat(),
    }


def _tag_to_dict(t: KnowledgeTag) -> dict:
    return {
        'id': t.id,
        'name': t.name,
        'category': t.category,
        'usage_count': t.usage_count,
        'create_time': t.create_time.isoformat(),
    }


def _parse_tags(tags_str: Optional[str]) -> list:
    """将逗号分隔的标签字符串解析为列表"""
    if not tags_str:
        return []
    return [t.strip() for t in tags_str.split(',') if t.strip()]


# ============================================================================
# API 端点
# ============================================================================
@router.post('/entries/create', summary='创建知识条目')
@require_permission('knowledge.entry.create')
def create_entry(request, data: EntryCreateIn):
    account = _get_account_from_request(request)
    entry = services.create_entry(
        entry_type=data.entry_type,
        title=data.title,
        content=data.content,
        summary=data.summary or '',
        tags=data.tags,
        source_type=data.source_type or '',
        source_id=data.source_id,
        source_key=data.source_key or '',
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '知识条目已创建', 'data': _entry_to_dict(entry)}


@router.get('/entries/list', summary='知识条目列表')
@require_permission('knowledge.entry.read')
def list_entries(request, params: EntryListParams = Query(...)):
    tags = _parse_tags(params.tags)
    result = services.list_entries(
        page=params.page, page_size=params.page_size,
        entry_type=params.entry_type,
        tags=tags,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_entry_to_dict(e) for e in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/entries/search', summary='搜索知识条目')
@require_permission('knowledge.entry.read')
def search_entries(request, params: EntrySearchParams = Query(...)):
    tags = _parse_tags(params.tags)
    result = services.search_entries(
        query=params.query,
        entry_type=params.entry_type,
        tags=tags,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_entry_to_dict(e) for e in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


class BatchReviewIn(Schema):
    entry_ids: List[int]
    action: str  # 'publish' | 'reject'
    reason: Optional[str] = ''


@router.post('/entries/batch-review', summary='批量审核知识条目')
@require_permission('knowledge.entry.review')
def batch_review(request, data: BatchReviewIn):
    """批量发布或拒绝待审核的知识条目"""
    from .governance import batch_review_entries

    account = _get_account_from_request(request)
    operator_id = account.id if account else None

    result = batch_review_entries(
        entry_ids=data.entry_ids,
        action=data.action,
        operator_id=operator_id,
        reason=data.reason or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/entries/pending-review', summary='获取待审核知识条目列表')
@require_permission('knowledge.entry.review')
def list_pending_review(request, entry_type: Optional[str] = None, page: int = 1, page_size: int = 20):
    """获取待审核知识条目列表（审核员工作台）"""
    from .governance import get_pending_review_entries

    result = get_pending_review_entries(entry_type=entry_type, page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/entries/{entry_id}', summary='知识条目详情')
@require_permission('knowledge.entry.read')
def get_entry(request, entry_id: int):
    entry = services.get_entry(entry_id)
    if not entry:
        return 404, {'code': 404, 'msg': '知识条目不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _entry_to_dict(entry)}


@router.get('/entries/{entry_id}/history', summary='知识条目版本历史')
@require_permission('knowledge.entry.read')
def get_entry_history(request, entry_id: int):
    history = services.get_entry_history(entry_id)
    if not history:
        return 404, {'code': 404, 'msg': '知识条目不存在'}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [_entry_to_dict(entry) for entry in history],
            'total': len(history),
        },
    }


@router.put('/entries/{entry_id}', summary='更新知识条目')
@require_permission('knowledge.entry.create')
def update_entry(request, entry_id: int, data: EntryUpdateIn):
    entry = services.update_entry(entry_id, **data.dict(exclude_unset=True))
    if not entry:
        return 404, {'code': 404, 'msg': '知识条目不存在'}
    return {'code': 200, 'msg': '知识条目已更新', 'data': _entry_to_dict(entry)}


@router.post('/entries/deposit-from-retrospective', summary='从复盘沉淀')
@require_permission('knowledge.entry.create')
def deposit_from_retrospective(request, data: DepositFromRetroIn):
    entries = services.deposit_from_retrospective(data.retrospective_id)
    if not entries:
        return 400, {'code': 400, 'msg': '复盘不存在或无经验教训可沉淀'}
    return {
        'code': 200, 'msg': f'已沉淀 {len(entries)} 条经验教训',
        'data': [_entry_to_dict(e) for e in entries],
    }


@router.delete('/entries/{entry_id}', summary='删除知识条目')
@require_permission('knowledge.entry.delete')
def delete_entry(request, entry_id: int):
    deleted = services.delete_entry(entry_id)
    if not deleted:
        return 404, {'code': 404, 'msg': '知识条目不存在'}
    return {'code': 200, 'msg': '知识条目已删除', 'data': None}


@router.post('/entries/deposit-from-sop', summary='从SOP沉淀')
@require_permission('knowledge.entry.create')
def deposit_from_sop(request, data: DepositFromSopIn):
    entry = services.deposit_from_sop(data.sop_id)
    if not entry:
        return 400, {'code': 400, 'msg': 'SOP不存在或无内容可沉淀'}
    return {
        'code': 200, 'msg': '已沉淀 1 条SOP知识',
        'data': [_entry_to_dict(entry)],
    }


@router.get('/tags/list', summary='标签列表')
@require_permission('knowledge.entry.read')
def list_tags(request, params: TagListParams = Query(...)):
    tags = services.list_tags(category=params.category)
    return {
        'code': 200, 'msg': 'OK',
        'data': [_tag_to_dict(t) for t in tags],
    }


# ============================================================================
# K4: 混合检索 API（向量 + 图谱 + 关键词）
# ============================================================================

@router.get('/hybrid-search', summary='混合检索（K4）')
@require_permission('knowledge.entry.read')
def hybrid_search_api(
    request,
    q: str = '',
    entry_type: Optional[str] = None,
    channels: Optional[str] = None,
    top_k: int = 20,
    graph_max_hops: int = 1,
    graph_relation_types: Optional[str] = None,
    graph_min_confidence: float = 0.0,
):
    """
    三路混合检索：关键词 + 向量 + 图谱，使用 RRF 融合排序。

    channels: 逗号分隔，可选 keyword,vector,graph（默认全部）
    """
    from .retrieval_gateway import multi_channel_search

    channel_list = None
    if channels:
        channel_list = [c.strip() for c in channels.split(',') if c.strip()]
    relation_type_list = None
    if graph_relation_types:
        relation_type_list = [c.strip() for c in graph_relation_types.split(',') if c.strip()]

    result = multi_channel_search(
        query=q,
        entry_type=entry_type,
        channels=channel_list,
        top_k=min(top_k, 100),
        graph_max_hops=graph_max_hops,
        graph_relation_types=relation_type_list,
        graph_min_confidence=graph_min_confidence,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/entities', summary='知识实体列表')
@require_permission('knowledge.entry.read')
def list_entities(
    request,
    q: Optional[str] = None,
    entity_type: Optional[str] = None,
    namespace: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """查询知识图谱实体"""
    from .models import KnowledgeEntity

    qs = KnowledgeEntity.objects.filter(is_deleted=False)
    if q:
        qs = qs.filter(
            Q(label__icontains=q) | Q(label_en__icontains=q) | Q(definition__icontains=q)
        )
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    if namespace:
        qs = qs.filter(namespace=namespace)

    total = qs.count()
    start = (page - 1) * page_size
    items = qs.order_by('-update_time')[start:start + page_size]

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [
            {
                'id': e.id,
                'entity_type': e.entity_type,
                'uri': e.uri,
                'label': e.label,
                'label_en': e.label_en,
                'definition': (e.definition or '')[:200],
                'namespace': e.namespace,
                'linked_entry_id': e.linked_entry_id,
            }
            for e in items
        ],
        'total': total,
    }}


@router.get('/entities/{entity_id}/relations', summary='实体关系')
@require_permission('knowledge.entry.read')
def entity_relations(request, entity_id: int):
    """查询指定实体的所有关系（出边 + 入边）"""
    from .models import KnowledgeRelation

    outgoing = KnowledgeRelation.objects.filter(
        subject_id=entity_id, is_deleted=False,
    ).select_related('object')[:50]

    incoming = KnowledgeRelation.objects.filter(
        object_id=entity_id, is_deleted=False,
    ).select_related('subject')[:50]

    def _rel_dict(r, direction):
        other = r.object if direction == 'out' else r.subject
        return {
            'id': r.id,
            'direction': direction,
            'relation_type': r.relation_type,
            'predicate_uri': r.predicate_uri,
            'other_entity': {
                'id': other.id,
                'label': other.label,
                'entity_type': other.entity_type,
            },
            'confidence': r.confidence,
            'source': r.source,
        }

    relations = (
        [_rel_dict(r, 'out') for r in outgoing] +
        [_rel_dict(r, 'in') for r in incoming]
    )

    return {'code': 200, 'msg': 'OK', 'data': {
        'entity_id': entity_id,
        'relations': relations,
        'total': len(relations),
    }}


# ── K3: CDISC 导入 API ──

class CDISCImportIn(Schema):
    sdtm_version: str = '3.4'
    cdash_version: str = '2.2'
    include_variables: bool = False


@router.post('/ontology/cdisc/import', summary='导入 CDISC 标准术语（K3）')
@require_permission('knowledge.entry.create')
def cdisc_import(request, data: CDISCImportIn):
    """
    从 CDISC Library API 导入 SDTM/CDASH 域定义和变量到知识图谱。
    需要配置 CDISC_LIBRARY_API_KEY 环境变量。
    """
    from .cdisc_importer import run_full_cdisc_import

    result = run_full_cdisc_import(
        sdtm_version=data.sdtm_version,
        cdash_version=data.cdash_version,
        include_variables=data.include_variables,
    )
    code = 200 if result.get('success') else 400
    return {'code': code, 'msg': result.get('message', 'OK'), 'data': result}


@router.post('/ontology/instrument/manual', summary='导入仪器手册 PDF（KR-3-4）')
@require_permission('knowledge.entry.create')
def instrument_manual_import(
    request,
    file: UploadedFile = File(...),
    equipment_id: Optional[int] = None,
    dry_run: bool = False,
):
    """上传仪器 PDF/手册，解析后导入到统一知识管线。"""
    from .instrument_knowledge_builder import ingest_instrument_manual

    account = _get_account_from_request(request)
    result = ingest_instrument_manual(
        file_bytes=file.read(),
        file_name=file.name,
        equipment_id=equipment_id,
        created_by_id=account.id if account else None,
        dry_run=dry_run,
    )
    code = 200 if result.get('success') else 400
    return {'code': code, 'msg': result.get('message', 'OK'), 'data': result}


class CDISCCtImportIn(Schema):
    ct_package: str = 'sdtm'
    version: str = '2024-03-29'


@router.post('/ontology/cdisc/ct/import', summary='导入 CDISC 受控术语')
@require_permission('knowledge.entry.create')
def cdisc_ct_import(request, data: CDISCCtImportIn):
    """导入 CDISC 受控术语（Codelists + Terms）"""
    from .cdisc_importer import import_controlled_terminology

    result = import_controlled_terminology(data.ct_package, data.version)
    code = 200 if result.get('success') else 400
    return {'code': code, 'msg': result.get('message', 'OK'), 'data': result}


# ── K5: BRIDG 导入 API ──

@router.post('/ontology/bridg/seed', summary='导入 BRIDG 核心种子数据（K5）')
@require_permission('knowledge.entry.create')
def bridg_seed_import(request):
    """
    导入 BRIDG 核心概念（20 个类 + 5 个 CRO 化妆品扩展 + 17 个关系），
    无需外部文件，直接从内置定义创建知识图谱节点。
    """
    from .bridg_importer import import_bridg_seed

    result = import_bridg_seed()
    code = 200 if result.get('success') else 400
    return {'code': code, 'msg': 'OK', 'data': result}


@router.post('/ontology/bridg/owl', summary='从 OWL 文件导入 BRIDG 本体')
@require_permission('knowledge.entry.create')
def bridg_owl_import(request, file: UploadedFile = File(...)):
    """上传 BRIDG OWL/RDF-XML 文件，解析并导入到知识图谱"""
    from .bridg_importer import import_bridg_owl

    content = file.read()
    result = import_bridg_owl(content)
    code = 200 if result.get('success') else 400
    return {'code': code, 'msg': result.get('message', 'OK'), 'data': result}


# ── 检索评测 API（Phase 4：检索质量监控）──

class RetrievalEvalIn(Schema):
    test_cases: Optional[List[dict]] = None  # [{ query, relevant_entry_ids, entry_type }]
    channels: Optional[List[str]] = None


@router.post('/eval/retrieval', summary='检索质量评测（Phase 4）')
@require_permission('knowledge.entry.view')
def retrieval_eval(request, data: RetrievalEvalIn):
    """
    运行检索质量评测。

    不传 test_cases 时使用内置烟雾测试（CI 健康检查用）。
    传入 test_cases 时运行完整评测（需提供 relevant_entry_ids）。
    """
    from .retrieval_evaluator import (
        QueryTestCase, check_retrieval_quality_gate, run_smoke_test
    )

    if not data.test_cases:
        result = run_smoke_test()
        return {'code': 200, 'msg': 'OK', 'data': result}

    test_cases = []
    for tc_dict in data.test_cases:
        test_cases.append(QueryTestCase(
            query=tc_dict.get('query', ''),
            relevant_entry_ids=tc_dict.get('relevant_entry_ids', []),
            entry_type=tc_dict.get('entry_type'),
            description=tc_dict.get('description', ''),
        ))

    result = check_retrieval_quality_gate(
        test_cases=test_cases,
        channels=data.channels,
    )
    code = 200 if result.get('passed') else 422
    return {'code': code, 'msg': 'passed' if result.get('passed') else 'below threshold', 'data': result}


@router.get('/eval/retrieval/smoke', summary='检索通路健康检查')
@require_permission('knowledge.entry.view')
def retrieval_smoke_test(request):
    """快速检查检索通路是否正常（CI 专用）"""
    from .retrieval_evaluator import run_smoke_test

    result = run_smoke_test()
    code = 200 if result.get('status') == 'ok' else 206
    return {'code': code, 'msg': result.get('status'), 'data': result}


# ── 外部知识采集触发 API ──

@router.post('/harvest/trigger', summary='手动触发外部知识采集')
@require_permission('knowledge.entry.create')
def trigger_harvest(request):
    """管理员手动触发外部知识采集（NMPA / SOP / 论文）"""
    from .tasks import run_external_fetchers
    run_external_fetchers.delay()
    return {'code': 200, 'msg': '采集任务已加入队列', 'data': {}}


@router.post('/harvest/papers', summary='触发论文关键词采集')
@require_permission('knowledge.entry.create')
def trigger_paper_scout(request):
    """手动触发论文采集（从 PubMed 按配置关键词检索）"""
    from .tasks import paper_scout_run
    paper_scout_run.delay()
    return {'code': 200, 'msg': '论文采集任务已加入队列', 'data': {}}


# ── Phase 5：知识治理 API ──

class StatusTransitionIn(Schema):
    target_status: str
    reason: Optional[str] = ''


@router.post('/entries/{entry_id}/status', summary='知识条目状态转换')
@require_permission('knowledge.entry.review')
def transition_status(request, entry_id: int, data: StatusTransitionIn):
    """
    知识条目状态机转换。

    允许的转换链：
    draft → processed → pending_review → published → archived
    任意状态 → rejected
    rejected → draft
    """
    from .governance import transition_entry_status

    account = _get_account_from_request(request)
    operator_id = account.id if account else None

    success, msg = transition_entry_status(
        entry_id=entry_id,
        target_status=data.target_status,
        operator_id=operator_id,
        reason=data.reason or '',
    )
    code = 200 if success else 400
    return {'code': code, 'msg': msg, 'data': {'entry_id': entry_id, 'status': data.target_status}}





@router.post('/entries/{entry_id}/rescore', summary='重新计算知识条目质量评分')
@require_permission('knowledge.entry.create')
def rescore_entry(request, entry_id: int):
    """手动触发重新计算质量评分"""
    from .governance import recalculate_quality_score

    result = recalculate_quality_score(entry_id)
    code = 200 if result.get('success') else 404
    return {'code': code, 'msg': 'OK', 'data': result}


@router.get('/governance/stats', summary='知识治理统计')
@require_permission('knowledge.entry.view')
def governance_stats(request):
    """获取知识库整体治理状态统计"""
    from .governance import get_knowledge_governance_stats

    result = get_knowledge_governance_stats()
    return {'code': 200, 'msg': 'OK', 'data': result}
