"""
统一生产级知识检索网关

五层架构（所有入口必须经过此链，禁止在 benchmark/agent 中建立私有影子检索）：
  Layer 1 - 多通道候选召回（keyword / vector / graph / feishu_doc）
  Layer 2 - 候选 hydration（加载完整字段、执行数据范围过滤）
  Layer 3 - RRF 初排融合（Reciprocal Rank Fusion，k=60）
  Layer 4 - Stage-2 Reranker 插槽（可插拔，当前为置信度精排）
  Layer 5 - 结果序列化（统一输出格式，含 score/channels/confidence）

向量层职责：
  - 主召回：Qdrant MCP（ANN 向量检索）
  - fallback：pgvector（Postgres 扩展，维度须与 Qdrant 一致）
  - embedding 契约：jinaai/jina-embeddings-v3 1024 维（本地主通道）

调用方约定：
  - API 层：直接调用 multi_channel_search()
  - Agent 层（agent_gateway）：调用 multi_channel_search()，不再做额外排序
  - 评测层（benchmark）：调用 multi_channel_search()，不得附加私有 boost/rerank
"""
import logging
import os
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from django.db import connection
from django.db.models import Q, Case, When, Value, IntegerField, F

from .models import KnowledgeEntry, KnowledgeEntity, KnowledgeRelation
from libs.db_utils import paginate_queryset

logger = logging.getLogger(__name__)

RRF_K = 60
KEYWORD_WEIGHT = 1.0
VECTOR_WEIGHT = 1.2
GRAPH_WEIGHT = 0.8
FEISHU_DOC_WEIGHT = 0.6

# ── 候选池大小（召回候选数 = top_k × CANDIDATE_MULTIPLIER，供 reranker 精排）──
CANDIDATE_MULTIPLIER = 4
CANDIDATE_MIN = 30

# ── Graphiti 阈值接入配置 ─────────────────────────────────────────────────
GRAPHITI_MIN_ENTITIES = int(os.getenv('GRAPHITI_MIN_ENTITIES', '10000'))
GRAPHITI_MIN_RELATIONS = int(os.getenv('GRAPHITI_MIN_RELATIONS', '2000'))
GRAPHITI_DEFAULT_MAX_HOPS = int(os.getenv('GRAPHITI_DEFAULT_MAX_HOPS', '3'))
GRAPHITI_QUERY_HINTS = (
    '路径', '链路', '多跳', '关系', '依赖', '影响', '追溯', 'upstream', 'downstream',
    'path', 'graph', 'hop', 'depends on', 'impact',
)
_graphiti_readiness_cache: Dict[str, Any] = {'ts': 0.0, 'ready': False, 'stats': {}}

# ── 置信度评分配置 ──────────────────────────────────────────────────
# 通道交叉验证权重：命中越多通道 → 置信度越高
CONFIDENCE_CHANNEL_BONUS = {
    1: 0,       # 单通道命中：无加成
    2: 15,      # 双通道交叉验证：+15
    3: 30,      # 三通道交叉验证：+30
    4: 40,      # 四通道交叉验证：+40
}
# 来源权威性加成：不同 entry_type 的固有权威性
CONFIDENCE_SOURCE_AUTHORITY = {
    'regulation': 20,       # 法规：最权威
    'sop': 15,              # SOP：内部标准化文档
    'method_reference': 15, # 方法参考：标准方法
    'proposal_template': 10,
    'instrument_spec': 10,
    'ingredient_data': 10,
    'paper_abstract': 8,    # 论文：有学术权威但需判断
    'lesson_learned': 5,    # 经验教训：主观性较强
    'faq': 5,
    'competitor_intel': 3,
    'market_insight': 3,
    'feishu_doc': 2,        # 飞书文档：非正式来源
    'meeting_decision': 2,
}
# 图谱通道命中时的结构化加成（说明知识有本体关系支撑）
CONFIDENCE_GRAPH_BONUS = 10
# 置信度等级划分
CONFIDENCE_LEVELS = [
    (80, 'high',   '高置信：多通道交叉验证 + 权威来源'),
    (50, 'medium', '中置信：部分交叉验证或权威来源'),
    (0,  'low',    '低置信：单通道命中，建议人工复核'),
]


def hybrid_search(
    query: str,
    entry_type: Optional[str] = None,
    tags: Optional[List[str]] = None,
    page: int = 1,
    page_size: int = 20,
    execution_context=None,  # Optional[SkillExecutionContext]
):
    """
    向后兼容的入口：仅关键词召回 + 元数据过滤

    execution_context: 若提供，则按用户的 data_scope 过滤知识条目：
    - global (admin): 无附加过滤
    - 其他: 仅返回全局发布条目（KnowledgeEntry 无项目字段，
      暂以 is_published=True 作为公开标记，未来可扩展 project_id）
    """
    if execution_context is None:
        logger.warning(
            'hybrid_search called without execution_context — fail-closed, returning no data'
        )
        return paginate_queryset(KnowledgeEntry.objects.none(), page=page, page_size=page_size, max_page_size=200)

    qs = KnowledgeEntry.objects.filter(is_deleted=False, is_published=True)

    # 数据范围过滤：非管理员只能访问无项目归属的全局知识条目
    if execution_context is not None and not execution_context.is_admin:
        # KnowledgeEntry 暂无 protocol_id 字段，使用 namespace 区分；
        # 无 namespace 的条目视为全局公开，有 namespace 的仅对有权限用户开放。
        # 此处将 namespace 非空的条目限制为管理员，确保安全默认。
        qs = _apply_knowledge_scope(qs, execution_context)

    if entry_type:
        qs = qs.filter(entry_type=entry_type)
    if tags:
        for tag in tags:
            qs = qs.filter(tags__contains=tag)

    if query:
        qs = _apply_keyword_search_queryset(qs, query)
    else:
        qs = qs.order_by('-update_time')

    return paginate_queryset(qs, page=page, page_size=page_size, max_page_size=200)


def _can_use_postgres_fts() -> bool:
    return connection.vendor == 'postgresql'


