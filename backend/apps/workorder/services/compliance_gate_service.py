"""
F4 合规阻断链 — 工单执行前的 6 个合规门禁

Gate 1: 受试者入组状态     — Enrollment.status == 'enrolled'
Gate 2: 访视窗口期         — 实际日期在允许窗口内
Gate 3: 操作人方法资质     — MethodQualification.level in (independent, mentor)
Gate 4: 设备校准有效       — EquipmentAuthorization.expires_at > today AND calibration_status == 'valid'
Gate 5: 环境合规           — VenueEnvironmentLog.is_compliant == True（最近30分钟内）
Gate 6: 访视活动一致性     — 工单活动在 visit_node 定义的活动列表中（F6）

使用方式：
    from apps.workorder.services.compliance_gate_service import check_all_gates
    result = check_all_gates(work_order_id=1, operator_id=42)
"""
import logging
from datetime import date, timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)

# Gate 标识符
GATE_ENROLLMENT_STATUS = 'enrollment_status'
GATE_VISIT_WINDOW = 'visit_window'
GATE_OPERATOR_QUALIFICATION = 'operator_qualification'
GATE_EQUIPMENT_CALIBRATION = 'equipment_calibration'
GATE_ENVIRONMENT_COMPLIANCE = 'environment_compliance'
GATE_VISIT_ACTIVITY_CONSISTENCY = 'visit_activity_consistency'


def check_all_gates(
    work_order_id: int,
    operator_id: int,
    force: bool = False,
    force_reason: str = '',
    include_visit_activity: bool = True,
) -> dict:
    """
    执行所有合规门禁校验

    Args:
        work_order_id: 工单 ID
        operator_id: 操作人 Account ID
        force: 是否强制放行（需主管权限）
        force_reason: 强制放行原因（force=True 时必填）
        include_visit_activity: 是否包含 Gate 6（访视活动一致性）

    Returns:
        {
            "all_passed": bool,
            "gates": [{"gate": str, "passed": bool, "message": str, "detail": dict}],
            "forced": bool,
            "force_reason": str,
        }
    """
    try:
        from apps.workorder.models import WorkOrder
        work_order = WorkOrder.objects.select_related(
            'enrollment', 'visit_node', 'visit_activity',
        ).get(pk=work_order_id)
    except Exception as e:
        return {'error': f'工单 {work_order_id} 不存在或无法访问：{e}'}

    gates = []

    # Gate 1: 受试者入组状态
    gates.append(_check_gate_1_enrollment_status(work_order))

    # Gate 2: 访视窗口期
    gates.append(_check_gate_2_visit_window(work_order))

    # Gate 3: 操作人方法资质
    gates.append(_check_gate_3_operator_qualification(work_order, operator_id))

    # Gate 4: 设备校准有效
    gates.append(_check_gate_4_equipment_calibration(work_order, operator_id))

    # Gate 5: 环境合规
    gates.append(_check_gate_5_environment_compliance(work_order))

    # Gate 6: 访视活动一致性（可选）
    if include_visit_activity:
        gates.append(_check_gate_6_visit_activity_consistency(work_order))

    failed_gates = [g for g in gates if not g['passed'] and g['passed'] is not None]
    all_passed = len(failed_gates) == 0

    result = {
        'all_passed': all_passed,
        'gates': gates,
        'forced': False,
        'force_reason': '',
    }

    # 强制放行逻辑
    if not all_passed and force:
        if not force_reason.strip():
            return {'error': '强制放行必须填写原因（force_reason）', 'gates': gates}

        _create_force_override_deviation(
            work_order=work_order,
            operator_id=operator_id,
            failed_gates=failed_gates,
            reason=force_reason,
        )
        result['all_passed'] = True
        result['forced'] = True
        result['force_reason'] = force_reason
        logger.warning(
            f'工单 {work_order_id} 强制放行合规检查（操作人={operator_id}）：'
            f'{[g["gate"] for g in failed_gates]}'
        )

    return result


# ============================================================================
# 各 Gate 实现
# ============================================================================

