"""
易快报数据注入器 — 按业务逻辑正确关联

易快报数据的业务含义：
  - requisition（申请单，S开头）= 项目预算申请，包含项目标的、客户、利润率
  - expense（报销单，B开头）= 项目费用报销，通过 expenseLink 关联预算申请单
  - loan（借款单，J开头）= 日常管理借款

业务关联链路：
  易快报 u_项目档案.code (M26041002)
    → Protocol.code (项目编号)
    → Protocol.id = ExpenseRequest.protocol_id
    → Protocol.sponsor_id = Client.id (客户)

  易快报 expenseLink.code (S26000040)
    → requisition 类型单据的 code
    → 报销单 ↔ 预算申请单 的关联

  易快报 expenseDepartment.name (组4)
    → 费用承担部门（用于成本归属）

  易快报 specificationId.name (功效测试项目报销单)
    → 业务单据类型（区分项目费用 vs 日常管理费用）

注入目标：
  requisition → ProjectBudget（预算申请 → 项目预算）
  expense    → ExpenseRequest（项目报销 → 费用报销）+ 关联到 Protocol
  loan       → ExpenseRequest（借款 → 费用报销，类型=other）
"""
import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('cn_kis.ekuaibao.injector')


def _model_snapshot(instance) -> dict:
    snapshot = {}
    for field in instance._meta.fields:
        val = getattr(instance, field.name, None)
        if hasattr(val, 'isoformat'):
            snapshot[field.name] = val.isoformat()
        elif val is not None:
            snapshot[field.name] = str(val)
    return snapshot


def _ts_to_date(ts) -> Optional[str]:
    """易快报毫秒时间戳 → YYYY-MM-DD"""
    if not ts or ts == 0:
        return None
    try:
        return datetime.fromtimestamp(int(ts) / 1000).strftime('%Y-%m-%d')
    except Exception:
        return None


def _ts_to_datetime(ts):
    """易快报毫秒时间戳 → aware datetime"""
    if not ts or ts == 0:
        return None
    try:
        return timezone.make_aware(datetime.fromtimestamp(int(ts) / 1000))
    except Exception:
        return None


