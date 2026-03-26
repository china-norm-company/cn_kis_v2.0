"""
跨工作台质量事件关联服务

处理其他工作台（设备、设施、物料等）触发的质量偏差自动创建。
"""
import logging
from datetime import date

from ..models import Deviation, DeviationStatus

logger = logging.getLogger(__name__)

DEVIATION_SOURCES = {
    'internal_audit': '内审发现',
    'external_audit': '外审发现',
    'inspection': '巡查发现',
    'self_report': '自主报告',
    'customer_complaint': '客户投诉',
    'equipment_ooc': '设备OOC',
    'environment_excursion': '环境超标',
    'material_expiry': '物料超期',
    'audit_finding': '审计发现',
}


def create_deviation_from_source(
    source: str,
    source_workstation: str,
    source_record_id: str,
    title: str,
    description: str = '',
    severity: str = 'major',
    reporter: str = '系统自动',
    project: str = '',
    project_id: int = None,
) -> Deviation:
    """
    从外部来源创建偏差记录。
    """
    code = f'DEV-{source_workstation.upper()}-{source_record_id}'
    source_label = DEVIATION_SOURCES.get(source, source)

    dev = Deviation.objects.create(
        code=code,
        title=f'[{source_label}] {title}',
        category=source_label,
        severity=severity,
        status=DeviationStatus.IDENTIFIED,
        reporter=reporter,
        reported_at=date.today(),
        project=project,
        project_id=project_id,
        description=description,
        source=source,
        source_workstation=source_workstation,
        source_record_id=str(source_record_id),
    )

    try:
        from libs.feishu_message import send_quality_notification
        send_quality_notification(
            title=f'跨台偏差自动创建: {code}',
            content=f'来源: {source_label}\n描述: {title}\n严重度: {severity}',
        )
    except Exception as e:
        logger.warning(f'Failed to send notification for cross-ws deviation: {e}')

    logger.info(f'Created deviation {code} from {source_workstation}/{source_record_id}')
    return dev


def create_deviation_from_equipment_ooc(
    equipment_code: str,
    equipment_name: str,
    ooc_detail: str,
    record_id: str,
    project: str = '',
):
    return create_deviation_from_source(
        source='equipment_ooc',
        source_workstation='equipment',
        source_record_id=record_id,
        title=f'设备 {equipment_code}({equipment_name}) OOC',
        description=ooc_detail,
        severity='major',
        project=project,
    )


def create_deviation_from_environment(
    facility_name: str,
    parameter: str,
    actual_value: str,
    limit_value: str,
    record_id: str,
    project: str = '',
):
    return create_deviation_from_source(
        source='environment_excursion',
        source_workstation='facility',
        source_record_id=record_id,
        title=f'环境超标: {facility_name} {parameter}',
        description=f'参数: {parameter}\n实际值: {actual_value}\n限值: {limit_value}',
        severity='major',
        project=project,
    )


def create_deviation_from_material_expiry(
    material_code: str,
    material_name: str,
    expiry_date: str,
    record_id: str,
    project: str = '',
):
    return create_deviation_from_source(
        source='material_expiry',
        source_workstation='material',
        source_record_id=record_id,
        title=f'物料超期: {material_code}({material_name})',
        description=f'有效期: {expiry_date}',
        severity='minor',
        project=project,
    )


def create_deviation_from_dispensing_issue(
    dispensing_no: str,
    subject_code: str,
    visit_code: str,
    issue_description: str,
    severity: str = 'major',
    reporter: str = '系统自动',
    project: str = '',
    project_id: int = None,
):
    """
    样品发放过程中出现问题时自动创建偏差。
    典型场景：发放超期样品、发放数量异常、重复发放被拦截后需记录偏差。
    """
    return create_deviation_from_source(
        source='self_report',
        source_workstation='material',
        source_record_id=dispensing_no,
        title=f'样品发放异常: {subject_code} {visit_code}',
        description=issue_description,
        severity=severity,
        reporter=reporter,
        project=project,
        project_id=project_id,
    )