def _segment_query_for_search(query: str) -> List[str]:
    """为中文 FTS 预分词；缺依赖或失败时回退到现有关键词提取。"""
    if not query:
        return []

    extracted = _extract_keywords(query)
    tokens: List[str] = []
    try:
        import jieba

        segmented = jieba.lcut_for_search(query)
    except Exception:
        segmented = []

    for token in segmented + extracted:
        token = (token or '').strip()
        if not token:
            continue
        if len(token) == 1 and not token.isascii():
            continue
        if token not in tokens:
            tokens.append(token)
    return tokens or extracted


def _apply_keyword_search_queryset(qs, query: str):
    """对给定 queryset 应用关键词检索排序，优先使用 PostgreSQL FTS。"""
    if not query:
        return qs.order_by('-update_time')

    if _can_use_postgres_fts():
        try:
            from django.contrib.postgres.search import SearchVector, SearchQuery, SearchRank

            tokens = _segment_query_for_search(query)
            if tokens:
                segmented_query = ' '.join(tokens)
                weighted_vector = SearchVector('search_vector_text', weight='A', config='simple')
                search_query = SearchQuery(segmented_query, search_type='plain', config='simple')
                fts_qs = qs.exclude(search_vector_text='').annotate(
                    fts_vector=weighted_vector,
                    exact_query_title_hit=Case(
                        When(title__icontains=query, then=Value(10)),
                        default=Value(0),
                        output_field=IntegerField(),
                    ),
                    exact_query_summary_hit=Case(
                        When(summary__icontains=query, then=Value(6)),
                        default=Value(0),
                        output_field=IntegerField(),
                    ),
                ).annotate(
                    fts_rank=SearchRank(weighted_vector, search_query),
                ).filter(
                    fts_vector=search_query,
                ).order_by(
                    '-exact_query_title_hit',
                    '-exact_query_summary_hit',
                    '-fts_rank',
                    '-quality_score',
                    '-update_time',
                )
                if fts_qs.exists():
                    return fts_qs
        except Exception as e:
            logger.debug('PostgreSQL FTS unavailable, fallback to legacy keyword search: %s', e)

    keywords = _segment_query_for_search(query)
    q_filter = Q()
    for kw in keywords:
        q_filter |= (
            Q(title__icontains=kw) |
            Q(content__icontains=kw) |
            Q(summary__icontains=kw)
        )
    return qs.filter(q_filter).annotate(
        title_hit=Case(
            When(title__icontains=query, then=Value(3)),
            default=Value(0),
            output_field=IntegerField(),
        ),
        summary_hit=Case(
            When(summary__icontains=query, then=Value(2)),
            default=Value(0),
            output_field=IntegerField(),
        ),
        content_hit=Case(
            When(content__icontains=query, then=Value(1)),
            default=Value(0),
            output_field=IntegerField(),
        ),
    ).order_by('-title_hit', '-summary_hit', '-content_hit', '-update_time')


def multi_channel_search(
    query: str,
    entry_type: Optional[str] = None,
    tags: Optional[List[str]] = None,
    channels: Optional[List[str]] = None,
    top_k: int = 20,
    execution_context=None,  # Optional[SkillExecutionContext]
    enable_rerank: bool = True,
    graph_max_hops: int = 1,
    graph_relation_types: Optional[List[str]] = None,
    graph_min_confidence: float = 0.0,
) -> Dict[str, Any]:
    """
    统一生产检索主入口（五层架构）。

    所有调用方（API、Agent、benchmark）必须使用此函数，禁止在调用方附加私有 boost/rerank。

    Layer 1 - 多通道候选召回
    Layer 2 - 候选 hydration + 数据范围过滤
    Layer 3 - RRF 初排融合
    Layer 4 - Stage-2 Reranker 精排（可通过 enable_rerank=False 关闭，仅用于对比实验）
    Layer 5 - 结果序列化（统一输出格式）

    Args:
        channels: 召回通道，默认 ["keyword", "vector", "graph"]
        top_k: 最终返回条数
        execution_context: 用户执行上下文，用于数据范围过滤
        enable_rerank: 是否启用二阶段 reranker（默认 True）

    Returns:
        {
            items: [...],          # 最终排序结果
            channels_used: [...],  # 实际使用的召回通道
            total_candidates: int, # 候选池大小
            reranked: bool,        # 是否经过 reranker
            rerank_provider: str,  # 实际使用的 reranker
        }
    """
    if execution_context is None:
        logger.warning(
            'multi_channel_search called without execution_context — fail-closed, returning no data'
        )
        return {
            'items': [],
            'channels_used': [],
            'total_candidates': 0,
            'reranked': False,
        }

    if channels is None:
        channels = ['keyword', 'vector', 'graph']

    # ── Layer 1: 多通道候选召回 ──────────────────────────────────────────────
    # 候选池大小 = max(top_k * CANDIDATE_MULTIPLIER, CANDIDATE_MIN)
    # 扩大候选池目的是让 reranker 有充足的选择空间
    candidate_limit = max(top_k * CANDIDATE_MULTIPLIER, CANDIDATE_MIN)

    channel_rankings: Dict[str, List[int]] = {}
    feishu_doc_raw_items: List[Dict[str, Any]] = []

    if 'keyword' in channels:
        kw_ids = _keyword_recall(query, entry_type, tags, limit=candidate_limit)
        channel_rankings['keyword'] = kw_ids

    if 'vector' in channels:
        vec_ids = _vector_recall(query, entry_type, limit=candidate_limit)
        channel_rankings['vector'] = vec_ids

    if 'graph' in channels:
        graph_ids = _graph_recall(
            query,
            entry_type,
            limit=candidate_limit,
            graph_max_hops=graph_max_hops,
            graph_relation_types=graph_relation_types,
            graph_min_confidence=graph_min_confidence,
        )
        channel_rankings['graph'] = graph_ids

    if 'feishu_doc' in channels:
        feishu_doc_raw_items = _feishu_doc_recall(query, top_k=candidate_limit)
        if feishu_doc_raw_items:
            fd_virtual_ids = [-(i + 1) for i in range(len(feishu_doc_raw_items))]
            channel_rankings['feishu_doc'] = fd_virtual_ids

    # 收集所有候选 ID
    all_candidate_ids: Set[int] = set()
    for ids in channel_rankings.values():
        all_candidate_ids.update(ids)

    if not all_candidate_ids:
        return {
            'items': [],
            'channels_used': list(channel_rankings.keys()),
            'total_candidates': 0,
            'reranked': False,
        }

    # ── Layer 2: 候选 hydration + 数据范围过滤 ─────────────────────────────
    real_entry_ids = [eid for eid in all_candidate_ids if eid > 0]
    entries_qs = KnowledgeEntry.objects.filter(id__in=real_entry_ids, is_deleted=False)
    if execution_context is not None and not execution_context.is_admin:
        entries_qs = _apply_knowledge_scope(entries_qs, execution_context)
    entry_map: Dict[int, KnowledgeEntry] = {e.id: e for e in entries_qs}

    fd_item_map = {-(i + 1): item for i, item in enumerate(feishu_doc_raw_items)}

    # ── Layer 3: RRF 初排融合 ───────────────────────────────────────────────
    rrf_scores = _rrf_fusion(channel_rankings)

    # 经过 hydration 过滤后重新排序（scope filter 可能排除部分候选）
    valid_ids = [
        eid for eid in sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)
        if (eid > 0 and eid in entry_map) or (eid < 0 and eid in fd_item_map)
    ]

    # ── Layer 4: Stage-2 Reranker 精排 ─────────────────────────────────────
    # 当前实现：置信度感知精排（可替换为外部 Jina/Cohere rerank MCP）
    # 接口约定：输入 query + candidate_ids → 输出重排后的 ids + rerank_scores
    reranked = False
    rerank_scores: Dict[int, float] = {}
    rerank_provider = 'none'
    if enable_rerank and len(valid_ids) > top_k:
        rerank_result = _stage2_rerank(
            query=query,
            candidate_ids=valid_ids,
            entry_map=entry_map,
            fd_item_map=fd_item_map,
            rrf_scores=rrf_scores,
            channel_rankings=channel_rankings,
            top_n=top_k,
        )
        final_ids = rerank_result['ids']
        reranked = rerank_result['did_rerank']
        rerank_scores = rerank_result['scores']
        rerank_provider = rerank_result['provider']
    else:
        final_ids = valid_ids[:top_k]
        rerank_scores = {eid: rrf_scores.get(eid, 0.0) for eid in final_ids}

    # ── Layer 5: 结果序列化 ──────────────────────────────────────────────────
    items = _serialize_results(
        ids=final_ids,
        entry_map=entry_map,
        fd_item_map=fd_item_map,
        channel_rankings=channel_rankings,
        rrf_scores=rrf_scores,
        rerank_scores=rerank_scores,
        rerank_provider=rerank_provider,
    )

    return {
        'items': items,
        'channels_used': list(channel_rankings.keys()),
        'total_candidates': len(all_candidate_ids),
        'reranked': reranked,
        'rerank_provider': rerank_provider,
    }


