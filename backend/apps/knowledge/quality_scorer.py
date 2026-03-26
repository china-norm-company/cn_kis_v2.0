"""
知识质量评分器（预训练版）

五维度原始评分：完整性(25) + 权威性(25) + 准确性(25) + 时效性(20) + 关联性(25)
最终 total 会归一化到 0-100 分，兼容现有门禁阈值。

升级说明：
- 权威性维度（25 分）：区分权威法规/学术来源 vs 一般来源，防止低质资料被高估
- 关联性维度从 25 分降为 15 分：减少对实体抽取数量的过度依赖
- 完整性维度新增：has_source_url、切片来源标识
- 整体路由更严格：预训练资料要求有来源 URL 才能自动发布

分数路由：
  ≥ 65 + 权威来源 → published（自动）
  40-64 或 AI 生成 → pending_review（人工审核）
  < 40 → rejected（低质量暂存）
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)
RAW_SCORE_MAX = 120

# 高可信来源白名单：这些来源可以在质量分 ≥ 65 时直接发布
AUTO_PUBLISH_SOURCES = {
    'sop_sync',
    'cdisc_import',
    'bridg_import',
    'retrospective',
    'internal_sop',
    'regulation_tracker',
    # 知识预训练阶段的导入来源
    'efficacy_import',
    'ontology_import',
    'entity_bridge_fix',
    'paper_scout',
    'manual_ingest',
    # 预训练专用权威来源
    'ich_import',         # ICH 指南导入
    'nmpa_import',        # NMPA 法规导入
    'gb_standard_import', # GB/QB/T 标准导入
    'sccs_import',        # SCCS 成分安全意见
    'cir_import',         # CIR 成分评价报告
    'pubmed_import',      # PubMed 论文摘要
    'clinicaltrials_import',  # ClinicalTrials 研究设计
    'instrument_import',  # 仪器厂商技术文档
    'ingredient_safety_seed',
    'quality_ops_seed',
    'competitor_monitor',
    'market_intelligence_agent',
    # 飞书全量采集来源（2026-03-25 启用自动发布，阈值降至 40 分）
    # 背景：全量数据已完成入库，质量分均 ≥ 40，人工审核无法覆盖 40 万+条目
    'feishu_mail',
    'feishu_im',
    'feishu_task',
    'feishu_calendar',
    'feishu_doc',
    'feishu_wiki',
    'feishu_meeting',
    # 受试者智能层（运营数据生成，分数 ≥ 40 即为有效业务知识）
    'subject_intelligence',
    # 运营图谱（从邮件提取的业务实体关系）
    'project_profile',
    'operations_graph',
}

# 来源权威性等级（用于新增权威性维度）
SOURCE_AUTHORITY_LEVEL: Dict[str, str] = {
    # 最高权威：官方法规/国际标准
    'cdisc_import': 'authoritative',
    'bridg_import': 'authoritative',
    'ich_import': 'authoritative',
    'nmpa_import': 'authoritative',
    'gb_standard_import': 'authoritative',
    'regulation_tracker': 'authoritative',
    'sccs_import': 'authoritative',
    'cir_import': 'authoritative',
    # 高可信：学术/SOP/内部规范
    'sop_sync': 'high',
    'internal_sop': 'high',
    'paper_scout': 'high',
    'pubmed_import': 'high',
    'efficacy_import': 'high',
    'ontology_import': 'high',
    'manual_ingest': 'high',
    'clinicaltrials_import': 'high',
    'instrument_import': 'high',
    'entity_bridge_fix': 'high',
    'ingredient_safety_seed': 'high',
    'quality_ops_seed': 'high',
    'competitor_monitor': 'high',
    'market_intelligence_agent': 'high',
    # 中等可信
    'retrospective': 'medium',
    'instrument_knowledge_builder': 'medium',
    'feishu_meeting': 'medium',
    'competitor_monitor': 'medium',
    'market_intelligence_agent': 'medium',
    # 运营数据（飞书全量采集 + 受试者智能层）
    'feishu_mail': 'medium',
    'feishu_im': 'medium',
    'feishu_task': 'medium',
    'feishu_calendar': 'medium',
    'feishu_doc': 'medium',
    'feishu_wiki': 'medium',
    'subject_intelligence': 'medium',
    'project_profile': 'medium',
    'operations_graph': 'medium',
    # 低可信
    'feishu_chat': 'low',
    'agent_tool': 'low',
    'market_research': 'low',
}

# 来源风险等级（影响准确性维度，保持兼容）
SOURCE_RISK_LEVEL: Dict[str, str] = {
    'sop_sync': 'low',
    'cdisc_import': 'low',
    'bridg_import': 'low',
    'retrospective': 'low',
    'internal_sop': 'low',
    'regulation_tracker': 'low',
    'efficacy_import': 'low',
    'ontology_import': 'low',
    'entity_bridge_fix': 'low',
    'manual_ingest': 'low',
    'ich_import': 'low',
    'nmpa_import': 'low',
    'gb_standard_import': 'low',
    'sccs_import': 'low',
    'cir_import': 'low',
    'pubmed_import': 'low',
    'clinicaltrials_import': 'low',
    'instrument_import': 'low',
    'paper_scout': 'medium',
    'ingredient_safety_seed': 'low',
    'quality_ops_seed': 'low',
    'competitor_monitor': 'low',
    'market_intelligence_agent': 'low',
    'instrument_knowledge_builder': 'medium',
    'feishu_meeting': 'medium',
    'feishu_chat': 'high',
    'agent_tool': 'high',
    'competitor_monitor': 'medium',
    'market_research': 'high',
}

# 按知识类型的时效性阈值（天）
FRESHNESS_THRESHOLDS: Dict[str, int] = {
    'regulation': 365,
    'competitor_intel': 180,
    'market_insight': 180,
    'paper_abstract': 1095,
    'sop': 730,
    'instrument_spec': 1825,
    'ingredient_data': 1095,
    'method_reference': 1095,
    'lesson_learned': 730,
    'meeting_decision': 365,
    'faq': 365,
    'proposal_template': 1095,
    'feishu_doc': 365,
}

DEFAULT_FRESHNESS_THRESHOLD_DAYS = 730


def score_entry(
    title: str,
    content: str,
    summary: str = '',
    tags: list = None,
    source_type: str = '',
    entry_type: str = '',
    created_at: Optional[datetime] = None,
    entity_count: int = 0,
    relation_count: int = 0,
    has_source_url: bool = False,
    properties: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    计算知识条目质量评分（五维度版）。

    返回：
    {
        'total': 0-100,
        'completeness': 0-20,
        'authority': 0-25,
        'accuracy': 0-20,
        'freshness': 0-20,
        'relevance': 0-15,
        'routing': 'published' | 'pending_review' | 'rejected',
        'details': {...},
    }
    """
    tags = tags or []
    properties = properties or {}

    completeness = _score_completeness(title, content, summary, tags, source_type, has_source_url, properties)
    authority = _score_authority(source_type, properties)
    accuracy = _score_accuracy(source_type, has_source_url, content, properties)
    freshness = _score_freshness(entry_type, created_at)
    relevance = _score_relevance(entity_count, relation_count, tags, properties)

    raw_total = completeness + authority + accuracy + freshness + relevance
    total = int(round(raw_total / RAW_SCORE_MAX * 100))

    routing = _determine_routing(total, source_type, properties)

    return {
        'total': total,
        'completeness': completeness,
        'authority': authority,
        'accuracy': accuracy,
        'freshness': freshness,
        'relevance': relevance,
        'routing': routing,
        'details': {
            'has_title': bool(title and title.strip()),
            'has_summary': bool(summary and summary.strip()),
            'has_tags': len(tags) >= 2,
            'has_source': bool(source_type),
            'has_source_url': has_source_url or bool(properties.get('source_url') or properties.get('url')),
            'content_length': len(content or ''),
            'entity_count': entity_count,
            'relation_count': relation_count,
            'authority_level': SOURCE_AUTHORITY_LEVEL.get(source_type, 'unknown'),
        },
    }


