"""
邮件信号外部证据适配器（Phase 3 — 统一采集接口 + 标准化数据模型）

Phase 3 升级：
- ExternalEvidenceItem：统一证据条目数据类
- ADAPTER_REGISTRY：按 source_type 路由到具体适配器
- fetch_external_evidence()：统一采集入口
- execute_evidence_plan()：通用计划执行器，替代三个独立函数

向后兼容：保留原有三个函数签名作为 legacy alias，
以免影响现有 Phase 2 调用链。

Phase 3 风险控制：
- 所有适配器均为 deterministic / 可测试（本地目录，无外部网络依赖）
- 后续接入真实外部 API 时只需在 ADAPTER_REGISTRY 注册新适配器，不改调用方
- 采集结果标准化为 ExternalEvidenceItem，知识沉淀时可直接使用
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable


# ─── Phase 3: 统一证据条目数据类 ──────────────────────────────────────────────

@dataclass
class ExternalEvidenceItem:
    """标准化外部证据条目，所有适配器均返回此格式。"""
    code: str
    title: str
    source_type: str
    summary: str
    keywords: list[str] = field(default_factory=list)
    applicable_labels: list[str] = field(default_factory=list)  # 适用方向（统一字段名）
    weight: int = 80
    fetched_at: str = ''

    def __post_init__(self) -> None:
        if not self.fetched_at:
            self.fetched_at = datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')

    def to_hit_dict(self, matched_by: list[str] | None = None, relevance_score: int = 0) -> dict[str, Any]:
        """转换为兼容 Phase 2 hit 格式的字典。"""
        return {
            'code': self.code,
            'title': self.title,
            'source_type': self.source_type,
            'summary': self.summary,
            'matched_by': matched_by or [],
            'relevance_score': relevance_score,
            'fetched_at': self.fetched_at,
        }


# ─── 三套证据目录（统一使用 ExternalEvidenceItem）────────────────────────────

REGULATION_CATALOG: list[ExternalEvidenceItem] = [
    ExternalEvidenceItem(
        code='CSAR_GENERAL',
        title='化妆品监督管理条例（通用合规要求）',
        source_type='regulation_search',
        summary='化妆品宣称应当真实、合法、有充分科学依据，不得虚假或引人误解。',
        keywords=['法规', '合规', '宣称', '真实', '科学依据', '误导'],
        applicable_labels=['法规合规宣称', '综合宣称策略'],
        weight=100,
    ),
    ExternalEvidenceItem(
        code='CLAIM_EVALUATION_SPEC',
        title='化妆品功效宣称评价规范',
        source_type='regulation_search',
        summary='功效宣称需与评价方法和证据类型匹配，支持人体功效评价、消费者使用测试、实验室研究等路径。',
        keywords=['功效宣称', '评价规范', '测试方案', '人体功效', '证据路径'],
        applicable_labels=['测试路径', '综合宣称策略', '保湿宣称', '美白/提亮宣称', '抗衰/抗皱宣称'],
        weight=110,
    ),
    ExternalEvidenceItem(
        code='SUNSCREEN_RULE',
        title='防晒类宣称与 SPF/PA 评价要求',
        source_type='regulation_search',
        summary='涉及 SPF/PA 或防晒宣称时，应匹配对应的人体功效评价方法和标签要求。',
        keywords=['防晒', 'SPF', 'PA', '人体功效', '标签'],
        applicable_labels=['防晒宣称', '测试路径'],
        weight=105,
    ),
    ExternalEvidenceItem(
        code='MOISTURE_CLAIM_GUIDE',
        title='保湿/修护类宣称证据路径指引（内部整理）',
        source_type='regulation_search',
        summary='保湿、修护类宣称通常需要围绕即时/长效功效设定评价周期和指标，避免绝对化表达。',
        keywords=['保湿', '修护', '48h', '72h', '长效', '即时'],
        applicable_labels=['保湿宣称', '修护宣称', '测试路径'],
        weight=95,
    ),
    ExternalEvidenceItem(
        code='WHITENING_CLAIM_GUIDE',
        title='美白/提亮类宣称合规提醒（内部整理）',
        source_type='regulation_search',
        summary='美白、提亮类宣称需要注意法规边界、样本设计及表述方式，避免夸大性承诺。',
        keywords=['美白', '提亮', '宣称', '合规', '样本设计'],
        applicable_labels=['美白/提亮宣称', '法规合规宣称'],
        weight=90,
    ),
]

TREND_CATALOG: list[ExternalEvidenceItem] = [
    ExternalEvidenceItem(
        code='SUNSCREEN_SOCIAL_TREND',
        title='防晒赛道社媒热度持续高位（内部趋势样本）',
        source_type='social_trend',
        summary='防晒、SPF、PA 相关内容在季节性节点热度显著提升，消费者更关注体感、防护与便携形态。',
        keywords=['防晒', 'SPF', 'PA', '喷雾', '体感', '便携'],
        applicable_labels=['防晒品类'],
        weight=108,
    ),
    ExternalEvidenceItem(
        code='HYDRATION_MARKET_TREND',
        title='保湿/修护赛道强调即时+长效双维度（内部趋势样本）',
        source_type='industry_report',
        summary='保湿、修护相关产品更强调即时体感与 24h/48h/72h 长效叙事，证据与宣称联动需求增强。',
        keywords=['保湿', '修护', '48h', '72h', '长效', '即时'],
        applicable_labels=['保湿/补水品类'],
        weight=101,
    ),
    ExternalEvidenceItem(
        code='ANTIAGING_INGREDIENT_TREND',
        title='抗衰赛道成分叙事强化（内部趋势样本）',
        source_type='industry_report',
        summary='抗老、抗皱赛道更常围绕视黄醇、胶原、肽类等成分叙事构建差异化。',
        keywords=['抗老', '抗皱', 'retinol', '胶原', '成分'],
        applicable_labels=['抗衰品类'],
        weight=98,
    ),
    ExternalEvidenceItem(
        code='NMPA_NEW_FILING_PATTERN',
        title='备案数据提示新品类快速上新（内部备案样本）',
        source_type='nmpa_filing',
        summary='新品备案节奏和功效关键词呈明显聚集，适合辅助判断客户切入赛道的热度和竞争强度。',
        keywords=['备案', '新品', '上市', '功效', '品类'],
        applicable_labels=['防晒品类', '保湿/补水品类', '美白/提亮品类', '抗衰品类', '综合护肤'],
        weight=96,
    ),
]

COMPETITIVE_CATALOG: list[ExternalEvidenceItem] = [
    ExternalEvidenceItem(
        code='PRICE_PRESSURE_SAMPLE',
        title='价格带竞争压力样本（内部竞品样本）',
        source_type='ecommerce_reviews',
        summary='当客户明确提到"更便宜/价格压力"时，通常需要同时评估价格带和价值包差异，不宜只回应单一降价。',
        keywords=['更便宜', '价格压力', '价格战', '更低', '报价'],
        applicable_labels=['价格竞争压力'],
        weight=108,
    ),
    ExternalEvidenceItem(
        code='CLAIM_COMPETITION_SAMPLE',
        title='宣称/功效对比压力样本（内部竞品样本）',
        source_type='competitor_claims',
        summary='客户提及"更有说服力"的竞品时，往往需要补充宣称证据、评价方法和差异化话术，而不是只改价格。',
        keywords=['宣称', '功效对比', '更有说服力', '差异化', '对标'],
        applicable_labels=['宣称/功效竞争', '竞品直接提及'],
        weight=110,
    ),
    ExternalEvidenceItem(
        code='COMPETITOR_FILING_SAMPLE',
        title='竞品备案公开信息样本（内部备案样本）',
        source_type='nmpa_filing',
        summary='竞品备案信息可作为公开证据补充成分、功效方向和上市节奏的基础判断。',
        keywords=['竞品', '备案', '品牌', '上市', '成分'],
        applicable_labels=['竞品直接提及', '市场格局压力'],
        weight=95,
    ),
]


# ─── Phase 3: 统一检索核心函数 ───────────────────────────────────────────────

def _search_items(
    items: list[ExternalEvidenceItem],
    query: str,
    *,
    matched_keywords: list[str] | None = None,
    focus_label: str = '',
    limit: int = 3,
) -> list[dict[str, Any]]:
    """对 ExternalEvidenceItem 列表做关键词 + 方向标签打分检索。"""
    query_text = (query or '').lower()
    kws = [k.lower() for k in (matched_keywords or [])]
    scored: list[tuple[int, dict[str, Any]]] = []

    for item in items:
        score = 0
        item_keywords = [k.lower() for k in item.keywords]
        matched_by: list[str] = []
        for kw in item_keywords:
            if kw in query_text:
                score += 10
                matched_by.append(kw)
            if kw in kws:
                score += 8
                if kw not in matched_by:
                    matched_by.append(kw)
        if focus_label and focus_label in item.applicable_labels:
            score += 25
        score += item.weight
        if score <= item.weight:
            continue
        scored.append((score, item.to_hit_dict(matched_by=matched_by, relevance_score=score)))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [x[1] for x in scored[:limit]]


# ─── Phase 3: 适配器注册表 ───────────────────────────────────────────────────

AdapterFn = Callable[[str, list[str], str, int], list[dict[str, Any]]]

def _make_catalog_adapter(
    catalog: list[ExternalEvidenceItem],
) -> AdapterFn:
    def _adapter(
        query: str,
        matched_keywords: list[str],
        focus_label: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        return _search_items(catalog, query, matched_keywords=matched_keywords, focus_label=focus_label, limit=limit)
    return _adapter


ADAPTER_REGISTRY: dict[str, AdapterFn] = {
    'regulation_search': _make_catalog_adapter(REGULATION_CATALOG),
    'social_trend':       _make_catalog_adapter(TREND_CATALOG),
    'industry_report':    _make_catalog_adapter(TREND_CATALOG),
    'nmpa_filing':        _make_catalog_adapter(TREND_CATALOG),
    'competitor_claims':  _make_catalog_adapter(COMPETITIVE_CATALOG),
    'ecommerce_reviews':  _make_catalog_adapter(COMPETITIVE_CATALOG),
}


def _knowledge_base_adapter(
    query: str,
    matched_keywords: list[str],
    focus_label: str,
    limit: int,
) -> list[dict[str, Any]]:
    """
    Phase 3 知识库适配器：从 KnowledgeEntry 中检索相关知识条目。

    通过关键词匹配 title/content/tags，返回格式与外部证据一致，
    使邮件分析可直接利用历史积累的专业知识。
    """
    try:
        from apps.knowledge.models import KnowledgeEntry
        from django.db.models import Q
        search_terms = [query] + (matched_keywords or [])
        q_filter = Q(is_deleted=False, is_published=True)
        or_condition = Q()
        for term in search_terms:
            if term and len(term) >= 2:
                or_condition |= Q(title__icontains=term) | Q(content__icontains=term) | Q(tags__contains=term)
        if not or_condition.children:
            return []
        entries = KnowledgeEntry.objects.filter(q_filter & or_condition).order_by(
            '-quality_score', '-create_time',
        ).values('id', 'title', 'summary', 'content', 'entry_type', 'tags', 'source_type')[:limit]
        result = []
        for e in entries:
            snippet = e['summary'] or (e['content'][:200] + '…' if e['content'] else '')
            result.append({
                'source_type': 'knowledge_base',
                'source_label': '内部知识库',
                'title': e['title'],
                'snippet': snippet,
                'url': f'/knowledge/{e["id"]}',
                'relevance_score': 70,
                'hit_keywords': [t for t in search_terms if t and t.lower() in (e['title'] + e['content']).lower()],
                'entry_type': e['entry_type'],
                'kb_entry_id': e['id'],
            })
        return result
    except Exception:
        return []


ADAPTER_REGISTRY.update({
    'knowledge_base': _knowledge_base_adapter,
})


def fetch_external_evidence(
    source_type: str,
    query: str,
    matched_keywords: list[str] | None = None,
    focus_label: str = '',
    limit: int = 3,
) -> list[dict[str, Any]]:
    """
    Phase 3 统一外部证据采集入口。

    按 source_type 路由到 ADAPTER_REGISTRY 中对应的适配器。
    未知 source_type 返回空列表（静默降级，不抛异常）。

    后续接入真实外部网络采集时，只需在 ADAPTER_REGISTRY 注册新适配器，
    不改任何调用方。
    """
    adapter = ADAPTER_REGISTRY.get(source_type)
    if not adapter:
        return []
    return adapter(
        query or '',
        list(matched_keywords or []),
        focus_label or '',
        limit,
    )


def execute_evidence_plan(
    external_evidence_plan: list[dict[str, Any]],
    matched_keywords: list[str] | None = None,
    focus_label: str = '',
) -> list[dict[str, Any]]:
    """
    Phase 3 通用计划执行器。

    遍历 external_evidence_plan，对每一条调用 fetch_external_evidence()，
    把命中结果聚合返回。

    取代原来三个独立的 execute_*_evidence_plan 函数。
    """
    results: list[dict[str, Any]] = []
    for item in external_evidence_plan or []:
        source_type = str(item.get('source_type') or '')
        query = str(item.get('query') or '')
        hits = fetch_external_evidence(
            source_type=source_type,
            query=query,
            matched_keywords=matched_keywords or [],
            focus_label=focus_label,
        )
        if hits:
            results.append({
                'source_type': source_type,
                'query': query,
                'purpose': item.get('purpose', ''),
                'hits': hits,
            })
    return results


# ─── Legacy aliases — 向后兼容 Phase 2 调用方 ────────────────────────────────

def search_regulation_evidence(
    query: str,
    *,
    matched_keywords: list[str] | None = None,
    primary_focus: str = '',
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Legacy alias。请新代码改用 fetch_external_evidence('regulation_search', ...)。"""
    return fetch_external_evidence(
        'regulation_search', query,
        matched_keywords=matched_keywords or [],
        focus_label=primary_focus,
        limit=limit,
    )


