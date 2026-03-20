"""
技术评估人员 API

端点（挂载到 /evaluator/）：

工作面板：
- GET  /my-dashboard            今日工单 + 等候队列 + 环境/仪器状态
- GET  /my-workorders           我的工单列表
- GET  /my-schedule             我的排程

工单执行流：
- POST /workorders/{id}/accept   接受工单
- POST /workorders/{id}/reject   拒绝工单
- POST /workorders/{id}/prepare  完成执行前准备
- POST /workorders/{id}/pause    暂停执行
- POST /workorders/{id}/resume   恢复执行

分步执行：
- POST /workorders/{id}/steps/init   从检测方法模板初始化步骤
- GET  /workorders/{id}/steps        获取步骤列表
- POST /steps/{step_id}/start        开始步骤
- POST /steps/{step_id}/complete     完成步骤
- POST /steps/{step_id}/skip         跳过步骤

仪器检测：
- POST /workorders/{id}/detections       创建检测任务
- POST /detections/{detection_id}/start   开始检测
- POST /detections/{detection_id}/complete 完成检测

异常上报：
- POST /workorders/{id}/exceptions   上报异常
- GET  /workorders/{id}/exceptions   获取异常列表

个人成长：
- GET  /my-profile               我的资质/培训/绩效
"""
import os
import subprocess
import sys
import time
from ninja import Router, Schema, Query, File
from ninja.files import UploadedFile
from typing import Optional, List, Any
from datetime import date
from django.conf import settings
from django.db import connections

from apps.identity.decorators import _get_account_from_request, require_permission

router = Router()


# ============================================================================
# Schema 定义
# ============================================================================
class RejectIn(Schema):
    reason: str


class PrepareIn(Schema):
    checklist_items: Optional[List[dict]] = None


class PauseIn(Schema):
    reason: str


class StepCompleteIn(Schema):
    execution_data: Optional[dict] = None
    result: Optional[str] = ''


class StepSkipIn(Schema):
    reason: str


class DetectionCreateIn(Schema):
    equipment_id: Optional[int] = None
    detection_name: str
    detection_method: Optional[str] = ''


class DetectionCompleteIn(Schema):
    raw_data: Optional[dict] = None
    processed_data: Optional[dict] = None
    result_values: Optional[dict] = None
    data_file_path: Optional[str] = ''
    qc_passed: Optional[bool] = None
    qc_notes: Optional[str] = ''


class DetectionStartIn(Schema):
    """开始检测（F2 环境快照参数）"""
    force: bool = False  # 环境不合规时强制放行
    deviation_reason: Optional[str] = ''  # 强制放行时必填
    manual_env: Optional[dict] = None  # 无传感器时手动录入环境


class DetectionUpdateIn(Schema):
    """修改已完成检测的数据（F1 数据变更留痕：必须提供修改原因）"""
    raw_data: Optional[dict] = None
    processed_data: Optional[dict] = None
    result_values: Optional[dict] = None
    qc_passed: Optional[bool] = None
    qc_notes: Optional[str] = None
    change_reason: str  # 必填，不可省略


class DetectionVoidIn(Schema):
    """作废检测记录（F1 数据变更留痕：软删除，保留原始数据）"""
    reason: str  # 必填


class InstrumentReadingsUploadIn(Schema):
    """SADC 保存后触发，由 KIS 上传到 instrument_readings 表"""
    records: List[Any] = []  # 每项为一条 instrument_readings 行（字段见 INSTRUMENT_READINGS_UPLOAD_SPEC）
    created_by: Optional[int] = None


class InstrumentReadingsFromUIIn(Schema):
    """从 KIS 前端 UI 提交的仪器数据（由极简抓取服务抓取）"""
    header: List[str] = []
    rows: List[List[str]] = []
    meta: Optional[dict] = None


class AuditLogQueryIn(Schema):
    page: int = 1
    page_size: int = 50


class ExceptionReportIn(Schema):
    exception_type: str
    severity: Optional[str] = 'medium'
    description: str
    impact_analysis: Optional[str] = ''


class WorkOrderQueryIn(Schema):
    status: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ScheduleQueryIn(Schema):
    week_offset: int = 0  # 兼容，优先用 month_offset
    month_offset: Optional[int] = None  # 0=本月，1=下月，-1=上月