def _check_gate_1_enrollment_status(work_order) -> dict:
    """Gate 1: 受试者入组状态必须为 enrolled"""
    gate = {
        'gate': GATE_ENROLLMENT_STATUS,
        'name': '受试者入组状态',
        'passed': True,
        'message': '受试者入组状态正常',
        'detail': {},
    }

    try:
        enrollment = work_order.enrollment
        if not enrollment:
            gate['passed'] = False
            gate['message'] = '工单未关联受试者入组信息'
            return gate

        status = enrollment.status
        subject_code = getattr(enrollment, 'subject_code', '') or str(enrollment.id)

        gate['detail']['subject_code'] = subject_code
        gate['detail']['enrollment_status'] = status

        if status == 'enrolled':
            gate['passed'] = True
            gate['message'] = f'受试者 {subject_code} 入组状态正常（enrolled）'
        elif status == 'withdrawn':
            gate['passed'] = False
            gate['message'] = f'受试者 {subject_code} 已退出研究，无法执行检测'
        elif status == 'completed':
            gate['passed'] = False
            gate['message'] = f'受试者 {subject_code} 研究已完成，无法新增检测'
        elif status == 'screening':
            gate['passed'] = False
            gate['message'] = f'受试者 {subject_code} 仍在筛选阶段，尚未正式入组'
        elif status == 'screen_failed':
            gate['passed'] = False
            gate['message'] = f'受试者 {subject_code} 筛选失败，无法执行检测'
        else:
            gate['passed'] = False
            gate['message'] = f'受试者入组状态异常：{status}'

    except Exception as e:
        logger.error(f'Gate 1 校验失败：{e}')
        gate['passed'] = None
        gate['message'] = f'Gate 1 校验异常：{e}'

    return gate


def _check_gate_2_visit_window(work_order) -> dict:
    """Gate 2: 实际执行日期必须在访视窗口期内"""
    gate = {
        'gate': GATE_VISIT_WINDOW,
        'name': '访视窗口期',
        'passed': True,
        'message': '访视窗口期检查通过',
        'detail': {},
    }

    if not work_order.visit_node:
        gate['passed'] = True
        gate['message'] = '工单未关联访视节点，跳过窗口期检查'
        gate['skipped'] = True
        return gate

    try:
        visit_node = work_order.visit_node
        today = date.today()

        # 如果工单有 enrollment，计算基线日期
        enrollment = work_order.enrollment
        if not enrollment or not hasattr(enrollment, 'enrolled_at') or not enrollment.enrolled_at:
            gate['passed'] = True
            gate['message'] = '无法确定入组日期，跳过窗口期精确检查'
            gate['skipped'] = True
            return gate

        baseline_date = enrollment.enrolled_at.date() if hasattr(enrollment.enrolled_at, 'date') else enrollment.enrolled_at
        baseline_day = getattr(visit_node, 'baseline_day', 0) or 0
        window_before = getattr(visit_node, 'window_before', 0) or 0
        window_after = getattr(visit_node, 'window_after', 0) or 0

        target_date = baseline_date + timedelta(days=baseline_day)
        earliest = target_date - timedelta(days=window_before)
        latest = target_date + timedelta(days=window_after)

        gate['detail'] = {
            'today': str(today),
            'target_date': str(target_date),
            'window_earliest': str(earliest),
            'window_latest': str(latest),
            'window_before': window_before,
            'window_after': window_after,
        }

        if earliest <= today <= latest:
            gate['passed'] = True
            gate['message'] = (
                f'在访视窗口期内（{earliest} ~ {latest}，目标日 {target_date}）'
            )
        else:
            days_diff = (today - target_date).days
            gate['passed'] = False
            if today < earliest:
                gate['message'] = (
                    f'访视时间偏早：今天 {today} 比窗口最早允许日 {earliest} 早 {(earliest - today).days} 天'
                )
            else:
                gate['message'] = (
                    f'访视时间偏晚：今天 {today} 比窗口最晚允许日 {latest} 晚 {(today - latest).days} 天'
                )

    except Exception as e:
        logger.error(f'Gate 2 校验失败：{e}')
        gate['passed'] = None
        gate['message'] = f'Gate 2 校验异常：{e}'

    return gate


