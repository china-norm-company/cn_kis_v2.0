"""
协议检测项提取与模板匹配服务

来源：cn_kis_test visit/services/protocol_to_activities_service.py

职责：
- 从 parsed_data 提取结构化检测项列表
- 将检测项匹配到已有活动模板（ActivityTemplate）
"""
import logging
from typing import List, Optional
from dataclasses import dataclass, field

from apps.resource.models import ActivityTemplate

logger = logging.getLogger(__name__)


@dataclass
class ProcedureInfo:
    """解析后的检测项信息"""
    name: str
    visit_code: str = ''
    visit_name: str = ''
    description: str = ''
    suggested_instrument: str = ''
    suggested_duration: int = 30
    suggested_category: str = 'other'
    measurement_sites: List[str] = field(default_factory=list)
    repeat_times: int = 1
    matched_template_id: Optional[int] = None
    matched_template_name: Optional[str] = None


class ProtocolToActivitiesService:
    """
    协议到活动的转换服务

    提供从 parsed_data 中提取详细检测信息并匹配模板的能力。
    """

    @classmethod
    def extract_procedures_from_parsed_data(
        cls,
        parsed_data: dict,
        enable_template_matching: bool = True,
    ) -> List[ProcedureInfo]:
        """
        从协议的 parsed_data 提取所有检测项

        Args:
            parsed_data: Protocol.parsed_data
            enable_template_matching: 是否启用模板匹配

        Returns:
            List[ProcedureInfo]
        """
        if not parsed_data:
            return []

        visits = parsed_data.get('visits', [])
        if not visits:
            return []

        # 预加载模板
        template_map = cls._build_template_map() if enable_template_matching else {}

        procedures = []
        for visit in visits:
            visit_code = visit.get('visit_code', '')
            visit_name = visit.get('visit_name', '')
            raw_procs = visit.get('procedures', [])

            for raw in raw_procs:
                info = cls._parse_procedure(raw, visit_code, visit_name)
                if enable_template_matching:
                    cls._try_match_template(info, template_map)
                procedures.append(info)

        logger.info(
            f'提取检测项: total={len(procedures)}, '
            f'matched={sum(1 for p in procedures if p.matched_template_id)}'
        )
        return procedures

    @classmethod
    def match_to_templates(cls, procedures: List[ProcedureInfo]) -> List[ProcedureInfo]:
        """
        对已提取的检测项执行模板匹配

        可在手动调整检测项列表后重新执行匹配。
        """
        template_map = cls._build_template_map()
        for proc in procedures:
            cls._try_match_template(proc, template_map)
        return procedures

    @classmethod
    def get_unique_procedures(cls, parsed_data: dict) -> List[str]:
        """获取去重后的检测项名称列表"""
        procedures = cls.extract_procedures_from_parsed_data(
            parsed_data, enable_template_matching=False
        )
        seen = set()
        result = []
        for p in procedures:
            if p.name not in seen:
                seen.add(p.name)
                result.append(p.name)
        return result

    # ------------------------------------------------------------------
    # 内部方法
    # ------------------------------------------------------------------
    @classmethod
    def _parse_procedure(cls, raw, visit_code: str, visit_name: str) -> ProcedureInfo:
        """解析单个检测项（支持字符串和字典格式）"""
        if isinstance(raw, str):
            return ProcedureInfo(
                name=raw.strip(),
                visit_code=visit_code,
                visit_name=visit_name,
            )
        elif isinstance(raw, dict):
            return ProcedureInfo(
                name=raw.get('name', '未命名检测').strip(),
                visit_code=visit_code,
                visit_name=visit_name,
                description=raw.get('description', ''),
                suggested_instrument=raw.get('suggested_instrument', ''),
                suggested_duration=raw.get('suggested_duration', 30),
                suggested_category=raw.get('suggested_category', 'other'),
                measurement_sites=raw.get('measurement_sites', []),
                repeat_times=raw.get('repeat_times', 1),
            )
        else:
            return ProcedureInfo(
                name=str(raw),
                visit_code=visit_code,
                visit_name=visit_name,
            )

    @classmethod
    def _build_template_map(cls) -> dict:
        """构建模板名称→模板对象映射"""
        templates = ActivityTemplate.objects.filter(is_active=True, is_deleted=False)
        result = {}
        for tpl in templates:
            result[tpl.name.lower()] = tpl
            result[tpl.code.lower()] = tpl
        return result

    @classmethod
    def _try_match_template(cls, info: ProcedureInfo, template_map: dict):
        """尝试将检测项匹配到活动模板"""
        name_lower = info.name.lower().strip()

        # 精确匹配
        matched = template_map.get(name_lower)
        if not matched:
            # 包含匹配
            for key, tpl in template_map.items():
                if key in name_lower or name_lower in key:
                    matched = tpl
                    break

        if matched:
            info.matched_template_id = matched.id
            info.matched_template_name = matched.name
