"""
质量合规服务

封装偏差管理、CAPA 跟踪、SOP 管理的业务逻辑。
"""
import importlib.util as _ilu
import logging
import os as _os
from typing import Optional
from datetime import date
from django.db import transaction
from django.utils import timezone
from .models import (
    Deviation, CAPA, SOP, DeviationStatus, CAPAStatus,
    CAPAActionItem, CAPAActionItemStatus,
)

logger = logging.getLogger(__name__)


def _load_quality_gate_module():
    """
    延迟加载 quality_gate_service 子模块。

    `apps.quality.services` 当前是单文件模块，而仓库内同时存在
    `apps/quality/services/quality_gate_service.py`。直接按
    `apps.quality.services.quality_gate_service` 导入会失败，这里提供稳定代理。
    """
    module_name = 'apps.quality.services._quality_gate_service_proxy'
    cached = globals().get(module_name)
    if cached is not None:
        return cached

    gate_path = _os.path.join(_os.path.dirname(__file__), 'services', 'quality_gate_service.py')
    spec = _ilu.spec_from_file_location(module_name, gate_path)
    module = _ilu.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    globals()[module_name] = module
    return module


def _apply_data_scope(qs, account=None):
    """应用数据权限过滤（若提供 account）"""
    if account is None:
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(qs, account)


