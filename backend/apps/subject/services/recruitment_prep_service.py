"""
招募准备材料生成服务（数字人驱动）

从协议/招募计划生成：入排口径摘要、FAQ 草稿、粗筛问卷草稿、渠道文案、海报文案。
供 protocol-to-startup-pack 与招募台「生成招募准备包」使用。
"""
import logging
from typing import Any, Dict, List, Optional

from apps.protocol.models import Protocol
from apps.subject.models_recruitment import RecruitmentPlan

logger = logging.getLogger(__name__)


def generate_recruitment_prep_draft(
    plan_id: Optional[int] = None,
    protocol_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    生成招募准备包草稿（海报文案、渠道策略、FAQ、粗筛问卷）。

    优先使用 plan_id（招募计划），否则用 protocol_id 从协议 parsed_data 抽取。
    """
    if plan_id:
        plan = RecruitmentPlan.objects.filter(id=plan_id).select_related('protocol').first()
        if not plan:
            return _error_result(plan_id or protocol_id, '招募计划不存在')
        protocol = plan.protocol
        protocol_id = protocol.id if protocol else None
    elif protocol_id:
        protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
        if not protocol:
            return _error_result(protocol_id, '协议不存在')
        plan = RecruitmentPlan.objects.filter(protocol_id=protocol_id).first()
    else:
        return _error_result(None, '请提供 plan_id 或 protocol_id')

    parsed_data = getattr(protocol, 'parsed_data', None) or {}
    title = getattr(protocol, 'title', '') or ''

    inclusion = parsed_data.get('inclusion_criteria') or parsed_data.get('inclusion', [])
    if isinstance(inclusion, str):
        inclusion = [inclusion]
    exclusion = parsed_data.get('exclusion_criteria') or parsed_data.get('exclusion', [])
    if isinstance(exclusion, str):
        exclusion = [exclusion]
    sample = parsed_data.get('sample_size') or {}
    planned = sample.get('planned', sample.get('n', 0)) if isinstance(sample, dict) else 0

    faq_draft = _build_faq_draft(title, inclusion, exclusion)
    screening_draft = _build_screening_questionnaire_draft(inclusion, exclusion)
    poster_copy = _build_poster_copy_draft(title, inclusion, planned)
    channel_strategy = _build_channel_strategy_draft(planned)

    return {
        'plan_id': plan.id if plan else None,
        'protocol_id': protocol_id,
        'protocol_title': title,
        'inclusion_criteria_summary': inclusion[:15],
        'exclusion_criteria_summary': exclusion[:15],
        'planned_enrollment': planned,
        'faq_draft': faq_draft,
        'screening_questionnaire_draft': screening_draft,
        'poster_copy_draft': poster_copy,
        'channel_strategy_draft': channel_strategy,
        'channel_copy_draft': poster_copy.get('short_copy', ''),
    }


def _error_result(ident: Optional[int], message: str) -> Dict[str, Any]:
    return {
        'plan_id': None,
        'protocol_id': ident,
        'error': message,
        'faq_draft': [],
        'screening_questionnaire_draft': [],
        'poster_copy_draft': {},
        'channel_strategy_draft': {},
    }


def _build_faq_draft(title: str, inclusion: List, exclusion: List) -> List[Dict[str, str]]:
    faqs = [
        {'q': '本研究主要考察什么？', 'a': f'本研究为「{title}」，具体目的与访视安排以知情同意书为准。'},
        {'q': '参加研究需要满足哪些条件？', 'a': '需符合方案规定的入组标准且不符合排除标准，具体由研究医生判断。'},
        {'q': '参加研究有哪些流程？', 'a': '报名后经粗筛、筛选、知情同意与基线访视后正式入组，之后按访视计划到院随访。'},
    ]
    if inclusion:
        faqs.append({
            'q': '入组标准大致有哪些？',
            'a': '入组标准包括：' + '；'.join(str(x)[:80] for x in inclusion[:5]) + '。',
        })
    if exclusion:
        faqs.append({
            'q': '哪些情况不能参加？',
            'a': '排除标准包括：' + '；'.join(str(x)[:80] for x in exclusion[:5]) + '。',
        })
    return faqs


def _build_screening_questionnaire_draft(inclusion: List, exclusion: List) -> List[Dict[str, Any]]:
    items = [
        {'type': 'text', 'key': 'name', 'label': '姓名', 'required': True},
        {'type': 'choice', 'key': 'gender', 'label': '性别', 'options': ['男', '女', '其他'], 'required': True},
        {'type': 'number', 'key': 'age', 'label': '年龄', 'required': True},
        {'type': 'text', 'key': 'phone', 'label': '联系电话', 'required': True},
    ]
    for i, inc in enumerate(inclusion[:5]):
        items.append({
            'type': 'boolean',
            'key': f'inclusion_{i}',
            'label': str(inc)[:100],
            'required': False,
        })
    for i, exc in enumerate(exclusion[:5]):
        items.append({
            'type': 'boolean',
            'key': f'exclusion_{i}',
            'label': '是否不符合：' + str(exc)[:80],
            'required': False,
        })
    return items


def _build_poster_copy_draft(title: str, inclusion: List, planned: int) -> Dict[str, str]:
    head = f'【{title}】受试者招募' if title else '临床研究受试者招募'
    short_copy = (
        f'{head}。计划招募约 {planned} 名受试者，符合条件者可获得规范随访与相应补偿。'
        if planned else f'{head}。符合条件者可获得规范随访与相应补偿。'
    )
    return {
        'headline': head,
        'short_copy': short_copy,
        'body_draft': (
            '本研究已获得伦理委员会批准。'
            '若您或亲友可能符合条件，欢迎咨询。'
            '报名后将进行初步筛选，符合条件者将进入后续筛选与知情同意流程。'
        ),
    }


def _build_channel_strategy_draft(planned: int) -> Dict[str, Any]:
    return {
        'channels': [
            {'channel': 'hospital', 'label': '医院院内/合作科室', 'priority': 1, 'notes': '首推，患者池匹配度高'},
            {'channel': 'online', 'label': '线上招募平台/公众号', 'priority': 2, 'notes': '扩大触达'},
            {'channel': 'referral', 'label': '转介/老受试者推荐', 'priority': 3, 'notes': '转化率高'},
        ],
        'target_enrollment': planned,
        'notes': '可根据实际入组进度调整渠道权重与预算。',
    }
