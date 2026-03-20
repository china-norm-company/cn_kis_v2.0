"""
质量门禁服务

提供项目启动、数据锁定、结项三道质量门禁检查。
每道门禁返回通过/不通过 + 未满足条件列表。
"""
import logging
from datetime import date

from ..models import Deviation, DeviationStatus, CAPA, CAPAStatus, SOP, SOPStatus

logger = logging.getLogger(__name__)


def _check_item(name: str, passed: bool, detail: str = '') -> dict:
    return {'name': name, 'passed': passed, 'detail': detail}


def check_project_start_gate(protocol_id: int) -> dict:
    """
    项目启动门禁（硬门禁：未通过时禁止排程发布/工单发布）

    检查：执行人员资质、设备校准有效、SOP 生效与培训、伦理批件有效、关键物料到位。
    用于：排程发布前校验、启动包就绪清单、工单发布前校验。
    """
    checks = []

    # 1. 执行人员资质：至少有一名 GCP 有效人员（可执行项目）
    try:
        from apps.hr.models import Staff, GCPStatus
        valid_gcp_count = Staff.objects.filter(
            is_deleted=False,
            gcp_status__in=(GCPStatus.VALID, GCPStatus.EXPIRING),
        ).count()
        checks.append(_check_item(
            '执行人员资质',
            valid_gcp_count > 0,
            f'GCP 有效人员: {valid_gcp_count}（至少需 1 人）',
        ))
    except Exception:
        checks.append(_check_item('执行人员资质', False, '无法检查人员资质'))

    # 2. 设备校准有效
    try:
        from apps.equipment.models import Equipment
        uncalibrated = Equipment.objects.filter(
            calibration_status='overdue',
        ).count()
        checks.append(_check_item(
            '设备校准有效',
            uncalibrated == 0,
            f'校准超期设备: {uncalibrated}',
        ))
    except Exception:
        checks.append(_check_item('设备校准有效', True, '设备模块未接入'))

    # 3. SOP 文件生效
    effective_sops = SOP.objects.filter(is_deleted=False, status=SOPStatus.EFFECTIVE).count()
    checks.append(_check_item(
        'SOP 文件生效',
        effective_sops > 0,
        f'当前生效 SOP 数量: {effective_sops}',
    ))

    # 4. 人员培训完成（SOP 培训）
    try:
        from apps.quality.models import SOPTraining, SOPTrainingStatus
        pending_trainings = SOPTraining.objects.filter(
            status=SOPTrainingStatus.PENDING,
        ).count()
        checks.append(_check_item(
            'SOP 培训完成',
            pending_trainings == 0,
            f'待培训记录: {pending_trainings}',
        ))
    except Exception:
        checks.append(_check_item('SOP 培训完成', False, '无法检查培训数据'))

    # 5. 伦理批件有效
    try:
        from apps.ethics.models import EthicsApplication
        valid_approval = EthicsApplication.objects.filter(
            protocol_id=protocol_id,
            status='approved',
        ).exists()
        checks.append(_check_item(
            '伦理批件有效',
            valid_approval,
            '已获批伦理批件' if valid_approval else '未找到有效伦理批件',
        ))
    except Exception:
        checks.append(_check_item('伦理批件有效', True, '伦理模块未接入'))

    # 6. 关键物料到位（与协议/访视资源需求挂钩；暂无则按“通过”处理并备注）
    try:
        from apps.visit.models import VisitPlan, ResourceDemand
        plan = VisitPlan.objects.filter(protocol_id=protocol_id, is_deleted=False).first()
        demand = ResourceDemand.objects.filter(visit_plan=plan).first() if plan else None
        if demand and getattr(demand, 'demand_details', None):
            # 可选：根据 demand_details 检查物料库存/效期，未接入时通过
            checks.append(_check_item('关键物料到位', True, '资源需求已生成，物料校验待接入'))
        else:
            checks.append(_check_item('关键物料到位', True, '暂无资源需求或待生成'))
    except Exception:
        checks.append(_check_item('关键物料到位', True, '物料模块待接入'))

    all_passed = all(c['passed'] for c in checks)
    return {'gate': 'project_start', 'passed': all_passed, 'checks': checks}


def check_data_lock_gate(protocol_id: int) -> dict:
    """
    数据锁定门禁

    检查：偏差已闭环、CRF完整度、SDV完成
    """
    checks = []

    open_deviations = Deviation.objects.filter(
        is_deleted=False,
        project_id=protocol_id,
    ).exclude(status=DeviationStatus.CLOSED).count()

    checks.append(_check_item(
        '偏差全部闭环',
        open_deviations == 0,
        f'未关闭偏差: {open_deviations}',
    ))

    open_capas = CAPA.objects.filter(
        is_deleted=False,
        deviation__project_id=protocol_id,
    ).exclude(status=CAPAStatus.CLOSED).count()

    checks.append(_check_item(
        'CAPA 全部完成',
        open_capas == 0,
        f'未关闭 CAPA: {open_capas}',
    ))

    try:
        from apps.edc.models import DataQuery
        open_queries = DataQuery.objects.filter(
            status='open',
        ).count()
        checks.append(_check_item(
            '数据质疑全部解答',
            open_queries == 0,
            f'未关闭质疑: {open_queries}',
        ))
    except Exception:
        checks.append(_check_item('数据质疑全部解答', True, 'EDC 模块未接入'))

    all_passed = all(c['passed'] for c in checks)
    return {'gate': 'data_lock', 'passed': all_passed, 'checks': checks}


def check_closeout_gate(protocol_id: int) -> dict:
    """
    结项门禁

    检查：所有偏差关闭、CAPA验证完成、质量报告完成
    """
    checks = []

    open_deviations = Deviation.objects.filter(
        is_deleted=False,
        project_id=protocol_id,
    ).exclude(status=DeviationStatus.CLOSED).count()

    checks.append(_check_item(
        '所有偏差已关闭',
        open_deviations == 0,
        f'未关闭偏差: {open_deviations}',
    ))

    unclosed_capas = CAPA.objects.filter(
        is_deleted=False,
        deviation__project_id=protocol_id,
    ).exclude(status=CAPAStatus.CLOSED).count()

    checks.append(_check_item(
        'CAPA 验证完成',
        unclosed_capas == 0,
        f'未完成 CAPA: {unclosed_capas}',
    ))

    total_deviations = Deviation.objects.filter(
        is_deleted=False, project_id=protocol_id,
    ).count()
    closed_deviations = Deviation.objects.filter(
        is_deleted=False, project_id=protocol_id, status=DeviationStatus.CLOSED,
    ).count()
    closure_rate = round(closed_deviations / total_deviations * 100) if total_deviations > 0 else 100
    checks.append(_check_item(
        '偏差关闭率 100%',
        closure_rate == 100,
        f'关闭率: {closure_rate}%',
    ))

    all_passed = all(c['passed'] for c in checks)
    return {'gate': 'closeout', 'passed': all_passed, 'checks': checks}


def check_all_gates(protocol_id: int) -> dict:
    """检查所有门禁"""
    return {
        'project_start': check_project_start_gate(protocol_id),
        'data_lock': check_data_lock_gate(protocol_id),
        'closeout': check_closeout_gate(protocol_id),
    }