# ============================================================================
# 偏差管理
# ============================================================================
def list_deviations(
    status: str = None,
    severity: str = None,
    project: str = None,
    date_from: str = None,
    date_to: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    """分页查询偏差列表"""
    qs = Deviation.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if severity:
        qs = qs.filter(severity=severity)
    if project:
        qs = qs.filter(project__icontains=project)
    if date_from:
        qs = qs.filter(reported_at__gte=date_from)
    if date_to:
        qs = qs.filter(reported_at__lte=date_to)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_deviation(deviation_id: int) -> Optional[Deviation]:
    return Deviation.objects.filter(id=deviation_id, is_deleted=False).first()


def create_deviation(
    code: str,
    title: str,
    category: str,
    severity: str,
    reporter: str,
    reported_at: date,
    project: str,
    description: str = '',
    reporter_id: int = None,
    project_id: int = None,
    reporter_open_id: str = '',
) -> Deviation:
    """
    创建偏差记录并发起飞书审批

    飞书集成（FEISHU_NATIVE_SETUP.md 3.3）：
    创建偏差后自动发起飞书偏差报告审批，审批结果通过回调更新状态。
    """
    deviation = Deviation.objects.create(
        code=code, title=title, category=category, severity=severity,
        reporter=reporter, reported_at=reported_at, project=project,
        description=description, reporter_id=reporter_id, project_id=project_id,
    )

    # 飞书审批：自动发起偏差报告审批
    if reporter_open_id:
        try:
            from libs.feishu_approval import create_deviation_approval
            instance_code = create_deviation_approval(
                open_id=reporter_open_id,
                deviation_type=category,
                description=f"{title}\n{description}",
                impact_assessment=severity,
                corrective_action='',
            )
            if instance_code:
                deviation.feishu_approval_instance_id = instance_code
                deviation.save(update_fields=['feishu_approval_instance_id'])
                logger.info(f"偏差#{deviation.id} 飞书审批已发起: {instance_code}")
        except Exception as e:
            logger.error(f"偏差#{deviation.id} 飞书审批发起失败: {e}")

    return deviation


def update_deviation(deviation_id: int, **kwargs) -> Optional[Deviation]:
    dev = get_deviation(deviation_id)
    if not dev:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(dev, key):
            setattr(dev, key, value)
    dev.save()
    return dev


def delete_deviation(deviation_id: int) -> bool:
    dev = get_deviation(deviation_id)
    if not dev:
        return False
    dev.is_deleted = True
    dev.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_deviation_stats() -> dict:
    """偏差统计"""
    from django.db.models import Count
    qs = Deviation.objects.filter(is_deleted=False)
    by_status = qs.values('status').annotate(count=Count('id'))
    by_severity = qs.values('severity').annotate(count=Count('id'))
    return {
        'by_status': {item['status']: item['count'] for item in by_status},
        'by_severity': {item['severity']: item['count'] for item in by_severity},
        'total': qs.count(),
    }


# ============================================================================
# CAPA 管理
# ============================================================================
def list_capas(
    status: str = None,
    type: str = None,
    deviation_id: int = None,
    is_overdue: bool = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    qs = CAPA.objects.filter(is_deleted=False).select_related('deviation')
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if type:
        qs = qs.filter(type=type)
    if deviation_id:
        qs = qs.filter(deviation_id=deviation_id)
    if is_overdue:
        today = date.today()
        qs = qs.filter(
            due_date__lt=today,
            status__in=[CAPAStatus.PLANNED, CAPAStatus.IN_PROGRESS, CAPAStatus.VERIFICATION, CAPAStatus.OVERDUE],
        )

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_capa(capa_id: int) -> Optional[CAPA]:
    return CAPA.objects.filter(id=capa_id, is_deleted=False).select_related('deviation').first()


@transaction.atomic
def create_capa(
    code: str,
    deviation_id: int,
    type: str,
    title: str,
    responsible: str,
    due_date: date,
    responsible_id: int = None,
    action_detail: str = '',
) -> CAPA:
    """
    创建 CAPA（S2-6 增强）

    AC-2：创建 CAPA 后偏差状态自动变为 capa_pending
    """
    capa = CAPA.objects.create(
        code=code, deviation_id=deviation_id, type=type, title=title,
        responsible=responsible, due_date=due_date,
        responsible_id=responsible_id, action_detail=action_detail,
    )

    # S2-6 AC-2：偏差状态联动
    dev = Deviation.objects.filter(id=deviation_id, is_deleted=False).first()
    if dev and dev.status in (
        DeviationStatus.IDENTIFIED, DeviationStatus.REPORTED,
        DeviationStatus.INVESTIGATING, DeviationStatus.CAPA_PENDING,
    ):
        dev.status = DeviationStatus.CAPA_PENDING
        dev.save(update_fields=['status', 'update_time'])
        logger.info(f'偏差#{deviation_id} 状态更新为 capa_pending')

    return capa


def update_capa(capa_id: int, **kwargs) -> Optional[CAPA]:
    capa = get_capa(capa_id)
    if not capa:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(capa, key):
            setattr(capa, key, value)
    capa.save()
    return capa


def delete_capa(capa_id: int) -> bool:
    capa = get_capa(capa_id)
    if not capa:
        return False
    capa.is_deleted = True
    capa.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_capa_stats() -> dict:
    from django.db.models import Count
    qs = CAPA.objects.filter(is_deleted=False)
    by_status = qs.values('status').annotate(count=Count('id'))
    return {
        'by_status': {item['status']: item['count'] for item in by_status},
        'total': qs.count(),
    }


# ============================================================================
# SOP 管理
# ============================================================================
def list_sops(
    status: str = None,
    category: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    qs = SOP.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if category:
        qs = qs.filter(category__icontains=category)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_sop(sop_id: int) -> Optional[SOP]:
    return SOP.objects.filter(id=sop_id, is_deleted=False).first()


def create_sop(
    code: str,
    title: str,
    version: str,
    category: str,
    owner: str,
    effective_date: date = None,
    next_review: date = None,
    feishu_doc_url: str = '',
) -> SOP:
    return SOP.objects.create(
        code=code, title=title, version=version, category=category,
        owner=owner, effective_date=effective_date, next_review=next_review,
        feishu_doc_url=feishu_doc_url,
    )


def update_sop(sop_id: int, **kwargs) -> Optional[SOP]:
    sop = get_sop(sop_id)
    if not sop:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(sop, key):
            setattr(sop, key, value)
    sop.save()
    return sop


def delete_sop(sop_id: int) -> bool:
    sop = get_sop(sop_id)
    if not sop:
        return False
    sop.is_deleted = True
    sop.save(update_fields=['is_deleted', 'update_time'])
    return True


def get_sop_stats() -> dict:
    """SOP 统计"""
    from django.db.models import Count
    qs = SOP.objects.filter(is_deleted=False)
    by_status = qs.values('status').annotate(count=Count('id'))
    return {
        'by_status': {item['status']: item['count'] for item in by_status},
        'total': qs.count(),
    }


# ============================================================================
# S2-6：偏差状态机 + CAPA 行动项管理
# ============================================================================

# 偏差状态转换表
DEVIATION_TRANSITIONS = {
    DeviationStatus.IDENTIFIED: [DeviationStatus.REPORTED],
    DeviationStatus.REPORTED: [DeviationStatus.INVESTIGATING],
    DeviationStatus.INVESTIGATING: [DeviationStatus.CAPA_PENDING],
    DeviationStatus.CAPA_PENDING: [DeviationStatus.CAPA_EXECUTING],
    DeviationStatus.CAPA_EXECUTING: [DeviationStatus.CAPA_COMPLETE],
    DeviationStatus.CAPA_COMPLETE: [DeviationStatus.CLOSED],
}


def advance_deviation_status(deviation_id: int, new_status: str) -> Optional[Deviation]:
    """
    偏差状态推进（S2-6 AC-1）

    严格按照状态机转换。
    """
    dev = get_deviation(deviation_id)
    if not dev:
        return None

    allowed = DEVIATION_TRANSITIONS.get(dev.status, [])
    if new_status not in allowed:
        logger.warning(
            f'偏差#{deviation_id}: {dev.status} → {new_status} 不允许。'
            f'可选: {allowed}'
        )
        return None

    dev.status = new_status
    if new_status == DeviationStatus.CLOSED:
        dev.closed_at = timezone.now().date()
    dev.save(update_fields=['status', 'update_time'] +
             (['closed_at'] if new_status == DeviationStatus.CLOSED else []))

    if new_status == DeviationStatus.CAPA_PENDING:
        _auto_create_capa_draft(dev)

    return dev


def _auto_create_capa_draft(dev) -> None:
    """
    数字员工自动闭环：偏差推进到 CAPA 待建时，自动创建 CAPA 草稿。
    失败只记日志。
    """
    try:
        existing = CAPA.objects.filter(deviation=dev, is_deleted=False).count()
        if existing > 0:
            return
        from datetime import timedelta
        code = f'CAPA-{dev.code}-01'
        capa = create_capa(
            code=code,
            deviation_id=dev.id,
            type='corrective',
            title=f'针对偏差 {dev.code} 的纠正与预防措施',
            responsible=dev.reporter or '待指定',
            due_date=timezone.now().date() + timedelta(days=30),
            action_detail=f'根据偏差「{dev.title}」的根因分析，建议采取纠正措施并防止再发。',
        )
        try:
            from apps.secretary.runtime_plane import create_execution_task, finalize_execution_task
            task_id = create_execution_task(
                runtime_type='service',
                name='auto-create-capa-draft',
                target='quality.auto_create_capa_draft',
                account_id=dev.reporter_id,
                role_code='quality_guardian',
                workstation_key='quality',
                business_object_type='deviation',
                business_object_id=str(dev.id),
            )
            finalize_execution_task(task_id, ok=True, output={'capa_id': capa.id, 'capa_code': code})
        except Exception:
            pass
        logger.info(f'数字员工自动创建 CAPA 草稿: {code} (偏差 {dev.code})')
    except Exception as exc:
        logger.warning(f'自动创建 CAPA 草稿失败 (偏差 {dev.code}): {exc}')


def add_capa_action_item(
    capa_id: int,
    title: str,
    due_date: date,
    responsible_name: str = '',
    responsible_id: int = None,
) -> Optional[CAPAActionItem]:
    """添加 CAPA 行动项"""
    capa = get_capa(capa_id)
    if not capa:
        return None

    last_seq = CAPAActionItem.objects.filter(capa=capa).count()
    item = CAPAActionItem.objects.create(
        capa=capa,
        sequence=last_seq + 1,
        title=title,
        responsible_id=responsible_id,
        responsible_name=responsible_name,
        due_date=due_date,
    )

    # 创建行动项后，如果偏差在 capa_pending 状态，更新为 capa_executing
    dev = capa.deviation
    if dev.status == DeviationStatus.CAPA_PENDING:
        dev.status = DeviationStatus.CAPA_EXECUTING
        dev.save(update_fields=['status', 'update_time'])

    return item


@transaction.atomic
def complete_action_item(
    action_item_id: int,
    completion_note: str = '',
) -> Optional[CAPAActionItem]:
    """
    完成 CAPA 行动项（S2-6 AC-3）

    所有行动项完成后自动检查 CAPA 状态。
    """
    item = CAPAActionItem.objects.filter(id=action_item_id).first()
    if not item or item.status == CAPAActionItemStatus.COMPLETED:
        return None

    item.status = CAPAActionItemStatus.COMPLETED
    item.completion_note = completion_note
    item.completed_at = timezone.now()
    item.save()

    # 检查所有行动项是否完成
    capa = item.capa
    all_items = CAPAActionItem.objects.filter(capa=capa)
    pending_count = all_items.exclude(status=CAPAActionItemStatus.COMPLETED).count()

    if pending_count == 0:
        # AC-3：全部完成 → CAPA 状态变为验证中
        capa.status = CAPAStatus.VERIFICATION
        capa.save(update_fields=['status', 'update_time'])
        logger.info(f'CAPA#{capa.id} 所有行动项已完成，状态变为 verification')

        # 偏差状态联动 → capa_complete
        dev = capa.deviation
        if dev.status == DeviationStatus.CAPA_EXECUTING:
            dev.status = DeviationStatus.CAPA_COMPLETE
            dev.save(update_fields=['status', 'update_time'])
            logger.info(f'偏差#{dev.id} 状态变为 capa_complete')

    return item


def verify_and_close_capa(
    capa_id: int,
    effectiveness: str = '有效',
    verification_note: str = '',
) -> Optional[CAPA]:
    """
    验证并关闭 CAPA（S2-6 AC-4）

    CAPA 验证后偏差可关闭。
    """
    capa = get_capa(capa_id)
    if not capa or capa.status != CAPAStatus.VERIFICATION:
        return None

    capa.status = CAPAStatus.CLOSED
    capa.effectiveness = effectiveness
    capa.verification_note = verification_note
    capa.save(update_fields=['status', 'effectiveness', 'verification_note', 'update_time'])

    # CAPA 关闭后自动关闭关联偏差
    dev = capa.deviation
    if dev and dev.status in (DeviationStatus.CAPA_COMPLETE, DeviationStatus.CAPA_EXECUTING):
        dev.status = DeviationStatus.CLOSED
        dev.closed_at = timezone.now().date()
        dev.save(update_fields=['status', 'closed_at', 'update_time'])
        logger.info(f'偏差#{dev.id} 随 CAPA#{capa.id} 关闭而自动关闭')

    return capa


# ============================================================================
# 审计管理服务
# ============================================================================
class _AuditManagementService:

    def list_audits(self, audit_type=None, status=None, page=1, page_size=20):
        from .models import Audit
        qs = Audit.objects.all()
        if audit_type:
            qs = qs.filter(audit_type=audit_type)
        if status:
            qs = qs.filter(status=status)
        total = qs.count()
        offset = (page - 1) * page_size
        return {
            'items': list(qs[offset:offset + page_size]),
            'total': total, 'page': page, 'page_size': page_size,
        }

    def create_audit(self, code, title, audit_type, scope='', auditor='',
                     planned_date=None, auditor_org='', checklist=None):
        from .models import Audit
        return Audit.objects.create(
            code=code, title=title, audit_type=audit_type,
            scope=scope, auditor=auditor, planned_date=planned_date,
            auditor_org=auditor_org, checklist=checklist or [],
        )

    def get_audit(self, audit_id):
        from .models import Audit
        return Audit.objects.filter(id=audit_id).first()

    def start_audit(self, audit_id):
        from .models import Audit
        audit = Audit.objects.filter(id=audit_id, status='planned').first()
        if not audit:
            return None
        audit.status = 'in_progress'
        audit.actual_date = date.today()
        audit.save(update_fields=['status', 'actual_date', 'update_time'])
        return audit

    def complete_audit(self, audit_id, summary=''):
        from .models import Audit
        audit = Audit.objects.filter(id=audit_id, status='in_progress').first()
        if not audit:
            return None
        audit.status = 'completed'
        audit.summary = summary
        audit.save(update_fields=['status', 'summary', 'update_time'])
        return audit

    def close_audit(self, audit_id):
        from .models import Audit
        audit = Audit.objects.filter(id=audit_id, status='completed').first()
        if not audit:
            return None
        audit.status = 'closed'
        audit.save(update_fields=['status', 'update_time'])
        return audit

    def add_finding(self, audit_id, title='', severity='minor', clause='',
                    corrective_requirement='', corrective_deadline=None):
        from .models import Audit, AuditFinding
        audit = Audit.objects.filter(id=audit_id).first()
        if not audit:
            return None
        seq = audit.findings.count() + 1
        return AuditFinding.objects.create(
            audit=audit, sequence=seq, title=title, severity=severity,
            clause=clause, corrective_requirement=corrective_requirement,
            corrective_deadline=corrective_deadline,
        )

    def list_findings(self, audit_id):
        from .models import AuditFinding
        return list(AuditFinding.objects.filter(audit_id=audit_id))

    def generate_audit_report(self, audit_id):
        from .models import Audit
        audit = Audit.objects.filter(id=audit_id).first()
        if not audit:
            return None
        findings = self.list_findings(audit_id)
        return {
            'audit_code': audit.code, 'title': audit.title,
            'audit_type': audit.audit_type, 'scope': audit.scope,
            'auditor': audit.auditor, 'auditor_org': audit.auditor_org,
            'planned_date': str(audit.planned_date),
            'actual_date': str(audit.actual_date) if audit.actual_date else None,
            'status': audit.status, 'summary': audit.summary,
            'finding_count': len(findings),
            'findings': [
                {'sequence': f.sequence, 'title': f.title, 'severity': f.severity,
                 'status': f.status}
                for f in findings
            ],
        }


audit_management_service = _AuditManagementService()


# ============================================================================
# 变更控制服务
# ============================================================================
class _ChangeControlService:

    def list_change_requests(self, change_type=None, status=None, risk_level=None,
                             page=1, page_size=20):
        from .models import ChangeRequest
        qs = ChangeRequest.objects.all()
        if change_type:
            qs = qs.filter(change_type=change_type)
        if status:
            qs = qs.filter(status=status)
        if risk_level:
            qs = qs.filter(risk_level=risk_level)
        total = qs.count()
        offset = (page - 1) * page_size
        return {
            'items': list(qs[offset:offset + page_size]),
            'total': total, 'page': page, 'page_size': page_size,
        }

    def create_change_request(self, code, title, change_type, description='',
                              risk_level='medium', applicant='', applicant_id=None,
                              impact_assessment=''):
        from .models import ChangeRequest
        return ChangeRequest.objects.create(
            code=code, title=title, change_type=change_type,
            description=description, risk_level=risk_level,
            applicant=applicant, applicant_id=applicant_id,
            impact_assessment=impact_assessment,
        )

    def get_change_request(self, cr_id):
        from .models import ChangeRequest
        return ChangeRequest.objects.filter(id=cr_id).first()

    def submit_change_request(self, cr_id):
        from .models import ChangeRequest
        cr = ChangeRequest.objects.filter(id=cr_id, status='draft').first()
        if not cr:
            return None
        cr.status = 'submitted'
        cr.save(update_fields=['status', 'update_time'])
        return cr

    def approve_change_request(self, cr_id, reviewer='', reviewer_id=None):
        from .models import ChangeRequest
        cr = ChangeRequest.objects.filter(id=cr_id, status='submitted').first()
        if not cr:
            return None
        cr.status = 'approved'
        cr.reviewer = reviewer
        cr.reviewer_id = reviewer_id
        cr.save(update_fields=['status', 'reviewer', 'reviewer_id', 'update_time'])
        return cr

    def reject_change_request(self, cr_id, reviewer='', reviewer_id=None):
        from .models import ChangeRequest
        cr = ChangeRequest.objects.filter(id=cr_id, status='submitted').first()
        if not cr:
            return None
        cr.status = 'rejected'
        cr.reviewer = reviewer
        cr.reviewer_id = reviewer_id
        cr.save(update_fields=['status', 'reviewer', 'reviewer_id', 'update_time'])
        return cr

    def start_implementation(self, cr_id, implementation_plan=''):
        from .models import ChangeRequest
        cr = ChangeRequest.objects.filter(id=cr_id, status='approved').first()
        if not cr:
            return None
        cr.status = 'implementing'
        cr.implementation_plan = implementation_plan
        cr.save(update_fields=['status', 'implementation_plan', 'update_time'])
        return cr

    def verify_change(self, cr_id, verification_note=''):
        from .models import ChangeRequest
        cr = ChangeRequest.objects.filter(id=cr_id, status='implementing').first()
        if not cr:
            return None
        cr.status = 'verified'
        cr.verification_note = verification_note
        cr.save(update_fields=['status', 'verification_note', 'update_time'])
        return cr

    def close_change(self, cr_id):
        from .models import ChangeRequest
        cr = ChangeRequest.objects.filter(id=cr_id, status='verified').first()
        if not cr:
            return None
        cr.status = 'closed'
        cr.save(update_fields=['status', 'update_time'])
        return cr

    def get_change_stats(self):
        from .models import ChangeRequest
        qs = ChangeRequest.objects.all()
        return {
            'total': qs.count(),
            'draft': qs.filter(status='draft').count(),
            'submitted': qs.filter(status='submitted').count(),
            'approved': qs.filter(status='approved').count(),
            'implementing': qs.filter(status='implementing').count(),
            'closed': qs.filter(status='closed').count(),
        }


change_control_service = _ChangeControlService()


# ============================================================================
# 质量门禁服务
# ============================================================================
class _QualityGateService:

    def check_quality_gate(self, entity_type, entity_id, gate_name):
        return {'passed': True, 'gate': gate_name, 'checks': []}

    def list_gates(self, entity_type=None):
        return []


quality_gate_service = _QualityGateService()


def check_project_start_gate(protocol_id: int) -> dict:
    """项目启动门禁公共入口。"""
    return _load_quality_gate_module().check_project_start_gate(protocol_id)


def check_data_lock_gate(protocol_id: int) -> dict:
    """数据锁定门禁公共入口。"""
    return _load_quality_gate_module().check_data_lock_gate(protocol_id)


def check_closeout_gate(protocol_id: int) -> dict:
    """
    结项门禁公共入口。

    `apps.quality.services` 当前是单文件模块，无法直接按
    `apps.quality.services.quality_gate_service` 形式导入子模块，
    因此在这里提供稳定代理，供 protocol/closeout 等模块调用。
    """
    from .models import Deviation, DeviationStatus, CAPA, CAPAStatus

    checks = []

    open_deviations = Deviation.objects.filter(
        is_deleted=False,
        project_id=protocol_id,
    ).exclude(status=DeviationStatus.CLOSED).count()
    checks.append({
        'name': '所有偏差已关闭',
        'passed': open_deviations == 0,
        'detail': f'未关闭偏差: {open_deviations}',
    })

    unclosed_capas = CAPA.objects.filter(
        is_deleted=False,
        deviation__project_id=protocol_id,
    ).exclude(status=CAPAStatus.CLOSED).count()
    checks.append({
        'name': 'CAPA 验证完成',
        'passed': unclosed_capas == 0,
        'detail': f'未完成 CAPA: {unclosed_capas}',
    })

    total_deviations = Deviation.objects.filter(
        is_deleted=False,
        project_id=protocol_id,
    ).count()
    closed_deviations = Deviation.objects.filter(
        is_deleted=False,
        project_id=protocol_id,
        status=DeviationStatus.CLOSED,
    ).count()
    closure_rate = round(closed_deviations / total_deviations * 100) if total_deviations > 0 else 100
    checks.append({
        'name': '偏差关闭率 100%',
        'passed': closure_rate == 100,
        'detail': f'关闭率: {closure_rate}%',
    })

    return {
        'gate': 'closeout',
        'passed': all(item['passed'] for item in checks),
        'checks': checks,
    }


def check_all_gates(protocol_id: int) -> dict:
    """全部质量门禁公共入口。"""
    return {
        'project_start': check_project_start_gate(protocol_id),
        'data_lock': check_data_lock_gate(protocol_id),
        'closeout': check_closeout_gate(protocol_id),
    }
