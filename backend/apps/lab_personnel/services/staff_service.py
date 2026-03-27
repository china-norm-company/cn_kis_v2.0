"""
人员档案服务

封装实验室人员档案的查询、创建、更新逻辑。
"""
import logging
from typing import Optional
from django.db.models import Q

from apps.hr.models import Staff
from apps.lab_personnel.models import LabStaffProfile, StaffCertificate, MethodQualification

logger = logging.getLogger(__name__)


def list_lab_staff(
    lab_role: str = None,
    competency_level: str = None,
    employment_type: str = None,
    is_active: bool = None,
    search: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """获取实验室人员列表（含扩展档案信息）"""
    qs = LabStaffProfile.objects.select_related('staff').filter(
        staff__is_deleted=False,
    )

    if lab_role:
        qs = qs.filter(lab_role=lab_role)
    if competency_level:
        qs = qs.filter(competency_level=competency_level)
    if employment_type:
        qs = qs.filter(employment_type=employment_type)
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    if search:
        qs = qs.filter(
            Q(staff__name__icontains=search) |
            Q(staff__employee_no__icontains=search)
        )

    qs = qs.order_by('staff__name')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_staff_full_detail(staff_id: int) -> Optional[dict]:
    """获取人员完整档案（合并 Staff 基础 + LabProfile + 证书 + 方法资质 + 设备授权 + 项目 + 培训 + 评估）"""
    staff = Staff.objects.filter(id=staff_id, is_deleted=False).first()
    if not staff:
        return None

    profile = LabStaffProfile.objects.filter(staff=staff).first()

    # 证书列表
    certificates = StaffCertificate.objects.filter(staff=staff).order_by('-expiry_date')

    # 方法资质列表
    method_quals = MethodQualification.objects.filter(
        staff=staff
    ).select_related('method').order_by('method__name')

    # 设备授权列表（从 resource 模块读取）
    from apps.resource.models import EquipmentAuthorization
    equipment_auths = EquipmentAuthorization.objects.filter(
        operator_id=staff.account_id, is_active=True
    ).select_related('equipment') if staff.account_id else []

    # 项目分配（从 hr 模块读取）
    from apps.hr.models import ProjectAssignment
    project_assignments = ProjectAssignment.objects.filter(
        staff=staff, is_active=True
    ).order_by('-create_time')

    # 培训记录（从 hr 模块读取）
    from apps.hr.models import Training
    trainings = Training.objects.filter(
        trainee=staff, is_deleted=False
    ).order_by('-start_date')[:20]

    # 评估历史（从 hr 模块读取）
    from apps.hr.models import Assessment
    assessments = Assessment.objects.filter(
        staff=staff, is_deleted=False
    ).order_by('-period')[:10]

    # 排班记录
    from apps.lab_personnel.models_scheduling import ShiftSlot
    recent_shifts = ShiftSlot.objects.filter(
        staff=staff
    ).select_related('schedule').order_by('-shift_date')[:20]

    data = {
        'staff': {
            'id': staff.id,
            'name': staff.name,
            'employee_no': staff.employee_no,
            'position': staff.position,
            'department': staff.department,
            'phone': staff.phone,
            'email': staff.email,
            'gcp_cert': staff.gcp_cert,
            'gcp_expiry': staff.gcp_expiry.isoformat() if staff.gcp_expiry else None,
            'gcp_status': staff.gcp_status,
            'other_certs': staff.other_certs,
        },
        'lab_profile': None,
        'certificates': [{
            'id': c.id,
            'cert_type': c.cert_type,
            'cert_type_display': c.get_cert_type_display(),
            'cert_name': c.cert_name,
            'cert_number': c.cert_number,
            'expiry_date': c.expiry_date.isoformat() if c.expiry_date else None,
            'status': c.status,
            'status_display': c.get_status_display(),
            'is_locked': c.is_locked,
        } for c in certificates],
        'method_qualifications': [{
            'id': mq.id,
            'method_id': mq.method_id,
            'method_name': mq.method.name,
            'method_code': mq.method.code,
            'level': mq.level,
            'level_display': mq.get_level_display(),
            'qualified_date': mq.qualified_date.isoformat() if mq.qualified_date else None,
            'total_executions': mq.total_executions,
            'last_execution_date': mq.last_execution_date.isoformat() if mq.last_execution_date else None,
        } for mq in method_quals],
        'equipment_authorizations': [{
            'id': ea.id,
            'equipment_id': ea.equipment_id,
            'equipment_name': ea.equipment.name,
            'authorized_at': ea.authorized_at.isoformat(),
            'expires_at': ea.expires_at.isoformat() if ea.expires_at else None,
            'is_active': ea.is_active,
        } for ea in equipment_auths],
        'project_assignments': [{
            'id': pa.id,
            'protocol_id': pa.protocol_id,
            'role': pa.role,
            'workload_percentage': pa.workload_percentage,
        } for pa in project_assignments],
        'trainings': [{
            'id': t.id,
            'course_name': t.course_name,
            'category': t.category,
            'trainer': t.trainer,
            'start_date': t.start_date.isoformat(),
            'hours': t.hours,
            'status': t.status,
            'score': t.score,
        } for t in trainings],
        'assessments': [{
            'id': a.id,
            'period': a.period,
            'scores': a.scores,
            'overall': a.overall,
            'status': a.status,
            'assessor': a.assessor,
        } for a in assessments],
        'recent_shifts': [{
            'id': s.id,
            'shift_date': s.shift_date.isoformat(),
            'start_time': s.start_time.strftime('%H:%M'),
            'end_time': s.end_time.strftime('%H:%M'),
            'planned_hours': float(s.planned_hours),
            'confirm_status': s.confirm_status,
            'project_name': s.project_name,
        } for s in recent_shifts],
    }

    if profile:
        data['lab_profile'] = {
            'id': profile.id,
            'lab_role': profile.lab_role,
            'lab_role_display': profile.get_lab_role_display(),
            'lab_role_secondary': profile.lab_role_secondary,
            'employment_type': profile.employment_type,
            'employment_type_display': profile.get_employment_type_display(),
            'competency_level': profile.competency_level,
            'competency_level_display': profile.get_competency_level_display(),
            'available_weekdays': profile.available_weekdays,
            'max_daily_hours': profile.max_daily_hours,
            'max_weekly_hours': profile.max_weekly_hours,
            'is_active': profile.is_active,
            'notes': profile.notes,
        }

    return data


def upsert_lab_staff_profile(staff_id: int, **kwargs) -> Optional[LabStaffProfile]:
    """创建或更新实验室人员档案"""
    staff = Staff.objects.filter(id=staff_id, is_deleted=False).first()
    if not staff:
        return None

    profile, created = LabStaffProfile.objects.update_or_create(
        staff=staff,
        defaults=kwargs,
    )

    # 确保 select_related staff 可用
    profile = LabStaffProfile.objects.select_related('staff').get(pk=profile.pk)
    return profile
