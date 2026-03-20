"""
审批流程通用引擎服务 - 兼容性入口

实际逻辑已迁移到 services/ 子目录:
- services/workflow_service.py  审批流程核心
- services/impact_analysis_service.py  变更影响分析
"""
from apps.workflow.services.workflow_service import (  # noqa: F401
    create_definition,
    start_workflow,
    approve,
    reject,
    get_instance_detail,
)
from apps.workflow.services.impact_analysis_service import ImpactAnalysisService  # noqa: F401