def _stage2_rerank(
    query: str,
    candidate_ids: List[int],
    entry_map: Dict[int, 'KnowledgeEntry'],
    fd_item_map: Dict[int, Dict[str, Any]],
    rrf_scores: Dict[int, float],
    channel_rankings: Dict[str, List[int]],
    top_n: int,
) -> Dict[str, Any]:
    """
    Stage-2 Reranker 插槽（可替换为外部 Jina/Cohere rerank MCP）。

    当前实现：多信号融合精排
      - RRF 初排分数（基础）
      - 多通道交叉验证加成（命中通道越多越高）
      - 来源权威性加成
      - 图谱结构化加成

    外部 reranker 接入方式：
      1. 将 query + candidate passages 发送到 Jina/Cohere rerank API
      2. 获取 rerank_score 替换当前多信号分数
      3. 按新分数重排，取 top_n

    输入/输出协议（固定，便于未来切换外部 reranker）：
      输入: query (str), candidate_ids (List[int]) + 元数据
      输出: (reranked_ids: List[int], did_rerank: bool)
    """
    # 尝试外部 reranker（Jina/Cohere MCP）
    external_result = _try_external_rerank(query, candidate_ids, entry_map, fd_item_map, top_n)
    if external_result is not None:
        return external_result

    # 本地多信号精排（fallback）
    scored: List[Tuple[int, float]] = []
    for eid in candidate_ids:
        rrf_score = rrf_scores.get(eid, 0.0)

        # 确定该候选命中的通道
        source_channels = [ch for ch, ids in channel_rankings.items() if eid in ids]

        if eid > 0:
            entry = entry_map.get(eid)
            if not entry:
                continue
            entry_type = entry.entry_type
            source_type = entry.source_type or ''
            title = entry.title or ''
        else:
            entry_type = 'feishu_doc'
            source_type = 'feishu_doc'
            title = fd_item_map.get(eid, {}).get('title', '')

        # 多信号综合分
        rerank_score = _compute_rerank_score(
            query,
            rrf_score,
            source_channels,
            entry_type,
            source_type=source_type,
            title=title,
        )
        scored.append((eid, rerank_score))

    scored.sort(key=lambda x: x[1], reverse=True)
    local_scores = {eid: score for eid, score in scored}
    return {
        'ids': [eid for eid, _ in scored[:top_n]],
        'did_rerank': True,
        'provider': 'local_multi_signal',
        'scores': local_scores,
    }


def _try_external_rerank(
    query: str,
    candidate_ids: List[int],
    entry_map: Dict[int, 'KnowledgeEntry'],
    fd_item_map: Dict[int, Dict[str, Any]],
    top_n: int,
) -> Optional[Dict[str, Any]]:
    """
    尝试调用外部 reranker MCP（Jina/Cohere）。
    不可用时返回 None，由调用方降级到本地多信号精排。
    """
    try:
        from libs.mcp_client import rerank_passages
        passages = []
        id_order = []
        for eid in candidate_ids:
            if eid > 0:
                entry = entry_map.get(eid)
                if not entry:
                    continue
                text = (entry.title or '') + '\n' + (entry.summary or entry.content or '')[:500]
            else:
                item = fd_item_map.get(eid, {})
                text = (item.get('title', '') + '\n' + item.get('summary', ''))[:500]
            passages.append(text)
            id_order.append(eid)

        if not passages:
            return None

        result = rerank_passages(query=query, passages=passages, top_n=top_n)
        if 'error' in result or not result.get('results'):
            return None

        reranked_order = []
        rerank_scores: Dict[int, float] = {}
        for item in result['results'][:top_n]:
            idx = item.get('index')
            if idx is not None and 0 <= idx < len(id_order):
                eid = id_order[idx]
                reranked_order.append(eid)
                rerank_scores[eid] = float(item.get('relevance_score', 0.0))
        if not reranked_order:
            return None
        return {
            'ids': reranked_order,
            'did_rerank': True,
            'provider': 'external_reranker',
            'scores': rerank_scores,
        }
    except Exception as e:
        logger.debug('External reranker unavailable: %s', e)
        return None