# ============================================================================
# 工作面板
# ============================================================================
@router.get('/my-dashboard')
@require_permission('evaluator.dashboard.read')
def my_dashboard(request):
    """技术评估人员工作面板 - 今日工单、等候队列、环境/仪器状态"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import get_evaluator_dashboard
    data = get_evaluator_dashboard(account.id)
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/my-workorders')
@require_permission('evaluator.workorder.read')
def my_workorders(request, params: Query[WorkOrderQueryIn]):
    """我的工单列表（支持日期、状态筛选）"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import get_my_workorders
    data = get_my_workorders(
        account_id=account.id,
        status=params.status,
        date_from=params.date_from,
        date_to=params.date_to,
        page=params.page,
        page_size=params.page_size,
    )
    return {'code': 0, 'msg': 'ok', 'data': data}


@router.get('/my-schedule')
@require_permission('evaluator.schedule.read')
def my_schedule(request, params: Query[ScheduleQueryIn]):
    """我的排程（支持按周或按月，默认按月）"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import get_my_schedule, get_my_schedule_month
    if params.month_offset is not None:
        data = get_my_schedule_month(account.id, month_offset=params.month_offset)
    else:
        data = get_my_schedule(account.id, week_offset=params.week_offset)
    return {'code': 0, 'msg': 'ok', 'data': data}


class ScheduleByPersonQueryIn(Schema):
    person_name: str = ''
    week_offset: int = 0
    month_offset: int = 0


@router.get('/schedule/by-person')
@require_permission('evaluator.schedule.read')
def schedule_by_person(request, params: Query[ScheduleByPersonQueryIn]):
    """按姓名查看排程（维周同步后可按人查看）。暂未实现按人过滤，返回当前用户排程。"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import get_my_schedule_month
    data = get_my_schedule_month(account.id, month_offset=params.month_offset)
    return {'code': 0, 'msg': 'ok', 'data': data}


class ScheduleImportNotesIn(Schema):
    """Excel 导入排程备注"""
    rows: List[dict]
    person_name: Optional[str] = None
    replace_existing: Optional[bool] = True


@router.post('/schedule/import-notes')
@require_permission('evaluator.schedule.read')
def import_schedule_notes_endpoint(request, payload: ScheduleImportNotesIn):
    """批量导入排程备注（Excel 解析后的 JSON）"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import import_schedule_notes
    result = import_schedule_notes(
        account.id,
        payload.rows,
        payload.person_name or '',
        bool(payload.replace_existing if payload.replace_existing is not None else True),
    )
    return {'code': 0, 'msg': f'成功导入 {result["created"]} 条', 'data': result}


@router.post('/schedule/upload-attachment')
@require_permission('evaluator.schedule.read')
def upload_schedule_attachment(request, file: File[UploadedFile], schedule_date: Optional[str] = Query(None)):
    """上传排程图片附件（支持 jpg/png/webp/gif，单文件 < 5MB）"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import save_schedule_attachment
    result = save_schedule_attachment(account.id, file, schedule_date)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '上传成功', 'data': result}


@router.get('/schedule/warmup-ocr')
@require_permission('evaluator.schedule.read')
def warmup_ocr_endpoint(request):
    """
    预热 OCR 模型，弹窗打开时调用可减少首次识别的等待时间。
    返回 ready=true 表示 EasyOCR 已加载就绪。
    """
    try:
        from .ocr_schedule import _get_reader
        r = _get_reader()
        return {'code': 0, 'msg': 'OCR 已就绪' if r else 'OCR 不可用', 'data': {'ready': r is not None}}
    except Exception as e:
        return {'code': 0, 'msg': str(e)[:100], 'data': {'ready': False}}


@router.post('/schedule/analyze-image')
@require_permission('evaluator.schedule.read')
def analyze_schedule_image_endpoint(
    request,
    file: File[UploadedFile],
    person_name: Optional[str] = Query(None),
):
    """
    识别排程图片内容：提取与指定人员（如林紫倩）相关的工作日期、设备、项目编号，
    并自动创建排程备注显示在日历上。
    """
    account = _get_account_from_request(request)

    try:
        from .services.evaluator_service import analyze_schedule_image
        result = analyze_schedule_image(account.id, file, person_name or '')
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception('analyze_schedule_image error')
        return {'code': 500, 'msg': f'识别处理异常: {str(e)[:200]}', 'data': {'created': 0, 'items': [], 'error': str(e)}}
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': result}
    return {'code': 0, 'msg': f'成功识别并导入 {result["created"]} 条排程', 'data': result}