def _safe_decimal(val, default='0') -> Decimal:
    try:
        return Decimal(str(val or default)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(default)


# ============================================================================
# 项目 / 客户匹配（核心业务关联）
# ============================================================================

def _match_protocol(raw_data: dict) -> Optional[Any]:
    """通过易快报的 u_项目档案 匹配系统中的 Protocol"""
    try:
        from apps.protocol.models import Protocol
        up = raw_data.get('userProps', {}) or {}

        # u_项目档案 = {id, code, name}
        proj_archive = up.get('u_项目档案', {})
        if isinstance(proj_archive, dict) and proj_archive.get('code'):
            project_code = proj_archive['code']
            protocol = Protocol.objects.filter(code=project_code, is_deleted=False).first()
            if protocol:
                return protocol

        # 降级：从 title 中提取项目编码（格式通常是 M26041002-xxx 或 C25001029-xxx）
        title = raw_data.get('title', '')
        if title and '-' in title:
            code_part = title.split('-')[0].strip()
            if len(code_part) >= 6:
                protocol = Protocol.objects.filter(code=code_part, is_deleted=False).first()
                if protocol:
                    return protocol
    except Exception as ex:
        logger.debug('项目匹配失败: %s', ex)
    return None


def _match_client(raw_data: dict) -> Optional[Any]:
    """通过易快报的 u_客户名称 匹配系统中的 Client"""
    try:
        from apps.crm.models import Client
        up = raw_data.get('userProps', {}) or {}
        client_name = up.get('u_客户名称', '')
        if not client_name:
            # 从 u_项目档案.name 获取
            proj_archive = up.get('u_项目档案', {})
            if isinstance(proj_archive, dict):
                client_name = proj_archive.get('name', '')

        if client_name:
            client = Client.objects.filter(name=client_name, is_deleted=False).first()
            if not client:
                client = Client.objects.filter(
                    short_name=client_name, is_deleted=False
                ).first()
            return client
    except Exception as ex:
        logger.debug('客户匹配失败: %s', ex)
    return None


def _extract_project_info(raw_data: dict) -> dict:
    """从易快报数据中提取完整的项目信息"""
    up = raw_data.get('userProps', {}) or {}

    proj_archive = up.get('u_项目档案', {})
    if isinstance(proj_archive, dict):
        project_code = proj_archive.get('code', '')
        project_name_from_archive = proj_archive.get('name', '')
    else:
        project_code = ''
        project_name_from_archive = ''

    execution_ledger = up.get('u_项目执行台账新', {})
    if isinstance(execution_ledger, dict):
        execution_name = execution_ledger.get('name', '')
    else:
        execution_name = ''

    return {
        'project_code': project_code,
        'client_name': project_name_from_archive or up.get('u_客户名称', ''),
        'project_name': up.get('u_项目名称', '') or execution_name,
        'project_target': _safe_decimal(up.get('u_项目标的', 0)),
        'profit_rate': up.get('u_利润率', None),
        'sample_count': up.get('u_样本数量', None),
        'sector': up.get('u_版块', {}).get('name', '') if isinstance(up.get('u_版块'), dict) else '',
        'test_type': up.get('u_测试类型', {}).get('name', '') if isinstance(up.get('u_测试类型'), dict) else '',
        'source_type': up.get('u_委托来源', {}).get('name', '') if isinstance(up.get('u_委托来源'), dict) else '',
        'start_date': _ts_to_date(up.get('u_项目开始日期')),
        'end_date': _ts_to_date(up.get('u_项目结束日期')),
        'dept_name': up.get('expenseDepartment', {}).get('name', '') if isinstance(up.get('expenseDepartment'), dict) else '',
        'account_manager': up.get('u_客户经理', {}).get('name', '') if isinstance(up.get('u_客户经理'), dict) else '',
        'linked_requisition_code': up.get('expenseLink', {}).get('code', '') if isinstance(up.get('expenseLink'), dict) else up.get('u_申请单号', ''),
    }


def _extract_owner_info(raw_data: dict) -> dict:
    """从易快报数据中提取申请人/提交人信息"""
    owner = raw_data.get('owner', {}) or {}
    up = raw_data.get('userProps', {}) or {}
    submitter = up.get('submitterId', {})
    if isinstance(submitter, dict):
        submitter_name = submitter.get('name', '')
        submitter_code = submitter.get('code', '')
    else:
        submitter_name = ''
        submitter_code = ''

    owner_depts = owner.get('departments', [])
    dept_names = [d.get('name', '') for d in owner_depts if isinstance(d, dict)]

    return {
        'owner_name': owner.get('name', ''),
        'owner_id': owner.get('id', ''),
        'submitter_name': submitter_name or owner.get('name', ''),
        'submitter_code': submitter_code,
        'department_names': dept_names,
    }


def _extract_template_name(raw_data: dict) -> str:
    """提取单据模板名称（业务类型）"""
    up = raw_data.get('userProps', {}) or {}
    spec = up.get('specificationId', {})
    return spec.get('name', '') if isinstance(spec, dict) else ''


def _map_expense_type(raw_data: dict) -> str:
    """根据模板名称和标题映射费用类型"""
    template = _extract_template_name(raw_data)
    title = raw_data.get('title', '') or ''

    # 项目费用 vs 日常管理
    if '功效测试' in template or '特化' in template or '消费者测试' in template:
        # 项目相关费用
        kw_map = {
            '兼职': 'other',       # 兼职劳务费
            '差旅': 'travel',
            '出差': 'travel',
            '交通': 'travel',
            '采购': 'procurement',
            '耗材': 'procurement',
            '物料': 'procurement',
            '招待': 'entertainment',
            '餐饮': 'entertainment',
        }
        for kw, etype in kw_map.items():
            if kw in title:
                return etype
        return 'other'
    elif '日常管理' in template:
        kw_map = {
            '差旅': 'travel',
            '出差': 'travel',
            '采购': 'procurement',
            '招待': 'entertainment',
        }
        for kw, etype in kw_map.items():
            if kw in title:
                return etype
        return 'other'

    return 'other'


def _map_approval_status(state: str) -> str:
    """映射审批状态"""
    state_upper = (state or '').upper()
    mapping = {
        'PAID': 'reimbursed',
        'PAYING': 'approved',
        'PROCESSING': 'submitted',
        'APPROVED': 'approved',
        'REJECTED': 'rejected',
        'DRAFT': 'draft',
    }
    return mapping.get(state_upper, 'submitted')


# ============================================================================
# 冲突检测
# ============================================================================

class EkbConflictDetector:
    @classmethod
    def check_expense(cls, raw_data: dict):
        try:
            from apps.finance.models_expense import ExpenseRequest
            ekb_id = raw_data.get('id', '')
            flow_no = raw_data.get('code', '')
            if ekb_id:
                existing = ExpenseRequest.objects.filter(ekuaibao_id=ekb_id).first()
                if existing:
                    return existing, 'exact_id', 1.0
            if flow_no:
                existing = ExpenseRequest.objects.filter(ekuaibao_no=flow_no).first()
                if existing:
                    return existing, 'exact_id', 1.0
        except Exception:
            pass
        return None

    @classmethod
    def detect(cls, module: str, raw_data: dict):
        if module == 'flows':
            return cls.check_expense(raw_data)
        return None


# ============================================================================
# 注入器主体
# ============================================================================

class EkbInjector:
    def __init__(self, batch, dry_run: bool = False, resolve_conflicts: str = 'pending'):
        self.batch = batch
        self.dry_run = dry_run
        self.resolve_conflicts = resolve_conflicts
        self.stats = {
            'injected': 0, 'updated': 0, 'conflicts': 0,
            'skipped': 0, 'failed': 0,
        }

    def inject_all(self) -> dict:
        from apps.ekuaibao_integration.models import EkbRawRecord

        if self.resolve_conflicts == 'upsert':
            status_filter = ['pending', 'conflict']
        else:
            status_filter = ['pending']

        modules = list(
            EkbRawRecord.objects.filter(
                batch=self.batch, injection_status__in=status_filter
            ).values_list('module', flat=True).distinct()
        )
        for module in modules:
            self.inject_module(module)
        return dict(self.stats)

    def inject_module(self, module: str) -> dict:
        from apps.ekuaibao_integration.models import EkbRawRecord

        if self.resolve_conflicts == 'upsert':
            status_filter = ['pending', 'conflict']
        else:
            status_filter = ['pending']

        records = EkbRawRecord.objects.filter(
            batch=self.batch, module=module, injection_status__in=status_filter
        )
        count = records.count()
        logger.info('[%s] 开始注入: %d 条待处理（策略: %s）', module, count, self.resolve_conflicts)

        for raw_rec in records:
            try:
                self._inject_one(raw_rec)
            except Exception as ex:
                logger.error('[%s] 注入失败 ekb_id=%s: %s', module, raw_rec.ekb_id, ex)
                raw_rec.injection_status = 'failed'
                raw_rec.save(update_fields=['injection_status'])
                self.stats['failed'] += 1

        return dict(self.stats)

    def _inject_one(self, raw_rec):
        from apps.ekuaibao_integration.models import (
            EkbConflict, EkbConflictType, EkbConflictResolution,
            EkbInjectionLog, EkbInjectionAction,
        )
        module = raw_rec.module
        raw_data = raw_rec.raw_data

        if module != 'flows':
            raw_rec.injection_status = 'skipped'
            raw_rec.save(update_fields=['injection_status'])
            self.stats['skipped'] += 1
            return

        # 去重：同一个 code 的单据只注入一次
        conflict_result = EkbConflictDetector.detect(module, raw_data)
        if conflict_result:
            existing, conflict_type, similarity = conflict_result
            if self.dry_run:
                self.stats['conflicts'] += 1
                return

            # upsert 模式：直接用 EKB 数据强制更新已有记录
            if self.resolve_conflicts == 'upsert':
                try:
                    doc_type = raw_data.get('type', '')
                    result = None
                    if doc_type == 'requisition':
                        result = _inject_requisition_as_budget(raw_data)
                        workstation = 'finance'
                    elif doc_type in ('expense', 'loan'):
                        result = _inject_expense_with_relations(raw_data)
                        workstation = 'finance'
                    if result:
                        target_obj, action, before_data = result
                        with transaction.atomic():
                            EkbInjectionLog.objects.create(
                                batch=self.batch, raw_record=raw_rec,
                                module=module, ekb_id=raw_rec.ekb_id,
                                target_table=target_obj.__class__._meta.db_table,
                                target_id=target_obj.id,
                                action='upsert', target_workstation=workstation,
                                before_data=_model_snapshot(existing),
                                after_data=raw_data,
                            )
                            raw_rec.injection_status = 'injected'
                            raw_rec.save(update_fields=['injection_status'])
                        self.stats['updated'] += 1
                    else:
                        raw_rec.injection_status = 'skipped'
                        raw_rec.save(update_fields=['injection_status'])
                        self.stats['skipped'] += 1
                except Exception as e:
                    logger.error('[upsert] %s:%s 失败: %s', module, raw_rec.ekb_id, e)
                    raw_rec.injection_status = 'failed'
                    raw_rec.save(update_fields=['injection_status'])
                    self.stats['failed'] += 1
                return

            EkbConflict.objects.create(
                batch=self.batch, raw_record=raw_rec,
                module=module, ekb_id=raw_rec.ekb_id,
                conflict_type=conflict_type, similarity_score=similarity,
                ekb_data=raw_data,
                existing_record_id=existing.id,
                existing_table=existing.__class__._meta.db_table,
                existing_data=_model_snapshot(existing),
                diff_fields=[],
                resolution=EkbConflictResolution.PENDING,
            )
            raw_rec.injection_status = 'conflict'
            raw_rec.save(update_fields=['injection_status'])
            self.stats['conflicts'] += 1
            return

        if self.dry_run:
            self.stats['injected'] += 1
            return

        # 按单据类型分发注入
        doc_type = raw_data.get('type', '')
        if doc_type == 'requisition':
            result = _inject_requisition_as_budget(raw_data)
            workstation = 'finance'
        elif doc_type in ('expense', 'loan'):
            result = _inject_expense_with_relations(raw_data)
            workstation = 'finance'
        else:
            raw_rec.injection_status = 'skipped'
            raw_rec.save(update_fields=['injection_status'])
            self.stats['skipped'] += 1
            return

        if result:
            target_obj, action, before_data = result
            with transaction.atomic():
                EkbInjectionLog.objects.create(
                    batch=self.batch, raw_record=raw_rec,
                    module=module, ekb_id=raw_rec.ekb_id,
                    target_table=target_obj.__class__._meta.db_table,
                    target_id=target_obj.id,
                    action=action, target_workstation=workstation,
                    before_data=before_data, after_data=raw_data,
                )
                raw_rec.injection_status = 'injected'
                raw_rec.save(update_fields=['injection_status'])
            self.stats['injected'] += 1 if action == 'created' else 0
            self.stats['updated'] += 1 if action == 'updated' else 0
        else:
            raw_rec.injection_status = 'skipped'
            raw_rec.save(update_fields=['injection_status'])
            self.stats['skipped'] += 1

    @staticmethod
    def _compute_diff(ekb_data: dict, existing_data: dict) -> List[dict]:
        diff = []
        for key in sorted(set(str(k) for k in ekb_data) | set(str(k) for k in existing_data)):
            ev = str(ekb_data.get(key, '')).strip()
            xv = str(existing_data.get(key, '')).strip()
            if ev != xv and (ev or xv):
                diff.append({'field': key, 'ekb': ev[:200], 'existing': xv[:200]})
        return diff


# ============================================================================
# 注入函数：expense/loan → ExpenseRequest（带完整业务关联）
# ============================================================================

def _inject_expense_with_relations(raw_data: dict):
    """
    将 expense（报销单）或 loan（借款单）注入为 ExpenseRequest，
    同时正确关联 Protocol（项目）和其他业务维度。
    """
    try:
        from apps.finance.models_expense import ExpenseRequest

        ekb_id = raw_data.get('id', '')
        code = raw_data.get('code', '')
        if not code:
            return None

        # 提取业务信息
        project_info = _extract_project_info(raw_data)
        owner_info = _extract_owner_info(raw_data)
        template_name = _extract_template_name(raw_data)

        # 匹配项目
        protocol = _match_protocol(raw_data)

        # 映射费用类型和状态
        expense_type = _map_expense_type(raw_data)
        approval_status = _map_approval_status(raw_data.get('state', ''))

        # 金额
        amount = _safe_decimal(raw_data.get('sumAmount', 0))

        # 构造完整的描述（包含业务上下文）
        desc_parts = [raw_data.get('title', '')]
        if project_info['project_code']:
            desc_parts.append(f"项目: {project_info['project_code']}")
        if project_info['client_name']:
            desc_parts.append(f"客户: {project_info['client_name']}")
        if project_info['dept_name']:
            desc_parts.append(f"部门: {project_info['dept_name']}")
        if template_name:
            desc_parts.append(f"模板: {template_name}")
        description = ' | '.join(filter(None, desc_parts))

        # 检查是否已存在（用 request_no 去重）
        existing_expense = None
        try:
            if ekb_id:
                existing_expense = ExpenseRequest.objects.filter(ekuaibao_id=ekb_id).first()
        except Exception:
            pass
        if not existing_expense and code:
            existing_expense = ExpenseRequest.objects.filter(request_no=code).first()

        if existing_expense:
            # 更新已有记录
            before = {}
            existing_expense.ekuaibao_id = ekb_id
            existing_expense.ekuaibao_no = code
            existing_expense.amount = amount
            existing_expense.approval_status = approval_status
            existing_expense.import_source = 'ekuaibao'
            try:
                existing_expense.approval_chain = []
                existing_expense.client_name = project_info.get('client_name', '')
                existing_expense.ekuaibao_submitter_id = owner_info.get('submitter_id', '')
                existing_expense.expense_template = template_name or ''
            except Exception:
                pass
            existing_expense.save()
            return existing_expense, 'updated', before

        obj = ExpenseRequest.objects.create(
            request_no=code,
            applicant_id=0,
            applicant_name=owner_info['submitter_name'],
            protocol_id=protocol.id if protocol else None,
            project_name=project_info['project_name'] or project_info['client_name'] or '（待填写）',
            expense_type=expense_type,
            amount=amount,
            description=description,
            approval_status=approval_status,
            notes=raw_data.get('remark', '') or '',
            ekuaibao_id=ekb_id,
            ekuaibao_no=code,
            import_batch_id=str(raw_data.get('_batch_no', '')),
            import_source='ekuaibao',
            feishu_approval_id='',
            receipt_count=0,
            receipt_images=[],
            approval_chain=[],
            client_name=project_info.get('client_name', ''),
            cost_department='',
            ekuaibao_submitter_id=owner_info.get('submitter_id', ''),
            expense_template=template_name or '',
            linked_budget_no='',
        )
        return obj, 'created', {}

    except Exception as ex:
        logger.error('报销单注入失败: %s | code=%s', ex, raw_data.get('code', '?'))
        return None


# ============================================================================
# 注入函数：requisition → ProjectBudget（预算申请 → 项目预算）
# ============================================================================

def _inject_requisition_as_budget(raw_data: dict):
    """
    将 requisition（预算申请单）注入为 ProjectBudget，
    正确关联 Protocol 和 Client。
    """
    try:
        from apps.finance.models import ProjectBudget

        ekb_id = raw_data.get('id', '')
        code = raw_data.get('code', '')
        if not code:
            return None

        # 提取业务信息
        project_info = _extract_project_info(raw_data)
        owner_info = _extract_owner_info(raw_data)

        # 匹配项目
        protocol = _match_protocol(raw_data)
        client = _match_client(raw_data)

        # 检查是否已存在（用 budget_no 去重，兼容没有 ekuaibao_budget_id 字段的生产版本）
        existing = None
        try:
            if ekb_id:
                existing = ProjectBudget.objects.filter(
                    ekuaibao_budget_id=ekb_id
                ).first()
        except Exception:
            pass
        if not existing and code:
            existing = ProjectBudget.objects.filter(budget_no=code).first()
        if existing:
            before = _model_snapshot(existing)
            return existing, 'updated', before

        # 金额
        budget_total = project_info['project_target'] or _safe_decimal(
            raw_data.get('sumAmount', 0)
        )
        actual_expense = _safe_decimal(raw_data.get('sumAmount', 0))

        # 解析日期
        start_date = project_info['start_date'] or '2025-01-01'
        end_date = project_info['end_date'] or '2026-12-31'

        from datetime import date as date_type
        try:
            start_d = date_type.fromisoformat(start_date)
            budget_year = start_d.year
        except Exception:
            budget_year = 2026

        create_kwargs = dict(
            budget_no=code,
            budget_name=f"{project_info['project_code']} {project_info['client_name']} {project_info['project_name']}".strip() or code,
            status='approved' if raw_data.get('state', '').upper() in ('PAID', 'PAYING', 'APPROVED') else 'draft',
            protocol_id=protocol.id if protocol else 0,
            project_name=project_info['project_name'] or raw_data.get('title', '') or '（待填写）',
            client_id=client.id if client else None,
            client_name=project_info['client_name'] or '',
            budget_year=budget_year,
            start_date=start_date,
            end_date=end_date,
            total_expense=actual_expense,
            gross_margin=Decimal(str(project_info['profit_rate'] or 0)) * 100 if project_info['profit_rate'] else Decimal('0'),
            notes=(
                f"易快报预算申请 | 样本数: {project_info['sample_count'] or '-'} | "
                f"版块: {project_info['sector']} | 测试类型: {project_info['test_type']} | "
                f"委托来源: {project_info['source_type']} | "
                f"客户经理: {project_info['account_manager']}"
            ),
        )
        # 兼容：只在字段存在时添加
        for field_name, value in [
            ('import_source', 'ekuaibao'),
            ('import_batch_id', ''),
            ('ekuaibao_budget_id', ekb_id or code),
        ]:
            try:
                ProjectBudget._meta.get_field(field_name)
                create_kwargs[field_name] = value
            except Exception:
                pass

        obj = ProjectBudget.objects.create(**create_kwargs)
        return obj, 'created', {}

    except Exception as ex:
        logger.error('预算注入失败: %s | code=%s', ex, raw_data.get('code', '?'))
        return None