def _compute_rerank_score(
    query: str,
    rrf_score: float,
    source_channels: List[str],
    entry_type: str,
    source_type: str = '',
    title: str = '',
) -> float:
    """
    多信号融合精排分数（本地 reranker fallback）。

    分数构成：
      rrf_score（基础）× (1 + 通道交叉加成) + 来源权威性加成 + 图谱加成 + 查询意图加成
    """
    # 通道交叉加成：命中通道数越多越高
    channel_bonus_map = {1: 0.0, 2: 0.08, 3: 0.15, 4: 0.20}
    ch_count = len(source_channels)
    channel_bonus = channel_bonus_map.get(ch_count, 0.20)

    # 来源权威性加成（已归一化到 0-0.20）
    authority_map = {
        'regulation': 0.20, 'sop': 0.15, 'method_reference': 0.15,
        'proposal_template': 0.10, 'instrument_spec': 0.10, 'ingredient_data': 0.10,
        'paper_abstract': 0.08, 'lesson_learned': 0.05, 'faq': 0.05,
        'competitor_intel': 0.03, 'market_insight': 0.03, 'feishu_doc': 0.02,
    }
    authority_bonus = authority_map.get(entry_type, 0.0)

    source_type_bonus_map = {
        'nmpa_import': 0.18,
        'ich_import': 0.18,
        'gb_standard_import': 0.18,
        'authority_clause_card': 0.16,
        'ingredient_safety_seed': 0.15,
        'quality_ops_seed': 0.15,
        'specialist_anchor_seed': 0.12,
        'public_evidence_seed': 0.10,
        'pubmed_import': 0.10,
        'paper_scout': 0.08,
        'manual_ingest': 0.08,
        'sop_sync': 0.06,
        'digital_worker_asset': 0.02,
        'benchmark_asset': 0.02,
        'topic_package_playbook': -0.18,
        'entity_bridge_fix': -0.10,
    }
    source_type_bonus = source_type_bonus_map.get(source_type or '', 0.0)

    # 图谱结构化加成
    graph_bonus = 0.05 if 'graph' in source_channels else 0.0

    intent_bonus = _compute_query_intent_bonus(query, entry_type)
    normalized_query = ''.join((query or '').lower().split())
    normalized_title = ''.join((title or '').lower().split())
    exact_title_bonus = 0.18 if normalized_query and normalized_title and normalized_query in normalized_title else 0.0

    return (
        rrf_score * (1.0 + channel_bonus)
        + authority_bonus
        + source_type_bonus
        + graph_bonus
        + intent_bonus
        + exact_title_bonus
    )


def _compute_query_intent_bonus(query: str, entry_type: str) -> float:
    """
    根据用户问题意图，修正条目类型优先级。

    目标：
    - 仪器/方法问题：不让法规类条目把 instrument_spec / method_reference 压到后面
    - 统计/设计问题：优先 method_reference / proposal_template / paper_abstract
    - 成分问题：优先 ingredient_data，其次 regulation
    - 法规问题：优先 regulation / sop
    """
    q = (query or '').lower()

    def has_any(*keywords: str) -> bool:
        return any(keyword in q for keyword in keywords)

    # 仪器 / 方法
    if has_any('仪器', 'corneometer', 'tewameter', 'vapometer', 'mexameter', 'cutometer', 'visia', '波长', '测量原理'):
        boost_map = {
            'instrument_spec': 0.22,
            'method_reference': 0.18,
            'sop': 0.10,
            'paper_abstract': 0.06,
            'regulation': -0.08,
        }
        return boost_map.get(entry_type, 0.0)

    # 统计 / 设计
    if has_any('样本量', '正态性', '配对t', 'wilcoxon', "cohen's d", 'cohen', '效应量', '统计分析', 'sap'):
        boost_map = {
            'method_reference': 0.22,
            'proposal_template': 0.14,
            'paper_abstract': 0.10,
            'sop': 0.08,
            'regulation': -0.06,
        }
        return boost_map.get(entry_type, 0.0)

    # 成分 / 安全
    if has_any('烟酰胺', '神经酰胺', '透明质酸', '视黄醇', '熊果苷', '传明酸', '成分', '安全性', '分子量'):
        boost_map = {
            'ingredient_data': 0.22,
            'paper_abstract': 0.10,
            'regulation': 0.06,
            'method_reference': 0.04,
        }
        return boost_map.get(entry_type, 0.0)

    # 法规 / 合规
    if has_any('法规', '监管', '合规', 'ich', 'gcp', 'nmpa', '宣称'):
        boost_map = {
            'regulation': 0.18,
            'sop': 0.10,
            'method_reference': 0.04,
        }
        return boost_map.get(entry_type, 0.0)

    return 0.0


