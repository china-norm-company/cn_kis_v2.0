"""
客户赋能服务 — 管理价值洞察推送、简报发布、内部赋能流程

进思 → 采苓 的赋能通道：
1. 价值洞察推送：管理者创建/AI生成 → 通知研究经理传递给客户
2. 客户简报发布：管理者编辑 → 推送到研究团队
3. 项目价值标注：管理者标注 → 在采苓项目面板显示
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any

from django.utils import timezone

from apps.crm.models import (
    ClientValueInsight, ClientBrief, ProjectValueTag,
    InsightSource,
)

logger = logging.getLogger(__name__)


def share_insight_to_team(insight_id: int) -> Optional[dict]:
    """推送价值洞察通知给研究经理团队"""
    insight = ClientValueInsight.objects.filter(id=insight_id, is_deleted=False).first()
    if not insight:
        return None

    insight.shared_at = timezone.now()
    insight.save(update_fields=['shared_at', 'update_time'])

    try:
        from apps.crm.services.feishu_integration_service import CRMFeishuService
        CRMFeishuService.notify_insight_shared(insight)
    except Exception as e:
        logger.warning(f'洞察推送飞书通知失败: {e}')

    return {
        'insight_id': insight.id,
        'title': insight.title,
        'shared_at': insight.shared_at.isoformat(),
    }


def publish_brief_to_team(brief_id: int) -> Optional[dict]:
    """发布客户简报到研究团队"""
    brief = ClientBrief.objects.filter(id=brief_id, is_deleted=False).first()
    if not brief:
        return None

    brief.published = True
    brief.published_at = timezone.now()
    brief.save(update_fields=['published', 'published_at', 'update_time'])

    try:
        from apps.crm.services.feishu_integration_service import CRMFeishuService
        CRMFeishuService.publish_brief_to_feishu(brief)
    except Exception as e:
        logger.warning(f'简报推送飞书失败: {e}')

    return {
        'brief_id': brief.id,
        'title': brief.title,
        'published_at': brief.published_at.isoformat(),
    }


def get_enablement_stats(client_id: int = None) -> Dict[str, Any]:
    """赋能活动统计"""
    from django.db.models import Count

    insight_qs = ClientValueInsight.objects.filter(is_deleted=False)
    brief_qs = ClientBrief.objects.filter(is_deleted=False)
    tag_qs = ProjectValueTag.objects.all()

    if client_id:
        insight_qs = insight_qs.filter(client_id=client_id)
        brief_qs = brief_qs.filter(client_id=client_id)

    return {
        'total_insights': insight_qs.count(),
        'shared_insights': insight_qs.filter(shared_at__isnull=False).count(),
        'converted_insights': insight_qs.filter(led_to_opportunity__isnull=False).count(),
        'total_briefs': brief_qs.count(),
        'published_briefs': brief_qs.filter(published=True).count(),
        'total_value_tags': tag_qs.count(),
    }