def execute_claim_regulation_plan(
    external_evidence_plan: list[dict[str, Any]],
    *,
    matched_keywords: list[str] | None = None,
    primary_focus: str = '',
) -> list[dict[str, Any]]:
    """Legacy alias。请新代码改用 execute_evidence_plan(...)。"""
    reg_plan = [p for p in (external_evidence_plan or []) if p.get('source_type') == 'regulation_search']
    return execute_evidence_plan(reg_plan, matched_keywords=matched_keywords, focus_label=primary_focus)


def execute_market_trend_evidence_plan(
    external_evidence_plan: list[dict[str, Any]],
    *,
    matched_keywords: list[str] | None = None,
    inferred_category: str = '',
) -> list[dict[str, Any]]:
    """Legacy alias。请新代码改用 execute_evidence_plan(...)。"""
    allowed = {'social_trend', 'nmpa_filing', 'industry_report'}
    trend_plan = [p for p in (external_evidence_plan or []) if p.get('source_type') in allowed]
    return execute_evidence_plan(trend_plan, matched_keywords=matched_keywords, focus_label=inferred_category)


def execute_competitive_evidence_plan(
    external_evidence_plan: list[dict[str, Any]],
    *,
    matched_keywords: list[str] | None = None,
    primary_threat: str = '',
) -> list[dict[str, Any]]:
    """Legacy alias。请新代码改用 execute_evidence_plan(...)。"""
    allowed = {'competitor_claims', 'ecommerce_reviews', 'nmpa_filing'}
    competitive_plan = [p for p in (external_evidence_plan or []) if p.get('source_type') in allowed]
    return execute_evidence_plan(competitive_plan, matched_keywords=matched_keywords, focus_label=primary_threat)


# ─── Phase 3 新增：证据条目 -> 知识沉淀输入的转换工具 ──────────────────────────

def evidence_to_knowledge_content(
    task_key: str,
    conclusion: str,
    conclusion_type: str,
    evidence_hits: list[dict[str, Any]],
    subject: str = '',
    client_label: str = '',
) -> str:
    """
    把专项分析候选结论和相关证据命中组装为适合写入知识库的结构化内容文本。
    """
    lines = [f'专项类型：{task_key}', f'结论类型：{conclusion_type}', f'核心结论：{conclusion}']
    if subject:
        lines.append(f'来源邮件主题：{subject}')
    if client_label:
        lines.append(f'客户：{client_label}')
    if evidence_hits:
        lines.append('')
        lines.append('证据支撑：')
        for hit in evidence_hits[:5]:
            if not isinstance(hit, dict):
                continue
            lines.append(f'- [{hit.get("source_type", "-")}] {hit.get("title", "-")}：{hit.get("summary", "-")}')
    return '\n'.join(lines)