def _serialize_results(
    ids: List[int],
    entry_map: Dict[int, 'KnowledgeEntry'],
    fd_item_map: Dict[int, Dict[str, Any]],
    channel_rankings: Dict[str, List[int]],
    rrf_scores: Dict[int, float],
    rerank_scores: Dict[int, float],
    rerank_provider: str,
) -> List[Dict[str, Any]]:
    """Layer 5: 统一结果序列化，输出固定格式。"""
    items = []
    for eid in ids:
        if eid > 0:
            entry = entry_map.get(eid)
            if not entry:
                continue
            source_channels = [ch for ch, ch_ids in channel_rankings.items() if eid in ch_ids]
            confidence = _compute_confidence(source_channels, entry.entry_type)
            items.append({
                'id': entry.id,
                'title': entry.title,
                'content': entry.content or '',
                'summary': entry.summary[:300] if entry.summary else '',
                'entry_type': entry.entry_type,
                'tags': entry.tags or [],
                'score': round(rerank_scores.get(eid, rrf_scores.get(eid, 0)), 4),
                'channels': source_channels,
                'confidence': confidence,
                'uri': entry.uri or '',
                'namespace': entry.namespace or '',
                'source_type': entry.source_type or '',
                'score_details': {
                    'rrf_score': round(rrf_scores.get(eid, 0), 6),
                    'rerank_score': round(rerank_scores.get(eid, rrf_scores.get(eid, 0)), 6),
                    'final_score': round(rerank_scores.get(eid, rrf_scores.get(eid, 0)), 6),
                    'rerank_provider': rerank_provider,
                },
                'update_time': entry.update_time.isoformat() if entry.update_time else '',
            })
        else:
            fd_item = fd_item_map.get(eid)
            if fd_item:
                item = dict(fd_item)
                item['score'] = round(rerank_scores.get(eid, rrf_scores.get(eid, 0)), 4)
                item['confidence'] = _compute_confidence(['feishu_doc'], 'feishu_doc')
                item['score_details'] = {
                    'rrf_score': round(rrf_scores.get(eid, 0), 6),
                    'rerank_score': round(rerank_scores.get(eid, rrf_scores.get(eid, 0)), 6),
                    'final_score': round(rerank_scores.get(eid, rrf_scores.get(eid, 0)), 6),
                    'rerank_provider': rerank_provider,
                }
                items.append(item)
    return items


def _extract_keywords(query: str) -> List[str]:
    """
    从查询中提取检索关键词列表。
    策略：
    1. 按常见功能词和标点切分查询，得到实义词段
    2. 对较长的词段再次提取3-6字的核心名词短语
    3. 保留英文专有词（大写、规范编号）
    """
    import re
    keywords = [query]  # 始终包含原始查询

    # 英文专有词：大写首字母单词、全大写缩写、规范编号（支持中文字符之间的英文）
    en_terms = re.findall(
        r'(?<![a-zA-Z])(?:[A-Z][a-zA-Z0-9]+(?:[/-][A-Za-z0-9]+)*|[A-Z]{2,}[0-9]*|'
        r'ISO\s*\d+|GB/T\s*\d+|ICH\s+[A-Z]\d+)(?![a-zA-Z])',
        query,
    )

    # 第一轮：按功能词和标点切分
    split_pattern = (
        r'[，。？！、：；…\s\(\)（）【】\[\]]|'
        r'什么样|什么是|什么|如何|怎么|是否|需要|可以|应该|能否|'
        r'其中|以及|并且|或者|有何|有什么|各自|各有|各是|'
        r'有哪些|主要|常见|一般|通常|简述|请问|请介绍|'
        r'的区别|和处理|的影响|与.*不同|为何|为什么|哪些|那么'
    )
    parts = re.split(split_pattern, query)

    for part in parts:
        part = part.strip()
        if len(part) < 3:
            continue
        if re.match(r'^[a-zA-Z0-9\s]+$', part):
            continue
        if part not in keywords:
            keywords.append(part)

        # 第二轮：对每个词段，提取以"的/和/与/中/后/时/前"等为边界的子段（核心名词）
        sub_parts = re.split(r'[的和与对中后时前里上下]', part)
        for sub in sub_parts:
            sub = sub.strip()
            if 3 <= len(sub) <= 12 and sub not in keywords:
                if not re.match(r'^[a-zA-Z0-9\s]+$', sub):
                    keywords.append(sub)

    for kw in en_terms:
        if kw and kw not in keywords:
            keywords.append(kw)

    # 第三轮：对较长中文词段（>5字），额外提取前3-5字的前缀关键词
    # 这有助于捕获"伦理委员会批件到期"→"伦理委员会"这类实体词头
    import re as _re2
    for kw in list(keywords[1:]):  # 跳过原始查询
        if len(kw) > 5 and not _re2.match(r'^[a-zA-Z0-9\s]+$', kw):
            chinese_chars = _re2.findall(r'[\u4e00-\u9fff]+', kw)
            for segment in chinese_chars:
                # 提取3-5字的前缀
                for n in (3, 4, 5):
                    prefix = segment[:n]
                    if len(prefix) == n and prefix not in keywords:
                        keywords.append(prefix)

    return keywords


def _keyword_recall(
    query: str,
    entry_type: Optional[str],
    tags: Optional[List[str]],
    limit: int = 40,
) -> List[int]:
    """
    关键词通道：多关键词加权召回。
    对长句查询自动拆分关键词做 OR 检索，并按关键词命中数量加权排序。
    """
    if not query:
        return []

    qs = KnowledgeEntry.objects.filter(
        is_deleted=False, is_published=True,
    )

    if entry_type:
        qs = qs.filter(entry_type=entry_type)
    if tags:
        for tag in tags:
            qs = qs.filter(tags__contains=tag)

    qs = _apply_keyword_search_queryset(qs, query)
    return list(qs.values_list('id', flat=True)[:limit])


def _vector_recall(
    query: str,
    entry_type: Optional[str],
    limit: int = 40,
) -> List[int]:
    """
    向量通道：优先 Qdrant MCP，降级到 pgvector。

    策略：
    1. 尝试 Qdrant MCP（独立向量数据库，通过 embedding_id 关联 KnowledgeEntry）
    2. 降级：尝试 pgvector（需 embedding 列 + 扩展已安装）
    3. 均不可用时返回空
    """
    if not query:
        return []

    # 路径 1: Qdrant MCP
    qdrant_ids = _vector_recall_qdrant(query, entry_type, limit)
    if qdrant_ids:
        return qdrant_ids

    # 路径 2: pgvector 降级
    return _vector_recall_pgvector(query, entry_type, limit)


