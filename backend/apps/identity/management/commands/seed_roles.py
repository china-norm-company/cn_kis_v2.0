"""
角色与工作台可见性映射（供 _build_user_profile 等指标模块导入）。

与 identity/api.py 中 VALID_WORKSTATION_KEYS、WORKSTATION_BASELINE_ROLE_MAP 保持语义一致：
飞书首登会授予 viewer + 工作台基线角色，此处决定「在秘书台门户能看到哪些台卡片」。
"""

# 18 台全量（顺序便于阅读；与 api.VALID_WORKSTATION_KEYS 一致）
_ALL_WORKSTATIONS = [
    'secretary',
    'finance',
    'research',
    'execution',
    'quality',
    'hr',
    'crm',
    'recruitment',
    'equipment',
    'material',
    'facility',
    'evaluator',
    'lab-personnel',
    'ethics',
    'reception',
    'control-plane',
    'admin',
    'digital-workforce',
]

# 角色 name（t_role.name）→ 可见工作台 key 列表（并集由各角色合并）
# 未列出的角色在 _build_user_profile 中不会增加可见台（仅权限/菜单仍可能来自 RolePermission）
ROLE_WORKBENCH_MAP = {
    'superadmin': list(_ALL_WORKSTATIONS),
    'admin': list(_ALL_WORKSTATIONS),
    'general_manager': list(_ALL_WORKSTATIONS),
    # 基线 viewer：仅门户（业务台入口由具体业务角色补充）
    'viewer': ['secretary'],
    # 与各业务台 baseline 角色对齐（见 services.WORKSTATION_BASELINE_ROLE_MAP）
    'finance': ['finance', 'secretary'],
    'researcher': ['research', 'secretary'],
    'clinical_executor': ['execution', 'secretary'],
    'receptionist': ['reception', 'secretary'],
    'qa': ['quality', 'ethics', 'secretary'],
    'hr': ['hr', 'secretary'],
    'hr_manager': ['hr', 'secretary'],
    'sales': ['crm', 'secretary'],
    'sales_director': ['crm', 'secretary'],
    'sales_manager': ['crm', 'secretary'],
    'customer_success': ['crm', 'secretary'],
    'business_assistant': ['crm', 'secretary'],
    'recruiter': ['recruitment', 'secretary'],
    'recruitment_manager': ['recruitment', 'secretary'],
    'technician': ['equipment', 'material', 'facility', 'secretary'],
    'evaluator': ['evaluator', 'secretary'],
    'lab_personnel': ['lab-personnel', 'secretary'],
    'it_specialist': ['control-plane', 'secretary'],
    'project_director': ['research', 'execution', 'secretary'],
    'project_manager': ['research', 'execution', 'secretary'],
    'research_director': ['research', 'secretary'],
    'tech_director': ['quality', 'execution', 'secretary'],
    'quality_manager': ['quality', 'secretary'],
    'data_manager': ['research', 'secretary'],
    'crc': ['research', 'execution', 'reception', 'secretary'],
    'crc_supervisor': ['research', 'execution', 'secretary'],
    'scheduler': ['execution', 'secretary'],
    'subject_self': ['reception', 'secretary'],
    # 智能体 / 平台
    'ai_operator': ['digital-workforce', 'secretary'],
}
