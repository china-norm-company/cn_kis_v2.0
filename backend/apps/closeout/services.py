"""
结项管理服务

封装项目结项、检查清单、复盘、归档的业务逻辑。
"""
import logging
from typing import Optional
from django.db import transaction
from django.utils import timezone

from .models import (
    ProjectCloseout, CloseoutChecklist, ProjectRetrospective,
    ClientAcceptance, CloseoutStatus, ChecklistGroup,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 检查清单模板（18项）
# ============================================================================
CHECKLIST_TEMPLATE = [
    # document_completeness 组（5项）
    (ChecklistGroup.DOCUMENT_COMPLETENESS, 'DOC-001', '协议文件归档', False),
    (ChecklistGroup.DOCUMENT_COMPLETENESS, 'DOC-002', '伦理批件归档', False),
    (ChecklistGroup.DOCUMENT_COMPLETENESS, 'DOC-003', '知情同意书归档', False),
    (ChecklistGroup.DOCUMENT_COMPLETENESS, 'DOC-004', 'CRF模板归档', False),
    (ChecklistGroup.DOCUMENT_COMPLETENESS, 'DOC-005', 'SOP归档', False),
    # data_completeness 组（4项）
    (ChecklistGroup.DATA_COMPLETENESS, 'DAT-001', '所有CRF已锁定', True),
    (ChecklistGroup.DATA_COMPLETENESS, 'DAT-002', '所有工单已关闭', True),
    (ChecklistGroup.DATA_COMPLETENESS, 'DAT-003', '数据库已锁定', False),
    (ChecklistGroup.DATA_COMPLETENESS, 'DAT-004', '统计分析已完成', False),
    # quality_compliance 组（4项）
    (ChecklistGroup.QUALITY_COMPLIANCE, 'QUA-001', '所有偏差已关闭', True),
    (ChecklistGroup.QUALITY_COMPLIANCE, 'QUA-002', '所有CAPA已完成', True),
    (ChecklistGroup.QUALITY_COMPLIANCE, 'QUA-003', '最终报告已生成', False),
    (ChecklistGroup.QUALITY_COMPLIANCE, 'QUA-004', 'SDV完成确认', False),
    # financial_settlement 组（5项）
    (ChecklistGroup.FINANCIAL_SETTLEMENT, 'FIN-001', '所有发票已开具', False),
    (ChecklistGroup.FINANCIAL_SETTLEMENT, 'FIN-002', '所有回款已确认', False),
    (ChecklistGroup.FINANCIAL_SETTLEMENT, 'FIN-003', '成本核算已完成', False),
    (ChecklistGroup.FINANCIAL_SETTLEMENT, 'FIN-004', '合同结算确认', False),
    (ChecklistGroup.FINANCIAL_SETTLEMENT, 'FIN-005', '客户验收签收', False),
]


# ============================================================================
# 结项管理
# ============================================================================
@transaction.atomic
def initiate_closeout(protocol_id: int, initiated_by_id: int = None) -> ProjectCloseout:
    """
    发起结项，自动生成18项检查清单
    """
    closeout = ProjectCloseout.objects.create(
        protocol_id=protocol_id,
        initiated_by_id=initiated_by_id,
        status=CloseoutStatus.INITIATED,
    )

    checklist_items = []
    for group, code, desc, is_auto in CHECKLIST_TEMPLATE:
        checklist_items.append(CloseoutChecklist(
            closeout=closeout,
            group=group,
            item_code=code,
            item_description=desc,
            is_auto_check=is_auto,
        ))
    CloseoutChecklist.objects.bulk_create(checklist_items)

    logger.info(f'结项#{closeout.id} 已发起，协议#{protocol_id}，生成{len(checklist_items)}项检查清单')
    return closeout


def auto_check_completeness(closeout_id: int) -> dict:
    """
    自动检查（查工单、CRF、偏差、CAPA状态）

    检查可自动验证的清单项，更新 auto_check_passed 字段。
    """
    closeout = ProjectCloseout.objects.filter(id=closeout_id).first()
    if not closeout:
        return {'checked': 0, 'passed': 0, 'failed': 0}

    protocol_id = closeout.protocol_id
    auto_items = CloseoutChecklist.objects.filter(
        closeout=closeout, is_auto_check=True,
    )

    checked = 0
    passed = 0
    failed = 0

    for item in auto_items:
        result = _run_auto_check(item.item_code, protocol_id)
        item.auto_check_passed = result
        item.save(update_fields=['auto_check_passed', 'update_time'])
        checked += 1
        if result:
            passed += 1
        else:
            failed += 1

    # 更新结项状态为 checking
    if closeout.status == CloseoutStatus.INITIATED:
        closeout.status = CloseoutStatus.CHECKING
        closeout.save(update_fields=['status', 'update_time'])

    logger.info(f'结项#{closeout_id} 自动检查完成: checked={checked}, passed={passed}, failed={failed}')
    return {'checked': checked, 'passed': passed, 'failed': failed}


def _run_auto_check(item_code: str, protocol_id: int) -> bool:
    """
    运行单项自动检查

    根据 item_code 查询相关模块的数据状态。
    """
    try:
        if item_code == 'DAT-001':
            # 所有CRF已锁定 — CRFRecord 通过 work_order → enrollment → protocol 链路关联
            from apps.edc.models import CRFRecord
            from apps.workorder.models import WorkOrder
            from apps.subject.models import Enrollment

            enrollment_ids = Enrollment.objects.filter(
                protocol_id=protocol_id,
            ).values_list('id', flat=True)
            wo_ids = WorkOrder.objects.filter(
                enrollment_id__in=enrollment_ids, is_deleted=False,
            ).values_list('id', flat=True)

            total = CRFRecord.objects.filter(work_order_id__in=wo_ids).count()
            if total == 0:
                return True
            unlocked = CRFRecord.objects.filter(
                work_order_id__in=wo_ids,
            ).exclude(status='locked').count()
            return unlocked == 0

        elif item_code == 'DAT-002':
            # 所有工单已关闭 — WorkOrder 通过 enrollment → protocol 链路关联
            from apps.workorder.models import WorkOrder
            open_orders = WorkOrder.objects.filter(
                enrollment__protocol_id=protocol_id, is_deleted=False,
            ).exclude(status__in=['completed', 'approved', 'cancelled']).count()
            return open_orders == 0

        elif item_code == 'QUA-001':
            # 所有偏差已关闭
            from apps.quality.models import Deviation
            open_deviations = Deviation.objects.filter(
                project_id=protocol_id, is_deleted=False,
            ).exclude(status='closed').count()
            return open_deviations == 0

        elif item_code == 'QUA-002':
            # 所有CAPA已完成
            from apps.quality.models import CAPA, Deviation
            deviation_ids = Deviation.objects.filter(
                project_id=protocol_id, is_deleted=False,
            ).values_list('id', flat=True)
            open_capas = CAPA.objects.filter(
                deviation_id__in=deviation_ids, is_deleted=False,
            ).exclude(status='closed').count()
            return open_capas == 0

    except Exception as e:
        logger.warning(f'自动检查 {item_code} 失败: {e}')
        return False

    return False


@transaction.atomic
def create_retrospective(
    closeout_id: int,
    what_went_well: list = None,
    what_to_improve: list = None,
    action_items: list = None,
    lessons_learned: list = None,
    created_by_id: int = None,
) -> Optional[ProjectRetrospective]:
    """创建项目复盘"""
    closeout = ProjectCloseout.objects.filter(id=closeout_id).first()
    if not closeout:
        return None

    retro = ProjectRetrospective.objects.create(
        closeout=closeout,
        what_went_well=what_went_well or [],
        what_to_improve=what_to_improve or [],
        action_items=action_items or [],
        lessons_learned=lessons_learned or [],
        created_by_id=created_by_id,
    )

    # 更新结项状态为 review
    if closeout.status in (CloseoutStatus.INITIATED, CloseoutStatus.CHECKING):
        closeout.status = CloseoutStatus.REVIEW
        closeout.save(update_fields=['status', 'update_time'])

    logger.info(f'结项#{closeout_id} 复盘已创建: 复盘#{retro.id}')
    return retro


@transaction.atomic
def archive_project(closeout_id: int) -> dict:
    """
    归档项目

    检查清单全部完成后才可执行。
    """
    closeout = ProjectCloseout.objects.filter(id=closeout_id).first()
    if not closeout:
        return {'success': False, 'msg': '结项记录不存在'}

    # 检查清单是否全部完成
    checklists = CloseoutChecklist.objects.filter(closeout=closeout)
    incomplete = []
    for item in checklists:
        if item.is_auto_check:
            if not item.auto_check_passed:
                incomplete.append(item.item_code)
        else:
            if not item.is_manually_confirmed:
                incomplete.append(item.item_code)

    if incomplete:
        return {
            'success': False,
            'msg': f'以下检查项未完成: {", ".join(incomplete)}',
            'incomplete_items': incomplete,
        }

    closeout.status = CloseoutStatus.ARCHIVED
    closeout.archived_at = timezone.now()
    closeout.save(update_fields=['status', 'archived_at', 'update_time'])

    # 同步修改 Protocol 状态为 archived
    try:
        from apps.protocol.models import Protocol
        Protocol.objects.filter(id=closeout.protocol_id).update(status='archived')
        logger.info(f'协议#{closeout.protocol_id} 状态已改为 archived')
    except Exception as e:
        logger.warning(f'协议状态更新失败: {e}')

    logger.info(f'结项#{closeout_id} 已归档')
    return {'success': True, 'msg': '项目已归档'}


# ============================================================================
# 查询
# ============================================================================
def list_closeouts(
    page: int = 1,
    page_size: int = 20,
    status: str = None,
) -> dict:
    """分页查询结项列表"""
    qs = ProjectCloseout.objects.select_related('protocol').all()
    if status:
        qs = qs.filter(status=status)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_closeout(closeout_id: int) -> Optional[dict]:
    """
    获取结项详情，包含检查清单、复盘、验收信息
    """
    closeout = ProjectCloseout.objects.select_related('protocol').filter(
        id=closeout_id,
    ).first()
    if not closeout:
        return None

    checklists = CloseoutChecklist.objects.filter(closeout=closeout).order_by('group', 'item_code')
    retrospectives = ProjectRetrospective.objects.filter(closeout=closeout)
    acceptances = ClientAcceptance.objects.filter(closeout=closeout).select_related('client')

    return {
        'closeout': closeout,
        'checklists': list(checklists),
        'retrospectives': list(retrospectives),
        'acceptances': list(acceptances),
    }
