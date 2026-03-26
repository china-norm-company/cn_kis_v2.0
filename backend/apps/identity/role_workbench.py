"""
角色 → 默认可访问工作台列表（并集用于 OAuth 回调构建用户画像）。

来源与 v1 `management/commands/seed_roles.py` 中 ROLE_WORKBENCH_MAP 对齐；
OAuth 路径不得依赖 management 命令包是否存在。
"""

# 角色 → 可访问工作台映射（15 业务 + 3 平台 = 18）
ROLE_WORKBENCH_MAP = {
    'superadmin': [
        'secretary', 'finance', 'research', 'execution', 'quality',
        'hr', 'crm', 'recruitment', 'equipment', 'material',
        'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception',
        'control-plane', 'admin', 'digital-workforce',
    ],
    'admin': [
        'secretary', 'finance', 'research', 'execution', 'quality',
        'hr', 'crm', 'recruitment', 'equipment', 'material',
        'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception',
        'control-plane', 'admin', 'digital-workforce',
    ],
    'general_manager': ['secretary', 'digital-workforce', 'research', 'execution', 'quality', 'finance', 'hr', 'crm', 'recruitment', 'control-plane'],
    'sales_director': ['secretary', 'crm', 'finance'],
    'project_director': ['secretary', 'research', 'execution', 'quality', 'recruitment'],
    'tech_director': ['secretary', 'research', 'execution', 'control-plane'],
    'research_director': ['secretary', 'research', 'quality'],
    'sales_manager': ['secretary', 'crm', 'finance'],
    'project_manager': ['secretary', 'research', 'execution', 'quality'],
    'quality_manager': ['secretary', 'quality'],
    'finance_manager': ['secretary', 'finance'],
    'hr_manager': ['secretary', 'hr'],
    'data_manager': ['secretary', 'research', 'control-plane'],
    'crc_supervisor': ['secretary', 'execution', 'reception'],
    'scheduler': ['secretary', 'execution'],
    'customer_success': ['secretary', 'crm'],
    'researcher': ['secretary', 'research'],
    'sales': ['secretary', 'crm', 'finance'],
    'business_assistant': ['secretary', 'crm', 'finance'],
    'it_specialist': ['secretary', 'control-plane'],
    'data_analyst': ['secretary', 'research'],
    'crc': ['secretary', 'execution', 'reception'],
    'receptionist': ['secretary', 'reception'],
    'clinical_executor': ['secretary', 'execution'],
    'technician': ['secretary', 'execution', 'equipment', 'material', 'facility', 'lab-personnel'],
    'evaluator': ['secretary', 'evaluator'],
    'recruiter': ['secretary', 'recruitment'],
    'recruitment_manager': ['secretary', 'recruitment'],
    'lab_personnel': ['secretary', 'lab-personnel'],
    'subject_self': [],
    'finance': ['secretary', 'finance'],
    'qa': ['secretary', 'quality', 'ethics'],
    'hr': ['secretary', 'hr'],
    'viewer': ['secretary'],
}
