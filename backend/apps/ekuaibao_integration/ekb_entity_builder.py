"""
易快报业务关系重建器

按照业务逻辑完整重建：
  Step 1: 677 staffs → Account + Staff + 角色推导
  Step 2: 114 departments → 部门层级树（KnowledgeEntity）
  Step 3: 审批流模板 + 每条单据审批轨迹持久化
  Step 4: 报销→预算关联链（expenseLink 持久化）
  Step 5: 知识图谱实体和关系入库

调用方式：
  python manage.py rebuild_ekuaibao_relations
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger('cn_kis.ekuaibao.entity_builder')


# ============================================================================
# 角色映射表（易快报审批节点名 → 系统 Role.name）
# ============================================================================

NODE_TO_ROLE = {
    '组长审批':             ('project_leader',  '项目组长',    'operation',  5),
    '客户经理审批':          ('account_manager', '客户经理',    'operation',  5),
    '客户经理审批（特化选择蒋艳雯）': ('account_manager', '客户经理', 'operation', 5),
    '财务审批':             ('finance_auditor', '财务审批',    'support',    6),
    '出纳支付':             ('cashier',         '出纳',        'support',    4),
    '板块负责人审批':        ('sector_head',     '板块负责人',  'management', 7),
    '企发部审批':           ('biz_dev_reviewer','企发部审核',  'management', 6),
    '伦理二级审核-马蓓丽':   ('ethics_reviewer', '伦理审核',    'operation',  6),
    '运营中心':             ('ops_manager',     '运营中心',    'operation',  5),
    '总经理室审批':         ('gm_reviewer',     '总经理室',    'management', 8),
    '董事长审批':           ('chairman',        '董事长',      'management', 9),
    '医美诊所':             ('clinic_reviewer', '医美诊所',    'operation',  5),
}


def _get_or_create_role(name: str, display_name: str, category: str, level: int):
    """获取或创建角色"""
    from apps.identity.models import Role
    role, _ = Role.objects.get_or_create(
        name=name,
        defaults={
            'display_name': display_name,
            'category': category,
            'level': level,
            'is_system': False,
            'is_active': True,
        }
    )
    return role


# ============================================================================
# Step 1: 677 staffs → Account + Staff + 角色推导
# ============================================================================

def build_staff_accounts(batch_no: str = '20260318_144803') -> dict:
    """
    从易快报员工数据创建 Account + Staff 记录，
    并通过审批流反向推导每人的系统角色。
    """
    from apps.ekuaibao_integration.models import EkbRawRecord
    from apps.identity.models import Account, AccountRole, Role
    from apps.hr.models import Staff

    stats = {
        'accounts_created': 0, 'accounts_updated': 0,
        'staff_created': 0, 'staff_updated': 0,
        'roles_assigned': 0,
    }

    # Phase 1A: 预先构建 ekb_staff_id → 审批角色 映射
    # 从 flows 的审批日志中提取：operatorId 出现在某个节点名 → 该人拥有对应角色
    staff_roles: Dict[str, set] = {}  # ekb_staff_id → {role_name, ...}
    phase1_batch = '20260318_144803'

    for rec in EkbRawRecord.objects.filter(batch__batch_no=phase1_batch, module='flows'):
        flow_data = rec.raw_data
        logs = flow_data.get('logs', []) or []
        flow_plan = flow_data.get('flowPlan', {}) or {}
        nodes = flow_plan.get('nodes', []) or []

        # 建立 nodeId → nodeName 映射
        node_name_map = {}
        for node in nodes:
            if isinstance(node, dict):
                nid = node.get('id', '')
                nname = node.get('name', '')
                if nid and nname:
                    node_name_map[nid] = nname

        for log_entry in logs:
            if not isinstance(log_entry, dict):
                continue
            action = log_entry.get('action', '')
            if action not in ('freeflow.agree', 'freeflow.reject'):
                continue
            operator_id = log_entry.get('operatorId', '')
            node_name = log_entry.get('nodeName', '') or node_name_map.get(
                log_entry.get('nodeId', ''), ''
            )
            if not operator_id or not node_name:
                continue
            if operator_id not in staff_roles:
                staff_roles[operator_id] = set()
            # 找到对应角色
            for kw, (role_name, *_) in NODE_TO_ROLE.items():
                if kw in node_name:
                    staff_roles[operator_id].add(role_name)
                    break

    logger.info('从审批流推导到 %d 人的角色', len(staff_roles))

    # Phase 1B: 创建 Account + Staff
    phase1_staffs = list(EkbRawRecord.objects.filter(
        batch__batch_no='20260318_133425', module='staffs'
    ))

    for rec in phase1_staffs:
        d = rec.raw_data
        ekb_id = d.get('id', '')
        name = d.get('name', '')
        if not name:
            continue

        # 从 staffCustomForm 提取额外信息
        custom_form = d.get('staffCustomForm') or {}
        employee_no = ''
        if isinstance(custom_form, dict):
            u_account = custom_form.get('u_员工账号', '')
            if isinstance(u_account, dict):
                employee_no = u_account.get('name', '') or u_account.get('value', '')
            elif isinstance(u_account, str):
                employee_no = u_account

        # 部门
        dept_ids = d.get('departments', [])
        default_dept_id = d.get('defaultDepartment', '')

        # 是否激活
        is_active = d.get('active', True)
        is_leave = not is_active

        # 生成安全的 username（易快报 code 或 name 拼音化）
        code = d.get('code', '') or d.get('staffCode', '')
        # 确保 username 全局唯一：优先用 code，否则用 ekb_前缀ID
        if code:
            username = code
            # 检查是否与其他 Account 的 username 冲突
            if Account.objects.filter(username=code).exclude(ekuaibao_staff_id=ekb_id).exists():
                username = f'ekb_{ekb_id.split(":")[-1][:16]}'
        else:
            username = f'ekb_{ekb_id.split(":")[-1][:16]}'

        # 创建或更新 Account（生产库中可能已有缝合后的账号）
        existing = Account.objects.filter(
            ekuaibao_staff_id=ekb_id, is_deleted=False
        ).first()
        if existing:
            account = existing
            created = False
            # 更新关键字段
            changed = False
            if not account.ekuaibao_username and code:
                account.ekuaibao_username = code
                changed = True
            if changed:
                account.save(update_fields=['ekuaibao_username'])
            stats['accounts_updated'] += 1
        else:
            try:
                account = Account.objects.create(
                    username=username,
                    display_name=name,
                    account_type='internal',
                    status='inactive' if is_leave else 'active',
                    ekuaibao_staff_id=ekb_id,
                    ekuaibao_username=code,
                )
                created = True
                stats['accounts_created'] += 1
            except Exception:
                # 并发或重复时兜底
                account = Account.objects.filter(
                    ekuaibao_staff_id=ekb_id
                ).first()
                if not account:
                    continue
                created = False
                stats['accounts_updated'] += 1

        # 创建或更新 Staff（部门名称需要从 departments 数据中查找）
        dept_name = ''
        if dept_ids:
            dept_name = _resolve_dept_name(str(default_dept_id or dept_ids[0]))

        # Staff 用姓名+部门作为查找键（不依赖 feishu_open_id，因为易快报无飞书ID）
        staff_obj = Staff.objects.filter(account_fk=account).first()
        if staff_obj:
            # 更新已有记录
            staff_obj.name = name
            staff_obj.employee_no = employee_no or staff_obj.employee_no
            staff_obj.position = _infer_position(ekb_id, staff_roles) or staff_obj.position
            staff_obj.department = dept_name or staff_obj.department
            staff_obj.is_deleted = is_leave
            staff_obj.account_id = account.id
            staff_obj.save(update_fields=[
                'name', 'employee_no', 'position', 'department', 'is_deleted', 'account_id'
            ])
            stats['staff_updated'] += 1
        else:
            # feishu_open_id 是 unique=True，用 ekb_{account_id} 作为临时占位符避免冲突
            Staff.objects.create(
                name=name,
                employee_no=employee_no,
                position=_infer_position(ekb_id, staff_roles) or '研究员',
                department=dept_name,
                is_deleted=is_leave,
                account_id=account.id,
                account_fk=account,
                feishu_open_id=f'ekb_{account.id}',
            )
            stats['staff_created'] += 1

        # 分配角色
        inferred_roles = staff_roles.get(ekb_id, set())
        for role_name in inferred_roles:
            role_info = next(
                (v for k, v in NODE_TO_ROLE.items() if v[0] == role_name), None
            )
            if not role_info:
                continue
            role = _get_or_create_role(role_info[0], role_info[1], role_info[2], role_info[3])
            AccountRole.objects.get_or_create(
                account=account,
                role=role,
                project_id=None,
            )
            stats['roles_assigned'] += 1

    # 确保所有 NODE_TO_ROLE 中的角色都已创建
    for node_name, (rname, rdisp, rcat, rlvl) in NODE_TO_ROLE.items():
        _get_or_create_role(rname, rdisp, rcat, rlvl)

    logger.info('Step 1 完成: %s', stats)
    return stats


_dept_name_cache: Dict[str, str] = {}


def _resolve_dept_name(dept_id: str) -> str:
    """从 EkbRawRecord 解析部门名称（带缓存）"""
    if dept_id in _dept_name_cache:
        return _dept_name_cache[dept_id]
    try:
        from apps.ekuaibao_integration.models import EkbRawRecord
        rec = EkbRawRecord.objects.filter(
            batch__batch_no='20260318_133425',
            module='departments',
            ekb_id=dept_id,
        ).first()
        if rec:
            name = rec.raw_data.get('name', '')
            _dept_name_cache[dept_id] = name
            return name
    except Exception:
        pass
    return ''


def _infer_position(ekb_id: str, staff_roles: Dict[str, set]) -> str:
    """从审批流推导职位名称"""
    roles = staff_roles.get(ekb_id, set())
    role_to_position = {
        'project_leader': '项目组长',
        'account_manager': '客户经理',
        'finance_auditor': '财务审批',
        'cashier': '出纳',
        'sector_head': '板块负责人',
        'biz_dev_reviewer': '企发部',
        'ethics_reviewer': '伦理审核',
        'gm_reviewer': '总经理',
        'chairman': '董事长',
    }
    for role_name, position in role_to_position.items():
        if role_name in roles:
            return position
    return '研究员'


# ============================================================================
# Step 2: 114 departments → 部门层级树
# ============================================================================

def build_department_tree(batch_no: str = '20260318_133425') -> dict:
    """
    将易快报 114 个部门建立为 KnowledgeEntity 树形结构，
    并更新 Staff.department 字段。
    """
    from apps.ekuaibao_integration.models import EkbRawRecord
    from apps.knowledge.models import KnowledgeEntity

    stats = {'entities_created': 0, 'entities_updated': 0}

    dept_records = list(EkbRawRecord.objects.filter(
        batch__batch_no=batch_no, module='departments'
    ))

    # 建立 ekb_id → record 映射
    dept_map: Dict[str, dict] = {}
    for rec in dept_records:
        d = rec.raw_data
        dept_id = d.get('id', rec.ekb_id)
        _dept_name_cache[dept_id] = d.get('name', '')
        dept_map[dept_id] = {
            'id': dept_id,
            'name': d.get('name', ''),
            'parent_id': d.get('parentId', ''),
            'code': d.get('code', ''),
        }

    # 先创建所有实体（不管层级）
    entity_map: Dict[str, Any] = {}
    for dept_id, info in dept_map.items():
        uri = f'cnkis:dept:{dept_id}'
        entity, created = KnowledgeEntity.objects.update_or_create(
            uri=uri,
            defaults={
                'label': info['name'],
                'entity_type': 'concept',
                'namespace': 'cnkis',
                'definition': f"部门：{info['name']}（编码：{info.get('code', '-')}）",
                'properties': {
                    'ekuaibao_dept_id': dept_id,
                    'code': info.get('code', ''),
                    'source': 'ekuaibao_departments',
                },
                'is_deleted': False,
            }
        )
        entity_map[dept_id] = entity
        if created:
            stats['entities_created'] += 1
        else:
            stats['entities_updated'] += 1

    # 建立父子关系
    for dept_id, info in dept_map.items():
        parent_id = info.get('parent_id', '')
        if parent_id and parent_id in entity_map:
            child_entity = entity_map[dept_id]
            parent_entity = entity_map[parent_id]
            if child_entity.parent_id != parent_entity.id:
                child_entity.parent = parent_entity
                child_entity.save(update_fields=['parent'])

    # 更新 Staff.department 字段（通过 ekuaibao_staff_id 关联）
    from apps.identity.models import Account
    from apps.hr.models import Staff

    updated_staff = 0
    for account in Account.objects.exclude(ekuaibao_staff_id=''):
        # 找到对应的 staffs 原始数据
        from apps.ekuaibao_integration.models import EkbRawRecord as EkbRR
        staff_rec = EkbRR.objects.filter(
            batch__batch_no='20260318_133425',
            module='staffs',
            ekb_id=account.ekuaibao_staff_id,
        ).first()
        if not staff_rec:
            continue
        default_dept_id = staff_rec.raw_data.get('defaultDepartment', '')
        dept_name = _dept_name_cache.get(str(default_dept_id), '')
        if not dept_name:
            depts = staff_rec.raw_data.get('departments', [])
            if depts:
                dept_name = _dept_name_cache.get(str(depts[0]), '')

        if dept_name:
            Staff.objects.filter(account_fk=account).update(department=dept_name)
            updated_staff += 1

    stats['staff_dept_updated'] = updated_staff
    logger.info('Step 2 完成: %s', stats)
    return stats


# ============================================================================
# Step 3: 审批流模板 + 每条单据审批轨迹持久化
# ============================================================================

def build_approval_chains(batch_no: str = '20260318_144803') -> dict:
    """
    1. 从 flows 提取审批流模板（按 specificationId 分类）→ KnowledgeEntity
    2. 更新 ExpenseRequest.approval_chain（每条单据的实际审批轨迹）
    """
    from apps.ekuaibao_integration.models import EkbRawRecord
    from apps.knowledge.models import KnowledgeEntity
    from apps.finance.models_expense import ExpenseRequest

    stats = {
        'templates_created': 0,
        'expenses_approval_updated': 0,
    }

    # Phase 3A: 按 specificationId 聚合审批流模板
    flow_templates: Dict[str, dict] = {}

    for rec in EkbRawRecord.objects.filter(batch__batch_no=batch_no, module='flows'):
        d = rec.raw_data
        up = d.get('userProps', {}) or {}
        spec = up.get('specificationId', {})
        spec_name = spec.get('name', '') if isinstance(spec, dict) else ''
        if not spec_name:
            continue

        flow_plan = d.get('flowPlan', {}) or {}
        nodes = flow_plan.get('nodes', []) or []
        node_names = [
            n.get('name', '')
            for n in nodes
            if isinstance(n, dict) and n.get('name', '') not in ('SUBMIT', '')
        ]

        if spec_name not in flow_templates:
            flow_templates[spec_name] = {
                'spec_name': spec_name,
                'node_names': node_names,
                'count': 0,
            }
        flow_templates[spec_name]['count'] += 1

    # 持久化审批流模板为 KnowledgeEntity
    for spec_name, info in flow_templates.items():
        uri = f'cnkis:approval_flow:{spec_name}'
        node_desc = ' → '.join(filter(None, info['node_names']))
        entity, created = KnowledgeEntity.objects.update_or_create(
            uri=uri,
            defaults={
                'label': spec_name,
                'entity_type': 'concept',
                'namespace': 'cnkis',
                'definition': (
                    f"审批流模板：{spec_name}\n"
                    f"节点顺序：{node_desc}\n"
                    f"使用次数：{info['count']}"
                ),
                'properties': {
                    'source': 'ekuaibao_approval_flow',
                    'nodes': info['node_names'],
                    'usage_count': info['count'],
                },
                'is_deleted': False,
            }
        )
        if created:
            stats['templates_created'] += 1

    # Phase 3B: 更新每条 ExpenseRequest 的 approval_chain
    for expense in ExpenseRequest.objects.filter(import_source='ekuaibao').exclude(ekuaibao_id=''):
        raw_rec = EkbRawRecord.objects.filter(
            batch__batch_no=batch_no, ekb_id=expense.ekuaibao_id
        ).first()
        if not raw_rec:
            continue

        logs = raw_rec.raw_data.get('logs', []) or []
        chain = []
        for log_entry in logs:
            if not isinstance(log_entry, dict):
                continue
            action = log_entry.get('action', '')
            ts = log_entry.get('time', 0)
            time_str = ''
            if ts:
                try:
                    time_str = datetime.fromtimestamp(int(ts) / 1000).strftime('%Y-%m-%d %H:%M')
                except Exception:
                    pass
            chain.append({
                'action': action,
                'node_name': log_entry.get('nodeName', ''),
                'operator_id': log_entry.get('operatorId', ''),
                'operator_name': log_entry.get('operatorName', ''),
                'time': time_str,
            })

        if chain:
            expense.approval_chain = chain
            expense.save(update_fields=['approval_chain'])
            stats['expenses_approval_updated'] += 1

    logger.info('Step 3 完成: %s', stats)
    return stats


# ============================================================================
# Step 4: 报销→预算关联链（expenseLink 持久化）
# ============================================================================

def build_expense_budget_links(batch_no: str = '20260318_144803') -> dict:
    """
    将易快报 userProps.expenseLink.code (S 开头的预算申请单号)
    持久化到 ExpenseRequest.linked_budget_no，
    并尝试关联到 ExpenseRequest.budget_item（通过 ProjectBudget）。
    """
    from apps.ekuaibao_integration.models import EkbRawRecord
    from apps.finance.models_expense import ExpenseRequest
    from apps.finance.models import ProjectBudget

    stats = {
        'linked_budget_no_set': 0,
        'budget_item_linked': 0,
        'cost_dept_set': 0,
        'template_set': 0,
        'client_set': 0,
        'submitter_id_set': 0,
    }

    for expense in ExpenseRequest.objects.filter(import_source='ekuaibao').exclude(ekuaibao_id=''):
        raw_rec = EkbRawRecord.objects.filter(
            batch__batch_no=batch_no, ekb_id=expense.ekuaibao_id
        ).first()
        if not raw_rec:
            continue

        d = raw_rec.raw_data
        up = d.get('userProps', {}) or {}
        update_fields = []

        # expenseLink → linked_budget_no
        expense_link = up.get('expenseLink', {})
        if isinstance(expense_link, dict):
            link_code = expense_link.get('code', '') or up.get('u_申请单号', '')
        else:
            link_code = up.get('u_申请单号', '')

        if link_code and not expense.linked_budget_no:
            expense.linked_budget_no = link_code
            update_fields.append('linked_budget_no')
            stats['linked_budget_no_set'] += 1

        # 费用承担部门
        cost_dept = up.get('expenseDepartment', {})
        if isinstance(cost_dept, dict) and cost_dept.get('name') and not expense.cost_department:
            expense.cost_department = cost_dept['name']
            update_fields.append('cost_department')
            stats['cost_dept_set'] += 1

        # 单据模板
        spec = up.get('specificationId', {})
        if isinstance(spec, dict) and spec.get('name') and not expense.expense_template:
            expense.expense_template = spec['name']
            update_fields.append('expense_template')
            stats['template_set'] += 1

        # 客户名称（冗余字段便于展示）
        if not expense.client_name:
            client_name = up.get('u_客户名称', '')
            if not client_name:
                proj_archive = up.get('u_项目档案', {})
                if isinstance(proj_archive, dict):
                    client_name = proj_archive.get('name', '')
            if client_name:
                expense.client_name = client_name
                update_fields.append('client_name')
                stats['client_set'] += 1

        # 提交人易快报ID
        submitter = up.get('submitterId', {})
        if isinstance(submitter, dict) and submitter.get('id') and not expense.ekuaibao_submitter_id:
            expense.ekuaibao_submitter_id = submitter['id']
            update_fields.append('ekuaibao_submitter_id')
            stats['submitter_id_set'] += 1

        if update_fields:
            expense.save(update_fields=update_fields)

    # 尝试将 linked_budget_no 关联到 ProjectBudget.budget_no
    for expense in ExpenseRequest.objects.filter(
        import_source='ekuaibao'
    ).exclude(linked_budget_no=''):
        if expense.budget_item_id:
            continue
        budget = ProjectBudget.objects.filter(
            budget_no=expense.linked_budget_no, import_source='ekuaibao'
        ).first()
        if budget:
            # 找 budget 下的第一个 BudgetItem
            from apps.finance.models import BudgetItem
            budget_item = BudgetItem.objects.filter(budget=budget).first()
            if budget_item:
                expense.budget_item = budget_item
                expense.save(update_fields=['budget_item'])
                stats['budget_item_linked'] += 1

    logger.info('Step 4 完成: %s', stats)
    return stats


# ============================================================================
# Step 5: 知识图谱实体和关系入库
# ============================================================================

def build_knowledge_graph() -> dict:
    """
    将所有业务实体（人员、客户、项目、单据）和关系
    注入 KnowledgeEntity / KnowledgeRelation。
    """
    from apps.knowledge.models import KnowledgeEntity, KnowledgeRelation

    stats = {
        'entities_created': 0,
        'relations_created': 0,
    }

    def _upsert_entity(uri: str, label: str, entity_type: str,
                       description: str = '', properties: dict = None) -> Any:
        entity, created = KnowledgeEntity.objects.update_or_create(
            uri=uri,
            defaults={
                'label': label,
                'entity_type': entity_type,
                'namespace': 'cnkis',
                'definition': description,
                'properties': properties or {},
                'is_deleted': False,
            }
        )
        if created:
            stats['entities_created'] += 1
        return entity

    def _upsert_relation(subject: Any, obj: Any, rel_type: str,
                         predicate_uri: str = '') -> Any:
        # KnowledgeRelation 只接受 RelationType choices，自定义关系统一用 custom
        from apps.knowledge.models import RelationType
        allowed = {c[0] for c in RelationType.choices}
        actual_type = rel_type if rel_type in allowed else 'custom'
        actual_predicate = predicate_uri or f'cnkis:{rel_type}'
        rel, created = KnowledgeRelation.objects.get_or_create(
            subject=subject,
            object=obj,
            predicate_uri=actual_predicate,
            is_deleted=False,
            defaults={
                'relation_type': actual_type,
                'source': 'ekuaibao_import',
                'confidence': 1.0,
            },
        )
        if created:
            stats['relations_created'] += 1
        return rel

    # ── 客户实体 ──
    from apps.crm.models import Client
    client_entities: Dict[int, Any] = {}
    for client in Client.objects.all():
        e = _upsert_entity(
            uri=f'cnkis:client:{client.id}',
            label=client.name,
            entity_type='client',
            description=f"客户：{client.name}",
            properties={'system_id': client.id, 'short_name': client.short_name},
        )
        client_entities[client.id] = e

    # ── 项目实体 ──
    from apps.protocol.models import Protocol
    project_entities: Dict[int, Any] = {}
    for protocol in Protocol.objects.filter(is_deleted=False):
        e = _upsert_entity(
            uri=f'cnkis:project:{protocol.code}',
            label=f'{protocol.code} {protocol.title}',
            entity_type='project',
            description=f"项目：{protocol.code} — {protocol.title}",
            properties={
                'system_id': protocol.id,
                'code': protocol.code,
                'status': protocol.status,
            },
        )
        project_entities[protocol.id] = e
        # 客户→项目 sponsors 关系
        if protocol.sponsor_id and protocol.sponsor_id in client_entities:
            _upsert_relation(
                client_entities[protocol.sponsor_id], e, 'sponsors',
                'cnkis:sponsors',
            )

    # ── 人员实体 + 人员→部门 belongs_to_dept 关系 ──
    from apps.identity.models import Account
    from apps.knowledge.models import KnowledgeEntity as KE
    person_entities: Dict[str, Any] = {}
    for account in Account.objects.filter(is_deleted=False).exclude(ekuaibao_staff_id=''):
        e = _upsert_entity(
            uri=f'cnkis:person:{account.ekuaibao_staff_id}',
            label=account.display_name,
            entity_type='person',
            description=f"人员：{account.display_name}（账号：{account.username}）",
            properties={
                'system_account_id': account.id,
                'ekuaibao_staff_id': account.ekuaibao_staff_id,
                'ekuaibao_username': account.ekuaibao_username,
                'status': account.status,
            },
        )
        person_entities[account.ekuaibao_staff_id] = e

        # 人员→部门 关系
        dept_uri = None
        from apps.hr.models import Staff
        staff_obj = Staff.objects.filter(account_fk=account, is_deleted=False).first()
        if staff_obj and staff_obj.department:
            dept_entity = KE.objects.filter(
                label=staff_obj.department, entity_type='concept'
            ).first()
            if dept_entity:
                _upsert_relation(e, dept_entity, 'belongs_to_dept')

    # ── 人员角色关系 has_role ──
    from apps.identity.models import AccountRole
    approval_role_entities: Dict[str, Any] = {}
    for node_name, (rname, rdisp, rcat, rlvl) in NODE_TO_ROLE.items():
        role_e = _upsert_entity(
            uri=f'cnkis:approval_role:{rname}',
            label=rdisp,
            entity_type='role',
            description=f"审批角色：{rdisp}（对应易快报节点：{node_name}）",
            properties={'node_names': [k for k, v in NODE_TO_ROLE.items() if v[0] == rname]},
        )
        approval_role_entities[rname] = role_e

    for ar in AccountRole.objects.select_related('account', 'role').all():
        if ar.account.ekuaibao_staff_id and ar.role.name in approval_role_entities:
            person_e = person_entities.get(ar.account.ekuaibao_staff_id)
            role_e = approval_role_entities.get(ar.role.name)
            if person_e and role_e:
                _upsert_relation(person_e, role_e, 'has_role', 'cnkis:has_role')

    # ── 预算单实体 ──
    from apps.finance.models import ProjectBudget
    budget_entities: Dict[str, Any] = {}
    for budget in ProjectBudget.objects.filter(import_source='ekuaibao'):
        e = _upsert_entity(
            uri=f'cnkis:budget:{budget.budget_no}',
            label=f'{budget.budget_no} {budget.budget_name}',
            entity_type='instance',
            description=(
                f"预算申请：{budget.budget_no}\n"
                f"客户：{budget.client_name}\n"
                f"项目：{budget.project_name}\n"
                f"金额：¥{budget.total_expense:,.2f}"
            ),
            properties={
                'system_id': budget.id,
                'budget_no': budget.budget_no,
                'client_name': budget.client_name,
                'total_expense': float(budget.total_expense),
                'status': budget.status,
            },
        )
        budget_entities[budget.budget_no] = e
        # 预算→项目 budgets_for 关系
        if budget.protocol_id and budget.protocol_id in project_entities:
            _upsert_relation(e, project_entities[budget.protocol_id], 'budgets_for')

    # ── 报销单实体 ──
    from apps.finance.models_expense import ExpenseRequest
    for expense in ExpenseRequest.objects.filter(import_source='ekuaibao'):
        e = _upsert_entity(
            uri=f'cnkis:expense:{expense.ekuaibao_no or expense.request_no}',
            label=f'{expense.request_no} {expense.description[:30]}',
            entity_type='instance',
            description=(
                f"报销单：{expense.request_no}\n"
                f"申请人：{expense.applicant_name}\n"
                f"客户：{expense.client_name}\n"
                f"部门：{expense.cost_department}\n"
                f"金额：¥{expense.amount:,.2f}\n"
                f"状态：{expense.approval_status}\n"
                f"模板：{expense.expense_template}"
            ),
            properties={
                'system_id': expense.id,
                'request_no': expense.request_no,
                'amount': float(expense.amount),
                'approval_status': expense.approval_status,
                'applicant_name': expense.applicant_name,
                'client_name': expense.client_name,
                'cost_department': expense.cost_department,
                'expense_template': expense.expense_template,
            },
        )

        # 报销→申请人 submitted_by
        if expense.ekuaibao_submitter_id and expense.ekuaibao_submitter_id in person_entities:
            _upsert_relation(e, person_entities[expense.ekuaibao_submitter_id], 'submitted_by')

        # 报销→项目 expense_of_project
        if expense.protocol_id and expense.protocol_id in project_entities:
            _upsert_relation(e, project_entities[expense.protocol_id], 'expense_of_project')

        # 报销→预算 expense_of_budget
        if expense.linked_budget_no and expense.linked_budget_no in budget_entities:
            _upsert_relation(e, budget_entities[expense.linked_budget_no], 'expense_of_budget')

        # 报销→费用部门 cost_center
        if expense.cost_department:
            dept_entity = _find_dept_entity(expense.cost_department)
            if dept_entity:
                _upsert_relation(e, dept_entity, 'cost_center')

    logger.info('Step 5 完成: %s', stats)
    return stats


def _find_dept_entity(dept_name: str):
    """按部门名称查找 KnowledgeEntity"""
    from apps.knowledge.models import KnowledgeEntity
    return KnowledgeEntity.objects.filter(
        label=dept_name, entity_type='concept'
    ).first()


# ============================================================================
# Step 6: 向量化 — 业务上下文入 KnowledgeEntry
# ============================================================================

def build_knowledge_entries() -> dict:
    """
    为每个重要业务实体创建 KnowledgeEntry，
    触发 ingestion_pipeline 自动向量化。
    """
    from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
    from apps.knowledge.models import KnowledgeEntity

    stats = {'entries_created': 0, 'entries_skipped': 0}

    # 为每个项目-客户-费用关系创建一条综合描述 KnowledgeEntry
    from apps.protocol.models import Protocol
    from apps.finance.models_expense import ExpenseRequest
    from apps.finance.models import ProjectBudget
    from django.db.models import Sum, Count

    for protocol in Protocol.objects.filter(is_deleted=False):
        expenses = ExpenseRequest.objects.filter(
            protocol_id=protocol.id, import_source='ekuaibao'
        )
        budgets = ProjectBudget.objects.filter(
            protocol_id=protocol.id, import_source='ekuaibao'
        )
        if not expenses.exists() and not budgets.exists():
            continue

        total_expense = expenses.aggregate(Sum('amount'))['amount__sum'] or 0
        budget_total = budgets.aggregate(Sum('total_expense'))['total_expense__sum'] or 0
        approvers = set()
        for exp in expenses:
            for step in (exp.approval_chain or []):
                if step.get('operator_name') and 'agree' in step.get('action', ''):
                    approvers.add(step['operator_name'])

        content = (
            f"项目：{protocol.code} — {protocol.title}\n"
            f"客户：{protocol.sponsor_id}\n"
            f"预算总计：¥{budget_total:,.2f}\n"
            f"实际费用：¥{total_expense:,.2f}\n"
            f"预算执行率：{(total_expense/budget_total*100) if budget_total else 0:.1f}%\n"
            f"报销单数量：{expenses.count()} 张\n"
            f"涉及审批人：{', '.join(approvers)}\n"
        )

        result = run_pipeline(RawKnowledgeInput(
            title=f'项目费用概览：{protocol.code} {protocol.title}',
            content=content,
            entry_type='lesson_learned',
            source_type='ekuaibao_project_summary',
            source_key=f'ekb:project_summary:{protocol.code}',
            tags=['易快报', '项目费用', protocol.code, '费用汇总'],
            namespace='ekuaibao_import',
            properties={'protocol_id': protocol.id, 'protocol_code': protocol.code},
        ))
        if result.success:
            stats['entries_created'] += 1
        else:
            stats['entries_skipped'] += 1

    # 为每个客户创建汇总
    from apps.crm.models import Client
    for client in Client.objects.all():
        protocols = Protocol.objects.filter(sponsor_id=client.id, is_deleted=False)
        if not protocols.exists():
            continue
        project_codes = list(protocols.values_list('code', flat=True))
        total_exp = ExpenseRequest.objects.filter(
            protocol_id__in=protocols.values_list('id', flat=True),
            import_source='ekuaibao',
        ).aggregate(Sum('amount'))['amount__sum'] or 0

        content = (
            f"客户：{client.name}\n"
            f"关联项目数：{protocols.count()} 个\n"
            f"项目编号：{', '.join(project_codes[:10])}\n"
            f"累计费用：¥{total_exp:,.2f}\n"
        )
        result = run_pipeline(RawKnowledgeInput(
            title=f'客户费用概览：{client.name}',
            content=content,
            entry_type='lesson_learned',
            source_type='ekuaibao_client_summary',
            source_key=f'ekb:client_summary:{client.id}',
            tags=['易快报', '客户费用', client.name],
            namespace='ekuaibao_import',
            properties={'client_id': client.id, 'client_name': client.name},
        ))
        if result.success:
            stats['entries_created'] += 1
        else:
            stats['entries_skipped'] += 1

    logger.info('Step 6 完成: %s', stats)
    return stats


# ============================================================================
# 主入口
# ============================================================================

def rebuild_all(batch_no_phase1: str = '20260318_133425',
                batch_no_phase2: str = '20260318_144803') -> dict:
    """全量重建所有业务关系"""
    total = {}

    logger.info('=== 开始易快报业务关系完整重建 ===')

    logger.info('[Step 1] 人员实体化...')
    total['step1'] = build_staff_accounts(batch_no_phase2)

    logger.info('[Step 2] 部门层级树...')
    total['step2'] = build_department_tree(batch_no_phase1)

    logger.info('[Step 3] 审批流程...')
    total['step3'] = build_approval_chains(batch_no_phase2)

    logger.info('[Step 4] 报销→预算关联...')
    total['step4'] = build_expense_budget_links(batch_no_phase2)

    logger.info('[Step 5] 知识图谱实体和关系...')
    total['step5'] = build_knowledge_graph()

    logger.info('[Step 6] 向量化...')
    total['step6'] = build_knowledge_entries()

    logger.info('=== 全量重建完成 ===')
    return total
