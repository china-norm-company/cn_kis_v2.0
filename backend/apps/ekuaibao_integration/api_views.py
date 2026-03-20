"""
易快报跨工作台聚合 API

提供以下聚合视图：
  GET /ekuaibao/views/by-client         — 按客户汇总（进思·客户台）
  GET /ekuaibao/views/by-project        — 按项目汇总（采苓·研究台 / 维周·执行台）
  GET /ekuaibao/views/by-department     — 按部门汇总（时雨·人事台 / 管仲·财务台）
  GET /ekuaibao/views/by-person         — 按人员汇总（时雨·人事台）
  GET /ekuaibao/views/expense-detail/{no} — 单据完整详情（含审批链）
  GET /ekuaibao/views/org-tree          — 组织架构树
  GET /ekuaibao/views/approval-flows    — 审批流模板列表
  GET /ekuaibao/views/knowledge-graph   — 知识图谱实体和关系
"""
import logging
from typing import Optional

from django.db.models import Sum, Count, Q
from django.http import HttpRequest
from ninja import Router

logger = logging.getLogger('cn_kis.ekuaibao.views_api')

router = Router(tags=['易快报业务视图'])


# ============================================================================
# 按客户汇总（进思·客户台）
# ============================================================================

@router.get('/views/by-client', summary='按客户汇总费用（进思·客户台）')
def view_by_client(request: HttpRequest, client_name: Optional[str] = None):
    """
    返回每个客户的：
    - 关联项目数、报销单数、总费用、已报销/审批中/驳回
    - 关联的项目列表（按金额排序）
    """
    from apps.crm.models import Client
    from apps.protocol.models import Protocol
    from apps.finance.models_expense import ExpenseRequest

    result = []
    clients_qs = Client.objects.all()
    if client_name:
        clients_qs = clients_qs.filter(name__icontains=client_name)

    for client in clients_qs:
        protocols = Protocol.objects.filter(sponsor_id=client.id, is_deleted=False)
        if not protocols.exists():
            continue

        protocol_ids = list(protocols.values_list('id', flat=True))
        expenses = ExpenseRequest.objects.filter(
            protocol_id__in=protocol_ids, import_source='ekuaibao'
        )

        total_amount = expenses.aggregate(Sum('amount'))['amount__sum'] or 0
        by_status = {
            row['approval_status']: row['cnt']
            for row in expenses.values('approval_status').annotate(cnt=Count('id'))
        }

        projects_summary = []
        for proto in protocols:
            proto_expenses = expenses.filter(protocol_id=proto.id)
            proto_total = proto_expenses.aggregate(Sum('amount'))['amount__sum'] or 0
            projects_summary.append({
                'code': proto.code,
                'title': proto.title,
                'expense_count': proto_expenses.count(),
                'total_amount': float(proto_total),
            })
        projects_summary.sort(key=lambda x: -x['total_amount'])

        result.append({
            'client_id': client.id,
            'client_name': client.name,
            'project_count': protocols.count(),
            'expense_count': expenses.count(),
            'total_amount': float(total_amount),
            'by_status': by_status,
            'projects': projects_summary[:10],
        })

    result.sort(key=lambda x: -x['total_amount'])
    return {'code': 0, 'msg': 'ok', 'data': result}


# ============================================================================
# 按项目汇总（采苓·研究台 / 维周·执行台）
# ============================================================================