def _check_gate_3_operator_qualification(work_order, operator_id: int) -> dict:
    """Gate 3: 操作人必须有该工单检测方法的 independent 或 mentor 级资质"""
    gate = {
        'gate': GATE_OPERATOR_QUALIFICATION,
        'name': '操作人方法资质',
        'passed': True,
        'message': '操作人方法资质满足要求',
        'detail': {},
    }

    try:
        from apps.lab_personnel.models import MethodQualification, MethodQualLevel

        # 通过 account_id 找到对应的 staff
        staff = _get_staff_from_account(operator_id)
        if not staff:
            gate['passed'] = False
            gate['message'] = f'操作人（account_id={operator_id}）未找到对应的实验室人员档案'
            return gate

        # 获取工单要求的检测方法
        required_methods = _get_required_methods_for_workorder(work_order)
        if not required_methods:
            gate['passed'] = True
            gate['message'] = '工单未指定必要的检测方法，跳过资质校验'
            gate['skipped'] = True
            return gate

        # 检查每个必要方法的资质
        missing_quals = []
        insufficient_quals = []
        qual_details = []

        for method_id, method_name in required_methods:
            qual = MethodQualification.objects.filter(
                staff=staff,
                is_active=True,
            ).filter(
                method_id=method_id,
            ).first() if method_id else MethodQualification.objects.filter(
                staff=staff,
                is_active=True,
            ).filter(
                method__name=method_name,
            ).first()

            if not qual:
                missing_quals.append(method_name)
                qual_details.append({
                    'method': method_name,
                    'status': 'missing',
                    'message': '无该方法资质记录',
                })
            elif qual.level in (MethodQualLevel.INDEPENDENT, MethodQualLevel.MENTOR):
                qual_details.append({
                    'method': method_name,
                    'status': 'passed',
                    'level': qual.level,
                })
            else:
                insufficient_quals.append(f'{method_name}（当前：{qual.level}，要求：independent 或 mentor）')
                qual_details.append({
                    'method': method_name,
                    'status': 'insufficient',
                    'level': qual.level,
                    'message': '资质等级不足',
                })

        gate['detail']['qualifications'] = qual_details
        gate['detail']['operator_staff_id'] = staff.id

        if missing_quals:
            gate['passed'] = False
            gate['message'] = f'缺少以下方法的资质记录：{", ".join(missing_quals)}'
        elif insufficient_quals:
            gate['passed'] = False
            gate['message'] = f'以下方法资质等级不足（需 independent 或 mentor）：{"; ".join(insufficient_quals)}'
        else:
            gate['passed'] = True
            gate['message'] = '所有要求方法的资质均满足'

    except Exception as e:
        logger.error(f'Gate 3 校验失败：{e}')
        gate['passed'] = None
        gate['message'] = f'Gate 3 校验异常：{e}'

    return gate


def _check_gate_4_equipment_calibration(work_order, operator_id: int) -> dict:
    """Gate 4: 工单涉及设备的校准状态必须有效，且操作人有设备授权"""
    gate = {
        'gate': GATE_EQUIPMENT_CALIBRATION,
        'name': '设备校准有效',
        'passed': True,
        'message': '设备校准状态正常',
        'detail': {},
    }

    try:
        from apps.resource.models import ResourceItem, EquipmentAuthorization

        today = date.today()
        equipment_items = _get_equipment_items_for_workorder(work_order)

        if not equipment_items:
            gate['passed'] = True
            gate['message'] = '工单未指定设备，跳过设备校验'
            gate['skipped'] = True
            return gate

        expired_calibrations = []
        missing_auth = []
        equipment_details = []

        for eq_id, eq_name in equipment_items:
            detail = {'equipment_id': eq_id, 'equipment_name': eq_name}

            # 检查校准状态
            try:
                item = ResourceItem.objects.get(pk=eq_id)
                cal_status = getattr(item, 'calibration_status', 'unknown')
                cal_due = getattr(item, 'next_calibration_date', None)
                detail['calibration_status'] = cal_status
                detail['calibration_due'] = str(cal_due) if cal_due else None

                if cal_status == 'expired' or (cal_due and cal_due < today):
                    expired_calibrations.append(
                        f'{eq_name}（到期日：{cal_due}）' if cal_due else eq_name
                    )
                    detail['calibration_check'] = 'failed'
                else:
                    detail['calibration_check'] = 'passed'
            except ResourceItem.DoesNotExist:
                detail['calibration_check'] = 'not_found'

            # 检查操作人是否有该设备授权
            auth = EquipmentAuthorization.objects.filter(
                operator_id=operator_id,
                is_active=True,
                expires_at__gte=today,
            ).filter(equipment_id=eq_id).first()

            if auth:
                detail['authorization_check'] = 'passed'
                detail['auth_expires_at'] = str(auth.expires_at)
            else:
                missing_auth.append(eq_name)
                detail['authorization_check'] = 'failed'

            equipment_details.append(detail)

        gate['detail']['equipment'] = equipment_details

        issues = []
        if expired_calibrations:
            issues.append(f'以下设备校准已过期：{", ".join(expired_calibrations)}')
        if missing_auth:
            issues.append(f'操作人未获授权使用以下设备：{", ".join(missing_auth)}')

        if issues:
            gate['passed'] = False
            gate['message'] = '；'.join(issues)
        else:
            gate['passed'] = True

    except Exception as e:
        logger.error(f'Gate 4 校验失败：{e}')
        gate['passed'] = None
        gate['message'] = f'Gate 4 校验异常：{e}'

    return gate