def _vector_recall_qdrant(
    query: str,
    entry_type: Optional[str],
    limit: int = 40,
) -> List[int]:
    """通过 Qdrant MCP 进行向量检索"""
    try:
        from libs.mcp_client import vector_search
        result = vector_search(query=query, top_k=limit)

        if 'error' in result:
            logger.debug('Qdrant MCP unavailable: %s', result['error'])
            return []

        content = result.get('content', '')
        if not content:
            return []

        import json
        try:
            points = json.loads(content) if isinstance(content, str) else content
        except (json.JSONDecodeError, TypeError):
            return []

        if not isinstance(points, list):
            return []

        embedding_ids = []
        for point in points:
            payload = point.get('payload', {})
            entry_id = payload.get('entry_id')
            if entry_id:
                if entry_type and payload.get('entry_type') != entry_type:
                    continue
                embedding_ids.append(int(entry_id))

        if not embedding_ids:
            entry_ids_from_embed = list(
                KnowledgeEntry.objects.filter(
                    embedding_id__in=[str(p.get('id', '')) for p in points],
                    is_deleted=False,
                    is_published=True,
                ).values_list('id', flat=True)[:limit]
            )
            if entry_type and entry_ids_from_embed:
                entry_ids_from_embed = list(
                    KnowledgeEntry.objects.filter(
                        id__in=entry_ids_from_embed,
                        entry_type=entry_type,
                    ).values_list('id', flat=True)
                )
            return entry_ids_from_embed

        return embedding_ids[:limit]

    except Exception as e:
        logger.debug('Qdrant vector recall failed: %s', e)
        return []


def _vector_recall_pgvector(
    query: str,
    entry_type: Optional[str],
    limit: int = 40,
) -> List[int]:
    """pgvector 降级路径（使用 embedding_vector 列，参数顺序正确）"""
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
            )
            if not cursor.fetchone():
                return []
            # 检查 embedding_vector 列是否存在
            cursor.execute(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 't_knowledge_entry' AND column_name = 'embedding_vector'",
            )
            if not cursor.fetchone():
                logger.debug('pgvector: embedding_vector column not found on t_knowledge_entry')
                return []
    except Exception:
        return []

    try:
        embedding = _get_embedding(query)
        if not embedding:
            return []

        from django.db import connection

        # 参数顺序：entry_type（可选，WHERE 条件中）、embedding（ORDER BY 中）、limit（LIMIT 中）
        if entry_type:
            sql = """
                SELECT id FROM t_knowledge_entry
                WHERE is_deleted = false AND is_published = true
                  AND embedding_vector IS NOT NULL
                  AND entry_type = %s
                ORDER BY embedding_vector <=> %s::vector
                LIMIT %s
            """
            params = [entry_type, embedding, limit]
        else:
            sql = """
                SELECT id FROM t_knowledge_entry
                WHERE is_deleted = false AND is_published = true
                  AND embedding_vector IS NOT NULL
                ORDER BY embedding_vector <=> %s::vector
                LIMIT %s
            """
            params = [embedding, limit]

        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return [row[0] for row in cursor.fetchall()]
    except Exception as e:
        logger.debug('pgvector recall unavailable: %s', e)
        return []


def _graph_recall(
    query: str,
    entry_type: Optional[str],
    limit: int = 40,
    graph_max_hops: int = 1,
    graph_relation_types: Optional[List[str]] = None,
    graph_min_confidence: float = 0.0,
) -> List[int]:
    """
    图谱通道：通过 KnowledgeEntity 的 label 匹配，
    沿 KnowledgeRelation 扩展到关联实体，
    最后映射回 linked_entry。
    """
    if not query:
        return []

    relation_types = [item for item in (graph_relation_types or []) if item]
    max_hops = max(1, min(int(graph_max_hops or 1), 2))
    min_confidence = max(float(graph_min_confidence or 0.0), 0.0)

    if _should_use_graphiti(query) and not relation_types and min_confidence <= 0 and max_hops == 1:
        graphiti_ids = _graphiti_recall(query, entry_type=entry_type, limit=limit)
        if graphiti_ids:
            return graphiti_ids

    matched_entities = KnowledgeEntity.objects.filter(
        is_deleted=False,
    ).filter(
        Q(label__icontains=query) |
        Q(label_en__icontains=query) |
        Q(definition__icontains=query)
    ).values_list('id', flat=True)[:20]

    if not matched_entities:
        return []

    discovered_entity_ids: List[int] = []
    visited: Set[int] = set()
    frontier: List[int] = list(matched_entities)

    for entity_id in frontier:
        if entity_id not in visited:
            visited.add(entity_id)
            discovered_entity_ids.append(entity_id)

    for _hop in range(max_hops):
        if not frontier:
            break
        rel_qs = KnowledgeRelation.objects.filter(
            is_deleted=False,
            confidence__gte=min_confidence,
        ).filter(
            Q(subject_id__in=frontier) | Q(object_id__in=frontier)
        )
        if relation_types:
            rel_qs = rel_qs.filter(relation_type__in=relation_types)

        next_frontier: List[int] = []
        for subj, obj in rel_qs.values_list('subject_id', 'object_id'):
            for candidate in (subj, obj):
                if candidate not in visited:
                    visited.add(candidate)
                    discovered_entity_ids.append(candidate)
                    next_frontier.append(candidate)
        frontier = next_frontier

    entry_rows = list(
        KnowledgeEntity.objects.filter(
            id__in=discovered_entity_ids,
            linked_entry__isnull=False,
            is_deleted=False,
        ).values_list('id', 'linked_entry_id')
    )
    entity_to_entry = {entity_id: entry_id for entity_id, entry_id in entry_rows}
    result: List[int] = []
    seen_entry_ids: Set[int] = set()
    for entity_id in discovered_entity_ids:
        entry_id = entity_to_entry.get(entity_id)
        if not entry_id or entry_id in seen_entry_ids:
            continue
        seen_entry_ids.add(entry_id)
        result.append(entry_id)
        if len(result) >= limit:
            break

    if entry_type:
        result = list(
            KnowledgeEntry.objects.filter(
                id__in=result, entry_type=entry_type, is_deleted=False,
            ).values_list('id', flat=True)
        )

    return result


def _should_use_graphiti(query: str) -> bool:
    """
    Graphiti 阈值接入：
    只有在知识图谱规模达到阈值，且查询具备明显多跳/关系型意图时才启用。
    """
    if os.getenv('KNOWLEDGE_ENABLE_GRAPHITI_THRESHOLD', 'true').strip().lower() in (
        '0', 'false', 'no', 'off'
    ):
        return False

    normalized = (query or '').lower()
    if not any(hint in normalized for hint in GRAPHITI_QUERY_HINTS):
        return False

    return _graphiti_ready()


