"""
邮件信号专项分析服务（Phase 2）

职责：
- 执行 market_trend_brief / competitive_intel_brief / claim_strategy_brief 专项分析
- 产出结构化结果、证据引用，写入 AssistantActionPlan.evidence_refs / draft_artifact_refs
- 严格遵守输出治理：所有产物默认仅限内部草稿，不自动对客发送

实现层次：
1. 关键词提取（始终执行，作为降级保底）
2. AI 增强（调用 Kimi quick_chat，不可用时降级到关键词结果）

AI 增强内容写入 draft_artifact_refs[0].detail.ai_enhanced_sections，
关键词结果写入基础 sections，两者并存，前端优先展示 ai_enhanced_sections。

治理要求（OUTPUT_GOVERNANCE 文档摘要）：
- 产物必须带 governance_level 字段，值为 'internal_draft'
- 必须带证据引用（哪怕是最小占位）
- 不自动触发对客发送
- 强制人工审核后才能转为正式版

执行状态通过 AssistantActionPlan.action_payload['ai_analysis_status'] 记录：
  'pending'  → 草稿已生成，未触发分析
  'running'  → 分析正在执行
  'done'     → AI 分析完成
  'done_kw'  → 仅关键词提取完成（AI 不可用或跳过）
  'failed'   → AI 分析失败，已降级到关键词结果
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


# ─── 关键词词典 ───────────────────────────────────────────────────

_TREND_KEYWORDS: list[str] = [
    '防晒', 'SPF', 'PA', '保湿', '美白', '抗皱', '紧致', '修复', '抗老',
    '成分', '功效', '测试', '宣称', '备案', '上市', '新品', '品类',
    'retinol', 'niacinamide', 'ceramide', '烟酰胺', '玻尿酸', '胶原',
    '精华', '面霜', '防晒霜', '乳液', '爽肤水', '眼霜',
]

_TREND_CATEGORY_MAP: dict[str, str] = {
    '防晒': '防晒品类', 'SPF': '防晒品类', 'PA': '防晒品类',
    '保湿': '保湿/补水品类', '玻尿酸': '保湿/补水品类',
    '美白': '美白/提亮品类', '烟酰胺': '美白/提亮品类',
    '抗皱': '抗衰品类', '紧致': '抗衰品类', '抗老': '抗衰品类', 'retinol': '抗衰品类',
    '精华': '精华品类', '面霜': '面霜品类', '眼霜': '眼周护理品类',
}


def _extract_trend_keywords(text: str) -> tuple[list[str], str]:
    """
    从邮件文本提取品类/功效关键词，并推断主品类。

    返回: (matched_keywords, inferred_category)
    """
    text_lower = text.lower()
    matched = []
    category_counts: dict[str, int] = {}

    for kw in _TREND_KEYWORDS:
        if kw.lower() in text_lower:
            matched.append(kw)
            cat = _TREND_CATEGORY_MAP.get(kw, '综合护肤')
            category_counts[cat] = category_counts.get(cat, 0) + 1

    if not matched:
        return [], '未知品类'

    primary_cat = max(category_counts, key=lambda c: category_counts[c])
    return matched, primary_cat


def _build_market_trend_draft(
    subject: str,
    body_text: str,
    client_label: str,
    matched_keywords: list[str],
    inferred_category: str,
) -> dict[str, Any]:
    """构建 market_trend_brief 的结构化草稿产物。"""
    now_str = datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')
    return {
        'task_key': 'market_trend_brief',
        'governance_level': 'internal_draft',
        'generated_at': now_str,
        'subject': subject,
        'client_hint': client_label,
        'inferred_category': inferred_category,
        'matched_keywords': matched_keywords,
        'summary': (
            f'基于邮件主题"{subject}"，初步识别到品类关键词：'
            f'{", ".join(matched_keywords[:5]) if matched_keywords else "（未识别）"}。'
            f'推断关注品类为【{inferred_category}】。'
        ),
        'sections': [
            {
                'title': '品类热度信号',
                'content': (
                    f'本邮件涉及关键词：{", ".join(matched_keywords) or "暂无明确品类词"}，'
                    f'属于【{inferred_category}】赛道。'
                ),
                'evidence_quality': 'low',
                'note': '仅基于邮件文本提取，后续可接入外部趋势数据源补充',
            },
            {
                'title': '市场机会初判',
                'content': '基于邮件信号，客户可能有新品开发或功效评价需求。建议研究经理跟进确认具体需求方向。',
                'evidence_quality': 'low',
                'note': '需人工审核后才能转为正式判断',
            },
            {
                'title': '证据补充建议',
                'content': (
                    '建议后续从以下来源补充证据：\n'
                    '1. 品牌社媒声量（小红书/抖音热度）\n'
                    '2. NMPA 备案动态\n'
                    '3. 近期竞品上市情况\n'
                    '4. 行业报告摘要'
                ),
                'evidence_quality': 'placeholder',
                'note': 'Phase 2 第一阶段占位，待外部数据源接入后替换',
            },
        ],
        'review_required': True,
        'auto_send_to_client': False,
    }


# ─── 竞品情报关键词词典 ────────────────────────────────────────────

_COMPETITIVE_KEYWORDS: list[str] = [
    '竞品', '竞争对手', '另一家', '同类产品', '对标',
    '更低', '更便宜', '更有说服力', '价格压力', '价格战',
    '宣称', '功效对比', '差异化', '方案对比', '优势',
    '市场份额', '替代方案', '品牌对比', '品牌竞争',
]

_COMPETITOR_THREAT_MAP: dict[str, str] = {
    '价格': '价格竞争压力',
    '更低': '价格竞争压力', '更便宜': '价格竞争压力', '价格压力': '价格竞争压力',
    '宣称': '宣称/功效竞争', '功效对比': '宣称/功效竞争', '差异化': '宣称/功效竞争',
    '竞品': '竞品直接提及', '另一家': '竞品直接提及', '对标': '竞品直接提及',
    '市场份额': '市场格局压力', '替代方案': '市场格局压力',
}


def _extract_competitive_keywords(text: str) -> tuple[list[str], str]:
    """从邮件文本提取竞品/压力关键词，推断主要威胁类型。"""
    text_lower = text.lower()
    matched = []
    threat_counts: dict[str, int] = {}

    for kw in _COMPETITIVE_KEYWORDS:
        if kw.lower() in text_lower:
            matched.append(kw)
            threat = _COMPETITOR_THREAT_MAP.get(kw, '综合竞品压力')
            threat_counts[threat] = threat_counts.get(threat, 0) + 1

    if not matched:
        return [], '未识别竞品压力'

    primary_threat = max(threat_counts, key=lambda t: threat_counts[t])
    return matched, primary_threat


def _build_competitive_intel_draft(
    subject: str,
    body_text: str,
    client_label: str,
    matched_keywords: list[str],
    primary_threat: str,
) -> dict[str, Any]:
    """构建 competitive_intel_brief 的结构化草稿产物。"""
    now_str = datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')
    kw_str = '、'.join(matched_keywords[:5]) if matched_keywords else '（未识别）'
    return {
        'task_key': 'competitive_intel_brief',
        'governance_level': 'internal_draft',
        'generated_at': now_str,
        'subject': subject,
        'client_hint': client_label,
        'primary_threat': primary_threat,
        'matched_keywords': matched_keywords,
        'summary': (
            f'基于邮件主题"{subject}"，识别到竞品/压力信号：{kw_str}。'
            f'主要威胁类型：【{primary_threat}】。'
        ),
        'sections': [
            {
                'title': '竞品压力信号',
                'content': (
                    f'客户邮件中出现关键词：{", ".join(matched_keywords) or "暂无"}，'
                    f'主要威胁判断为【{primary_threat}】。'
                ),
                'evidence_quality': 'low',
                'note': '仅基于邮件文本，建议跟进确认竞品名称和具体诉求',
            },
            {
                'title': '差异化应对方向',
                'content': (
                    '建议研究经理/客户经理从以下方向初步应对：\n'
                    '1. 确认客户提及的竞品具体是哪家/哪款\n'
                    '2. 梳理我方在宣称证据和测试方案上的差异化优势\n'
                    '3. 如有价格压力，评估是否需要提供价值包方案'
                ),
                'evidence_quality': 'low',
                'note': '需人工审核后才能转为正式应对方案',
            },
            {
                'title': '证据补充建议',
                'content': (
                    '建议后续从以下来源补充竞品证据：\n'
                    '1. 公开的竞品宣称和检测报告\n'
                    '2. 电商平台竞品评价\n'
                    '3. NMPA 备案公开数据\n'
                    '4. 行业媒体竞品报道'
                ),
                'evidence_quality': 'placeholder',
                'note': 'Phase 2 第一阶段占位，待外部数据源接入后替换',
            },
        ],
        'review_required': True,
        'auto_send_to_client': False,
    }


# ─── 宣称策略关键词词典 ────────────────────────────────────────────

_CLAIM_KEYWORDS: list[str] = [
    '宣称', '功效宣称', '能不能写', '怎么测', '怎么支撑', '证据路径',
    '保湿', '美白', '抗皱', '修护', '抗氧化', '舒缓', '紧致',
    'SPF', 'PA', '测试方案', '检测方案', '人体功效', '体外测试',
    '法规', '备案', '规范', '标准', 'ISO', 'QB', 'GB',
    '48h', '72h', '24h', '持久', '即时', '长效',
]

_CLAIM_FOCUS_MAP: dict[str, str] = {
    '保湿': '保湿宣称', '美白': '美白/提亮宣称', '抗皱': '抗衰/抗皱宣称',
    '修护': '修护宣称', '抗氧化': '抗氧化宣称', '舒缓': '舒缓宣称', '紧致': '紧致宣称',
    'SPF': '防晒宣称', 'PA': '防晒宣称',
    '法规': '法规合规宣称', '备案': '法规合规宣称', '规范': '法规合规宣称',
    '测试方案': '测试路径', '检测方案': '测试路径', '人体功效': '测试路径',
}


def _extract_claim_keywords(text: str) -> tuple[list[str], str]:
    """从邮件文本提取宣称/功效关键词，推断主要关注宣称方向。"""
    text_lower = text.lower()
    matched = []
    focus_counts: dict[str, int] = {}

    for kw in _CLAIM_KEYWORDS:
        if kw.lower() in text_lower:
            matched.append(kw)
            focus = _CLAIM_FOCUS_MAP.get(kw, '综合宣称策略')
            focus_counts[focus] = focus_counts.get(focus, 0) + 1

    if not matched:
        return [], '未识别宣称方向'

    primary_focus = max(focus_counts, key=lambda f: focus_counts[f])
    return matched, primary_focus


def _build_claim_strategy_draft(
    subject: str,
    body_text: str,
    client_label: str,
    matched_keywords: list[str],
    primary_focus: str,
) -> dict[str, Any]:
    """构建 claim_strategy_brief 的结构化草稿产物。"""
    now_str = datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')
    kw_str = '、'.join(matched_keywords[:5]) if matched_keywords else '（未识别）'
    return {
        'task_key': 'claim_strategy_brief',
        'governance_level': 'internal_draft',
        'generated_at': now_str,
        'subject': subject,
        'client_hint': client_label,
        'primary_focus': primary_focus,
        'matched_keywords': matched_keywords,
        'summary': (
            f'基于邮件主题"{subject}"，识别到宣称相关关键词：{kw_str}。'
            f'主要关注方向：【{primary_focus}】。'
        ),
        'sections': [
            {
                'title': '宣称方向初判',
                'content': (
                    f'客户邮件涉及宣称关键词：{", ".join(matched_keywords) or "暂无"}，'
                    f'核心关注方向为【{primary_focus}】。'
                ),
                'evidence_quality': 'low',
                'note': '仅基于邮件文本，需与客户确认具体宣称诉求',
            },
            {
                'title': '证据路径建议',
                'content': (
                    '基于初判方向，建议从以下路径提供证据支撑：\n'
                    '1. 确认客户的具体宣称表述（原文）\n'
                    '2. 评估现有法规对该宣称的边界（GB/QB/化妆品监管规定）\n'
                    '3. 推荐人体功效评价或体外测试方案\n'
                    '4. 参考竞品同类宣称的证据路径'
                ),
                'evidence_quality': 'low',
                'note': '需人工审核后才能转为正式建议',
            },
            {
                'title': '检测方案占位',
                'content': (
                    '以下为 Phase 2 占位，待与研究经理确认后填充：\n'
                    '- A方案：\n'
                    '- B方案：\n'
                    '- C方案：'
                ),
                'evidence_quality': 'placeholder',
                'note': 'Phase 2 第一阶段占位，需研究经理补充具体方案',
            },
        ],
        'review_required': True,
        'auto_send_to_client': False,
    }


def _top_keywords(matched_keywords: list[str], limit: int = 3) -> list[str]:
    return matched_keywords[:limit] if matched_keywords else []


def _build_external_evidence_plan(
    task_key: str,
    subject: str,
    matched_keywords: list[str],
    focus_label: str,
) -> list[dict[str, Any]]:
    """
    为 Phase 2 专项生成轻量外部证据采集计划。

    当前不直接发起外部抓取，只生成：
    - 来源类型
    - 建议查询词
    - 采集用途
    - 优先级
    """
    top_keywords = _top_keywords(matched_keywords)
    keyword_query = ' '.join(top_keywords) if top_keywords else subject[:30]

    if task_key == 'market_trend_brief':
        return [
            {
                'source_type': 'social_trend',
                'priority': 'high',
                'query': f'{keyword_query} 趋势 热度 小红书 抖音',
                'purpose': '补充品类热度与消费者讨论信号',
            },
            {
                'source_type': 'nmpa_filing',
                'priority': 'high',
                'query': f'{keyword_query} 备案 NMPA',
                'purpose': '补充备案与新品上市节奏信息',
            },
            {
                'source_type': 'industry_report',
                'priority': 'medium',
                'query': f'{focus_label} 行业 报告 市场 规模',
                'purpose': '补充行业规模和机会判断',
            },
            {
                'source_type': 'knowledge_base',
                'priority': 'medium',
                'query': keyword_query,
                'purpose': '检索内部历史市场分析和项目经验',
            },
        ]

    if task_key == 'competitive_intel_brief':
        return [
            {
                'source_type': 'competitor_claims',
                'priority': 'high',
                'query': f'{keyword_query} 竞品 宣称 对比',
                'purpose': '补充竞品宣称与定位对比',
            },
            {
                'source_type': 'ecommerce_reviews',
                'priority': 'high',
                'query': f'{keyword_query} 电商 评价 价格',
                'purpose': '补充竞品价格带与用户反馈',
            },
            {
                'source_type': 'nmpa_filing',
                'priority': 'medium',
                'query': f'{keyword_query} 备案 NMPA 品牌',
                'purpose': '补充竞品备案与成分/功效公开信息',
            },
            {
                'source_type': 'knowledge_base',
                'priority': 'medium',
                'query': keyword_query,
                'purpose': '检索内部竞品分析历史和差异化经验',
            },
        ]

    return [
        {
            'source_type': 'regulation_search',
            'priority': 'high',
            'query': f'{keyword_query} 宣称 法规 标准 备案',
            'purpose': '补充法规边界与合规要求',
        },
        {
            'source_type': 'testing_method',
            'priority': 'high',
            'query': f'{focus_label} 测试 方法 人体功效 体外',
            'purpose': '补充检测方案与证据路径',
        },
        {
            'source_type': 'competitor_claims',
            'priority': 'medium',
            'query': f'{keyword_query} 竞品 宣称 证据',
            'purpose': '补充同类竞品宣称参考样本',
        },
        {
            'source_type': 'knowledge_base',
            'priority': 'medium',
            'query': keyword_query,
            'purpose': '检索内部宣称策略历史和合规案例',
        },
    ]


def _load_plan_and_event(action_plan_id: int, expected_task_key: str) -> tuple:
    """
    加载任务计划和关联邮件事件，返回 (plan, event, subject, body_text, client_label)。

    如果 plan 不存在或 task_key 不匹配，plan 为 None。
    """
    from .models import AssistantActionPlan, MailSignalEvent

    plan = AssistantActionPlan.objects.filter(id=action_plan_id).first()
    if not plan or plan.task_key != expected_task_key:
        return None, None, '', '', '未知客户'

    event: MailSignalEvent | None = None
    if plan.source_event_id:
        event = MailSignalEvent.objects.filter(id=plan.source_event_id).first()

    subject = event.subject or '' if event else ''
    body_text = (event.body_text or event.body_preview or '') if event else ''
    client_label = '未知客户'
    for ref in (plan.target_object_refs or []):
        if isinstance(ref, dict) and ref.get('type') == 'client':
            client_label = ref.get('label', client_label)
            break

    return plan, event, subject, body_text, client_label


def _save_analysis_result(
    plan: Any,
    evidence_refs: list[dict],
    draft_artifact_refs: list[dict],
    matched_keywords: list[str],
    extra_field: dict[str, Any],
) -> dict[str, Any]:
    """统一写库 + 返回格式。"""
    from .models import AssistantActionPlan

    plan.evidence_refs = evidence_refs
    plan.draft_artifact_refs = draft_artifact_refs
    plan.status = AssistantActionPlan.Status.CONFIRMED
    plan.save(update_fields=['evidence_refs', 'draft_artifact_refs', 'status', 'updated_at'])

    return {
        'ok': True,
        'action_plan_id': plan.id,
        'task_key': plan.task_key,
        **extra_field,
        'matched_keywords': matched_keywords,
        'evidence_refs': evidence_refs,
        'draft_artifact_refs': draft_artifact_refs,
        'governance_level': 'internal_draft',
        'review_required': True,
    }


# ─── AI 增强层（Kimi quick_chat，失败时降级到关键词结果）─────────────────

_MARKET_TREND_SYSTEM_PROMPT = (
    '你是一位专注美妆/化妆品行业的市场研究助手。'
    '根据提供的客户邮件信息，生成简洁的品类趋势内部简报草稿。'
    '所有内容必须标注为内部参考，不得直接对客发送。'
    '只输出 JSON，不要 markdown 或额外说明。'
)

_COMPETITIVE_INTEL_SYSTEM_PROMPT = (
    '你是一位专注美妆/化妆品行业的竞品情报助手。'
    '根据提供的客户邮件信息，生成简洁的竞品情报内部简报草稿。'
    '所有内容必须标注为内部参考，不得直接对客发送。'
    '只输出 JSON，不要 markdown 或额外说明。'
)

_CLAIM_STRATEGY_SYSTEM_PROMPT = (
    '你是一位专注化妆品功效宣称与法规合规的专业助手。'
    '根据提供的客户邮件信息，生成简洁的宣称策略建议内部草稿。'
    '所有内容必须标注为内部参考，不得直接对客发送。'
    '只输出 JSON，不要 markdown 或额外说明。'
)


def _call_ai_analysis(
    system_prompt: str,
    user_message: str,
    task_key: str,
) -> dict[str, Any] | None:
    """
    调用 Kimi quick_chat 生成 AI 增强分析内容。
    返回解析后的 JSON 字典，失败则返回 None（调用方负责降级处理）。

    可通过 settings.MAIL_SIGNAL_AI_ENABLED = False 或环境变量
    MAIL_SIGNAL_AI_DISABLED=1 禁用 AI 调用（测试/离线场景）。
    """
    from django.conf import settings
    import os

    if os.environ.get('MAIL_SIGNAL_AI_DISABLED') == '1':
        return None
    if not getattr(settings, 'MAIL_SIGNAL_AI_ENABLED', True):
        return None

    try:
        from apps.agent_gateway.services import quick_chat
        from apps.agent_gateway.models import AgentProvider

        raw = quick_chat(
            message=user_message,
            provider=AgentProvider.KIMI,
            model_id='moonshot-v1-32k',
            system_prompt=system_prompt,
            temperature=0.4,
            max_tokens=2000,
        )
        raw = raw.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        if isinstance(result, dict):
            return result
        return None
    except Exception as e:
        logger.warning('AI 增强分析失败 task_key=%s: %s', task_key, e)
        return None


def _format_external_results_for_prompt(external_evidence_results: list[dict[str, Any]] | None) -> str:
    """
    将外部证据命中结果格式化为适合喂给 LLM 的上下文文本。
    """
    if not external_evidence_results:
        return '暂无外部证据命中结果，仅基于邮件正文和关键词提取。'

    lines: list[str] = ['已命中的外部证据摘要：']
    for index, item in enumerate(external_evidence_results, start=1):
        lines.append(
            f'{index}. 来源={item.get("source_type", "-")} | 查询词={item.get("query", "-")} | 用途={item.get("purpose", "-")}'
        )
        hits = item.get('hits') if isinstance(item.get('hits'), list) else []
        for hit_index, hit in enumerate(hits[:3], start=1):
            if not isinstance(hit, dict):
                continue
            lines.append(
                f'   {index}.{hit_index} {hit.get("title", "-")}：{hit.get("summary", "-")}'
            )
    return '\n'.join(lines)


def _build_evidence_reference_hints(external_evidence_results: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    """
    从外部证据命中结果中提炼适合 AI 回指的引用候选。
    """
    hints: list[dict[str, str]] = []
    for item in external_evidence_results or []:
        source_type = str(item.get('source_type') or '')
        hits = item.get('hits') if isinstance(item.get('hits'), list) else []
        for hit in hits[:3]:
            if not isinstance(hit, dict):
                continue
            hints.append({
                'source_type': source_type,
                'evidence_title': str(hit.get('title') or ''),
                'reference_code': str(hit.get('code') or ''),
                'why': str(hit.get('summary') or '')[:80],
            })
    return hints


def _build_referenced_evidence_fallback(
    hints: list[dict[str, str]] | None,
    *,
    limit: int = 3,
) -> list[dict[str, str]]:
    """
    在 AI 不可用或未返回引用清单时，基于 hints 生成 deterministic 的引用证据清单。
    """
    results: list[dict[str, str]] = []
    for item in (hints or [])[:limit]:
        results.append({
            'evidence_title': item.get('evidence_title', ''),
            'reference_code': item.get('reference_code', ''),
            'source_type': item.get('source_type', ''),
            'supports': item.get('why', ''),
        })
    return results


def _validate_referenced_evidence(
    referenced: list[dict[str, str]],
    valid_codes: set[str],
) -> list[dict[str, str]]:
    """
    校验 referenced_evidence 中的 reference_code 必须真实存在于外部证据命中结果中。
    不合法的引用会被标记 validated=false 而不是直接丢弃，以便审计。
    """
    for item in referenced:
        code = item.get('reference_code', '')
        item['validated'] = 'true' if (code and code in valid_codes) else 'false'
    return referenced


def _collect_valid_evidence_codes(external_evidence_results: list[dict[str, Any]] | None) -> set[str]:
    """从外部证据命中结果中收集所有合法的 reference_code。"""
    codes: set[str] = set()
    for item in external_evidence_results or []:
        hits = item.get('hits') if isinstance(item.get('hits'), list) else []
        for hit in hits:
            if isinstance(hit, dict) and hit.get('code'):
                codes.add(str(hit['code']))
    return codes


def _resolve_referenced_evidence(
    ai_result: dict[str, Any] | None,
    hints: list[dict[str, str]] | None,
    external_evidence_results: list[dict[str, Any]] | None = None,
) -> list[dict[str, str]]:
    """
    优先使用 AI 输出的 referenced_evidence，否则回退到 deterministic fallback。
    无论哪种来源，都会做一致性校验，标记 validated 字段。
    """
    valid_codes = _collect_valid_evidence_codes(external_evidence_results)

    referenced = ai_result.get('referenced_evidence') if isinstance(ai_result, dict) else None
    if isinstance(referenced, list) and referenced:
        normalized: list[dict[str, str]] = []
        for item in referenced[:5]:
            if not isinstance(item, dict):
                continue
            normalized.append({
                'evidence_title': str(item.get('evidence_title') or item.get('title') or ''),
                'reference_code': str(item.get('reference_code') or item.get('code') or ''),
                'source_type': str(item.get('source_type') or ''),
                'supports': str(item.get('supports') or item.get('why') or ''),
            })
        if normalized:
            return _validate_referenced_evidence(normalized, valid_codes)

    fallback = _build_referenced_evidence_fallback(hints)
    return _validate_referenced_evidence(fallback, valid_codes)


def _build_knowledge_deposit_candidates(
    task_key: str,
    draft: dict[str, Any],
    referenced_evidence: list[dict[str, str]],
) -> list[dict[str, str]]:
    """
    从分析草稿中提取值得沉淀到知识层的候选结论（Phase 3 升级版）。

    Phase 3 升级：增加 entry_type 映射，为写库做准备。
    仍标记 deposit_ready=false，需调用 deposit-knowledge API 确认后才写库。
    """
    # Phase 3: task_key -> KnowledgeEntry.entry_type 映射
    ENTRY_TYPE_MAP: dict[str, str] = {
        'market_trend_brief': 'market_insight',
        'competitive_intel_brief': 'competitor_intel',
        'claim_strategy_brief': 'method_reference',
    }
    entry_type = ENTRY_TYPE_MAP.get(task_key, 'market_insight')

    candidates: list[dict[str, str]] = []
    validated_refs = [r for r in referenced_evidence if r.get('validated') == 'true']

    inferred = draft.get('inferred_category') or draft.get('primary_threat') or draft.get('primary_focus') or ''
    if inferred:
        candidates.append({
            'conclusion': inferred,
            'conclusion_type': 'category_or_focus',
            'task_key': task_key,
            'entry_type': entry_type,
            'evidence_support': str(len(validated_refs)),
            'deposit_ready': 'false',
        })

    ai_sections = draft.get('ai_enhanced_sections')
    if isinstance(ai_sections, dict):
        for field in ['trend_signals', 'competitive_signals', 'evidence_paths']:
            items = ai_sections.get(field)
            if isinstance(items, list):
                for item in items[:2]:
                    candidates.append({
                        'conclusion': str(item),
                        'conclusion_type': field,
                        'task_key': task_key,
                        'entry_type': entry_type,
                        'evidence_support': str(len(validated_refs)),
                        'deposit_ready': 'false',
                    })

    return candidates


def _format_evidence_reference_hints_for_prompt(hints: list[dict[str, str]] | None) -> str:
    if not hints:
        return '暂无可回指的外部证据标题。'
    lines = ['可用于引用回指的证据候选：']
    for index, item in enumerate(hints[:6], start=1):
        lines.append(
            f'{index}. [{item.get("source_type", "-")}] {item.get("evidence_title", "-")} '
            f'(code={item.get("reference_code", "-")})：{item.get("why", "-")}'
        )
    return '\n'.join(lines)


def _build_market_trend_ai_message(
    subject: str,
    body_text: str,
    client_label: str,
    matched_keywords: list[str],
    inferred_category: str,
    external_evidence_results: list[dict[str, Any]] | None = None,
    evidence_reference_hints: list[dict[str, str]] | None = None,
) -> str:
    kw_str = '、'.join(matched_keywords) if matched_keywords else '（未识别）'
    evidence_context = _format_external_results_for_prompt(external_evidence_results)
    evidence_hint_context = _format_evidence_reference_hints_for_prompt(evidence_reference_hints)
    return (
        f'以下是一封客户询价邮件的信息，请生成品类趋势分析内部简报草稿。\n\n'
        f'客户名称：{client_label}\n'
        f'邮件主题：{subject}\n'
        f'邮件内容摘要：{body_text[:500]}\n'
        f'初步识别品类关键词：{kw_str}\n'
        f'推断品类：{inferred_category}\n\n'
        f'{evidence_context}\n\n'
        f'{evidence_hint_context}\n\n'
        f'请输出以下 JSON 结构（中文内容）：\n'
        f'{{\n'
        f'  "summary": "一句话总结品类趋势判断",\n'
        f'  "inferred_category": "推断的主品类",\n'
        f'  "trend_signals": ["信号1", "信号2", "信号3"],\n'
        f'  "opportunity_hints": ["机会点1", "机会点2"],\n'
        f'  "evidence_gaps": ["需要补充的证据1", "需要补充的证据2"],\n'
        f'  "recommended_actions": ["建议行动1", "建议行动2"],\n'
        f'  "evidence_reference_hints": [{{"evidence_title": "候选证据标题", "why": "为什么可用"}}],\n'
        f'  "referenced_evidence": [{{"evidence_title": "实际引用的证据标题", "reference_code": "证据code", "supports": "它支持哪条结论"}}],\n'
        f'  "confidence": "low|medium|high",\n'
        f'  "ai_note": "AI生成，仅供内部参考，需人工审核"\n'
        f'}}'
    )


def _build_competitive_intel_ai_message(
    subject: str,
    body_text: str,
    client_label: str,
    matched_keywords: list[str],
    primary_threat: str,
    external_evidence_results: list[dict[str, Any]] | None = None,
    evidence_reference_hints: list[dict[str, str]] | None = None,
) -> str:
    kw_str = '、'.join(matched_keywords) if matched_keywords else '（未识别）'
    evidence_context = _format_external_results_for_prompt(external_evidence_results)
    evidence_hint_context = _format_evidence_reference_hints_for_prompt(evidence_reference_hints)
    return (
        f'以下是一封客户邮件的信息，邮件中提及了竞品/价格压力，请生成竞品情报内部简报草稿。\n\n'
        f'客户名称：{client_label}\n'
        f'邮件主题：{subject}\n'
        f'邮件内容摘要：{body_text[:500]}\n'
        f'识别到竞品/压力关键词：{kw_str}\n'
        f'主要威胁类型：{primary_threat}\n\n'
        f'{evidence_context}\n\n'
        f'{evidence_hint_context}\n\n'
        f'请输出以下 JSON 结构（中文内容）：\n'
        f'{{\n'
        f'  "summary": "一句话总结竞品压力判断",\n'
        f'  "primary_threat": "主要威胁类型",\n'
        f'  "competitive_signals": ["信号1", "信号2", "信号3"],\n'
        f'  "differentiation_hints": ["差异化方向1", "差异化方向2"],\n'
        f'  "response_actions": ["建议应对行动1", "建议应对行动2"],\n'
        f'  "evidence_gaps": ["需要补充的证据1", "需要补充的证据2"],\n'
        f'  "evidence_reference_hints": [{{"evidence_title": "候选证据标题", "why": "为什么可用"}}],\n'
        f'  "referenced_evidence": [{{"evidence_title": "实际引用的证据标题", "reference_code": "证据code", "supports": "它支持哪条结论"}}],\n'
        f'  "confidence": "low|medium|high",\n'
        f'  "ai_note": "AI生成，仅供内部参考，需人工审核"\n'
        f'}}'
    )


def _build_claim_strategy_ai_message(
    subject: str,
    body_text: str,
    client_label: str,
    matched_keywords: list[str],
    primary_focus: str,
    external_evidence_results: list[dict[str, Any]] | None = None,
    evidence_reference_hints: list[dict[str, str]] | None = None,
) -> str:
    kw_str = '、'.join(matched_keywords) if matched_keywords else '（未识别）'
    evidence_context = _format_external_results_for_prompt(external_evidence_results)
    evidence_hint_context = _format_evidence_reference_hints_for_prompt(evidence_reference_hints)
    return (
        f'以下是一封客户邮件，客户询问了某个功效宣称的测试方案或法规要求，请生成宣称策略建议内部草稿。\n\n'
        f'客户名称：{client_label}\n'
        f'邮件主题：{subject}\n'
        f'邮件内容摘要：{body_text[:500]}\n'
        f'识别到宣称关键词：{kw_str}\n'
        f'主要关注方向：{primary_focus}\n\n'
        f'{evidence_context}\n\n'
        f'{evidence_hint_context}\n\n'
        f'请输出以下 JSON 结构（中文内容）：\n'
        f'{{\n'
        f'  "summary": "一句话总结宣称策略建议",\n'
        f'  "primary_focus": "核心宣称方向",\n'
        f'  "regulatory_boundary": "法规边界简述",\n'
        f'  "evidence_paths": ["证据路径1", "证据路径2", "证据路径3"],\n'
        f'  "test_plan_hints": ["测试方案A简述", "测试方案B简述"],\n'
        f'  "risk_notes": ["注意事项1", "注意事项2"],\n'
        f'  "evidence_reference_hints": [{{"evidence_title": "候选证据标题", "why": "为什么可用"}}],\n'
        f'  "referenced_evidence": [{{"evidence_title": "实际引用的证据标题", "reference_code": "证据code", "supports": "它支持哪条结论"}}],\n'
        f'  "confidence": "low|medium|high",\n'
        f'  "ai_note": "AI生成，仅供内部参考，需人工审核"\n'
        f'}}'
    )


def execute_market_trend_brief(action_plan_id: int) -> dict[str, Any]:
    """
    执行 market_trend_brief 专项分析任务（AI 增强版）。

    执行顺序：
    1. 关键词提取（始终执行）
    2. 尝试 Kimi AI 增强，生成 ai_enhanced_sections
    3. 合并结果写库，AI 失败时降级到关键词结果
    """
    from .models import AssistantActionPlan, MailSignalEvent

    plan = AssistantActionPlan.objects.filter(id=action_plan_id).first()
    if not plan:
        return {'ok': False, 'error': f'任务 #{action_plan_id} 不存在'}
    if plan.task_key != 'market_trend_brief':
        return {'ok': False, 'error': f'任务 task_key 为 {plan.task_key}，不支持本分析执行器'}

    event: MailSignalEvent | None = None
    if plan.source_event_id:
        event = MailSignalEvent.objects.filter(id=plan.source_event_id).first()

    subject = event.subject or '' if event else ''
    body_text = (event.body_text or event.body_preview or '') if event else ''
    client_label = '未知客户'
    for ref in (plan.target_object_refs or []):
        if isinstance(ref, dict) and ref.get('type') == 'client':
            client_label = ref.get('label', client_label)
            break

    full_text = f'{subject}\n{body_text}'
    matched_keywords, inferred_category = _extract_trend_keywords(full_text)
    draft = _build_market_trend_draft(subject, body_text, client_label, matched_keywords, inferred_category)
    external_evidence_plan = _build_external_evidence_plan(
        'market_trend_brief', subject, matched_keywords, inferred_category
    )
    draft['external_evidence_plan'] = external_evidence_plan
    from .mail_signal_external_evidence_service import execute_evidence_plan
    trend_hits = execute_evidence_plan(
        external_evidence_plan,
        matched_keywords=matched_keywords,
        focus_label=inferred_category,
    )
    draft['external_evidence_results'] = trend_hits
    evidence_reference_hints = _build_evidence_reference_hints(trend_hits)
    draft['evidence_reference_hints'] = evidence_reference_hints

    # 尝试 AI 增强
    ai_result = _call_ai_analysis(
        _MARKET_TREND_SYSTEM_PROMPT,
        _build_market_trend_ai_message(
            subject,
            body_text,
            client_label,
            matched_keywords,
            inferred_category,
            trend_hits,
            evidence_reference_hints,
        ),
        'market_trend_brief',
    )
    referenced_evidence = _resolve_referenced_evidence(ai_result, evidence_reference_hints, trend_hits)
    ai_status = 'done' if ai_result else 'done_kw'
    if ai_result:
        draft['ai_enhanced_sections'] = ai_result
        draft['summary'] = ai_result.get('summary', draft['summary'])
        inferred_category = ai_result.get('inferred_category', inferred_category)
    draft['referenced_evidence'] = referenced_evidence
    draft['knowledge_deposit_candidates'] = _build_knowledge_deposit_candidates(
        'market_trend_brief', draft, referenced_evidence,
    )

    evidence_refs = [
        {
            'source': 'mail_signal',
            'source_id': event.id if event else None,
            'description': f'邮件正文关键词匹配 ({len(matched_keywords)} 个)',
            'keywords': matched_keywords,
            'quality': 'raw',
        },
        {
            'source': 'external_evidence_plan',
            'description': '已生成外部证据采集计划',
            'quality': 'planned',
            'items': external_evidence_plan,
        },
    ]
    if trend_hits:
        evidence_refs.append({
            'source': 'trend_catalog',
            'description': f'命中 {sum(len(item.get("hits", [])) for item in trend_hits)} 条趋势/备案证据',
            'quality': 'catalog_match',
            'items': trend_hits,
        })
    if ai_result:
        evidence_refs.append({
            'source': 'ai_kimi',
            'description': 'Kimi 品类趋势 AI 分析',
            'quality': 'ai_generated',
            'confidence': ai_result.get('confidence', 'low'),
        })

    draft_artifact_refs = [
        {
            'artifact_type': 'market_trend_brief_draft',
            'governance_level': 'internal_draft',
            'generated_at': draft['generated_at'],
            'summary': draft['summary'],
            'detail': draft,
            'ai_status': ai_status,
            'review_required': True,
            'auto_send_to_client': False,
        }
    ]

    # 把 ai_analysis_status 写入 action_payload，便于前端轮询状态
    action_payload = dict(plan.action_payload or {})
    action_payload['ai_analysis_status'] = ai_status
    plan.action_payload = action_payload
    plan.evidence_refs = evidence_refs
    plan.draft_artifact_refs = draft_artifact_refs
    plan.status = AssistantActionPlan.Status.CONFIRMED
    plan.save(update_fields=['evidence_refs', 'draft_artifact_refs', 'status', 'action_payload', 'updated_at'])

    return {
        'ok': True,
        'action_plan_id': plan.id,
        'task_key': plan.task_key,
        'inferred_category': inferred_category,
        'matched_keywords': matched_keywords,
        'evidence_refs': evidence_refs,
        'draft_artifact_refs': draft_artifact_refs,
        'summary': draft['summary'],
        'ai_status': ai_status,
        'governance_level': 'internal_draft',
        'review_required': True,
    }


def execute_competitive_intel_brief(action_plan_id: int) -> dict[str, Any]:
    """
    执行 competitive_intel_brief 专项分析任务（AI 增强版）。
    """
    plan, event, subject, body_text, client_label = _load_plan_and_event(
        action_plan_id, 'competitive_intel_brief'
    )
    if plan is None:
        from .models import AssistantActionPlan
        check = AssistantActionPlan.objects.filter(id=action_plan_id).first()
        if not check:
            return {'ok': False, 'error': f'任务 #{action_plan_id} 不存在'}
        return {'ok': False, 'error': f'任务 task_key 为 {check.task_key}，不支持本分析执行器'}

    full_text = f'{subject}\n{body_text}'
    matched_keywords, primary_threat = _extract_competitive_keywords(full_text)
    draft = _build_competitive_intel_draft(subject, body_text, client_label, matched_keywords, primary_threat)
    external_evidence_plan = _build_external_evidence_plan(
        'competitive_intel_brief', subject, matched_keywords, primary_threat
    )
    draft['external_evidence_plan'] = external_evidence_plan
    from .mail_signal_external_evidence_service import execute_evidence_plan
    competitive_hits = execute_evidence_plan(
        external_evidence_plan,
        matched_keywords=matched_keywords,
        focus_label=primary_threat,
    )
    draft['external_evidence_results'] = competitive_hits
    evidence_reference_hints = _build_evidence_reference_hints(competitive_hits)
    draft['evidence_reference_hints'] = evidence_reference_hints

    ai_result = _call_ai_analysis(
        _COMPETITIVE_INTEL_SYSTEM_PROMPT,
        _build_competitive_intel_ai_message(
            subject,
            body_text,
            client_label,
            matched_keywords,
            primary_threat,
            competitive_hits,
            evidence_reference_hints,
        ),
        'competitive_intel_brief',
    )
    referenced_evidence = _resolve_referenced_evidence(ai_result, evidence_reference_hints, competitive_hits)
    ai_status = 'done' if ai_result else 'done_kw'
    if ai_result:
        draft['ai_enhanced_sections'] = ai_result
        draft['summary'] = ai_result.get('summary', draft['summary'])
        primary_threat = ai_result.get('primary_threat', primary_threat)
    draft['referenced_evidence'] = referenced_evidence
    draft['knowledge_deposit_candidates'] = _build_knowledge_deposit_candidates(
        'competitive_intel_brief', draft, referenced_evidence,
    )

    evidence_refs = [
        {
            'source': 'mail_signal',
            'source_id': event.id if event else None,
            'description': f'邮件正文竞品信号关键词匹配 ({len(matched_keywords)} 个)',
            'keywords': matched_keywords,
            'quality': 'raw',
        },
        {
            'source': 'external_evidence_plan',
            'description': '已生成外部证据采集计划',
            'quality': 'planned',
            'items': external_evidence_plan,
        },
    ]
    if competitive_hits:
        evidence_refs.append({
            'source': 'competitive_catalog',
            'description': f'命中 {sum(len(item.get("hits", [])) for item in competitive_hits)} 条竞品证据',
            'quality': 'catalog_match',
            'items': competitive_hits,
        })
    if ai_result:
        evidence_refs.append({
            'source': 'ai_kimi',
            'description': 'Kimi 竞品情报 AI 分析',
            'quality': 'ai_generated',
            'confidence': ai_result.get('confidence', 'low'),
        })

    draft_artifact_refs = [
        {
            'artifact_type': 'competitive_intel_brief_draft',
            'governance_level': 'internal_draft',
            'generated_at': draft['generated_at'],
            'summary': draft['summary'],
            'detail': draft,
            'ai_status': ai_status,
            'review_required': True,
            'auto_send_to_client': False,
        }
    ]

    action_payload = dict(plan.action_payload or {})
    action_payload['ai_analysis_status'] = ai_status
    plan.action_payload = action_payload

    from .models import AssistantActionPlan
    plan.evidence_refs = evidence_refs
    plan.draft_artifact_refs = draft_artifact_refs
    plan.status = AssistantActionPlan.Status.CONFIRMED
    plan.save(update_fields=['evidence_refs', 'draft_artifact_refs', 'status', 'action_payload', 'updated_at'])

    return {
        'ok': True,
        'action_plan_id': plan.id,
        'task_key': plan.task_key,
        'primary_threat': primary_threat,
        'matched_keywords': matched_keywords,
        'evidence_refs': evidence_refs,
        'draft_artifact_refs': draft_artifact_refs,
        'summary': draft['summary'],
        'ai_status': ai_status,
        'governance_level': 'internal_draft',
        'review_required': True,
    }


def execute_claim_strategy_brief(action_plan_id: int) -> dict[str, Any]:
    """
    执行 claim_strategy_brief 专项分析任务（AI 增强版）。
    """
    plan, event, subject, body_text, client_label = _load_plan_and_event(
        action_plan_id, 'claim_strategy_brief'
    )
    if plan is None:
        from .models import AssistantActionPlan
        check = AssistantActionPlan.objects.filter(id=action_plan_id).first()
        if not check:
            return {'ok': False, 'error': f'任务 #{action_plan_id} 不存在'}
        return {'ok': False, 'error': f'任务 task_key 为 {check.task_key}，不支持本分析执行器'}

    full_text = f'{subject}\n{body_text}'
    matched_keywords, primary_focus = _extract_claim_keywords(full_text)
    draft = _build_claim_strategy_draft(subject, body_text, client_label, matched_keywords, primary_focus)
    external_evidence_plan = _build_external_evidence_plan(
        'claim_strategy_brief', subject, matched_keywords, primary_focus
    )
    draft['external_evidence_plan'] = external_evidence_plan
    from .mail_signal_external_evidence_service import execute_evidence_plan
    regulation_hits = execute_evidence_plan(
        external_evidence_plan,
        matched_keywords=matched_keywords,
        focus_label=primary_focus,
    )
    draft['external_evidence_results'] = regulation_hits
    evidence_reference_hints = _build_evidence_reference_hints(regulation_hits)
    draft['evidence_reference_hints'] = evidence_reference_hints

    ai_result = _call_ai_analysis(
        _CLAIM_STRATEGY_SYSTEM_PROMPT,
        _build_claim_strategy_ai_message(
            subject,
            body_text,
            client_label,
            matched_keywords,
            primary_focus,
            regulation_hits,
            evidence_reference_hints,
        ),
        'claim_strategy_brief',
    )
    referenced_evidence = _resolve_referenced_evidence(ai_result, evidence_reference_hints, regulation_hits)
    ai_status = 'done' if ai_result else 'done_kw'
    if ai_result:
        draft['ai_enhanced_sections'] = ai_result
        draft['summary'] = ai_result.get('summary', draft['summary'])
        primary_focus = ai_result.get('primary_focus', primary_focus)
    draft['referenced_evidence'] = referenced_evidence
    draft['knowledge_deposit_candidates'] = _build_knowledge_deposit_candidates(
        'claim_strategy_brief', draft, referenced_evidence,
    )

    evidence_refs = [
        {
            'source': 'mail_signal',
            'source_id': event.id if event else None,
            'description': f'邮件正文宣称关键词匹配 ({len(matched_keywords)} 个)',
            'keywords': matched_keywords,
            'quality': 'raw',
        },
        {
            'source': 'external_evidence_plan',
            'description': '已生成外部证据采集计划',
            'quality': 'planned',
            'items': external_evidence_plan,
        },
    ]
    if regulation_hits:
        evidence_refs.append({
            'source': 'regulation_catalog',
            'description': f'命中 {sum(len(item.get("hits", [])) for item in regulation_hits)} 条法规证据',
            'quality': 'catalog_match',
            'items': regulation_hits,
        })
    if ai_result:
        evidence_refs.append({
            'source': 'ai_kimi',
            'description': 'Kimi 宣称策略 AI 分析',
            'quality': 'ai_generated',
            'confidence': ai_result.get('confidence', 'low'),
        })

    draft_artifact_refs = [
        {
            'artifact_type': 'claim_strategy_brief_draft',
            'governance_level': 'internal_draft',
            'generated_at': draft['generated_at'],
            'summary': draft['summary'],
            'detail': draft,
            'ai_status': ai_status,
            'review_required': True,
            'auto_send_to_client': False,
        }
    ]

    action_payload = dict(plan.action_payload or {})
    action_payload['ai_analysis_status'] = ai_status
    plan.action_payload = action_payload

    from .models import AssistantActionPlan
    plan.evidence_refs = evidence_refs
    plan.draft_artifact_refs = draft_artifact_refs
    plan.status = AssistantActionPlan.Status.CONFIRMED
    plan.save(update_fields=['evidence_refs', 'draft_artifact_refs', 'status', 'action_payload', 'updated_at'])

    return {
        'ok': True,
        'action_plan_id': plan.id,
        'task_key': plan.task_key,
        'primary_focus': primary_focus,
        'matched_keywords': matched_keywords,
        'evidence_refs': evidence_refs,
        'draft_artifact_refs': draft_artifact_refs,
        'summary': draft['summary'],
        'ai_status': ai_status,
        'governance_level': 'internal_draft',
        'review_required': True,
    }


# ============================================================================
# opportunity_draft：商机草稿自动生成（改进 D — 2026-03-15）
# ============================================================================

def execute_opportunity_draft(action_plan_id: int) -> dict[str, Any]:
    """
    将 inquiry 类邮件信号中提取的商机信息，自动生成 Opportunity 草稿（stage=lead）。

    改进 D（2026-03-15）：
    - opportunity_draft 任务键此前只是字符串标签，没有对应的执行服务
    - 本函数实现完整的邮件 → CRM 商机草稿转换，补全 Phase 1 业务闭环
    - 需要先通过 writeback 或手动确认客户关联，才能完成 Opportunity 创建

    执行流程：
    1. 从 MailSignalEvent 读取意图分析结果（key_intent, risk_or_opportunity）
    2. 从已确认的 MailSignalLink 找到客户 ID
    3. 从 extracted_entities 提取金额和截止日期
    4. 创建 Opportunity(stage='lead', …) 草稿
    5. 更新 AssistantActionPlan 状态为 CONFIRMED
    """
    from .models import AssistantActionPlan, MailSignalEvent, MailSignalLink

    plan = AssistantActionPlan.objects.filter(id=action_plan_id).first()
    if not plan:
        return {'ok': False, 'error': f'任务 #{action_plan_id} 不存在'}
    if plan.task_key != 'opportunity_draft':
        return {'ok': False, 'error': f'任务 task_key 为 {plan.task_key}，不支持本执行器'}

    event: MailSignalEvent | None = None
    if plan.source_event_id:
        event = MailSignalEvent.objects.filter(id=plan.source_event_id).first()
    if not event:
        return {'ok': False, 'error': '关联邮件事件不存在'}

    # 1. 必须有已确认的客户关联
    client_link = MailSignalLink.objects.filter(
        mail_signal_event_id=event.id,
        link_type='client',
        confirmed=True,
    ).order_by('-match_score').first()

    if not client_link:
        return {
            'ok': False,
            'error': '缺少已确认的客户关联，请先在邮件详情页确认客户匹配',
            'action_required': 'confirm_client_link',
        }

    client_id = client_link.target_id

    # 2. 读取意图分析结果
    intents = event.extracted_intents or []
    intent_data = intents[0] if intents else {}
    key_intent = intent_data.get('key_intent', '') or event.subject or '邮件触发商机草稿'
    risk_opp = intent_data.get('risk_or_opportunity', '')

    # 3. 从实体提取估算金额
    entities = event.extracted_entities or {}
    amounts = entities.get('amounts', [])
    estimated_amount = None
    if amounts:
        try:
            # 取最大金额，单位万元
            max_wan = max(float(a.replace(',', '').replace('，', '')) for a in amounts)
            estimated_amount = int(max_wan * 10000)
        except (ValueError, AttributeError):
            pass

    # 4. 构建描述（意图 + 风险商机 + 邮件摘要）
    desc_parts = [f'来源邮件：{event.subject or "（无主题）"}']
    if risk_opp:
        desc_parts.append(f'商机分析：{risk_opp}')
    desc_parts.append(f'邮件摘要：{event.body_preview or event.body_text[:300] or "（无正文）"}')
    description = '\n\n'.join(desc_parts)

    # 5. 创建 Opportunity 草稿
    try:
        from apps.crm.services import create_opportunity
        opp = create_opportunity(
            title=key_intent[:200],
            client_id=client_id,
            owner=str(plan.account_id),
            description=description,
            estimated_amount=estimated_amount,
            source_mail_signal_id=event.id,
        )

        # 6. 更新 ActionPlan 状态
        from django.utils import timezone
        plan.status = AssistantActionPlan.Status.EXECUTED
        plan.confirmed_by = plan.account_id
        plan.confirmed_at = timezone.now()
        plan.action_payload = {
            **(plan.action_payload or {}),
            'opportunity_id': opp.id,
            'opportunity_title': opp.title,
            'client_id': client_id,
            'estimated_amount': estimated_amount,
            'stage': 'lead',
        }
        plan.save(update_fields=['status', 'confirmed_by', 'confirmed_at', 'action_payload', 'updated_at'])

        return {
            'ok': True,
            'action_plan_id': plan.id,
            'opportunity_id': opp.id,
            'opportunity_title': opp.title,
            'client_id': client_id,
            'stage': 'lead',
            'estimated_amount': estimated_amount,
            'risk_or_opportunity': risk_opp,
        }

    except Exception as e:
        import logging
        logging.getLogger(__name__).warning('execute_opportunity_draft failed: %s', e)
        return {'ok': False, 'error': f'创建商机草稿失败：{e}'}