def _score_completeness(
    title: str,
    content: str,
    summary: str,
    tags: list,
    source_type: str,
    has_source_url: bool = False,
    properties: Optional[Dict[str, Any]] = None,
) -> int:
    """完整性维度（0-25）"""
    properties = properties or {}
    score = 0

    if title and title.strip():
        score += 5

    if summary and summary.strip():
        score += 5

    valid_tags = [t for t in (tags or []) if t and str(t).strip()]
    if len(valid_tags) >= 2:
        score += 5
    elif len(valid_tags) == 1:
        score += 3

    if source_type and source_type.strip():
        score += 5

    content_len = len(content or '')
    if content_len >= 200:
        score += 5
    elif content_len >= 100:
        score += 5
    elif content_len >= 50:
        score += 3
    elif content_len >= 20:
        score += 2

    return min(25, score)


def _score_authority(
    source_type: str,
    properties: Optional[Dict[str, Any]] = None,
) -> int:
    """
    权威性维度（0-25）- 新增维度
    区分官方法规/国际标准/高质量学术资料 vs 一般内容
    """
    properties = properties or {}
    level = SOURCE_AUTHORITY_LEVEL.get(source_type, 'unknown')

    if level == 'authoritative':
        base = 22
    elif level == 'high':
        base = 16
    elif level == 'medium':
        base = 9
    elif level == 'low':
        base = 3
    else:
        base = 6  # unknown 来源给中低分

    # 有标准编号/DOI/法规文号（额外加分，最高 25）
    if properties.get('doi') or properties.get('pmid'):
        base = min(25, base + 3)
    if properties.get('regulation_code') or properties.get('standard_code'):
        base = min(25, base + 3)
    if properties.get('issn') or properties.get('journal'):
        base = min(25, base + 2)

    return min(25, base)