@router.delete('/schedule/note/{note_id}')
@require_permission('evaluator.schedule.read')
def delete_schedule_note_endpoint(request, note_id: int):
    """删除排程备注（图片识别导入的参考项）"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import delete_schedule_note
    result = delete_schedule_note(account.id, note_id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '已删除', 'data': result}


@router.delete('/schedule/notes')
@require_permission('evaluator.schedule.read')
def delete_all_schedule_notes_endpoint(request):
    """清空当前账号下所有图片识别记录，便于重新识别"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import delete_all_schedule_notes
    result = delete_all_schedule_notes(account.id)
    return {'code': 0, 'msg': f'已清空 {result.get("deleted", 0)} 条识别记录', 'data': result}


# ============================================================================
# 工单执行流
# ============================================================================
@router.post('/workorders/{work_order_id}/accept')
@require_permission('evaluator.workorder.execute')
def accept_workorder(request, work_order_id: int):
    """接受工单"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import accept_work_order
    result = accept_work_order(work_order_id, account.id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '工单已接受', 'data': result}


@router.post('/workorders/{work_order_id}/reject')
@require_permission('evaluator.workorder.execute')
def reject_workorder(request, work_order_id: int, payload: RejectIn):
    """拒绝工单"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import reject_work_order
    result = reject_work_order(work_order_id, account.id, payload.reason)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '工单已拒绝', 'data': result}


@router.post('/workorders/{work_order_id}/prepare')
@require_permission('evaluator.workorder.execute')
def prepare_workorder(request, work_order_id: int, payload: PrepareIn):
    """完成执行前准备"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import complete_preparation
    result = complete_preparation(work_order_id, account.id, payload.checklist_items)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '准备完成', 'data': result}


@router.post('/workorders/{work_order_id}/pause')
@require_permission('evaluator.workorder.execute')
def pause_workorder(request, work_order_id: int, payload: PauseIn):
    """暂停工单执行"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import pause_work_order
    result = pause_work_order(work_order_id, account.id, payload.reason)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '工单已暂停', 'data': result}


@router.post('/workorders/{work_order_id}/resume')
@require_permission('evaluator.workorder.execute')
def resume_workorder(request, work_order_id: int):
    """恢复工单执行"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import resume_work_order
    result = resume_work_order(work_order_id, account.id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '工单已恢复', 'data': result}


# ============================================================================
# 分步执行
# ============================================================================
@router.post('/workorders/{work_order_id}/steps/init')
@require_permission('evaluator.step.execute')
def init_steps(request, work_order_id: int):
    """从检测方法模板初始化步骤"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import init_steps_from_method
    result = init_steps_from_method(work_order_id, account.id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '步骤已初始化', 'data': result}


@router.get('/workorders/{work_order_id}/steps')
@require_permission('evaluator.step.read')
def list_steps(request, work_order_id: int):
    """获取工单步骤列表"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import get_steps
    steps = get_steps(work_order_id)
    return {'code': 0, 'msg': 'ok', 'data': {'items': steps, 'total': len(steps)}}


@router.post('/steps/{step_id}/start')
@require_permission('evaluator.step.execute')
def start_step(request, step_id: int):
    """开始执行步骤"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import start_step as _start_step
    result = _start_step(step_id, account.id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '步骤已开始', 'data': result}


@router.post('/steps/{step_id}/complete')
@require_permission('evaluator.step.execute')
def complete_step(request, step_id: int, payload: StepCompleteIn):
    """完成步骤"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import complete_step as _complete_step
    result = _complete_step(step_id, account.id, payload.execution_data, payload.result)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '步骤已完成', 'data': result}


@router.post('/steps/{step_id}/skip')
@require_permission('evaluator.step.execute')
def skip_step(request, step_id: int, payload: StepSkipIn):
    """跳过步骤（需填写原因）"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import skip_step as _skip_step
    result = _skip_step(step_id, account.id, payload.reason)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '步骤已跳过', 'data': result}