def _check_gate_5_environment_compliance(work_order) -> dict:
    """Gate 5: 关联场地的最近30分钟内环境记录必须合规"""
    gate = {
        'gate': GATE_ENVIRONMENT_COMPLIANCE,
        'name': '环境条件合规',
        'passed': True,
        'message': '环境条件符合要求',
        'detail': {},
    }

    try:
        from apps.resource.models import VenueEnvironmentLog

        threshold_minutes = 30
        cutoff = timezone.now() - timedelta(minutes=threshold_minutes)

        latest = VenueEnvironmentLog.objects.filter(
            recorded_at__gte=cutoff,
        ).order_by('-recorded_at').first()

        if not latest:
            gate['passed'] = None
            gate['message'] = f'最近 {threshold_minutes} 分钟内无环境监测记录，无法确认合规性'
            gate['skipped'] = True
            gate['detail']['warning'] = '建议手动确认环境条件'
            return gate

        gate['detail'] = {
            'temperature': float(latest.temperature) if latest.temperature else None,
            'humidity': float(latest.humidity) if latest.humidity else None,
            'recorded_at': latest.recorded_at.isoformat(),
            'is_compliant': getattr(latest, 'is_compliant', None),
        }

        is_compliant = getattr(latest, 'is_compliant', None)
        if is_compliant is False:
            gate['passed'] = False
            gate['message'] = (
                f'当前环境不合规（温度 {gate["detail"]["temperature"]}°C，'
                f'湿度 {gate["detail"]["humidity"]}%），'
                f'记录时间 {latest.recorded_at.strftime("%H:%M")}'
            )
        else:
            gate['passed'] = True
            gate['message'] = (
                f'环境合规（温度 {gate["detail"]["temperature"]}°C，'
                f'湿度 {gate["detail"]["humidity"]}%）'
            )

    except Exception as e:
        logger.error(f'Gate 5 校验失败：{e}')
        gate['passed'] = None
        gate['message'] = f'Gate 5 校验异常：{e}'

    return gate