@router.get('/views/by-project', summary='按项目汇总费用（采苓·研究台/维周·执行台）')
def view_by_project(
    request: HttpRequest,
    project_code: Optional[str] = None,
    client_name: Optional[str] = None,
):
    """
    返回每个项目的：
    - 预算申请总额、实际费用总额、执行率
    - 飞书财务信号统计（报价/合同/发票/礼金次数）
    - 审批中/已驳回的单据数
    """
    from apps.protocol.models import Protocol
    from apps.finance.models_expense import ExpenseRequest
    from apps.finance.models import ProjectBudget
    from django.db import connection

    qs = Protocol.objects.filter(is_deleted=False)
    if project_code:
        qs = qs.filter(code__icontains=project_code)
    if client_name:
        from apps.crm.models import Client
        matched_clients = Client.objects.filter(name__icontains=client_name)
        qs = qs.filter(sponsor_id__in=matched_clients.values_list('id', flat=True))

    # 预先查询飞书财务信号（批量，避免 N+1）
    feishu_signal_map = {}
    try:
        proto_codes = list(qs.values_list('code', flat=True))
        if proto_codes:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        pc,
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE signal_types ? 'quote') as quotes,
                        COUNT(*) FILTER (WHERE signal_types ? 'contract') as contracts,
                        COUNT(*) FILTER (WHERE signal_types ? 'invoice') as invoices,
                        COUNT(*) FILTER (WHERE signal_types ? 'stipend') as stipends,
                        COUNT(*) FILTER (WHERE signal_types ? 'budget') as budgets,
                        COUNT(DISTINCT user_id) as people
                    FROM t_financial_signal_cache,
                    LATERAL jsonb_array_elements_text(project_codes) as pc
                    WHERE pc = ANY(%s)
                    GROUP BY pc
                """, [proto_codes])
                for row in cursor.fetchall():
                    feishu_signal_map[row[0]] = {
                        'feishu_total': row[1], 'feishu_quotes': row[2],
                        'feishu_contracts': row[3], 'feishu_invoices': row[4],
                        'feishu_stipends': row[5], 'feishu_budgets': row[6],
                        'feishu_people': row[7],
                    }
    except Exception:
        pass  # 信号表可能不存在，静默忽略

    result = []
    for proto in qs:
        expenses = ExpenseRequest.objects.filter(
            protocol_id=proto.id, import_source='ekuaibao'
        )
        if not expenses.exists():
            continue

        budgets = ProjectBudget.objects.filter(
            protocol_id=proto.id, import_source='ekuaibao'
        )
        budget_total = budgets.aggregate(Sum('total_expense'))['total_expense__sum'] or 0
        expense_total = expenses.aggregate(Sum('amount'))['amount__sum'] or 0
        execution_rate = float(expense_total) / float(budget_total) * 100 if budget_total else 0

        by_dept = {
            row['cost_department']: float(row['total'])
            for row in expenses.values('cost_department').annotate(total=Sum('amount'))
            if row['cost_department']
        }

        by_template = {
            row['expense_template']: row['cnt']
            for row in expenses.values('expense_template').annotate(cnt=Count('id'))
            if row['expense_template']
        }

        # 获取客户名
        client_name_val = ''
        if proto.sponsor_id:
            from apps.crm.models import Client
            c = Client.objects.filter(id=proto.sponsor_id).first()
            if c:
                client_name_val = c.name

        result.append({
            'protocol_id': proto.id,
            'code': proto.code,
            'title': proto.title,
            'client_name': client_name_val,
            'budget_total': float(budget_total),
            'expense_total': float(expense_total),
            'execution_rate': round(execution_rate, 1),
            'expense_count': expenses.count(),
            'by_department': by_dept,
            'by_template': by_template,
            'pending_count': expenses.filter(
                approval_status__in=['submitted', 'approved']
            ).count(),
            'rejected_count': expenses.filter(approval_status='rejected').count(),
            # 飞书财务信号（项目历史沟通）
            **feishu_signal_map.get(proto.code, {
                'feishu_total': 0, 'feishu_quotes': 0, 'feishu_contracts': 0,
                'feishu_invoices': 0, 'feishu_stipends': 0, 'feishu_budgets': 0,
                'feishu_people': 0,
            }),
        })

    result.sort(key=lambda x: -x['expense_total'])
    return {'code': 0, 'msg': 'ok', 'data': result}


# ============================================================================
# 按部门汇总（时雨·人事台 / 管仲·财务台）
# ============================================================================

@router.get('/views/by-department', summary='按费用承担部门汇总（管仲·财务台/时雨·人事台）')
def view_by_department(request: HttpRequest, dept_name: Optional[str] = None):
    from apps.finance.models_expense import ExpenseRequest

    qs = ExpenseRequest.objects.filter(import_source='ekuaibao').exclude(cost_department='')
    if dept_name:
        qs = qs.filter(cost_department__icontains=dept_name)

    dept_stats = {}
    for exp in qs:
        dept = exp.cost_department
        if dept not in dept_stats:
            dept_stats[dept] = {
                'department': dept,
                'expense_count': 0,
                'total_amount': 0.0,
                'reimbursed': 0.0,
                'in_progress': 0.0,
                'rejected': 0.0,
                'applicants': set(),
            }
        dept_stats[dept]['expense_count'] += 1
        dept_stats[dept]['total_amount'] += float(exp.amount)
        if exp.approval_status == 'reimbursed':
            dept_stats[dept]['reimbursed'] += float(exp.amount)
        elif exp.approval_status in ('submitted', 'approved'):
            dept_stats[dept]['in_progress'] += float(exp.amount)
        elif exp.approval_status == 'rejected':
            dept_stats[dept]['rejected'] += float(exp.amount)
        if exp.applicant_name:
            dept_stats[dept]['applicants'].add(exp.applicant_name)

    result = []
    for dept, stats in sorted(dept_stats.items(), key=lambda x: -x[1]['total_amount']):
        stats['applicant_count'] = len(stats.pop('applicants'))
        result.append(stats)

    return {'code': 0, 'msg': 'ok', 'data': result}


# ============================================================================
# 按人员汇总（时雨·人事台）
# ============================================================================

@router.get('/views/by-person', summary='按申请人汇总费用（时雨·人事台）')
def view_by_person(request: HttpRequest, person_name: Optional[str] = None):
    from apps.finance.models_expense import ExpenseRequest

    qs = ExpenseRequest.objects.filter(import_source='ekuaibao').exclude(applicant_name='')
    if person_name:
        qs = qs.filter(applicant_name__icontains=person_name)

    person_stats = {}
    for exp in qs:
        name = exp.applicant_name
        if name not in person_stats:
            person_stats[name] = {
                'name': name,
                'ekuaibao_submitter_id': exp.ekuaibao_submitter_id,
                'expense_count': 0,
                'total_amount': 0.0,
                'departments': set(),
                'clients': set(),
                'approval_chain_steps': [],
            }
        person_stats[name]['expense_count'] += 1
        person_stats[name]['total_amount'] += float(exp.amount)
        if exp.cost_department:
            person_stats[name]['departments'].add(exp.cost_department)
        if exp.client_name:
            person_stats[name]['clients'].add(exp.client_name)

    result = []
    for name, stats in sorted(person_stats.items(), key=lambda x: -x[1]['total_amount']):
        stats['departments'] = list(stats['departments'])
        stats['clients'] = list(stats['clients'])
        # 关联 Account
        from apps.identity.models import Account
        account = Account.objects.filter(
            display_name=name, is_deleted=False
        ).first()
        stats['account_id'] = account.id if account else None
        stats['ekuaibao_staff_id'] = account.ekuaibao_staff_id if account else ''
        result.append(stats)

    return {'code': 0, 'msg': 'ok', 'data': result}


# ============================================================================
# 单据完整详情（含审批链）
# ============================================================================

@router.get('/views/expense-detail/{request_no}', summary='单据完整详情含审批链')
def view_expense_detail(request: HttpRequest, request_no: str):
    from apps.finance.models_expense import ExpenseRequest
    from apps.protocol.models import Protocol
    from apps.crm.models import Client

    expense = ExpenseRequest.objects.filter(
        Q(request_no=request_no) | Q(ekuaibao_no=request_no)
    ).first()
    if not expense:
        return {'code': 404, 'msg': '单据不存在', 'data': None}

    # 获取协议/项目信息
    protocol_info = None
    if expense.protocol_id:
        proto = Protocol.objects.filter(id=expense.protocol_id).first()
        if proto:
            client_name = ''
            if proto.sponsor_id:
                c = Client.objects.filter(id=proto.sponsor_id).first()
                client_name = c.name if c else ''
            protocol_info = {
                'id': proto.id, 'code': proto.code,
                'title': proto.title, 'client_name': client_name,
            }

    # 获取关联预算
    budget_info = None
    if expense.linked_budget_no:
        from apps.finance.models import ProjectBudget
        budget = ProjectBudget.objects.filter(budget_no=expense.linked_budget_no).first()
        if budget:
            budget_info = {
                'budget_no': budget.budget_no,
                'budget_name': budget.budget_name,
                'total_expense': float(budget.total_expense),
                'client_name': budget.client_name,
            }

    # 获取提交人 Account 信息
    submitter_info = None
    if expense.ekuaibao_submitter_id:
        from apps.identity.models import Account
        acc = Account.objects.filter(
            ekuaibao_staff_id=expense.ekuaibao_submitter_id
        ).first()
        if acc:
            submitter_info = {
                'account_id': acc.id,
                'display_name': acc.display_name,
                'username': acc.username,
            }

    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'id': expense.id,
            'request_no': expense.request_no,
            'ekuaibao_no': expense.ekuaibao_no,
            'applicant_name': expense.applicant_name,
            'expense_type': expense.expense_type,
            'expense_template': expense.expense_template,
            'amount': str(expense.amount),
            'approval_status': expense.approval_status,
            'description': expense.description,
            'notes': expense.notes,
            'cost_department': expense.cost_department,
            'client_name': expense.client_name,
            'protocol': protocol_info,
            'budget': budget_info,
            'submitter': submitter_info,
            'approval_chain': expense.approval_chain or [],
            'import_source': expense.import_source,
            'import_batch_id': expense.import_batch_id,
        },
    }


# ============================================================================
# 组织架构树（时雨·人事台 / 管仲·财务台）
# ============================================================================

@router.get('/views/org-tree', summary='组织架构树')
def view_org_tree(request: HttpRequest):
    from apps.knowledge.models import KnowledgeEntity

    # 获取所有部门实体
    dept_entities = list(KnowledgeEntity.objects.filter(
        entity_type='concept',
        namespace='cnkis',
        uri__startswith='cnkis:dept:',
        is_deleted=False,
    ).values('id', 'label', 'parent_id', 'definition', 'properties'))

    # 构建树形
    nodes_by_id = {n['id']: n for n in dept_entities}
    for n in dept_entities:
        n['children'] = []
    roots = []
    for n in dept_entities:
        pid = n.get('parent_id')
        if pid and pid in nodes_by_id:
            nodes_by_id[pid]['children'].append(n)
        else:
            roots.append(n)

    return {'code': 0, 'msg': 'ok', 'data': roots}


# ============================================================================
# 审批流模板（管仲·财务台）
# ============================================================================

@router.get('/views/approval-flows', summary='审批流模板列表')
def view_approval_flows(request: HttpRequest):
    from apps.knowledge.models import KnowledgeEntity

    flows = list(KnowledgeEntity.objects.filter(
        entity_type='concept',
        namespace='cnkis',
        uri__startswith='cnkis:approval_flow:',
        is_deleted=False,
    ).values('id', 'label', 'definition', 'properties'))

    return {'code': 0, 'msg': 'ok', 'data': flows}


# ============================================================================
# 知识图谱查询（中书·智能台）
# ============================================================================

@router.get('/views/knowledge-graph', summary='知识图谱实体和关系（中书·智能台）')
def view_knowledge_graph(
    request: HttpRequest,
    entity_type: Optional[str] = None,
    label_contains: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    from apps.knowledge.models import KnowledgeEntity, KnowledgeRelation

    qs = KnowledgeEntity.objects.filter(namespace='cnkis', is_deleted=False)
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    if label_contains:
        qs = qs.filter(label__icontains=label_contains)

    total = qs.count()
    offset = (page - 1) * page_size
    entities = list(qs[offset:offset + page_size].values(
        'id', 'uri', 'label', 'entity_type', 'definition', 'properties'
    ))

    # 获取这些实体的关系
    entity_ids = [e['id'] for e in entities]
    relations = list(KnowledgeRelation.objects.filter(
        subject_id__in=entity_ids,
        is_deleted=False,
    ).values(
        'id', 'subject_id', 'object_id', 'relation_type',
        'predicate_uri', 'confidence',
    )[:200])

    return {
        'code': 0, 'msg': 'ok',
        'data': {
            'total_entities': total,
            'entities': entities,
            'relations': relations,
        }
    }


# ============================================================================
# 财务知识图谱专项 API
# ============================================================================

@router.get('/views/financial-signals', summary='项目财务信号统计（来自飞书历史沟通）')
def view_financial_signals(
    request: HttpRequest,
    project_code: Optional[str] = None,
    signal_type: Optional[str] = None,
    min_mentions: int = 3,
    page: int = 1,
    page_size: int = 50,
):
    """
    从飞书邮件/IM/审批/文档中抽取的财务信号汇总。
    用于：报价历史、合同跟踪、发票催收、礼金核算、预算分析。
    
    signal_type: quote / contract / invoice / payment / stipend / budget / purchase_order
    """
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            where_clauses = ["pc ~ '^[MCWARO][0-9]{2}[0-9A-Z]{3,8}$'"]
            params = []

            if project_code:
                where_clauses.append("pc ILIKE %s")
                params.append(f'%{project_code}%')
            if signal_type:
                where_clauses.append("signal_types ? %s")
                params.append(signal_type)

            where_sql = ' AND '.join(where_clauses)

            cursor.execute(f"""
                SELECT 
                    pc as project_code,
                    COUNT(*) as total_mentions,
                    COUNT(*) FILTER (WHERE signal_types ? 'quote') as quotes,
                    COUNT(*) FILTER (WHERE signal_types ? 'contract') as contracts,
                    COUNT(*) FILTER (WHERE signal_types ? 'invoice') as invoices,
                    COUNT(*) FILTER (WHERE signal_types ? 'payment') as payments,
                    COUNT(*) FILTER (WHERE signal_types ? 'stipend') as stipends,
                    COUNT(*) FILTER (WHERE signal_types ? 'budget') as budgets,
                    array_agg(DISTINCT client) FILTER (WHERE client IS NOT NULL AND client != '') as clients,
                    array_agg(DISTINCT source_type) as source_types,
                    COUNT(DISTINCT user_id) as people_count
                FROM t_financial_signal_cache,
                LATERAL jsonb_array_elements_text(project_codes) as pc
                WHERE {where_sql}
                GROUP BY pc
                HAVING COUNT(*) >= %s
                ORDER BY COUNT(*) DESC
                LIMIT %s OFFSET %s
            """, params + [min_mentions, page_size, (page - 1) * page_size])

            rows = cursor.fetchall()

        # 查系统中对应的协议信息
        from apps.protocol.models import Protocol
        proto_map = {
            p.code: {'title': p.title, 'id': p.id}
            for p in Protocol.objects.filter(
                code__in=[r[0] for r in rows], is_deleted=False
            )
        }

        result = []
        for row in rows:
            code = row[0]
            proto_info = proto_map.get(code, {})
            result.append({
                'project_code': code,
                'project_title': proto_info.get('title', ''),
                'protocol_id': proto_info.get('id'),
                'total_mentions': row[1],
                'by_signal': {
                    'quote': row[2], 'contract': row[3], 'invoice': row[4],
                    'payment': row[5], 'stipend': row[6], 'budget': row[7],
                },
                'clients': [c for c in (row[8] or []) if c],
                'source_types': row[9] or [],
                'people_count': row[10],
            })

        return {'code': 0, 'msg': 'ok', 'data': {'items': result, 'page': page}}

    except Exception as ex:
        logger.warning('financial_signals API 失败（信号表可能未就绪）: %s', ex)
        return {'code': 0, 'msg': 'ok', 'data': {'items': [], 'note': '财务信号数据正在构建中'}}


@router.get('/views/financial-signals/stipend-summary', summary='受试者礼金信号汇总')
def view_stipend_summary(request: HttpRequest, project_code: Optional[str] = None):
    """
    从飞书数据中提取受试者礼金相关信号，
    用于礼金结算管理和历史数据参考。
    """
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            where_extra = "AND pc = %s" if project_code else ""
            params = []
            if project_code:
                params.append(project_code)

            cursor.execute(f"""
                SELECT 
                    pc,
                    COUNT(*) as stipend_mentions,
                    array_agg(DISTINCT source_type) as sources,
                    COUNT(DISTINCT user_id) as people_count
                FROM t_financial_signal_cache,
                LATERAL jsonb_array_elements_text(project_codes) as pc
                WHERE signal_types ? 'stipend' {where_extra}
                GROUP BY pc
                ORDER BY COUNT(*) DESC
                LIMIT 100
            """, params)

            rows = cursor.fetchall()

        from apps.protocol.models import Protocol
        proto_map = {p.code: p.title for p in Protocol.objects.filter(
            code__in=[r[0] for r in rows], is_deleted=False
        )}

        result = []
        for row in rows:
            code, mentions, sources, people = row
            result.append({
                'project_code': code,
                'project_title': proto_map.get(code, ''),
                'stipend_mentions': mentions,
                'sources': sources or [],
                'people_count': people,
            })

        return {'code': 0, 'msg': 'ok', 'data': result}

    except Exception as ex:
        logger.warning('stipend_summary API 失败: %s', ex)
        return {'code': 0, 'msg': 'ok', 'data': [], 'note': '数据正在构建中'}


@router.get('/views/financial-signals/cost-structure', summary='项目费用科目结构分析')
def view_cost_structure(request: HttpRequest, project_code: Optional[str] = None):
    """
    从飞书数据中分析项目的费用科目构成，
    为报价和预算编制提供历史参考。
    """
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            where_extra = "AND pc = %s" if project_code else ""
            params = []
            if project_code:
                params.append(project_code)

            cursor.execute(f"""
                SELECT 
                    ci as cost_item,
                    COUNT(DISTINCT pc) as project_count,
                    COUNT(*) as total_mentions,
                    array_agg(DISTINCT pc) FILTER (WHERE pc IS NOT NULL) as sample_projects
                FROM t_financial_signal_cache,
                LATERAL jsonb_array_elements_text(cost_items) as ci,
                LATERAL jsonb_array_elements_text(project_codes) as pc
                WHERE ci != '' {where_extra}
                GROUP BY ci
                ORDER BY total_mentions DESC
                LIMIT 30
            """, params)

            rows = cursor.fetchall()

        result = [
            {
                'cost_item': row[0],
                'project_count': row[1],
                'total_mentions': row[2],
                'sample_projects': (row[3] or [])[:5],
            }
            for row in rows
        ]

        return {'code': 0, 'msg': 'ok', 'data': result}

    except Exception as ex:
        logger.warning('cost_structure API 失败: %s', ex)
        return {'code': 0, 'msg': 'ok', 'data': [], 'note': '数据正在构建中'}