# ============================================================================
# 仪器检测
# ============================================================================
@router.post('/workorders/{work_order_id}/detections')
@require_permission('evaluator.detection.create')
def create_detection(request, work_order_id: int, payload: DetectionCreateIn):
    """创建仪器检测任务"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import create_instrument_detection
    data = payload.dict()
    data['operated_by'] = account.id
    result = create_instrument_detection(work_order_id, data)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '检测任务已创建', 'data': result}


@router.post('/detections/{detection_id}/start')
@require_permission('evaluator.detection.execute')
def start_detection_endpoint(request, detection_id: int, payload: DetectionStartIn = None):
    """开始仪器检测（F2 自动快照环境，F3 自动快照操作人资质）"""
    account = _get_account_from_request(request)

    extra_params = {}
    if payload:
        extra_params = {
            'force': payload.force,
            'deviation_reason': payload.deviation_reason or '',
            'manual_env': payload.manual_env,
        }

    from .services.evaluator_service import start_detection
    result = start_detection(detection_id, account.id, extra_params=extra_params)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': result}
    return {'code': 0, 'msg': '检测已开始', 'data': result}


@router.post('/detections/{detection_id}/complete')
@require_permission('evaluator.detection.execute')
def complete_detection_endpoint(request, detection_id: int, payload: DetectionCompleteIn):
    """完成仪器检测"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import complete_detection
    result = complete_detection(detection_id, payload.dict(), account.id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '检测已完成', 'data': result}


# ============================================================================
# 异常上报
# ============================================================================
@router.post('/workorders/{work_order_id}/exceptions')
@require_permission('evaluator.exception.create')
def report_exception_endpoint(request, work_order_id: int, payload: ExceptionReportIn):
    """上报工单异常"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import report_exception
    result = report_exception(work_order_id, account.id, payload.dict())
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '异常已上报', 'data': result}


@router.get('/workorders/{work_order_id}/exceptions')
@require_permission('evaluator.exception.read')
def list_exceptions(request, work_order_id: int):
    """获取工单异常列表"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import get_exceptions
    items = get_exceptions(work_order_id)
    return {'code': 0, 'msg': 'ok', 'data': {'items': items, 'total': len(items)}}


# ============================================================================
# F4: 合规阻断链 — 预检接口
# ============================================================================
class ComplianceCheckIn(Schema):
    """合规预检参数"""
    force: bool = False
    force_reason: Optional[str] = ''


@router.get('/workorders/{work_order_id}/compliance-check')
@require_permission('evaluator.workorder.read')
def compliance_check(request, work_order_id: int):
    """
    获取工单的合规预检结果（不修改任何数据，只读）

    前端可在进入执行页时调用此接口，展示各 Gate 的校验状态
    """
    account = _get_account_from_request(request)

    from .services.compliance_gate_service import check_all_gates
    result = check_all_gates(work_order_id=work_order_id, operator_id=account.id)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': 'ok', 'data': result}


@router.post('/workorders/{work_order_id}/compliance-check')
@require_permission('evaluator.workorder.read')
def compliance_check_with_force(request, work_order_id: int, payload: ComplianceCheckIn):
    """
    执行合规预检并可选择强制放行（会创建偏差记录）

    force=true 需要主管权限（通过权限系统控制）
    """
    account = _get_account_from_request(request)

    from .services.compliance_gate_service import check_all_gates
    result = check_all_gates(
        work_order_id=work_order_id,
        operator_id=account.id,
        force=payload.force,
        force_reason=payload.force_reason or '',
    )
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': result}
    return {'code': 0, 'msg': 'ok', 'data': result}


# ============================================================================
# F7: 仪器数据自动采集 — 数据注入接口
# ============================================================================
class InstrumentIngestIn(Schema):
    """仪器文件解析结果推送（来自 Windows 端 instrument-agent）"""
    records: List[dict]
    source_file: Optional[str] = ''
    data_source: Optional[str] = 'instrument_import'


@router.post('/instrument-data/ingest')
@require_permission('evaluator.detection.execute')
def instrument_data_ingest(request, payload: InstrumentIngestIn):
    """
    接受来自 Windows 端 instrument-agent 的仪器数据推送

    Agent 解析仪器文件后，通过此接口创建 InstrumentDetection 记录。

    验收标准：
    1. 创建 InstrumentDetection，data_source='instrument_import'
    2. raw_data 包含完整原始字段
    3. 返回创建的记录 ID 列表
    """
    account = _get_account_from_request(request)

    from .services.evaluator_service import ingest_instrument_data
    result = ingest_instrument_data(
        records=payload.records,
        source_file=payload.source_file or '',
        data_source=payload.data_source or 'instrument_import',
        operator_id=account.id,
    )
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': f'成功注入 {len(result.get("created_ids", []))} 条检测记录', 'data': result}