def _graphiti_ready() -> bool:
    now = time.time()
    cache_ttl = 60
    if now - _graphiti_readiness_cache['ts'] < cache_ttl:
        return bool(_graphiti_readiness_cache['ready'])

    entity_count = KnowledgeEntity.objects.filter(is_deleted=False).count()
    relation_count = KnowledgeRelation.objects.filter(is_deleted=False).count()
    ready = entity_count >= GRAPHITI_MIN_ENTITIES and relation_count >= GRAPHITI_MIN_RELATIONS
    _graphiti_readiness_cache.update({
        'ts': now,
        'ready': ready,
        'stats': {
            'entity_count': entity_count,
            'relation_count': relation_count,
            'entity_threshold': GRAPHITI_MIN_ENTITIES,
            'relation_threshold': GRAPHITI_MIN_RELATIONS,
        },
    })
    return ready


def _graphiti_recall(
    query: str,
    entry_type: Optional[str],
    limit: int,
) -> List[int]:
    """
    Graphiti 多跳检索路径。

    当前作为图谱通道的高阶升级版：
    - 阈值未到：完全不触发
    - Graphiti 服务不可用：静默降级回 PostgreSQL 图谱
    - Graphiti 服务可用：优先解析 linked_entry_id / entry_id / uri
    """
    try:
        from libs.mcp_client import graphiti_search

        result = graphiti_search(
            query=query,
            top_k=limit,
            max_hops=GRAPHITI_DEFAULT_MAX_HOPS,
        )
        if not result or result.get('error'):
            return []

        rows = result.get('results') or result.get('items') or []
        if not isinstance(rows, list):
            return []

        entry_ids: List[int] = []
        pending_uris: List[str] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            linked_entry_id = row.get('linked_entry_id') or row.get('entry_id')
            if isinstance(linked_entry_id, int):
                entry_ids.append(linked_entry_id)
                continue
            uri = row.get('uri') or row.get('entity_uri')
            if isinstance(uri, str) and uri.strip():
                pending_uris.append(uri.strip())

        if pending_uris:
            mapped_ids = list(
                KnowledgeEntity.objects.filter(
                    uri__in=pending_uris,
                    linked_entry__isnull=False,
                    is_deleted=False,
                ).values_list('linked_entry_id', flat=True)
            )
            entry_ids.extend(mapped_ids)

        if not entry_ids:
            return []

        deduped: List[int] = []
        seen: Set[int] = set()
        for entry_id in entry_ids:
            if entry_id not in seen:
                seen.add(entry_id)
                deduped.append(entry_id)

        if entry_type:
            deduped = list(
                KnowledgeEntry.objects.filter(
                    id__in=deduped,
                    entry_type=entry_type,
                    is_deleted=False,
                ).values_list('id', flat=True)
            )

        logger.info('Graphiti threshold recall used for query=%s', query[:80])
        return deduped[:limit]
    except Exception as e:
        logger.debug('Graphiti recall unavailable: %s', e)
        return []


def _feishu_doc_recall(
    query: str,
    top_k: int = 20,
) -> List[Dict[str, Any]]:
    """
    飞书文档通道：调用飞书云文档搜索 API，返回知识检索结果格式。
    飞书 API 不可用时静默降级。
    """
    if not query:
        return []

    try:
        from libs.feishu_client import feishu_client

        docs_data = feishu_client.search_documents(query)
        docs = docs_data.get('items', docs_data if isinstance(docs_data, list) else [])
        if not docs:
            return []

        items = []
        for rank, doc in enumerate(docs[:top_k]):
            score = FEISHU_DOC_WEIGHT * (1.0 / (RRF_K + rank + 1))
            items.append({
                'id': None,
                'title': doc.get('title', ''),
                'summary': doc.get('preview', doc.get('snippet', ''))[:300],
                'entry_type': 'feishu_doc',
                'tags': [],
                'score': round(score, 4),
                'channels': ['feishu_doc'],
                'uri': doc.get('url', doc.get('docs_url', '')),
                'update_time': doc.get('edit_time', ''),
                'source': 'feishu',
                'doc_token': doc.get('docs_token', doc.get('doc_token', '')),
            })
        return items
    except Exception as e:
        logger.debug('Feishu doc recall unavailable: %s', e)
        return []


def _rrf_fusion(
    channel_rankings: Dict[str, List[int]],
) -> Dict[int, float]:
    """Reciprocal Rank Fusion (RRF) 多路融合"""
    weight_map = {
        'keyword': KEYWORD_WEIGHT,
        'vector': VECTOR_WEIGHT,
        'graph': GRAPH_WEIGHT,
        'feishu_doc': FEISHU_DOC_WEIGHT,
    }
    scores: Dict[int, float] = defaultdict(float)

    for channel, ids in channel_rankings.items():
        w = weight_map.get(channel, 1.0)
        # 对每个通道的ID列表去重（保留首次出现的排名），防止重复累加分数
        seen: Set[int] = set()
        for rank, entry_id in enumerate(ids):
            if entry_id not in seen:
                seen.add(entry_id)
                scores[entry_id] += w * (1.0 / (RRF_K + rank + 1))

    return dict(scores)


def _get_embedding(text: str) -> Optional[list]:
    """
    多级向量嵌入策略（优先级从高到低）：
    1. 本地 Qwen3 Embedding（内网 GPU，1024维）—— 主通道
    2. 本地 jinaai/jina-embeddings-v3（1024维，零延迟）—— 降级
    3. 火山云 ARK ep- 端点 —— 云端备用

    设计原则：向量检索必须始终可用，不允许因外部服务不可达导致系统降级。
    """
    # 通道 1：本地 Qwen3 Embedding（GPU 服务器，最优质量）
    try:
        import requests as _req
        import os
        from django.conf import settings as _s
        qwen3_url = getattr(_s, 'QWEN3_EMBEDDING_URL',
                            os.getenv('QWEN3_EMBEDDING_URL', 'http://10.0.12.30:18099/Embedding/v1/embeddings'))
        qwen3_key = getattr(_s, 'QWEN3_EMBEDDING_KEY',
                            os.getenv('QWEN3_EMBEDDING_KEY', '7ed12a89-fe21-4ed1-9616-1f6f27e64637'))
        resp = _req.post(
            qwen3_url,
            json={'input': text},
            headers={'Authorization': f'Bearer {qwen3_key}'},
            timeout=10,
            verify=False,
        )
        data = resp.json()
        if 'data' in data and data['data']:
            emb = data['data'][0]['embedding']
            logger.debug('Qwen3 retrieval embedding 成功 dim=%d', len(emb))
            return emb
    except Exception as e:
        logger.debug('Qwen3 retrieval embedding 失败: %s', e)

    # 通道 2：本地 jina-embeddings-v3（主力，零依赖）
    try:
        from apps.agent_gateway.services import get_local_embedding
        embedding = get_local_embedding(text)
        if embedding:
            return embedding
    except Exception as e:
        logger.debug('本地 embedding 失败: %s', e)

    # 通道 3：火山云 ARK（有网络时提供备用通道）
    try:
        from apps.agent_gateway.services import get_ark_embedding
        embedding, trace = get_ark_embedding(text[:8000])
        if embedding:
            logger.debug('ARK embedding 成功作为备用通道')
            return embedding
        logger.debug('ARK retrieval embedding 未成功，trace=%s', trace)
    except Exception as e:
        logger.debug('ARK embedding failed: %s', e)

    return None


