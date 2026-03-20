"""
CRF 智能推荐服务

S4-3：基于访视活动类型推荐匹配的 CRF 模板
"""
import logging
from typing import List

from apps.edc.models import CRFTemplate

logger = logging.getLogger(__name__)


class CRFRecommendService:
    """CRF 模板智能推荐"""

    @classmethod
    def recommend_for_activity(cls, activity_template_id: int) -> List[CRFTemplate]:
        """
        根据活动模板推荐 CRF 模板

        匹配逻辑：
        1. 活动模板直接关联的 CRF 模板（精确匹配）
        2. 同名称/关键字模糊匹配
        """
        from apps.resource.models import ActivityTemplate

        template = ActivityTemplate.objects.filter(id=activity_template_id).first()
        if not template:
            return []

        results = []

        # 精确匹配：crf_template 直接关联
        if template.crf_template_id:
            crf = CRFTemplate.objects.filter(id=template.crf_template_id).first()
            if crf:
                results.append(crf)

        # 模糊匹配：名称关键字
        keywords = template.name.split()
        for kw in keywords:
            if len(kw) >= 2:
                matched = CRFTemplate.objects.filter(
                    name__icontains=kw,
                    is_deleted=False,
                ).exclude(
                    id__in=[r.id for r in results]
                )[:5]
                results.extend(matched)

        return results[:10]

    @classmethod
    def export_template(cls, template_id: int) -> dict:
        """导出 CRF 模板为 JSON"""
        template = CRFTemplate.objects.filter(id=template_id).first()
        if not template:
            return {}

        return {
            'name': template.name,
            'version': template.version or '1.0',
            'schema': template.schema,
            'description': template.description or '',
            'exported_from': 'CN_KIS_V1.0',
        }

    @classmethod
    def import_template(cls, data: dict) -> CRFTemplate:
        """从 JSON 导入 CRF 模板"""
        name = data.get('name', 'Imported Template')
        schema = data.get('schema', {})

        template = CRFTemplate.objects.create(
            name=name,
            schema=schema,
        )
        return template