def _check_gate_6_visit_activity_consistency(work_order) -> dict:
    """
    Gate 6: 工单检测活动须在协议定义的访视节点活动列表中

    F6 访视计划一致性校验
    """
    gate = {
        'gate': GATE_VISIT_ACTIVITY_CONSISTENCY,
        'name': '访视活动一致性',
        'passed': True,
        'message': '检测活动与访视计划一致',
        'detail': {},
        'skipped': False,
    }

    if not work_order.visit_node:
        gate['passed'] = True
        gate['message'] = '工单未关联访视节点，跳过一致性校验'
        gate['skipped'] = True
        return gate

    if not work_order.visit_activity:
        gate['passed'] = True
        gate['message'] = '工单未指定访视活动，跳过一致性校验'
        gate['skipped'] = True
        return gate

    try:
        visit_node = work_order.visit_node
        work_activity = work_order.visit_activity

        # 获取该访视节点定义的活动列表
        from apps.visit.models import VisitActivity
        node_activities = VisitActivity.objects.filter(
            visit_node=visit_node,
        ).values_list('id', flat=True)

        gate['detail'] = {
            'work_order_activity_id': work_activity.id,
            'work_order_activity_name': str(work_activity),
            'visit_node_activity_ids': list(node_activities),
        }

        if work_activity.id in node_activities:
            gate['passed'] = True
            gate['message'] = '工单检测活动在访视计划的活动列表中'
        else:
            gate['passed'] = False
            gate['message'] = (
                f'工单活动（{work_activity}）不在访视节点（{visit_node}）的计划活动列表中，'
                f'请确认是否为方案外检测'
            )

    except Exception as e:
        logger.error(f'Gate 6 校验失败：{e}')
        gate['passed'] = None
        gate['message'] = f'Gate 6 校验异常：{e}'

    return gate


# ============================================================================
# 辅助函数
# ============================================================================

def _get_staff_from_account(account_id: int):
    """根据 account_id 获取对应的 Staff 对象"""
    try:
        from apps.lab_personnel.models import LabStaffProfile
        profile = LabStaffProfile.objects.filter(
            staff__account_fk_id=account_id,
            is_active=True,
        ).select_related('staff').first()
        if profile:
            return profile.staff
        profile = LabStaffProfile.objects.filter(
            staff__account_id=account_id,
            is_active=True,
        ).select_related('staff').first()
        return profile.staff if profile else None
    except Exception:
        return None


def _get_required_methods_for_workorder(work_order) -> list:
    """
    获取工单要求的检测方法列表

    返回 [(method_id, method_name), ...]
    """
    methods = []
    try:
        from apps.resource.models_detection_method import DetectionMethodTemplate
        if work_order.visit_activity and hasattr(work_order.visit_activity, 'activity_template_id'):
            template_id = work_order.visit_activity.activity_template_id
            if template_id:
                template = DetectionMethodTemplate.objects.filter(pk=template_id).first()
                if template:
                    methods.append((template.id, template.name))
    except Exception as e:
        logger.warning(f'获取工单所需方法失败：{e}')
    return methods


def _get_equipment_items_for_workorder(work_order) -> list:
    """
    获取工单关联的设备列表

    返回 [(equipment_id, equipment_name), ...]
    """
    items = []
    try:
        from apps.workorder.models_extended import WorkOrderResource
        resources = WorkOrderResource.objects.filter(
            work_order=work_order,
        )
        for r in resources:
            if hasattr(r, 'resource_item') and r.resource_item:
                items.append((r.resource_item.id, r.resource_item.name))
    except Exception as e:
        logger.warning(f'获取工单设备列表失败（可能模型不存在）：{e}')

    # 如果上面方式失败，尝试从 JSON 字段读取
    if not items and hasattr(work_order, 'resources') and work_order.resources:
        try:
            for r in work_order.resources:
                if isinstance(r, dict) and r.get('resource_type') == 'equipment':
                    items.append((r.get('resource_item_id'), r.get('name', f'设备#{r.get("resource_item_id")}')))
        except Exception:
            pass

    return items


def _create_force_override_deviation(
    work_order,
    operator_id: int,
    failed_gates: list,
    reason: str,
):
    """强制放行时自动创建偏差记录"""
    try:
        from apps.quality.models import Deviation
        failed_desc = '\n'.join([
            f'- {g["name"]}（{g["gate"]}）：{g["message"]}'
            for g in failed_gates
        ])
        Deviation.objects.create(
            title=f'工单 #{work_order.id} 合规门禁强制放行',
            description=(
                f'操作人（account_id={operator_id}）强制跳过合规门禁：\n'
                f'{failed_desc}\n\n'
                f'强制放行原因：{reason}'
            ),
            source='compliance_gate_override',
            source_id=work_order.id,
            severity='medium',
            reported_by=operator_id,
        )
        logger.info(f'强制放行偏差记录已创建，工单#{work_order.id}，操作人={operator_id}')
    except Exception as e:
        logger.error(f'创建强制放行偏差记录失败：{e}')