def _compute_confidence(
    channels: List[str],
    entry_type: str,
) -> Dict[str, Any]:
    """
    基于多通道交叉验证 + 来源权威性计算置信度。

    评分公式（确定性，非概率性）：
      base = 30（检索到即有基础分）
      + 通道交叉验证加成（命中通道数越多越高）
      + 来源权威性加成（法规 > SOP > 论文 > 经验）
      + 图谱结构化加成（有本体关系支撑）
    最终 clamp 到 [0, 100]
    """
    base = 30
    channel_count = len(channels)
    cross_bonus = CONFIDENCE_CHANNEL_BONUS.get(
        channel_count, CONFIDENCE_CHANNEL_BONUS.get(4, 40),
    )
    authority_bonus = CONFIDENCE_SOURCE_AUTHORITY.get(entry_type, 0)
    graph_bonus = CONFIDENCE_GRAPH_BONUS if 'graph' in channels else 0

    raw_score = base + cross_bonus + authority_bonus + graph_bonus
    score = max(0, min(100, raw_score))

    level = 'low'
    label = ''
    for threshold, lvl, lbl in CONFIDENCE_LEVELS:
        if score >= threshold:
            level = lvl
            label = lbl
            break

    return {
        'score': score,
        'level': level,
        'label': label,
        'factors': {
            'channel_count': channel_count,
            'cross_validation_bonus': cross_bonus,
            'source_authority_bonus': authority_bonus,
            'graph_structure_bonus': graph_bonus,
        },
    }


def _apply_knowledge_scope(queryset, execution_context) -> Any:
    """
    按执行上下文的数据范围过滤知识条目 QuerySet。

    规则：
    - is_admin=True 或 data_scope='global'：不附加过滤
    - 其他用户：
      1. 无 namespace 的条目（全局公开）始终可见
      2. namespace 不为空的条目：仅当用户的 data_scope='project' 且
         该条目的 namespace 在用户的 project_ids 中时可见
         （KnowledgeEntry 暂无 protocol_id，用 namespace 临时代替）
      3. 无法确定时，只返回无 namespace 条目（安全默认）

    未来：KnowledgeEntry 添加 protocol_id 后，可改为直接按项目过滤。
    """
    if execution_context is None or execution_context.is_admin:
        return queryset

    if execution_context.data_scope == 'global':
        return queryset

    # 安全默认：只返回无 namespace 的全局公开条目，
    # 或 namespace 在用户项目范围内的条目（若 namespace 存储的是 protocol_id 字符串）
    from django.db.models import Q as _Q
    from django.db import connection as _conn

    # namespace 字段属于路线图 K1，尚未迁移时优雅降级，避免运行时崩溃
    existing_columns = {col.name for col in _conn.introspection.get_table_description(
        _conn.cursor(), queryset.model._meta.db_table
    )}
    if 'namespace' not in existing_columns:
        return queryset  # 字段未就绪，暂不过滤

    project_namespaces = [str(pid) for pid in (execution_context.project_ids or [])]

    if project_namespaces:
        return queryset.filter(
            _Q(namespace__isnull=True) |
            _Q(namespace='') |
            _Q(namespace__in=project_namespaces)
        )
    # 无项目分配：只能看全局公开（无 namespace）的条目
    return queryset.filter(_Q(namespace__isnull=True) | _Q(namespace=''))


def _serialize_entry(entry: KnowledgeEntry) -> Dict[str, Any]:
    """兼容旧版 RetrievalGateway 返回格式。"""
    return {
        'id': entry.id,
        'title': entry.title,
        'content': entry.content,
        'summary': entry.summary or '',
        'entry_type': entry.entry_type,
        'tags': entry.tags or [],
        'uri': entry.uri or '',
        'namespace': entry.namespace or '',
        'source_type': entry.source_type or '',
        'update_time': entry.update_time.isoformat() if entry.update_time else '',
    }


class RetrievalGateway:
    """
    兼容旧接口的轻量包装器。

    历史测试与评估代码按类接口调用，这里复用当前函数式实现，
    避免继续分叉出第二套检索逻辑。
    """

    def keyword_search(
        self,
        query: str,
        top_k: int = 5,
        entry_type: Optional[str] = None,
        tags: Optional[List[str]] = None,
        execution_context=None,
    ) -> List[Dict[str, Any]]:
        result = hybrid_search(
            query=query,
            entry_type=entry_type,
            tags=tags,
            page=1,
            page_size=top_k,
            execution_context=execution_context,
        )
        return [_serialize_entry(entry) for entry in result.get('items', [])]

    def multi_channel_search(
        self,
        query: str,
        top_k: int = 5,
        entry_type: Optional[str] = None,
        tags: Optional[List[str]] = None,
        channels: Optional[List[str]] = None,
        execution_context=None,
        enable_rerank: bool = True,
        graph_max_hops: int = 1,
        graph_relation_types: Optional[List[str]] = None,
        graph_min_confidence: float = 0.0,
    ) -> List[Dict[str, Any]]:
        result = multi_channel_search(
            query=query,
            entry_type=entry_type,
            tags=tags,
            channels=channels,
            top_k=top_k,
            execution_context=execution_context,
            enable_rerank=enable_rerank,
            graph_max_hops=graph_max_hops,
            graph_relation_types=graph_relation_types,
            graph_min_confidence=graph_min_confidence,
        )
        return result.get('items', [])
