"""
审批流程服务包

workflow_service.py  - 审批流程核心服务
impact_analysis_service.py - 变更影响分析服务
"""
from apps.workflow.services.workflow_service import (  # noqa: F401
    create_definition,
    start_workflow,
    approve,
    reject,
    get_instance_detail,
)
from apps.workflow.services.impact_analysis_service import ImpactAnalysisService  # noqa: F401