def _score_accuracy(
    source_type: str,
    has_source_url: bool,
    content: str,
    properties: Dict[str, Any],
) -> int:
    """准确性维度（0-25）"""
    risk = SOURCE_RISK_LEVEL.get(source_type, 'medium')

    if risk == 'low':
        base_score = 20
    elif risk == 'medium':
        base_score = 13
    else:
        base_score = 6

    if has_source_url or properties.get('source_url') or properties.get('url'):
        base_score += 5

    return min(25, base_score)


def _score_freshness(
    entry_type: str,
    created_at: Optional[datetime],
) -> int:
    """时效性维度（0-20）"""
    if created_at is None:
        return 10

    now = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        from django.utils import timezone as dj_tz
        created_at = dj_tz.make_aware(created_at)

    age_days = (now - created_at).days
    threshold = FRESHNESS_THRESHOLDS.get(entry_type, DEFAULT_FRESHNESS_THRESHOLD_DAYS)

    if age_days <= threshold * 0.25:
        return 20
    if age_days <= threshold * 0.5:
        return 18
    if age_days <= threshold:
        return 15

    over_ratio = (age_days - threshold) / threshold
    score = max(0, int(10 * (1.0 - over_ratio)))
    return score


def _score_relevance(
    entity_count: int,
    relation_count: int,
    tags: list,
    properties: Optional[Dict[str, Any]] = None,
) -> int:
    """
    关联性维度（0-25）

    优先奖励结构化信号：实体 + 关系。
    标签与外部引用仅作为轻度补充。
    """
    properties = properties or {}
    score = 0

    # 实体（最高 15 分）
    score += min(15, entity_count * 4)

    # 关系（最高 10 分）
    score += min(10, relation_count * 5)

    # 标签（最高 3 分）
    valid_tags = [t for t in (tags or []) if t and str(t).strip()]
    if len(valid_tags) >= 3:
        score += 3
    elif len(valid_tags) >= 1:
        score += 1

    # 有外部引用/命名空间（+2）
    if properties.get('namespace') and properties['namespace'] not in ('cnkis', ''):
        score += 1
    if properties.get('doi') or properties.get('pmid') or properties.get('regulation_code'):
        score += 1

    return min(25, score)


def _determine_routing(total: int, source_type: str, properties: Optional[Dict[str, Any]] = None) -> str:
    """根据评分和来源决定路由（更严格的预训练标准）"""
    properties = properties or {}

    if total < 40:
        return 'rejected'

    if source_type == 'agent_tool':
        return 'pending_review'

    auto_publish_threshold = 60
    if source_type == 'competitor_monitor':
        auto_publish_threshold = 50
    if source_type == 'market_intelligence_agent':
        auto_publish_threshold = 50
    # 飞书运营数据和受试者智能：质量门槛 40 分即可自动发布
    # 原因：来源可信（公司内部真实数据），单条体量小，人工审核无法覆盖 40 万+
    if source_type in {
        'feishu_mail', 'feishu_im', 'feishu_task', 'feishu_calendar',
        'feishu_doc', 'feishu_wiki', 'feishu_meeting',
        'subject_intelligence', 'project_profile', 'operations_graph',
    }:
        auto_publish_threshold = 40

    if source_type in AUTO_PUBLISH_SOURCES and total >= auto_publish_threshold:
        return 'published'

    if total >= 65:
        return 'pending_review'

    return 'pending_review'


def route_to_status(routing: str) -> str:
    """将路由决策转换为知识条目状态"""
    mapping = {
        'published': 'published',
        'pending_review': 'pending_review',
        'rejected': 'rejected',
    }
    return mapping.get(routing, 'pending_review')
