"""
伦理审查意见服务

核心逻辑：
- 创建审查意见时，根据意见类型自动驱动申请状态变更
- 管理回复流程和截止日期跟踪
"""
import logging
from typing import Optional
from django.db import transaction
from django.utils import timezone

from apps.ethics.models import EthicsApplication, EthicsApplicationStatus
from apps.ethics.models_review import EthicsReviewOpinion, OpinionType

logger = logging.getLogger(__name__)

OPINION_STATUS_MAP = {
    OpinionType.APPROVE: EthicsApplicationStatus.APPROVED,
    OpinionType.DISAPPROVE: EthicsApplicationStatus.REJECTED,
    OpinionType.REVISE: EthicsApplicationStatus.REVIEWING,
    OpinionType.TERMINATE: EthicsApplicationStatus.REJECTED,
}


def _generate_opinion_no() -> str:
    """生成审查意见编号"""
    now = timezone.now()
    prefix = f'RO-{now.strftime("%Y%m%d")}'
    count = EthicsReviewOpinion.objects.filter(
        opinion_no__startswith=prefix
    ).count()
    return f'{prefix}-{count + 1:03d}'


@transaction.atomic
def create_review_opinion(
    application_id: int,
    opinion_type: str,
    review_date,
    summary: str,
    detailed_opinion: str,
    modification_requirements: str = '',
    reviewer_names: list = None,
    response_required: bool = False,
    response_deadline=None,
    created_by_id: int = None,
) -> Optional[EthicsReviewOpinion]:
    """创建审查意见并自动驱动申请状态变更"""
    try:
        application = EthicsApplication.objects.get(id=application_id)
    except EthicsApplication.DoesNotExist:
        return None

    opinion = EthicsReviewOpinion.objects.create(
        application=application,
        opinion_no=_generate_opinion_no(),
        opinion_type=opinion_type,
        review_date=review_date,
        summary=summary,
        detailed_opinion=detailed_opinion,
        modification_requirements=modification_requirements,
        reviewer_names=reviewer_names or [],
        response_required=response_required,
        response_deadline=response_deadline,
        created_by_id=created_by_id,
    )

    new_status = OPINION_STATUS_MAP.get(opinion_type)
    if new_status:
        application.status = new_status
        application.save(update_fields=['status', 'update_time'])
        logger.info(
            f'审查意见 {opinion.opinion_no} 创建，申请 {application.application_number} '
            f'状态变更为 {new_status}'
        )

    return opinion


def get_review_opinion(opinion_id: int) -> Optional[EthicsReviewOpinion]:
    return EthicsReviewOpinion.objects.select_related('application').filter(id=opinion_id).first()


def list_review_opinions(
    application_id: int = None,
    opinion_type: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = EthicsReviewOpinion.objects.select_related('application')
    if application_id:
        qs = qs.filter(application_id=application_id)
    if opinion_type:
        qs = qs.filter(opinion_type=opinion_type)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}


def parse_irb_opinion(opinion_text: str) -> dict:
    """
    解析伦理审查意见文本，提取逐条意见并分类。

    支持的分类:
    - modification_required: 需修改的内容
    - clarification_needed: 需澄清的问题
    - approval_condition: 附条件批准
    - general_comment: 一般性意见

    Args:
        opinion_text: 伦理委员会审查意见的原始文本

    Returns:
        {
            'items': [{'index': 1, 'category': ..., 'content': ..., 'priority': ...}, ...],
            'summary': {'total': N, 'by_category': {...}},
            'raw_text': ...,
        }
    """
    import re
    from collections import Counter

    if not opinion_text or not opinion_text.strip():
        return {
            'items': [],
            'summary': {'total': 0, 'by_category': {}},
            'raw_text': '',
        }

    text = opinion_text.strip()
    items = []

    # 按编号、项目符号或换行拆分条目
    patterns = [
        r'(?:^|\n)\s*(\d+)[\.、）)\s]+(.+?)(?=\n\s*\d+[\.、）)\s]|\Z)',
        r'(?:^|\n)\s*[•·\-\*]\s*(.+?)(?=\n\s*[•·\-\*]|\Z)',
        r'(?:^|\n)\s*(?:[（(]\d+[)）])\s*(.+?)(?=\n\s*[（(]\d+|\Z)',
    ]

    entries = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.DOTALL)
        if matches:
            for m in matches:
                entry = m[-1].strip() if isinstance(m, tuple) else m.strip()
                if entry and len(entry) > 2:
                    entries.append(entry)
            break

    if not entries:
        for line in text.split('\n'):
            line = line.strip()
            if line and len(line) > 5:
                entries.append(line)

    modification_keywords = ['修改', '修订', '补充', '完善', '增加', '删除', '调整', '更新', '纠正']
    clarification_keywords = ['澄清', '说明', '解释', '明确', '请', '提供', '补充说明']
    condition_keywords = ['条件', '前提', '批准', '同意', '通过', '有效期']

    for idx, entry in enumerate(entries, 1):
        category = 'general_comment'
        priority = 'low'

        if any(kw in entry for kw in modification_keywords):
            category = 'modification_required'
            priority = 'high'
        elif any(kw in entry for kw in clarification_keywords):
            category = 'clarification_needed'
            priority = 'medium'
        elif any(kw in entry for kw in condition_keywords):
            category = 'approval_condition'
            priority = 'medium'

        items.append({
            'index': idx,
            'category': category,
            'content': entry,
            'priority': priority,
        })

    category_counts = Counter(item['category'] for item in items)

    logger.info(f'IRB 意见解析: {len(items)} 条意见, 分类={dict(category_counts)}')

    return {
        'items': items,
        'summary': {
            'total': len(items),
            'by_category': dict(category_counts),
        },
        'raw_text': text,
    }


@transaction.atomic
def respond_to_opinion(opinion_id: int, response_text: str) -> Optional[EthicsReviewOpinion]:
    """提交审查意见回复"""
    opinion = get_review_opinion(opinion_id)
    if not opinion or not opinion.response_required or opinion.response_received:
        return None

    opinion.response_text = response_text
    opinion.response_received = True
    opinion.response_date = timezone.now().date()
    opinion.save(update_fields=[
        'response_text', 'response_received', 'response_date', 'update_time',
    ])
    logger.info(f'审查意见 {opinion.opinion_no} 已收到回复')
    return opinion