# ============================================================================
# 个人成长
# ============================================================================
@router.get('/my-profile')
@require_permission('evaluator.profile.read')
def my_profile(request):
    """我的资质/培训/绩效"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import get_evaluator_profile
    data = get_evaluator_profile(account.id)
    return {'code': 0, 'msg': 'ok', 'data': data}


# ============================================================================
# F1: 数据变更留痕 — 修改/作废/审计日志
# ============================================================================
@router.patch('/detections/{detection_id}')
@require_permission('evaluator.detection.execute')
def update_detection(request, detection_id: int, payload: DetectionUpdateIn):
    """修改已完成检测的数据（必须提供修改原因，写入变更日志）"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import update_detection_data
    result = update_detection_data(detection_id, account.id, payload.dict())
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '检测数据已修改', 'data': result}


@router.post('/detections/{detection_id}/void')
@require_permission('evaluator.detection.execute')
def void_detection(request, detection_id: int, payload: DetectionVoidIn):
    """作废检测记录（软删除，原始数据保留不变）"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import void_detection as _void
    result = _void(detection_id, account.id, payload.reason)
    if 'error' in result:
        return {'code': 400, 'msg': result['error'], 'data': None}
    return {'code': 0, 'msg': '检测记录已作废', 'data': result}


@router.get('/detections/{detection_id}/audit-log')
@require_permission('evaluator.detection.read')
def detection_audit_log(request, detection_id: int, params: Query[AuditLogQueryIn]):
    """查询检测记录的变更历史日志"""
    account = _get_account_from_request(request)

    from .services.evaluator_service import get_detection_audit_log
    data = get_detection_audit_log(detection_id, page=params.page, page_size=params.page_size)
    return {'code': 0, 'msg': 'ok', 'data': data}


# ============================================================================
# F5: 检测 → eCRF 自动映射 — 预览接口
# ============================================================================
@router.get('/detections/{detection_id}/crf-preview')
@require_permission('evaluator.detection.read')
def detection_crf_preview(request, detection_id: int):
    """
    预览检测数据将被映射到哪些 CRF 字段（只读，不创建记录）

    前端可在检测完成后展示"将同步到 eCRF 的字段"
    """
    account = _get_account_from_request(request)

    from apps.edc.services.crf_auto_fill_service import preview_crf_mapping
    data = preview_crf_mapping(detection_id)
    if 'error' in data:
        return {'code': 400, 'msg': data['error'], 'data': None}
    return {'code': 0, 'msg': 'ok', 'data': data}


# ============================================================================
# 仪器数据上传（SADC 保存后由 KIS 执行，写入 PostgreSQL instrument_readings）
# ============================================================================
def _upload_instrument_readings(records: List[dict], created_by: int = 0) -> tuple[int, Optional[str]]:
    """
    将 records 写入 instrument_upload 库的 instrument_readings 表。
    返回 (成功条数, 错误信息)；若成功则错误为 None。
    """
    if 'instrument_upload' not in settings.DATABASES:
        return 0, '未配置 INSTRUMENT_UPLOAD_DB_HOST，无法上传'
    if not records:
        return 0, None
    cols = [
        'study_code', 'subject_code', 'time_point', 'observation_time', 'probe', 'sn',
        'position_code', 'take_order', 'record_id', 'revision_group_id', 'status_code', 'is_current',
        'revision_action', 'revision_reason', 'revision_time', 'revision_of_id',
        'attribute_name', 'attribute_value', 'created_by',
    ]
    placeholders = ', '.join(['%s'] * len(cols))
    columns = ', '.join(cols)
    sql = f"INSERT INTO instrument_readings ({columns}) VALUES ({placeholders})"
    try:
        conn = connections['instrument_upload']
        with conn.cursor() as cur:
            for r in records:
                observation_time = r.get('observation_time') or ''
                revision_time = r.get('revision_time') or None
                try:
                    attr_val = r.get('attribute_value')
                    if attr_val is not None and attr_val != '':
                        attr_val = float(attr_val)
                    else:
                        attr_val = None
                except (TypeError, ValueError):
                    attr_val = None
                row = (
                    (r.get('study_code') or '')[:100],
                    (r.get('subject_code') or '')[:100],
                    (r.get('time_point') or '')[:50],
                    observation_time,
                    (r.get('probe') or '')[:100] or None,
                    (r.get('sn') or '')[:100] or None,
                    (r.get('position_code') or '')[:50] or None,
                    int(r.get('take_order') or 0) if r.get('take_order') not in (None, '') else 0,
                    (r.get('record_id') or '')[:100],
                    (r.get('revision_group_id') or '')[:100] or None,
                    (r.get('status_code') or 'ACTIVE')[:50],
                    1 if str(r.get('is_current') or '1').strip() == '1' else 0,
                    (r.get('revision_action') or '')[:50] or None,
                    (r.get('revision_reason') or '')[:255] or None,
                    revision_time,
                    (r.get('revision_of_id') or '')[:100] or None,
                    (r.get('attribute_name') or '')[:100] or None,
                    attr_val,
                    int(r.get('created_by', created_by)) if r.get('created_by') not in (None, '') else created_by,
                )
                cur.execute(sql, row)
        return len(records), None
    except Exception as e:
        return 0, str(e)


@router.post('/instrument-readings/upload-from-ui')
@require_permission('evaluator.workorder.read')
def instrument_readings_upload_from_ui(request, payload: InstrumentReadingsFromUIIn):
    """
    从 KIS 前端 UI 上传仪器数据（由极简抓取服务抓取后提交）。
    将 header + rows 格式转换为 instrument_readings 格式并上传。
    """
    import uuid
    from datetime import datetime
    
    account = _get_account_from_request(request)
    if not account:
        return {'code': 403, 'msg': '未认证', 'data': {'uploaded': 0}}
    
    header = payload.header or []
    rows = payload.rows or []
    meta = payload.meta or {}
    
    if not header or not rows:
        return {'code': 400, 'msg': '缺少数据', 'data': {'uploaded': 0}}
    
    col_map = {h: i for i, h in enumerate(header)}
    
    def get_col(row: list, col_name: str, default: str = '') -> str:
        idx = col_map.get(col_name, -1)
        if idx >= 0 and idx < len(row):
            return row[idx] or default
        return default
    
    records = []
    terminal_id = getattr(settings, 'SADC_TERMINAL_ID', '') or 'KIS'
    
    for row_idx, row in enumerate(rows):
        record_id = f"REC-{terminal_id}-{uuid.uuid4().hex[:8].upper()}"
        
        observation_time = get_col(row, 'Time & Date Session') or get_col(row, 'DateTime')
        if not observation_time:
            observation_time = datetime.now().isoformat()
        
        attr_name = get_col(row, 'attribute_name')
        attr_value = get_col(row, 'attribute_value')
        
        if not attr_name and 'Measurement' in col_map:
            attr_name = get_col(row, 'Measurement')
        if not attr_value and 'Value' in col_map:
            attr_value = get_col(row, 'Value')
        
        rec = {
            'study_code': meta.get('study') or get_col(row, 'Study'),
            'subject_code': meta.get('subject') or get_col(row, 'Subject'),
            'time_point': meta.get('timePoint') or get_col(row, 'T'),
            'observation_time': observation_time,
            'probe': get_col(row, 'Probe'),
            'sn': get_col(row, 'Probe SN') or get_col(row, 'sn'),
            'position_code': meta.get('position') or get_col(row, 'Tags') or get_col(row, 'Position'),
            'take_order': row_idx,
            'record_id': record_id,
            'revision_group_id': record_id,
            'status_code': 'ACTIVE',
            'is_current': 1,
            'attribute_name': attr_name,
            'attribute_value': attr_value,
            'created_by': account.id,
        }
        records.append(rec)
    
    n, err = _upload_instrument_readings(records, created_by=account.id)
    if err:
        return {'code': 500, 'msg': f'上传失败：{err}', 'data': {'uploaded': 0}}
    return {'code': 0, 'msg': 'ok', 'data': {'uploaded': n}}


@router.post('/instrument-readings/upload')
def instrument_readings_upload(request, payload: InstrumentReadingsUploadIn):
    """
    SADC 保存本地 CSV 后调用本接口，由 KIS 将数据上传到 PostgreSQL instrument_readings 表。
    认证：请求头 X-Instrument-Upload-Key 与 settings.INSTRUMENT_UPLOAD_API_KEY 一致则放行；否则需 evaluator.workorder.read 权限。
    请求体：{ "records": [ { study_code, subject_code, time_point, observation_time, ... }, ... ], "created_by": 0 }
    """
    api_key = getattr(settings, 'INSTRUMENT_UPLOAD_API_KEY', None)
    header_key = request.headers.get('X-Instrument-Upload-Key') or ''
    if api_key and header_key == api_key:
        created_by = int(payload.created_by) if payload.created_by not in (None, '') else 0
    else:
        account = _get_account_from_request(request)
        if not account:
            return {'code': 403, 'msg': '未认证', 'data': {'uploaded': 0}}
        from apps.identity.authz import get_authz_service
        if not get_authz_service().has_permission(account, 'evaluator.workorder.read'):
            return {'code': 403, 'msg': '无权限', 'data': {'uploaded': 0}}
        created_by = getattr(account, 'id', None) or 0
    records = list(payload.records) if payload.records else []
    created_by = int(created_by) if created_by not in (None, '') else 0
    n, err = _upload_instrument_readings(records, created_by=created_by)
    if err:
        return {'code': 500, 'msg': '上传失败：%s' % err, 'data': {'uploaded': 0}}
    return {'code': 0, 'msg': 'ok', 'data': {'uploaded': n}}


# ============================================================================
# SADC 测量工作台一键启动（仅当 SADC_WORKBENCH_DIR 配置且本机可执行时可用）
# ============================================================================
@router.post('/start-sadc')
@require_permission('evaluator.workorder.read')
def start_sadc(request):
    """
    在配置的 SADC 目录下执行 SADC_START_CMD（默认 python app.py），供「开始测量」或「一键启动 SADC」调用。
    使用 shell=True 以便支持 "py -3.12-32 app.py" 或本机 PATH 下的 python。
    若进程在 3 秒内退出则捕获 stderr 并返回，便于排查未启动原因。
    """
    sadc_dir = getattr(settings, 'SADC_WORKBENCH_DIR', None)
    if not sadc_dir or not os.path.isdir(sadc_dir):
        return {'code': 503, 'msg': '未配置或目录不存在，无法启动 SADC', 'data': None}
    app_py = os.path.join(sadc_dir, 'app.py')
    if not os.path.isfile(app_py):
        return {'code': 503, 'msg': 'SADC 目录下未找到 app.py', 'data': None}
    start_cmd = getattr(settings, 'SADC_START_CMD', 'python app.py') or 'python app.py'
    try:
        env = os.environ.copy()
        # 由 KIS 启动的 SADC 子进程注入上传地址与 Key，保存时可调用本机 KIS 上传接口
        base = (request.build_absolute_uri('/') or 'http://127.0.0.1:8001/').rstrip('/')
        env['KIS_UPLOAD_URL'] = base + '/api/v1/evaluator/instrument-readings/upload'
        api_key = getattr(settings, 'INSTRUMENT_UPLOAD_API_KEY', None) or ''
        if api_key:
            env['KIS_UPLOAD_API_KEY'] = api_key
        terminal_id = getattr(settings, 'SADC_TERMINAL_ID', None) or ''
        if terminal_id:
            env['SADC_TERMINAL_ID'] = terminal_id
        kwargs = {
            'cwd': sadc_dir,
            'shell': True,
            'stdin': subprocess.DEVNULL,
            'stdout': subprocess.PIPE,
            'stderr': subprocess.PIPE,
            'env': env,
        }
        if sys.platform == 'win32':
            kwargs['creationflags'] = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)
        proc = subprocess.Popen(start_cmd, **kwargs)
        # 最多等 3 秒：若进程已退出则视为启动失败并返回 stderr；若仍在运行则视为成功，不结束进程
        for _ in range(30):
            if proc.poll() is not None:
                stderr_bytes = proc.stderr.read() if proc.stderr else b''
                if proc.returncode != 0:
                    err = stderr_bytes.decode('utf-8', errors='replace').strip()
                    return {'code': 500, 'msg': '启动失败（退出码 %s）：%s' % (proc.returncode, (err[:500] or '无输出')), 'data': None}
                break
            time.sleep(0.1)
        return {'code': 0, 'msg': '已发起启动，请稍候几秒再打开测量页', 'data': None}
    except Exception as e:
        return {'code': 500, 'msg': str(e), 'data': None}

