"""
方法资质服务

封装方法资质 CRUD、资质矩阵、能力差距分析逻辑。
"""
import logging
from typing import Optional
from django.db.models import Count, Q

from apps.hr.models import Staff
from apps.lab_personnel.models import MethodQualification, LabStaffProfile, MethodQualLevel
from apps.resource.models_detection_method import DetectionMethodTemplate

logger = logging.getLogger(__name__)


def list_method_qualifications(
    staff_id: int = None,
    method_id: int = None,
    level: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """方法资质列表"""
    qs = MethodQualification.objects.select_related('staff', 'method').all()

    if staff_id:
        qs = qs.filter(staff_id=staff_id)
    if method_id:
        qs = qs.filter(method_id=method_id)
    if level:
        qs = qs.filter(level=level)

    qs = qs.order_by('staff__name', 'method__name')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def create_method_qualification(
    staff_id: int,
    method_id: int,
    level: str = 'learning',
    qualified_date=None,
    expiry_date=None,
    notes: str = '',
) -> MethodQualification:
    """创建方法资质"""
    mq, created = MethodQualification.objects.update_or_create(
        staff_id=staff_id,
        method_id=method_id,
        defaults={
            'level': level,
            'qualified_date': qualified_date,
            'expiry_date': expiry_date,
            'notes': notes,
        },
    )
    mq = MethodQualification.objects.select_related('staff', 'method').get(pk=mq.pk)
    return mq


def update_method_qualification(qual_id: int, **kwargs) -> Optional[MethodQualification]:
    """更新方法资质"""
    mq = MethodQualification.objects.select_related('staff', 'method').filter(id=qual_id).first()
    if not mq:
        return None

    for k, v in kwargs.items():
        if v is not None and hasattr(mq, k):
            setattr(mq, k, v)
    mq.save()
    return mq


def get_qualification_matrix() -> dict:
    """
    获取资质矩阵视图

    返回：人员列表 × 方法列表 × 设备列表 的资质交叉矩阵
    """
    # 获取所有有 lab_profile 的人员
    profiles = LabStaffProfile.objects.filter(
        is_active=True, staff__is_deleted=False,
    ).select_related('staff').order_by('staff__name')

    # 获取所有活跃方法
    methods = DetectionMethodTemplate.objects.filter(
        status='active', is_deleted=False,
    ).order_by('code')

    # 获取所有方法资质
    all_quals = MethodQualification.objects.select_related('staff', 'method').all()
    qual_map = {}
    for mq in all_quals:
        key = (mq.staff_id, mq.method_id)
        qual_map[key] = mq

    # 获取设备授权
    from apps.resource.models import EquipmentAuthorization, ResourceItem
    equipment_items = ResourceItem.objects.filter(
        category__resource_type='equipment',
        status='active',
        is_deleted=False,
    ).order_by('name')

    all_auths = EquipmentAuthorization.objects.filter(
        is_active=True
    ).select_related('equipment')
    auth_map = {}
    for ea in all_auths:
        key = ea.operator_id
        if key not in auth_map:
            auth_map[key] = []
        auth_map[key].append(ea)

    # 单点依赖检测：每个方法仅有 1 个 independent+ 人员
    single_point_risks = []
    for method in methods:
        independent_count = MethodQualification.objects.filter(
            method=method,
            level__in=[MethodQualLevel.INDEPENDENT, MethodQualLevel.MENTOR],
            staff__is_deleted=False,
        ).count()
        if independent_count == 1:
            staff_names = list(MethodQualification.objects.filter(
                method=method,
                level__in=[MethodQualLevel.INDEPENDENT, MethodQualLevel.MENTOR],
            ).values_list('staff__name', flat=True))
            single_point_risks.append({
                'method_id': method.id,
                'method_name': method.name,
                'independent_count': independent_count,
                'staff_names': staff_names,
            })

    # 构建人员行
    staff_list = []
    for profile in profiles:
        staff = profile.staff
        staff_entry = {
            'staff_id': staff.id,
            'name': staff.name,
            'level': profile.competency_level,
            'role': profile.lab_role,
            'gcp_status': staff.gcp_status,
            'gcp_expiry': staff.gcp_expiry.isoformat() if staff.gcp_expiry else None,
            'method_qualifications': [],
            'equipment_authorizations': [],
        }

        # 方法资质
        for method in methods:
            mq = qual_map.get((staff.id, method.id))
            staff_entry['method_qualifications'].append({
                'method_id': method.id,
                'method_name': method.name,
                'level': mq.level if mq else None,
                'level_display': mq.get_level_display() if mq else '未涉及',
            })

        # 设备授权
        staff_auths = auth_map.get(staff.account_id, [])
        for equip in equipment_items:
            auth = next((a for a in staff_auths if a.equipment_id == equip.id), None)
            staff_entry['equipment_authorizations'].append({
                'equipment_id': equip.id,
                'equipment_name': equip.name,
                'authorized': auth is not None,
                'expiry': auth.expires_at.isoformat() if auth and auth.expires_at else None,
            })

        staff_list.append(staff_entry)

    # 为前端矩阵视图构建 staff[] + matrix{} 格式（与 QualificationMatrix TS 类型对齐）
    staff_for_matrix = [
        {'id': s['staff_id'], 'name': s['name'], 'level': s.get('level', '')}
        for s in staff_list
    ]
    matrix_dict = {}
    for s in staff_list:
        matrix_dict[str(s['staff_id'])] = {
            str(mq['method_id']): mq.get('level', '') or ''
            for mq in s.get('method_qualifications', [])
        }

    # single_point_risks 字段名与前端 TS 类型对齐：independent_count → qualified_count
    risks_normalized = [
        {
            'method_id': r['method_id'],
            'method_name': r['method_name'],
            'qualified_count': r.get('independent_count', 0),
            'staff_names': r.get('staff_names', []),
        }
        for r in single_point_risks
    ]

    return {
        'staff_list': staff_list,
        'staff': staff_for_matrix,
        'matrix': matrix_dict,
        'methods': [{'id': m.id, 'name': m.name, 'code': m.code} for m in methods],
        'equipments': [{'id': e.id, 'name': e.name, 'code': e.code} for e in equipment_items],
        'single_point_risks': risks_normalized,
    }


def get_gap_analysis(protocol_id: int = None) -> dict:
    """
    能力差距分析

    分析项目需求的检测方法 vs 现有人员资质，识别差距。
    """
    if not protocol_id:
        return {
            'protocol_name': None,
            'required_methods': [],
            'overall_readiness': 'unknown',
            'gaps': [],
        }

    from apps.resource.models_detection_method import DetectionMethodPersonnel

    # 获取项目需要的检测方法的人员要求
    method_personnel_reqs = DetectionMethodPersonnel.objects.select_related(
        'method'
    ).all()

    required_methods = []
    gaps = []

    for req in method_personnel_reqs:
        method = req.method

        # 找到具备 independent+ 资质的人员
        qualified = MethodQualification.objects.filter(
            method=method,
            level__in=[MethodQualLevel.INDEPENDENT, MethodQualLevel.MENTOR],
            staff__is_deleted=False,
        ).select_related('staff')

        available_count = qualified.count()
        required_count = 1

        status = 'sufficient' if available_count >= required_count else 'gap'
        entry = {
            'method_id': method.id,
            'method_name': method.name,
            'required_level': 'independent',
            'required_count': required_count,
            'available_count': available_count,
            'status': status,
            'available_staff': [{
                'id': q.staff.id,
                'name': q.staff.name,
                'level': q.level,
            } for q in qualified],
        }

        if status == 'gap':
            # 找培训候选人（正在学习的人员）
            candidates = MethodQualification.objects.filter(
                method=method,
                level__in=[MethodQualLevel.LEARNING, MethodQualLevel.PROBATION],
                staff__is_deleted=False,
            ).select_related('staff')

            entry['training_candidates'] = [{
                'id': c.staff.id,
                'name': c.staff.name,
                'current_level': c.level,
            } for c in candidates]

            gaps.append({
                'method': method.name,
                'shortage': required_count - available_count,
                'recommended_action': f'需培训 {required_count - available_count} 人达到独立执行水平',
            })

        required_methods.append(entry)

    overall = 'sufficient' if not gaps else 'partial' if required_methods else 'unknown'

    return {
        'protocol_name': f'协议#{protocol_id}',
        'required_methods': required_methods,
        'overall_readiness': overall,
        'gaps': gaps,
    }
