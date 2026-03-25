"""
数据级权限过滤器

根据用户角色的数据作用域，自动过滤 QuerySet。
继承自 cn_kis_test DataPermissionFilter，精简适配 CN_KIS_V1.0。

作用域层级：
- global:   全局访问，不过滤
- project:  项目级，按项目ID过滤
- personal: 个人级，仅自己创建/负责的数据
"""
import logging
from typing import Dict, Optional, Set

from django.db.models import Q, QuerySet

from .models import Account
from .authz import get_authz_service

logger = logging.getLogger(__name__)

# 不同作用域对应的模型字段候选列表（按优先级排序）
SCOPE_FIELD_CANDIDATES = {
    'project': ['project_id', 'protocol_id', 'study_id'],
    'personal': [
        'created_by_id',     # 通用：创建人
        'account_id',        # 通用：关联账号
        'assigned_to_id',    # 工单：处理人
        'assigned_to',       # 工单（IntegerField 命名）
        'owner_id',          # 商机：负责人
        'reporter_id',       # 偏差：报告人
        'responsible_id',    # CAPA：责任人
        'assignee_id',       # 售后工单：处理人
    ],
}

# 管理员角色（拥有全局数据访问权限）
ADMIN_ROLES = {'admin', 'superadmin', 'general_manager'}


def get_data_scope(account: Account) -> str:
    """
    根据用户角色判定数据作用域

    Returns:
        'global' | 'project' | 'personal'
    """
    authz = get_authz_service()
    role_names = authz.get_account_role_names(account.id)

    # 管理员 → 全局
    if role_names & ADMIN_ROLES:
        return 'global'

    # 总监/经理级别 → 全局（可细化为部门级）
    manager_roles = {
        'sales_director', 'project_director', 'tech_director', 'research_director',
        'sales_manager', 'project_manager', 'quality_manager', 'finance_manager',
        'hr_manager', 'data_manager',
    }
    if role_names & manager_roles:
        return 'global'

    # 业务操作角色 → 全局（CRM 销售、财务等需要看到所有数据）
    business_roles = {
        'sales', 'finance', 'recruiter', 'recruitment_manager',
        'customer_success', 'business_assistant',
    }
    if role_names & business_roles:
        return 'global'

    # 项目级角色（有项目分配则按项目过滤）
    project_roles = {
        'crc', 'crc_supervisor', 'clinical_executor', 'researcher',
        'technician', 'scheduler',
    }
    if role_names & project_roles:
        return 'project'

    # 其余 → 个人级
    return 'personal'


def filter_queryset_by_scope(
    queryset: QuerySet,
    account: Account,
    scope_override: Optional[str] = None,
    field_mapping: Optional[Dict[str, str]] = None,
) -> QuerySet:
    """
    根据数据权限过滤 QuerySet

    Args:
        queryset: 原始 QuerySet
        account: 当前用户账号
        scope_override: 强制指定作用域
        field_mapping: 自定义字段映射 {'personal': 'my_creator_field', ...}

    Returns:
        过滤后的 QuerySet
    """
    scope = scope_override or get_data_scope(account)

    if scope == 'global':
        return queryset

    model = queryset.model
    model_fields = {f.name for f in model._meta.get_fields()}

    if scope == 'project':
        return _filter_by_project(queryset, account, model_fields, field_mapping)

    if scope == 'personal':
        return _filter_by_personal(queryset, account, model_fields, field_mapping)

    return queryset


def _filter_by_project(
    queryset: QuerySet,
    account: Account,
    model_fields: Set[str],
    custom_mapping: Optional[Dict[str, str]] = None,
) -> QuerySet:
    """
    项目级过滤：仅返回用户分配到的项目数据

    优先使用 custom_mapping 中的 'project' 键（支持 ORM 跨表路径，如
    'enrollment__protocol_id'），再回退到模型直接字段候选列表。
    """
    from .models import AccountRole

    # 获取用户分配的项目 ID
    project_ids = list(
        AccountRole.objects.filter(
            account_id=account.id,
            project_id__isnull=False,
        ).values_list('project_id', flat=True)
    )

    if not project_ids:
        # 无项目分配 → 回退到个人级
        return _filter_by_personal(queryset, account, model_fields, custom_mapping)

    # 1. 优先使用 custom_mapping 中的路径（支持跨表 __ 路径）
    if custom_mapping and 'project' in custom_mapping:
        custom_field = custom_mapping['project']
        # 跨表路径（含 __）直接用于 ORM filter，无需在 model_fields 中存在
        if '__' in custom_field or custom_field in model_fields:
            return queryset.filter(**{f'{custom_field}__in': project_ids}).distinct()

    # 2. 回退到候选字段列表（直接模型字段）
    for field in SCOPE_FIELD_CANDIDATES['project']:
        if field in model_fields:
            return queryset.filter(**{f'{field}__in': project_ids})

    logger.warning(f'模型 {queryset.model.__name__} 无项目级过滤字段，回退到个人级')
    return _filter_by_personal(queryset, account, model_fields, custom_mapping)


def _filter_by_personal(
    queryset: QuerySet,
    account: Account,
    model_fields: Set[str],
    custom_mapping: Optional[Dict[str, str]] = None,
) -> QuerySet:
    """
    个人级过滤：返回用户创建/负责/分配的数据

    使用 OR 逻辑合并所有匹配字段——
    例如模型同时有 created_by_id 和 assigned_to_id 时，
    用户能看到自己创建 OR 自己被分配的所有记录。
    """
    # 收集所有匹配的字段，用 OR 逻辑合并
    q = Q()
    matched = False

    custom_field = (custom_mapping or {}).get('personal')
    if custom_field:
        if '__' in custom_field:
            q |= Q(**{custom_field: account.id})
            matched = True
        else:
            candidates = [custom_field] + list(SCOPE_FIELD_CANDIDATES['personal'])
    else:
        candidates = list(SCOPE_FIELD_CANDIDATES['personal'])

    for field in candidates:
        if field in model_fields:
            q |= Q(**{field: account.id})
            matched = True

    if matched:
        return queryset.filter(q)

    logger.warning(f'模型 {queryset.model.__name__} 无个人级过滤字段')
    return queryset.none()


def get_visible_object(queryset: QuerySet, account: Optional[Account], scope_override: Optional[str] = None):
    """
    在数据权限范围内取第一条（用于详情/单条接口的对象级校验）。
    无 account 时不过滤，直接返回 queryset.first()。
    scope_override: 强制指定作用域（如 'global' 表示团队共享）。
    """
    if account:
        queryset = filter_queryset_by_scope(queryset, account, scope_override=scope_override)
    return queryset.first()
