"""
技术评估人员专用服务

为评估台（衡技）提供业务逻辑支撑：
- 工作面板聚合（今日工单、等候队列、环境状态、仪器状态）
- 工单接受/拒绝/准备/暂停/恢复
- 从检测方法模板初始化执行步骤
- 异常上报
- 个人成长数据
"""
import json
import logging
from typing import Optional
from datetime import date, datetime
from django.utils import timezone
from django.db import transaction, models
from django.db.models import Q

from ..models import WorkOrder, WorkOrderStatus
from ..query_utils import filter_by_assignee
from ..models_execution import (
    ExperimentStep, StepStatus,
    InstrumentDetection, DetectionStatus,
    WorkOrderProgressTracker,
)
from ..models_extended import (
    WorkOrderConfirmation, ConfirmationStatus,
    WorkOrderPreparation, PreparationStatus,
    WorkOrderSuspension,
    WorkOrderException,
)

logger = logging.getLogger(__name__)


# ============================================================================
# 工单归属校验
# ============================================================================
def _verify_ownership(work_order_id: int, account_id: int) -> Optional[dict]:
    """
    校验当前用户是否为工单的负责人。
    返回 None 表示校验通过，返回 dict 表示校验失败（含 error 信息）。
    """
    try:
        wo = WorkOrder.objects.get(id=work_order_id, is_deleted=False)
    except WorkOrder.DoesNotExist:
        return {'error': '工单不存在'}
    if wo.effective_assigned_to != account_id:
        return {'error': '该工单未分配给您'}
    return None


def _verify_step_ownership(step_id: int, account_id: int) -> Optional[dict]:
    """校验步骤所属工单是否分配给当前用户"""
    try:
        step = ExperimentStep.objects.select_related('work_order').get(id=step_id)
    except ExperimentStep.DoesNotExist:
        return {'error': '步骤不存在'}
    if step.work_order.effective_assigned_to != account_id:
        return {'error': '该工单未分配给您'}
    return None


def _verify_detection_ownership(detection_id: int, account_id: int) -> Optional[dict]:
    """校验检测所属工单是否分配给当前用户"""
    try:
        det = InstrumentDetection.objects.select_related('work_order').get(id=detection_id)
    except InstrumentDetection.DoesNotExist:
        return {'error': '检测任务不存在'}
    if det.work_order.effective_assigned_to != account_id:
        return {'error': '该工单未分配给您'}
    return None


# ============================================================================
# 工作面板聚合
# ============================================================================
def get_evaluator_dashboard(account_id: int) -> dict:
    """
    聚合评估员今日工作面板数据

    返回：今日工单统计、工单列表、受试者等候队列、环境/仪器状态
    """
    from apps.workorder.services import get_my_today_work_orders

    today = date.today()

    # 今日工单列表（复用已有服务）
    work_orders = get_my_today_work_orders(account_id)

    # 统计
    stats = {
        'pending': 0,
        'accepted': 0,
        'preparing': 0,
        'in_progress': 0,
        'completed': 0,
        'total': len(work_orders),
    }
    for wo in work_orders:
        st = wo.get('status', '')
        if st in ('pending', 'assigned'):
            stats['pending'] += 1
        elif st == 'in_progress':
            stats['in_progress'] += 1
        elif st in ('completed', 'review', 'approved'):
            stats['completed'] += 1

    # 受试者等候队列
    waiting_subjects = _get_waiting_subjects(today)

    # 环境状态
    environment_status = _get_environment_status()

    # 今日仪器状态
    instrument_status = _get_today_instrument_status(work_orders)

    # 获取评估员实验室角色
    role = _get_evaluator_role(account_id)

    return {
        'date': str(today),
        'role': role,
        'stats': stats,
        'work_orders': work_orders,
        'waiting_subjects': waiting_subjects,
        'environment': environment_status,
        'instruments': instrument_status,
    }


def _get_waiting_subjects(today) -> list:
    """获取今日已签到等候的受试者"""
    try:
        from apps.subject.models import SubjectCheckin
        checkins = SubjectCheckin.objects.filter(
            checkin_date=today,
            status='checked_in',
        ).select_related('subject')[:20]
        return [
            {
                'id': c.subject_id,
                'name': c.subject.name[:1] + '**' if c.subject.name else '',
                'checkin_time': c.checkin_time.isoformat() if c.checkin_time else None,
                'queue_number': getattr(c, 'queue_number', None),
            }
            for c in checkins
        ]
    except Exception:
        return []


def _get_environment_status() -> dict:
    """获取最新环境监控数据"""
    try:
        from apps.resource.models import VenueEnvironmentLog
        latest = VenueEnvironmentLog.objects.order_by('-recorded_at').first()
        if latest:
            return {
                'temperature': float(latest.temperature) if latest.temperature else None,
                'humidity': float(latest.humidity) if latest.humidity else None,
                'recorded_at': latest.recorded_at.isoformat() if latest.recorded_at else None,
                'is_compliant': latest.is_compliant if hasattr(latest, 'is_compliant') else None,
            }
    except Exception:
        pass
    return {'temperature': None, 'humidity': None, 'recorded_at': None, 'is_compliant': None}


def _get_today_instrument_status(work_orders: list) -> list:
    """获取今日工单涉及设备的状态"""
    try:
        from apps.resource.models import ResourceItem
        equipment_ids = set()
        for wo in work_orders:
            resources = wo.get('resources', [])
            for r in resources:
                if r.get('resource_type') == 'equipment' and r.get('resource_item_id'):
                    equipment_ids.add(r['resource_item_id'])

        if not equipment_ids:
            return []

        items = ResourceItem.objects.filter(id__in=equipment_ids)
        return [
            {
                'id': item.id,
                'name': item.name,
                'calibration_status': getattr(item, 'calibration_status', 'unknown'),
                'next_calibration_date': str(item.next_calibration_date) if getattr(item, 'next_calibration_date', None) else None,
            }
            for item in items
        ]
    except Exception:
        return []


def _get_evaluator_role(account_id: int) -> str:
    """获取评估员的实验室角色（instrument_operator / medical_evaluator 等）"""
    try:
        from apps.lab_personnel.models import LabStaffProfile
        profile = LabStaffProfile.objects.filter(
            Q(staff__account_fk_id=account_id) | Q(staff__account_id=account_id),
            is_active=True,
        ).first()
        if profile:
            return profile.lab_role
    except Exception:
        pass
    return 'instrument_operator'


# ============================================================================
# 我的工单列表
# ============================================================================
def get_my_workorders(
    account_id: int,
    status: str = None,
    date_from: str = None,
    date_to: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """获取评估员的工单列表（支持日期和状态筛选）"""
    qs = WorkOrder.objects.filter(
        is_deleted=False,
    )
    qs = filter_by_assignee(qs, account_id)
    if status:
        qs = qs.filter(status=status)
    if date_from:
        qs = qs.filter(scheduled_date__gte=date_from)
    if date_to:
        qs = qs.filter(scheduled_date__lte=date_to)

    qs = qs.order_by('-scheduled_date', '-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size].values(
        'id', 'title', 'description', 'status', 'work_order_type',
        'scheduled_date', 'due_date', 'create_time',
        'enrollment__protocol__title',
    ))
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


# ============================================================================
# 我的排程
# ============================================================================
def get_my_schedule(account_id: int, week_offset: int = 0) -> dict:
    """获取评估员本周/指定周的排程（含工单、导入备注、附件）"""
    from datetime import timedelta
    from ..models_evaluator_schedule import EvaluatorScheduleNote, EvaluatorScheduleAttachment

    today = date.today()
    week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
    week_end = week_start + timedelta(days=6)

    work_orders = filter_by_assignee(WorkOrder.objects.filter(
        is_deleted=False,
        scheduled_date__gte=week_start,
        scheduled_date__lte=week_end,
    ), account_id).order_by('scheduled_date', 'create_time').values(
        'id', 'title', 'status', 'work_order_type',
        'scheduled_date', 'due_date',
        'enrollment__protocol__title',
    )

    # 按天分组
    daily = {}
    for wo in work_orders:
        day_str = str(wo['scheduled_date']) if wo['scheduled_date'] else 'unscheduled'
        daily.setdefault(day_str, []).append(wo)

    # 导入的排程备注（Excel 导入）
    notes_qs = EvaluatorScheduleNote.objects.filter(
        account_id=account_id,
        schedule_date__gte=week_start,
        schedule_date__lte=week_end,
    ).order_by('schedule_date', 'create_time')
    daily_notes = {}
    for n in notes_qs:
        day_str = str(n.schedule_date)
        daily_notes.setdefault(day_str, []).append({
            'id': n.id, 'title': n.title, 'note': n.note,
            'equipment': getattr(n, 'equipment', '') or '',
            'project_no': getattr(n, 'project_no', '') or '',
            'room_no': getattr(n, 'room_no', '') or '',
        })

    # 排程附件（图片）
    attach_qs = EvaluatorScheduleAttachment.objects.filter(
        account_id=account_id,
    ).filter(
        Q(schedule_date__isnull=True) |
        (Q(schedule_date__gte=week_start) & Q(schedule_date__lte=week_end))
    ).order_by('-create_time')
    daily_attachments = {}
    global_attachments = []
    for a in attach_qs:
        item = {'id': a.id, 'file_name': a.file_name, 'file_url': f'/media/{a.file_path}'}
        if a.schedule_date:
            day_str = str(a.schedule_date)
            daily_attachments.setdefault(day_str, []).append(item)
        else:
            global_attachments.append(item)

    # 下周预排
    next_week_start = week_start + timedelta(weeks=1)
    next_week_end = next_week_start + timedelta(days=6)
    next_week_workorder_count = filter_by_assignee(WorkOrder.objects.filter(
        is_deleted=False,
        scheduled_date__gte=next_week_start,
        scheduled_date__lte=next_week_end,
    ), account_id).count()
    this_week_note_count = sum(len(v) for v in daily_notes.values())
    next_week_note_count = EvaluatorScheduleNote.objects.filter(
        account_id=account_id,
        schedule_date__gte=next_week_start,
        schedule_date__lte=next_week_end,
    ).count()

    return {
        'week_start': str(week_start),
        'week_end': str(week_end),
        'daily_schedule': daily,
        'daily_notes': daily_notes,
        'daily_attachments': daily_attachments,
        'global_attachments': global_attachments,
        # 统计口径：优先展示“导入排程记录”数量，若无导入记录则回落到工单数
        'total_this_week': this_week_note_count if this_week_note_count > 0 else sum(len(v) for v in daily.values()),
        'next_week_count': next_week_note_count if next_week_note_count > 0 else next_week_workorder_count,
    }


def get_my_schedule_month(account_id: int, month_offset: int = 0) -> dict:
    """获取评估员指定月份的排程（含工单、备注、附件）"""
    from datetime import timedelta
    from calendar import monthrange
    from ..models_evaluator_schedule import EvaluatorScheduleNote, EvaluatorScheduleAttachment

    today = date.today()
    target_year = today.year
    target_month = today.month + month_offset
    while target_month > 12:
        target_month -= 12
        target_year += 1
    while target_month < 1:
        target_month += 12
        target_year -= 1
    month_start = date(target_year, target_month, 1)
    _, last_day = monthrange(target_year, target_month)
    month_end = date(target_year, target_month, last_day)

    work_orders = filter_by_assignee(WorkOrder.objects.filter(
        is_deleted=False,
        scheduled_date__gte=month_start,
        scheduled_date__lte=month_end,
    ), account_id).order_by('scheduled_date', 'create_time').values(
        'id', 'title', 'status', 'work_order_type',
        'scheduled_date', 'due_date',
        'enrollment__protocol__title',
    )
    daily = {}
    for wo in work_orders:
        day_str = str(wo['scheduled_date']) if wo['scheduled_date'] else 'unscheduled'
        daily.setdefault(day_str, []).append(wo)

    notes_qs = EvaluatorScheduleNote.objects.filter(
        account_id=account_id,
        schedule_date__gte=month_start,
        schedule_date__lte=month_end,
    ).order_by('schedule_date', 'create_time')
    daily_notes = {}
    for n in notes_qs:
        day_str = str(n.schedule_date)
        daily_notes.setdefault(day_str, []).append({
            'id': n.id, 'title': n.title, 'note': n.note,
            'equipment': getattr(n, 'equipment', '') or '',
            'project_no': getattr(n, 'project_no', '') or '',
            'room_no': getattr(n, 'room_no', '') or '',
        })

    attach_qs = EvaluatorScheduleAttachment.objects.filter(
        account_id=account_id,
    ).filter(
        Q(schedule_date__isnull=True) |
        (Q(schedule_date__gte=month_start) & Q(schedule_date__lte=month_end))
    ).order_by('-create_time')
    daily_attachments = {}
    global_attachments = []
    for a in attach_qs:
        item = {'id': a.id, 'file_name': a.file_name, 'file_url': f'/media/{a.file_path}'}
        if a.schedule_date:
            day_str = str(a.schedule_date)
            daily_attachments.setdefault(day_str, []).append(item)
        else:
            global_attachments.append(item)

    next_month = target_month + 1
    next_year = target_year
    if next_month > 12:
        next_month = 1
        next_year += 1
    next_month_start = date(next_year, next_month, 1)
    _, next_last = monthrange(next_year, next_month)
    next_month_end = date(next_year, next_month, next_last)
    next_month_workorder_count = filter_by_assignee(WorkOrder.objects.filter(
        is_deleted=False,
        scheduled_date__gte=next_month_start,
        scheduled_date__lte=next_month_end,
    ), account_id).count()
    this_month_note_count = sum(len(v) for v in daily_notes.values())
    next_month_note_count = EvaluatorScheduleNote.objects.filter(
        account_id=account_id,
        schedule_date__gte=next_month_start,
        schedule_date__lte=next_month_end,
    ).count()

    return {
        'week_start': str(month_start),
        'week_end': str(month_end),
        'month': target_month,
        'year': target_year,
        'daily_schedule': daily,
        'daily_notes': daily_notes,
        'daily_attachments': daily_attachments,
        'global_attachments': global_attachments,
        # 月视图统计：优先展示导入记录数，保持与“所选工作人员排程”一致
        'total_this_week': this_month_note_count if this_month_note_count > 0 else sum(len(v) for v in daily.values()),
        'next_week_count': next_month_note_count if next_month_note_count > 0 else next_month_workorder_count,
    }


def import_schedule_notes(
    account_id: int,
    rows: list,
    person_name: str = '',
    replace_existing: bool = True,
) -> dict:
    """批量导入排程备注（Excel 解析后调用，支持按姓名筛选）"""
    from datetime import datetime
    from ..models_evaluator_schedule import EvaluatorScheduleNote

    def _norm(s: str) -> str:
        return ''.join((s or '').split()).lower()

    def _pick(row: dict, candidates: list[str]) -> str:
        # 先精确命中
        for k in candidates:
            if k in row and row.get(k) is not None and str(row.get(k)).strip():
                return str(row.get(k)).strip()
        # 再模糊命中（列名包含关键字）
        for rk, rv in row.items():
            rks = str(rk or '').strip().lower()
            if not rks:
                continue
            for k in candidates:
                if str(k).strip().lower() in rks:
                    if rv is not None and str(rv).strip():
                        return str(rv).strip()
        return ''

    target_name = (person_name or '').strip()
    target_norm = _norm(target_name)
    created = 0
    errors = []
    if replace_existing:
        EvaluatorScheduleNote.objects.filter(account_id=account_id).delete()
    seen_keys = set()
    for i, row in enumerate(rows):
        try:
            schedule_date = (
                row.get('schedule_date') or row.get('日期') or row.get('date')
                or row.get('排程日期') or row.get('工作日期')
            )
            person = _pick(row, ['人员姓名', '姓名', '人员', '人员/岗位', '岗位人员', 'person_name'])
            equipment = _pick(row, ['设备', '仪器', 'equipment'])[:200]
            project_no = _pick(row, ['项目编号', '项目号', '项目编码', 'project_no'])[:100]
            room_no = _pick(row, ['房间号', '房间', 'room_no'])[:100]
            note = str(row.get('note') or row.get('备注') or row.get('remark') or '').strip()

            # 指定姓名时仅导入该人员行
            if target_norm:
                pn = _norm(person).replace('備', '倩')
                tn = target_norm.replace('備', '倩')
                # Excel 人员列常见格式：A（B）/C，采用包含匹配
                if not pn or tn not in pn:
                    continue

            if not schedule_date:
                errors.append(f'第 {i + 2} 行：日期不能为空')
                continue
            # 解析日期：str / date / datetime / Excel 序列数
            if isinstance(schedule_date, str):
                ds = schedule_date.strip()
                try:
                    schedule_date = datetime.strptime(ds[:10], '%Y-%m-%d').date()
                except Exception:
                    # 兼容 2026/2/27
                    schedule_date = datetime.strptime(ds[:10].replace('/', '-'), '%Y-%m-%d').date()
            elif hasattr(schedule_date, 'date'):
                schedule_date = schedule_date.date()
            elif isinstance(schedule_date, (int, float)):
                from datetime import timedelta
                schedule_date = (datetime(1899, 12, 30) + timedelta(days=int(schedule_date))).date()
            # 至少要有核心字段之一
            if not equipment and not project_no and not room_no:
                continue
            dedup_key = (str(schedule_date), project_no.strip(), equipment.strip(), room_no.strip())
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            title_parts = [
                f'设备:{equipment}' if equipment else '',
                f'项目:{project_no}' if project_no else '',
                f'房间:{room_no}' if room_no else '',
            ]
            title = ' | '.join([x for x in title_parts if x])[:500] or 'Excel导入'
            EvaluatorScheduleNote.objects.create(
                account_id=account_id,
                schedule_date=schedule_date,
                title=title,
                note=note[:5000],
                equipment=equipment,
                project_no=project_no,
                room_no=room_no,
            )
            created += 1
        except Exception as e:
            errors.append(f'第 {i + 2} 行：{str(e)}')
    return {'created': created, 'errors': errors}


def save_schedule_attachment(account_id: int, file_obj, schedule_date_str: str = None) -> dict:
    """保存排程图片附件"""
    from pathlib import Path
    from django.conf import settings
    from ..models_evaluator_schedule import EvaluatorScheduleAttachment

    ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
    MAX_SIZE = 5 * 1024 * 1024  # 5MB
    name = getattr(file_obj, 'name', '') or 'upload'
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXT:
        return {'error': '不支持的文件格式，请上传 jpg/png/webp/gif'}
    size = getattr(file_obj, 'size', 0)
    if size > MAX_SIZE:
        return {'error': '文件大小超过 5MB 限制'}

    rel_dir = Path('evaluator_schedule') / str(account_id)
    abs_dir = Path(settings.MEDIA_ROOT) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    base = int(timezone.now().timestamp() * 1000)
    save_name = f"{base}{ext}"
    abs_path = abs_dir / save_name
    rel_path = str((rel_dir / save_name).as_posix())

    with open(abs_path, 'wb') as f:
        if hasattr(file_obj, 'chunks'):
            for chunk in file_obj.chunks():
                f.write(chunk)
        elif hasattr(file_obj, 'read'):
            f.write(file_obj.read())

    schedule_date = None
    if schedule_date_str:
        try:
            from datetime import datetime
            schedule_date = datetime.strptime(schedule_date_str[:10], '%Y-%m-%d').date()
        except Exception:
            pass

    att = EvaluatorScheduleAttachment.objects.create(
        account_id=account_id,
        schedule_date=schedule_date,
        file_path=rel_path,
        file_name=name[:255],
    )
    return {'id': att.id, 'file_name': att.file_name, 'file_url': f'/media/{rel_path}'}


def _parse_ocr_schedule_with_llm(ocr_text: str, person_name: str) -> Optional[dict]:
    """
    将 OCR 提取的表格文本交由 LLM 解析，得到日期和指定人员的排程列表。
    Returns: {'date': date, 'items': [{'equipment':'','project_no':'','room_no':''}, ...]} or None
    """
    import json
    import re
    from datetime import datetime

    prompt = f"""以下是排程表的 OCR 识别结果（每行格式为「行N：列1 | 列2 | 列3 | ...」）。

请完成：
1. 从内容中提取日期：表头通常有「2026/2/27」「2月27日」等，输出为 YYYY-MM-DD
2. 表格列通常包含：组别、设备编号、设备、项目编号、样本、人员/岗位、房间、组别等
3. 只提取「人员/岗位」列中包含「{person_name}」的行
4. 对每行提取：设备（如探头-Corneometer 1）、项目编号（如 C25021007）、房间（如 D04-2）
5. 必须按 OCR 原文逐字提取，不要猜测或修改。C25021007 与 C26021007 不同，Glossymeter 与 Corneometer 不同
6. 设备名常见形式：Glossymeter、Tewameter、Corneometer 1/2/3、探头-XXX 等，严格按 OCR 识别结果输出，勿替换为相似词

输出格式（仅 JSON，无其他文字）：
{{"date":"YYYY-MM-DD","items":[{{"equipment":"设备原文","project_no":"项目编号原文","room_no":"房间原文"}}]}}

OCR 内容：
---
{ocr_text[:8000]}
---"""

    try:
        from apps.agent_gateway.services import quick_chat
        raw = quick_chat(
            message=prompt,
            system_prompt='你是表格解析专家。根据 OCR 文本解析排程表，只输出指定人员的行。设备、项目编号、房间必须与原文完全一致。',
            temperature=0.1,
            max_tokens=2048,
        )
    except Exception as e:
        logger.warning('_parse_ocr_schedule_with_llm quick_chat failed: %s', e)
        return None

    text = raw.strip()
    if text.startswith('```'):
        text = re.sub(r'^```\w*\n?', '', text)
        text = re.sub(r'\n?```\s*$', '', text)
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r'\{[\s\S]*\}', text)
        if match:
            try:
                obj = json.loads(match.group())
            except json.JSONDecodeError:
                return None
        else:
            return None

    if not isinstance(obj, dict):
        return None
    ds = obj.get('date') or ''
    items = obj.get('items') or []
    if not isinstance(items, list):
        items = []
    try:
        dt = datetime.strptime(ds[:10], '%Y-%m-%d').date() if ds and len(ds) >= 10 else date.today()
    except Exception:
        # 尝试从 OCR 文本中解析日期
        m = re.search(r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})', ocr_text)
        if m:
            try:
                dt = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except Exception:
                dt = date.today()
        else:
            m2 = re.search(r'(\d{1,2})月(\d{1,2})日', ocr_text)
            if m2:
                try:
                    dt = date(2026, int(m2.group(1)), int(m2.group(2)))
                except Exception:
                    dt = date.today()
            else:
                dt = date.today()
    return {'date': dt, 'items': items}


def _save_schedule_notes_from_parsed(
    account_id: int,
    target_name: str,
    observed_date,
    items: list,
) -> dict:
    """将解析结果保存为排程备注"""
    from ..models_evaluator_schedule import EvaluatorScheduleNote

    exclude_projects = {'FSDS0402004'}

    def _norm(s: str) -> str:
        return ''.join((s or '').split()).lower()

    seen_keys = set()
    created = 0
    result_items = []
    for row in items:
        if not isinstance(row, dict):
            continue
        eq = str(row.get('equipment') or row.get('设备') or '')[:200]
        pn = str(row.get('project_no') or row.get('project_number') or row.get('项目编号') or '')[:100]
        rn = str(row.get('room_no') or row.get('room_number') or row.get('房间号') or '')[:100]
        if target_name and pn.strip() in exclude_projects:
            continue
        if not eq.strip() and not pn.strip() and not rn.strip():
            continue
        dedup_key = (str(observed_date), _norm(pn), _norm(eq), _norm(rn))
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)
        title_parts = [p for p in [f'设备:{eq}' if eq else '', f'项目:{pn}' if pn else '', f'房间:{rn}' if rn else ''] if p]
        title = ' | '.join(title_parts) if title_parts else '图片识别'
        EvaluatorScheduleNote.objects.create(
            account_id=account_id,
            schedule_date=observed_date,
            title=title[:500],
            note='',
            equipment=eq,
            project_no=pn,
            room_no=rn,
        )
        created += 1
        result_items.append({'schedule_date': str(observed_date), 'equipment': eq, 'project_no': pn, 'room_no': rn, 'title': title})
    return {'created': created, 'items': result_items}


def analyze_schedule_image(account_id: int, file_obj, person_name: str = '') -> dict:
    """
    识别排程图片中与指定人员相关的工作日期、设备、项目编号，并创建排程备注。

    Args:
        account_id: 评估员账号 ID
        file_obj: 图片文件对象
        person_name: 要筛选的人员姓名（如 林紫倩），为空时使用当前账号 display_name 或提取所有

    Returns:
        {'created': int, 'items': list, 'error': str?}
    """
    try:
        return _analyze_schedule_image_impl(account_id, file_obj, person_name)
    except Exception as e:
        logger.exception('analyze_schedule_image unhandled: %s', e)
        return {'error': f'识别处理异常: {str(e)[:200]}', 'created': 0, 'items': []}


def _analyze_schedule_image_impl(account_id: int, file_obj, person_name: str) -> dict:
    """实际识别逻辑，由 analyze_schedule_image 调用并捕获异常"""
    import base64
    import json
    import re
    from datetime import datetime
    from ..models_evaluator_schedule import EvaluatorScheduleNote

    ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
    MAX_SIZE = 5 * 1024 * 1024  # 5MB
    name = getattr(file_obj, 'name', '') or 'upload'
    ext = __import__('pathlib').Path(name).suffix.lower()
    if ext not in ALLOWED_EXT:
        return {'error': '不支持的文件格式，请上传 jpg/png/webp/gif', 'created': 0, 'items': []}
    size = getattr(file_obj, 'size', 0)
    if size > MAX_SIZE:
        return {'error': '文件大小超过 5MB 限制', 'created': 0, 'items': []}

    if hasattr(file_obj, 'read'):
        raw = file_obj.read()
        data = raw if isinstance(raw, bytes) else b''.join(raw) if raw else b''
    elif hasattr(file_obj, 'chunks'):
        data = b''.join(file_obj.chunks())
    else:
        data = b''
    if not data:
        return {'error': '图片内容为空', 'created': 0, 'items': []}
    b64 = base64.b64encode(data).decode('ascii')
    mime = 'image/jpeg' if ext in ('.jpg', '.jpeg') else 'image/png'

    target_name = (person_name or '').strip()
    if not target_name:
        from apps.identity.models import Account
        acc = Account.objects.filter(id=account_id, is_deleted=False).first()
        target_name = (acc.display_name or acc.username or '').strip() if acc else ''

    # ========== OCR + LLM 结构化解析（可选） ==========
    # 默认关闭，避免 EasyOCR 首次下载模型导致请求长时间阻塞。
    use_ocr = __import__('os').environ.get('USE_SCHEDULE_OCR', '').strip().lower() in ('1', 'true', 'yes')
    ocr_text = ''
    if use_ocr:
        try:
            from ..ocr_schedule import ocr_image_to_table_text
            ocr_text = ocr_image_to_table_text(data) or ''
            if ocr_text and len(ocr_text.strip()) > 50:
                parse_result = _parse_ocr_schedule_with_llm(ocr_text, target_name)
                if parse_result and isinstance(parse_result.get('items'), list) and parse_result.get('items'):
                    return _save_schedule_notes_from_parsed(
                        account_id=account_id,
                        target_name=target_name,
                        observed_date=parse_result['date'],
                        items=parse_result['items'],
                    )
        except Exception as e:
            logger.warning('OCR schedule parse failed, fallback to vision: %s', e)

    # ========== 纯视觉识别（稳定，无本地模型加载） ==========
    stage1_prompt = """请仔细观察这张排程表图片的日期。

任务：找出图片中显示的准确日期。
- 查看表头、标题、页眉，图片上写的是「X月X日」或「X/X/X」或「XXXX年X月X日」
- 逐字辨认：27 与 28 易混淆，必须看准是「2月27日」还是「2月28日」
- 若看到「2月27日」「2/27」「2026/2/27」→ 输出 2026-02-27
- 若看到「2月28日」「2/28」「2026/2/28」→ 输出 2026-02-28
- 若无法确定年份，假设为 2026 年

只输出一个 JSON 对象：
{"date": "YYYY-MM-DD", "read_from": "图片中看到的原文"}"""

    try:
        from apps.agent_gateway.services import quick_vision_chat
        raw1 = quick_vision_chat(
            image_base64=b64,
            prompt=stage1_prompt,
            system_prompt='你是表格图片识别专家。必须根据图片实际内容回答，不要猜测。',
            mime=mime,
            max_tokens=256,
            temperature=0,
        )
    except Exception as e:
        logger.warning('analyze_schedule_image stage1 failed: %s', e)
        return {'error': f'AI 识别失败: {str(e)[:200]}', 'created': 0, 'items': []}

    observed_date = None
    stage1_text = raw1.strip()
    if stage1_text.startswith('```'):
        stage1_text = re.sub(r'^```\w*\n?', '', stage1_text)
        stage1_text = re.sub(r'\n?```\s*$', '', stage1_text)
    try:
        obj = json.loads(stage1_text) if stage1_text else {}
        if isinstance(obj, dict):
            ds = obj.get('date') or obj.get('schedule_date') or ''
            if ds and len(ds) >= 10:
                observed_date = datetime.strptime(ds[:10], '%Y-%m-%d').date()
    except Exception:
        match = re.search(r'(\d{4})-(\d{2})-(\d{2})', stage1_text)
        if match:
            try:
                observed_date = datetime.strptime(match.group(0)[:10], '%Y-%m-%d').date()
            except Exception:
                pass
    if not observed_date:
        observed_date = date.today()  # 兜底

    # 姓名变体（字体/识别易混淆）：倩⇔備 等，用于 prompt 提示模型
    def _get_name_aliases_for_filter(name: str) -> str:
        n = (name or '').strip()
        if not n:
            return '（无）'
        aliases = {n}
        if '倩' in n:
            aliases.add(n.replace('倩', '備'))
        if '備' in n:
            aliases.add(n.replace('備', '倩'))
        return '、'.join(sorted(aliases))

    # ========== 阶段二：先提取全表行，再由后端按姓名精确筛选 ==========
    date_str = str(observed_date)
    name_aliases = _get_name_aliases_for_filter(target_name)
    tn = target_name or '指定人员'
    stage2_prompt = f"""排程表日期：{date_str}。请提取整张表中所有可辨认的业务行。

要求：
1) 每条必须包含人员列原文 person_name（关键）
2) 逐字提取 equipment/project_no/room_no，不要改写
3) 若某字段看不清可留空，但不要猜测
4) 仅输出 JSON 数组，不要解释

输出格式：
[{{"person_name":"人员列原文","equipment":"设备原文","project_no":"项目编号原文","room_no":"房间原文"}}]"""

    try:
        raw2 = quick_vision_chat(
            image_base64=b64,
            prompt=stage2_prompt,
            system_prompt='你是排程表提取专家。每行输出前必须逐字核对「人员/岗位」列=目标人员。切勿凭设备或房间猜测归属。单人通常 3–6 条，若输出过多可能混入他人数据。',
            mime=mime,
            temperature=0,
        )
    except Exception as e:
        logger.warning('analyze_schedule_image stage2 failed: %s', e)
        return {'error': f'AI 识别失败: {str(e)[:200]}', 'created': 0, 'items': []}

    # 解析阶段二输出
    def _parse_json_array(text: str) -> list:
        t = text.strip()
        if t.startswith('```'):
            t = re.sub(r'^```\w*\n?', '', t)
            t = re.sub(r'\n?```\s*$', '', t)
        try:
            out = json.loads(t)
            return out if isinstance(out, list) else ([out] if isinstance(out, dict) else [])
        except json.JSONDecodeError:
            match = re.search(r'\[[\s\S]*?\]', t)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
        return []

    arr_all = _parse_json_array(raw2)

    def _norm_text(s: str) -> str:
        return ''.join((s or '').split()).lower()

    def _is_target_person(person_value: str, target_value: str) -> bool:
        if not target_value:
            return True
        p = _norm_text(person_value)
        t = _norm_text(target_value)
        if not p or not t:
            return False
        if p == t:
            return True
        # 倩/備易混，做最小替换
        p2 = p.replace('備', '倩')
        t2 = t.replace('備', '倩')
        return p2 == t2

    arr = []
    for row in arr_all:
        if not isinstance(row, dict):
            continue
        if _is_target_person(str(row.get('person_name') or row.get('人员') or row.get('姓名') or ''), target_name):
            arr.append(row)

    # ========== 阶段三：模型自审，剔除可能误入的他人数据 ==========
    if arr and target_name:
        tn = target_name or '指定人员'
        verify_prompt = f"""你刚才从排程表中提取了以下 {len(arr)} 条数据，目标人员是「{tn}」（含变体：{name_aliases}）。

请逐条核对图片：仅当某条确定来自他人（该行「人员/岗位」列不是目标人员）时才删除。
- 单人通常 3–6 条。若当前条数明显过多（如 >8），很可能混入了他人数据，请删除无法确认属于目标人员的行。
- 不确定时保留。若删除后会导致 0 条，则原样输出。

只输出修正后的 JSON 数组，不要其他文字。
当前数据：
{json.dumps(arr, ensure_ascii=False)}"""
        try:
            raw3 = quick_vision_chat(
                image_base64=b64,
                prompt=verify_prompt,
                system_prompt='你是数据审核专家。仅删除明确属于他人的行。不确定时保留。宁可多留勿错删。',
                mime=mime,
                temperature=0,
                max_tokens=1024,
            )
            arr_verified = _parse_json_array(raw3)
            # 若审核后变空但原有多条，保留原结果，避免过度删除
            if isinstance(arr_verified, list) and (len(arr_verified) > 0 or len(arr) == 0):
                arr = arr_verified
        except Exception as e:
            logger.warning('analyze_schedule_image stage3 verify failed: %s', e)

    # ========== 阶段四：基于 OCR 文本进行最终纠偏 ==========
    # 若纯视觉仍有“设备名串错/项目号串错”，用 OCR 行文本进行一次文本级校正。
    if use_ocr and arr and target_name and ocr_text and len(ocr_text.strip()) > 50:
        verify_with_ocr_prompt = f"""以下是排程表 OCR 行文本，以及当前候选结果。

目标人员：{target_name}（含变体：{name_aliases}）
任务：请仅保留并修正属于目标人员的记录，字段必须与 OCR 原文一致，不得猜测。

强规则：
1) 必须从 OCR 行文本中逐字提取 equipment / project_no / room_no
2) 若当前候选项字段与 OCR 不一致，按 OCR 修正
3) 若候选项属于他人或无法在 OCR 中定位，删除
4) 输出数量以 OCR 中目标人员真实行数为准
5) 只输出 JSON 数组，不要其他文字

当前候选：
{json.dumps(arr, ensure_ascii=False)}

OCR 行文本：
{ocr_text[:12000]}
"""
        try:
            from apps.agent_gateway.services import quick_chat
            raw4 = quick_chat(
                message=verify_with_ocr_prompt,
                system_prompt='你是排程表文本校对专家。只依据 OCR 文本逐字输出，严禁臆测。',
                temperature=0,
                max_tokens=2048,
            )
            arr4 = _parse_json_array(raw4)
            if isinstance(arr4, list) and arr4:
                arr = arr4
        except Exception as e:
            logger.warning('analyze_schedule_image stage4 OCR verify failed: %s', e)

    # 已知属于他人的项目编号，筛选林紫倩时排除
    exclude_projects = {'FSDS0402004'}  # 评估师7(刘莹/白云)

    def _norm(s: str) -> str:
        return ''.join(s.split()).lower() if s else ''

    def _normalize_equipment_text(eq: str) -> str:
        """
        保留原文优先，仅做最小化纠错：统一常见 OCR 误拼，避免 Corneometer/Glossymeter/Tewameter 串错。
        """
        raw_eq = (eq or '').strip()
        if not raw_eq:
            return ''
        low = raw_eq.lower().replace(' ', '')
        # 只做拼写归一，不改编号
        if 'glossymeter' in low or 'glossmeter' in low:
            return raw_eq.replace('Glossmeter', 'Glossymeter')
        if 'tewameter' in low or 'tewaneter' in low or 'tewmeter' in low:
            return raw_eq.replace('Tewmeter', 'Tewameter').replace('Tewaneter', 'Tewameter')
        if 'corneometer' in low or 'cornemeter' in low:
            return raw_eq.replace('CorneMeter', 'Corneometer').replace('Cornemeter', 'Corneometer')
        return raw_eq

    seen_keys = set()  # 去重：避免同一设备/项目/房间的重复记录
    created = 0
    items = []
    for i, row in enumerate(arr):
        if not isinstance(row, dict):
            continue
        sd = row.get('schedule_date') or row.get('date') or row.get('工作日期') or ''
        eq = _normalize_equipment_text(str(row.get('equipment') or row.get('设备') or '')[:200])
        pn = str(row.get('project_no') or row.get('project_number') or row.get('项目编号') or '')[:100]
        rn = str(row.get('room_no') or row.get('room_number') or row.get('房间号') or '')[:100]
        sm = str(row.get('summary') or row.get('note') or row.get('说明') or '')[:500]
        # 阶段二输出无日期，统一用阶段一识别的 observed_date
        dt = observed_date
        if sd:
            try:
                if isinstance(sd, str) and len(sd) >= 10:
                    dt = datetime.strptime(sd[:10], '%Y-%m-%d').date()
                elif hasattr(sd, 'date'):
                    dt = sd.date() if hasattr(sd, 'date') else sd
            except Exception:
                pass
        # 排除已知他人项目（如筛选林紫倩时排除刘莹/白云的 FSDS0402004）
        if target_name and pn and pn.strip() in exclude_projects:
            continue
        # 项目号硬校验：C+8位数字（容忍 OCR 中多余空格）
        pn_compact = ''.join(pn.split()).upper()
        if pn_compact and not __import__('re').match(r'^C\d{8}$', pn_compact):
            # 明显异常项目号直接跳过，避免脏数据入库
            continue
        pn = pn_compact or pn

        # 至少要有设备/项目/房间之一，否则跳过空行
        if not eq.strip() and not pn.strip() and not rn.strip():
            continue
        # 去重：同日期+项目+设备+房间视为一条
        dedup_key = (str(dt), _norm(pn), _norm(eq), _norm(rn))
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)
        title_parts = [p for p in [f'设备:{eq}' if eq else '', f'项目:{pn}' if pn else '', f'房间:{rn}' if rn else ''] if p]
        title = ' | '.join(title_parts) if title_parts else (sm[:200] or '图片识别')
        if sm and sm not in title:
            note = sm
        else:
            note = ''
        EvaluatorScheduleNote.objects.create(
            account_id=account_id,
            schedule_date=dt,
            title=title[:500],
            note=note[:5000],
            equipment=eq,
            project_no=pn,
            room_no=rn,
        )
        created += 1
        items.append({'schedule_date': str(dt), 'equipment': eq, 'project_no': pn, 'room_no': rn, 'title': title})
    logger.info(
        'schedule_image_result account_id=%s target=%s date=%s all_rows=%s matched_rows=%s created=%s',
        account_id,
        target_name,
        observed_date,
        len(arr_all),
        len(arr),
        created,
    )
    return {'created': created, 'items': items}


def delete_schedule_note(account_id: int, note_id: int) -> dict:
    """删除排程备注（仅限本人）"""
    from ..models_evaluator_schedule import EvaluatorScheduleNote

    note = EvaluatorScheduleNote.objects.filter(id=note_id, account_id=account_id).first()
    if not note:
        return {'error': '备注不存在或无权删除'}
    note.delete()
    return {'ok': True}


def delete_all_schedule_notes(account_id: int) -> dict:
    """删除当前账号下所有排程备注（图片识别的参考项）"""
    from ..models_evaluator_schedule import EvaluatorScheduleNote

    deleted, _ = EvaluatorScheduleNote.objects.filter(account_id=account_id).delete()
    return {'ok': True, 'deleted': deleted}


# ============================================================================
# 工单接受/拒绝
# ============================================================================
@transaction.atomic
def accept_work_order(work_order_id: int, account_id: int) -> dict:
    """评估员接受工单"""
    wo = WorkOrder.objects.select_for_update().get(id=work_order_id, is_deleted=False)

    if wo.effective_assigned_to != account_id:
        return {'error': '该工单未分配给您'}

    if wo.status not in (WorkOrderStatus.ASSIGNED, WorkOrderStatus.PENDING):
        return {'error': f'当前状态 {wo.status} 无法接受'}

    WorkOrderConfirmation.objects.update_or_create(
        work_order=wo,
        defaults={
            'status': ConfirmationStatus.ACCEPTED,
            'confirmed_by': account_id,
            'confirmed_at': timezone.now(),
        }
    )

    wo.status = WorkOrderStatus.IN_PROGRESS
    wo.save(update_fields=['status', 'update_time'])

    return {'success': True, 'work_order_id': wo.id, 'status': 'accepted'}


@transaction.atomic
def reject_work_order(work_order_id: int, account_id: int, reason: str) -> dict:
    """评估员拒绝工单"""
    wo = WorkOrder.objects.select_for_update().get(id=work_order_id, is_deleted=False)

    if wo.effective_assigned_to != account_id:
        return {'error': '该工单未分配给您'}

    WorkOrderConfirmation.objects.update_or_create(
        work_order=wo,
        defaults={
            'status': ConfirmationStatus.REJECTED,
            'confirmed_by': account_id,
            'confirmed_at': timezone.now(),
            'rejection_reason': reason,
        }
    )

    wo.status = WorkOrderStatus.PENDING
    wo.assigned_to = None
    wo.assigned_to_account_id = None
    wo.save(update_fields=['status', 'assigned_to', 'assigned_to_account', 'update_time'])

    return {'success': True, 'work_order_id': wo.id, 'status': 'rejected'}


# ============================================================================
# 执行前准备
# ============================================================================
@transaction.atomic
def complete_preparation(work_order_id: int, account_id: int, checklist_data: list = None) -> dict:
    """评估员完成执行前准备"""
    ownership_err = _verify_ownership(work_order_id, account_id)
    if ownership_err:
        return ownership_err

    wo = WorkOrder.objects.select_for_update().get(id=work_order_id, is_deleted=False)

    prep, created = WorkOrderPreparation.objects.update_or_create(
        work_order=wo,
        defaults={
            'status': PreparationStatus.COMPLETED,
            'checklist_items': checklist_data or [],
            'resources_confirmed': True,
            'venue_confirmed': True,
            'equipment_confirmed': True,
            'prepared_by': account_id,
            'prepared_at': timezone.now(),
        }
    )

    return {'success': True, 'work_order_id': wo.id, 'preparation_status': 'completed'}


# ============================================================================
# 暂停/恢复
# ============================================================================
@transaction.atomic
def pause_work_order(work_order_id: int, account_id: int, reason: str) -> dict:
    """暂停工单执行"""
    ownership_err = _verify_ownership(work_order_id, account_id)
    if ownership_err:
        return ownership_err

    wo = WorkOrder.objects.select_for_update().get(id=work_order_id, is_deleted=False)

    if wo.status != WorkOrderStatus.IN_PROGRESS:
        return {'error': f'当前状态 {wo.status} 无法暂停'}

    WorkOrderSuspension.objects.create(
        work_order=wo,
        suspended_by=account_id,
        suspension_reason=reason,
        is_active=True,
    )

    return {'success': True, 'work_order_id': wo.id, 'status': 'paused'}


@transaction.atomic
def resume_work_order(work_order_id: int, account_id: int) -> dict:
    """恢复工单执行"""
    ownership_err = _verify_ownership(work_order_id, account_id)
    if ownership_err:
        return ownership_err

    wo = WorkOrder.objects.select_for_update().get(id=work_order_id, is_deleted=False)

    active_suspension = WorkOrderSuspension.objects.filter(
        work_order=wo, is_active=True
    ).first()

    if not active_suspension:
        return {'error': '该工单不在暂停状态'}

    now = timezone.now()
    duration = int((now - active_suspension.suspended_at).total_seconds() / 60)
    active_suspension.resumed_at = now
    active_suspension.resumed_by = account_id
    active_suspension.duration_minutes = duration
    active_suspension.is_active = False
    active_suspension.save()

    return {'success': True, 'work_order_id': wo.id, 'status': 'resumed'}


# ============================================================================
# 分步执行
# ============================================================================
@transaction.atomic
def init_steps_from_method(work_order_id: int, account_id: int = None) -> dict:
    """
    从检测方法模板初始化工单的执行步骤

    查找工单关联的 VisitActivity → ActivityTemplate → DetectionMethodTemplate，
    解析 standard_procedure JSON 生成 ExperimentStep 列表。
    """
    if account_id:
        ownership_err = _verify_ownership(work_order_id, account_id)
        if ownership_err:
            return ownership_err

    wo = WorkOrder.objects.get(id=work_order_id, is_deleted=False)

    # 检查是否已初始化
    existing = ExperimentStep.objects.filter(work_order=wo).count()
    if existing > 0:
        return {'error': '步骤已初始化', 'step_count': existing}

    steps_data = []

    # 尝试从关联的检测方法模板获取步骤
    try:
        if wo.visit_activity_id:
            from apps.visit.models import VisitActivity
            activity = VisitActivity.objects.select_related('template').get(id=wo.visit_activity_id)
            if activity.template_id:
                from apps.resource.models_detection_method import DetectionMethodTemplate
                method = DetectionMethodTemplate.objects.filter(
                    sop_reference=activity.template.sop_reference
                ).first() if hasattr(activity.template, 'sop_reference') else None

                if method and method.standard_procedure:
                    try:
                        procedure = json.loads(method.standard_procedure) if isinstance(method.standard_procedure, str) else method.standard_procedure
                        if isinstance(procedure, list):
                            steps_data = procedure
                    except (json.JSONDecodeError, TypeError):
                        pass
    except Exception as e:
        logger.warning(f"从检测方法模板加载步骤失败: {e}")

    # 如果无法从模板获取，生成默认步骤
    if not steps_data:
        steps_data = [
            {'step': 1, 'name': '准备仪器', 'description': '按照 SOP 准备检测仪器', 'duration_minutes': 5},
            {'step': 2, 'name': '受试者准备', 'description': '确认受试者状态，进行检测前准备', 'duration_minutes': 5},
            {'step': 3, 'name': '执行检测', 'description': '按照标准方法执行检测操作', 'duration_minutes': 15},
            {'step': 4, 'name': '数据记录', 'description': '记录检测数据，拍照存档', 'duration_minutes': 5},
            {'step': 5, 'name': '清理归位', 'description': '清理仪器，归位整理', 'duration_minutes': 5},
        ]

    # 创建步骤
    steps = []
    for item in steps_data:
        step = ExperimentStep.objects.create(
            work_order=wo,
            step_number=item.get('step', len(steps) + 1),
            step_name=item.get('name', f'步骤 {len(steps) + 1}'),
            step_description=item.get('description', ''),
            estimated_duration_minutes=item.get('duration_minutes', 0),
        )
        steps.append({
            'id': step.id,
            'step_number': step.step_number,
            'step_name': step.step_name,
            'status': step.status,
        })

    # 创建/更新进度跟踪器
    WorkOrderProgressTracker.objects.update_or_create(
        work_order=wo,
        defaults={
            'total_steps': len(steps),
            'current_step': 0,
            'progress_percent': 0,
        }
    )

    return {'success': True, 'work_order_id': wo.id, 'step_count': len(steps), 'steps': steps}


def get_steps(work_order_id: int) -> list:
    """获取工单的步骤列表"""
    return list(
        ExperimentStep.objects.filter(work_order_id=work_order_id).order_by('step_number').values(
            'id', 'step_number', 'step_name', 'step_description',
            'estimated_duration_minutes', 'status',
            'started_at', 'completed_at', 'actual_duration_minutes',
            'execution_data', 'result', 'skip_reason',
        )
    )


@transaction.atomic
def start_step(step_id: int, account_id: int) -> dict:
    """开始执行步骤"""
    ownership_err = _verify_step_ownership(step_id, account_id)
    if ownership_err:
        return ownership_err

    step = ExperimentStep.objects.select_for_update().get(id=step_id)

    if step.status != StepStatus.PENDING:
        return {'error': f'步骤当前状态 {step.status} 无法开始'}

    # 检查前一步是否完成
    prev = ExperimentStep.objects.filter(
        work_order=step.work_order,
        step_number=step.step_number - 1,
    ).first()
    if prev and prev.status not in (StepStatus.COMPLETED, StepStatus.SKIPPED):
        return {'error': '请先完成上一步骤'}

    step.status = StepStatus.IN_PROGRESS
    step.started_at = timezone.now()
    step.executed_by = account_id
    step.save()

    # 更新进度
    _update_progress(step.work_order_id)

    return {'success': True, 'step_id': step.id, 'status': 'in_progress'}


@transaction.atomic
def complete_step(step_id: int, account_id: int, execution_data: dict = None, result: str = '') -> dict:
    """完成步骤"""
    ownership_err = _verify_step_ownership(step_id, account_id)
    if ownership_err:
        return ownership_err

    step = ExperimentStep.objects.select_for_update().get(id=step_id)

    if step.status != StepStatus.IN_PROGRESS:
        return {'error': f'步骤当前状态 {step.status} 无法完成'}

    now = timezone.now()
    duration = int((now - step.started_at).total_seconds() / 60) if step.started_at else 0

    step.status = StepStatus.COMPLETED
    step.completed_at = now
    step.actual_duration_minutes = duration
    step.execution_data = execution_data or {}
    step.result = result
    step.executed_by = account_id
    step.save()

    _update_progress(step.work_order_id)

    return {'success': True, 'step_id': step.id, 'status': 'completed', 'duration_minutes': duration}


@transaction.atomic
def skip_step(step_id: int, account_id: int, reason: str) -> dict:
    """跳过步骤（需填写原因）"""
    ownership_err = _verify_step_ownership(step_id, account_id)
    if ownership_err:
        return ownership_err

    step = ExperimentStep.objects.select_for_update().get(id=step_id)

    if step.status not in (StepStatus.PENDING, StepStatus.IN_PROGRESS):
        return {'error': f'步骤当前状态 {step.status} 无法跳过'}

    if not reason.strip():
        return {'error': '跳过步骤必须填写原因'}

    step.status = StepStatus.SKIPPED
    step.completed_at = timezone.now()
    step.skip_reason = reason
    step.executed_by = account_id
    step.save()

    _update_progress(step.work_order_id)

    return {'success': True, 'step_id': step.id, 'status': 'skipped'}


def _update_progress(work_order_id: int):
    """更新工单进度，100% 时自动完成工单"""
    steps = ExperimentStep.objects.filter(work_order_id=work_order_id)
    total = steps.count()
    done = steps.filter(status__in=[StepStatus.COMPLETED, StepStatus.SKIPPED]).count()
    current = steps.filter(status=StepStatus.IN_PROGRESS).first()
    percent = int(done * 100 / total) if total > 0 else 0

    WorkOrderProgressTracker.objects.update_or_create(
        work_order_id=work_order_id,
        defaults={
            'total_steps': total,
            'current_step': current.step_number if current else done,
            'progress_percent': percent,
        }
    )

    if percent == 100:
        try:
            from apps.workorder.services import complete_work_order
            complete_work_order(work_order_id)
            logger.info(f"工单 #{work_order_id} 步骤全部完成，自动完成工单")
        except Exception as e:
            logger.warning(f"自动完成工单失败: {e}")


# ============================================================================
# 仪器检测
# ============================================================================
@transaction.atomic
def create_instrument_detection(work_order_id: int, data: dict) -> dict:
    """创建仪器检测任务"""
    account_id = data.get('operated_by')
    if account_id:
        ownership_err = _verify_ownership(work_order_id, account_id)
        if ownership_err and ownership_err.get('error') != '该工单未分配给您':
            return ownership_err

    detection = InstrumentDetection.objects.create(
        work_order_id=work_order_id,
        equipment_id=data.get('equipment_id'),
        detection_name=data.get('detection_name', ''),
        detection_method=data.get('detection_method', ''),
        operated_by=data.get('operated_by'),
    )
    return {
        'success': True,
        'detection_id': detection.id,
        'status': detection.status,
    }


@transaction.atomic
def start_detection(detection_id: int, account_id: int = None, extra_params: dict = None) -> dict:
    """
    开始仪器检测

    F2 环境快照：自动获取当前场地环境数据，比对检测方法模板阈值
    F3 资质快照：自动快照操作人的方法资质等级和设备授权
    """
    extra_params = extra_params or {}

    if account_id:
        ownership_err = _verify_detection_ownership(detection_id, account_id)
        if ownership_err:
            return ownership_err

    det = InstrumentDetection.objects.select_for_update().get(id=detection_id)
    if det.status != DetectionStatus.QUEUED:
        return {'error': f'当前状态 {det.status} 无法开始'}

    # ---- F2: 环境数据快照 ----
    env_result = _capture_environment_snapshot(
        detection=det,
        force=extra_params.get('force', False),
        manual_env=extra_params.get('manual_env'),
        deviation_reason=extra_params.get('deviation_reason', ''),
    )
    if 'error' in env_result:
        return env_result

    det.environment_snapshot = env_result['snapshot']

    # ---- F3: 人员资质快照 ----
    if account_id:
        det.operator_qualification_snapshot = _capture_operator_qualification_snapshot(
            detection=det,
            account_id=account_id,
        )
        det.operated_by = account_id

    det.status = DetectionStatus.RUNNING
    det.started_at = timezone.now()
    det.save()

    result = {
        'success': True,
        'detection_id': det.id,
        'status': 'running',
        'environment_snapshot': det.environment_snapshot,
        'operator_qualification_snapshot': det.operator_qualification_snapshot,
    }

    if env_result.get('warnings'):
        result['warnings'] = env_result['warnings']

    return result


def _capture_environment_snapshot(
    detection,
    force: bool = False,
    manual_env: dict = None,
    deviation_reason: str = '',
) -> dict:
    """
    F2: 获取并冻结环境快照

    优先顺序：
    1. 从 VenueEnvironmentLog 自动获取关联场地的最新记录
    2. 无传感器数据时，接受手动填入（manual_env），标记 source=manual
    3. 环境超阈值时，force=True + deviation_reason 可强制放行
    """
    try:
        from apps.resource.models import VenueEnvironmentLog, ResourceItem
        from apps.resource.models_detection_method import DetectionMethodTemplate

        # 获取检测方法模板的环境阈值
        method_template = None
        if hasattr(detection, 'work_order') and detection.work_order and detection.work_order.visit_activity:
            activity = detection.work_order.visit_activity
            if hasattr(activity, 'activity_template') and activity.activity_template:
                method_template = DetectionMethodTemplate.objects.filter(
                    pk=activity.activity_template_id,
                ).first()

        # 获取最新环境记录
        env_log = None
        venue = None
        if hasattr(detection, 'work_order') and detection.work_order:
            pass  # 后续可通过工单关联的场地筛选

        env_log = VenueEnvironmentLog.objects.order_by('-recorded_at').first()

        if env_log and (timezone.now() - env_log.recorded_at).total_seconds() <= 30 * 60:
            snapshot = {
                'source': 'sensor',
                'temperature': float(env_log.temperature) if env_log.temperature else None,
                'humidity': float(env_log.humidity) if env_log.humidity else None,
                'is_compliant': True,
                'venue_name': str(env_log.venue) if hasattr(env_log, 'venue') else '',
                'recorded_at': env_log.recorded_at.isoformat(),
            }
        elif manual_env:
            snapshot = {
                'source': 'manual',
                'temperature': manual_env.get('temperature'),
                'humidity': manual_env.get('humidity'),
                'is_compliant': True,
                'venue_name': manual_env.get('venue_name', ''),
                'recorded_at': timezone.now().isoformat(),
            }
        else:
            # 无环境数据，记录为空快照（允许继续，但记录 no_data）
            snapshot = {
                'source': 'no_data',
                'temperature': None,
                'humidity': None,
                'is_compliant': None,
                'venue_name': '',
                'recorded_at': timezone.now().isoformat(),
            }
            return {'snapshot': snapshot, 'warnings': ['无法获取环境监测数据，已记录为空，请手动确认环境条件']}

        # 比对方法模板阈值
        violations = []
        if method_template:
            temp = snapshot.get('temperature')
            humidity = snapshot.get('humidity')
            if temp is not None and method_template.temperature_min is not None:
                if temp < float(method_template.temperature_min):
                    violations.append(
                        f'温度 {temp}°C 低于最低要求 {method_template.temperature_min}°C'
                    )
            if temp is not None and method_template.temperature_max is not None:
                if temp > float(method_template.temperature_max):
                    violations.append(
                        f'温度 {temp}°C 超出最高限制 {method_template.temperature_max}°C'
                    )
            if humidity is not None and method_template.humidity_min is not None:
                if humidity < float(method_template.humidity_min):
                    violations.append(
                        f'湿度 {humidity}% 低于最低要求 {method_template.humidity_min}%'
                    )
            if humidity is not None and method_template.humidity_max is not None:
                if humidity > float(method_template.humidity_max):
                    violations.append(
                        f'湿度 {humidity}% 超出最高限制 {method_template.humidity_max}%'
                    )

        if violations:
            if not force:
                return {
                    'error': f'环境条件不符合检测要求：{"；".join(violations)}。'
                             f'如需强制继续，请传入 force=true 并填写 deviation_reason。',
                    'violations': violations,
                }
            else:
                if not deviation_reason.strip():
                    return {'error': '强制放行必须填写偏差原因（deviation_reason）'}
                snapshot['is_compliant'] = False
                snapshot['violations'] = violations
                snapshot['deviation_reason'] = deviation_reason
                logger.warning(f'强制放行环境不合规检测 detection#{getattr(detection, "id", "?")}：{violations}')
        else:
            snapshot['is_compliant'] = True

        return {'snapshot': snapshot}

    except Exception as e:
        logger.error(f'环境快照获取失败：{e}')
        return {
            'snapshot': {
                'source': 'error',
                'temperature': None,
                'humidity': None,
                'is_compliant': None,
                'venue_name': '',
                'recorded_at': timezone.now().isoformat(),
                'error': str(e),
            }
        }


def _capture_operator_qualification_snapshot(detection, account_id: int) -> dict:
    """
    F3: 快照操作人的方法资质等级和设备授权

    返回检测开始时刻的实时资质状态，后续资质变更不影响此快照
    """
    snapshot = {
        'account_id': account_id,
        'method_qualifications': [],
        'equipment_authorizations': [],
        'captured_at': timezone.now().isoformat(),
    }
    try:
        from apps.lab_personnel.models import LabStaffProfile, MethodQualification

        profile = LabStaffProfile.objects.filter(
            staff__account_fk_id=account_id,
            is_active=True,
        ).first() or LabStaffProfile.objects.filter(
            staff__account_id=account_id,
            is_active=True,
        ).first()

        if profile:
            snapshot['operator_name'] = profile.staff.name if hasattr(profile, 'staff') else ''
            snapshot['lab_role'] = profile.lab_role
            quals = MethodQualification.objects.filter(
                staff=profile.staff, is_active=True,
            ).select_related()
            snapshot['method_qualifications'] = [
                {
                    'method_id': q.method_id if hasattr(q, 'method_id') else None,
                    'method_name': str(q.method) if hasattr(q, 'method') and q.method else '',
                    'qual_level': q.level,
                    'qualified_date': str(q.qualified_date) if q.qualified_date else None,
                    'expiry_date': str(q.expiry_date) if getattr(q, 'expiry_date', None) else None,
                    'total_executions': q.total_executions,
                }
                for q in quals
            ]
    except Exception as e:
        logger.warning(f'方法资质快照获取失败（account_id={account_id}）：{e}')

    try:
        from apps.resource.models import EquipmentAuthorization
        from django.utils import timezone as tz
        auths = EquipmentAuthorization.objects.filter(
            operator_id=account_id,
            is_active=True,
            expires_at__gte=tz.now().date(),
        ).select_related()
        snapshot['equipment_authorizations'] = [
            {
                'equipment_id': a.equipment_id if hasattr(a, 'equipment_id') else None,
                'equipment_name': str(a.equipment) if hasattr(a, 'equipment') and a.equipment else '',
                'auth_expires_at': str(a.expires_at),
                'auth_is_active': a.is_active,
            }
            for a in auths
        ]
    except Exception as e:
        logger.warning(f'设备授权快照获取失败（account_id={account_id}）：{e}')

    return snapshot


@transaction.atomic
def complete_detection(detection_id: int, result_data: dict, account_id: int = None) -> dict:
    """完成仪器检测，F5：自动触发 eCRF 映射"""
    if account_id:
        ownership_err = _verify_detection_ownership(detection_id, account_id)
        if ownership_err:
            return ownership_err

    det = InstrumentDetection.objects.select_for_update().get(id=detection_id)
    if det.status != DetectionStatus.RUNNING:
        return {'error': f'当前状态 {det.status} 无法完成'}

    det.status = DetectionStatus.COMPLETED
    det.completed_at = timezone.now()
    det.raw_data = result_data.get('raw_data') or {}
    det.processed_data = result_data.get('processed_data') or {}
    det.result_values = result_data.get('result_values') or {}
    det.data_file_path = result_data.get('data_file_path') or ''
    det.qc_passed = result_data.get('qc_passed')
    det.qc_notes = result_data.get('qc_notes') or ''
    det.save()

    # F5: 自动映射到 eCRF（异步触发，失败不影响主流程）
    crf_mapping_result = {}
    try:
        from apps.edc.services.crf_auto_fill_service import auto_fill_crf_from_detection
        crf_mapping_result = auto_fill_crf_from_detection(detection_id)
    except Exception as e:
        logger.warning(f'CRF 自动映射失败（detection#{detection_id}），不影响检测完成：{e}')
        crf_mapping_result = {'error': str(e)}

    return {
        'success': True,
        'detection_id': det.id,
        'status': 'completed',
        'crf_mapping': crf_mapping_result,
    }


# ============================================================================
# 异常上报
# ============================================================================
@transaction.atomic
def report_exception(work_order_id: int, account_id: int, data: dict) -> dict:
    """上报工单异常"""
    exc = WorkOrderException.objects.create(
        work_order_id=work_order_id,
        exception_type=data.get('exception_type', 'other'),
        severity=data.get('severity', 'medium'),
        description=data.get('description', ''),
        impact_analysis=data.get('impact_analysis', ''),
        reported_by=account_id,
    )

    # 严重异常自动创建偏差记录
    if exc.severity in ('high', 'critical'):
        try:
            from apps.quality.models import Deviation
            deviation = Deviation.objects.create(
                title=f'工单异常: {exc.get_exception_type_display()}',
                description=exc.description,
                source='work_order_exception',
                source_id=exc.id,
                severity=exc.severity,
                reported_by=account_id,
            )
            exc.deviation_id = deviation.id
            exc.save(update_fields=['deviation_id'])
            logger.info(f"严重异常自动创建偏差 DEV#{deviation.id}")

            try:
                from libs.notification import notify_deviation_created
                notify_deviation_created(deviation)
            except Exception as ne:
                logger.warning(f"偏差通知发送失败: {ne}")
        except Exception as e:
            logger.warning(f"自动创建偏差失败: {e}")

        try:
            from libs.notification import notify_exception_escalated
            notify_exception_escalated(exc)
        except Exception as ne:
            logger.warning(f"异常上报通知发送失败: {ne}")

    return {
        'success': True,
        'exception_id': exc.id,
        'severity': exc.severity,
        'auto_deviation': exc.deviation_id is not None,
    }


def get_exceptions(work_order_id: int) -> list:
    """获取工单的异常列表"""
    return list(
        WorkOrderException.objects.filter(work_order_id=work_order_id).values(
            'id', 'exception_type', 'severity', 'description',
            'impact_analysis', 'resolution_status', 'resolution_action',
            'reported_by', 'resolved_by', 'resolved_at',
            'deviation_id', 'create_time',
        )
    )


# ============================================================================
# 评估员个人数据
# ============================================================================
def get_evaluator_profile(account_id: int) -> dict:
    """获取评估员个人成长数据"""
    from datetime import timedelta

    today = date.today()
    month_start = today.replace(day=1)

    # 本月工单统计
    month_total = filter_by_assignee(WorkOrder.objects.filter(
        is_deleted=False,
        completed_at__gte=month_start,
    ), account_id).count()

    month_approved = filter_by_assignee(WorkOrder.objects.filter(
        is_deleted=False,
        completed_at__gte=month_start,
        status=WorkOrderStatus.APPROVED,
    ), account_id).count()

    # 按时完成率
    month_on_time = filter_by_assignee(WorkOrder.objects.filter(
        is_deleted=False,
        completed_at__gte=month_start,
    ), account_id).exclude(
        completed_at__gt=models.F('due_date')
    ).count()

    # 资质信息
    qualifications = []
    try:
        from apps.hr.models import StaffQualification
        quals = StaffQualification.objects.filter(account_id=account_id)
        qualifications = list(quals.values(
            'qualification_name', 'qualification_code',
            'obtained_date', 'expiry_date', 'status',
        ))
    except Exception:
        pass

    # 培训信息
    trainings = []
    try:
        from apps.hr.models import TrainingRecord
        trains = TrainingRecord.objects.filter(account_id=account_id).order_by('-training_date')[:10]
        trainings = list(trains.values(
            'training_name', 'training_date', 'status', 'score',
        ))
    except Exception:
        pass

    # 最近 6 个月月度统计
    monthly_trend = _get_monthly_trend(account_id, today)

    return {
        'role': _get_evaluator_role(account_id),
        'performance': {
            'month_completed': month_total,
            'month_approved': month_approved,
            'approval_rate': round(month_approved / month_total * 100, 1) if month_total > 0 else 0,
            'on_time_rate': round(month_on_time / month_total * 100, 1) if month_total > 0 else 0,
        },
        'monthly_trend': monthly_trend,
        'qualifications': qualifications,
        'trainings': trainings,
    }


def _get_monthly_trend(account_id: int, today) -> list:
    """获取最近 6 个月的月度工单完成数/通过率/按时率"""
    from datetime import timedelta
    from dateutil.relativedelta import relativedelta

    trend = []
    for i in range(5, -1, -1):
        m_start = (today.replace(day=1) - relativedelta(months=i))
        m_end = (m_start + relativedelta(months=1)) - timedelta(days=1)
        total = filter_by_assignee(WorkOrder.objects.filter(
            is_deleted=False,
            completed_at__gte=m_start, completed_at__lte=m_end,
        ), account_id).count()
        approved = filter_by_assignee(WorkOrder.objects.filter(
            is_deleted=False,
            completed_at__gte=m_start, completed_at__lte=m_end,
            status=WorkOrderStatus.APPROVED,
        ), account_id).count()
        on_time = filter_by_assignee(WorkOrder.objects.filter(
            is_deleted=False,
            completed_at__gte=m_start, completed_at__lte=m_end,
        ), account_id).exclude(completed_at__gt=models.F('due_date')).count()
        trend.append({
            'month': m_start.strftime('%Y-%m'),
            'completed': total,
            'approved': approved,
            'approval_rate': round(approved / total * 100, 1) if total > 0 else 0,
            'on_time_rate': round(on_time / total * 100, 1) if total > 0 else 0,
        })
    return trend


# ============================================================================
# F1: 数据变更留痕 — 修改 / 作废 / 审计日志
# ============================================================================

def update_detection_data(detection_id: int, operator_id: int, data: dict) -> dict:
    """
    修改已完成检测的数据（必须提供 change_reason）

    验收标准：
    1. 不传 change_reason → 返回 error
    2. 修改后 FieldChangeLog 中有精确的 old_value/new_value/changed_by/changed_at
    """
    from apps.workorder.models_execution import InstrumentDetection, DetectionStatus

    change_reason = (data.get('change_reason') or '').strip()
    if not change_reason:
        return {'error': '修改已采集数据必须填写变更原因（change_reason 不可为空）'}

    try:
        detection = InstrumentDetection.objects.get(pk=detection_id)
    except InstrumentDetection.DoesNotExist:
        return {'error': f'检测记录 {detection_id} 不存在'}

    if detection.is_voided:
        return {'error': '已作废的检测记录不可修改'}

    # 允许修改已完成的检测（completed / failed 状态），未完成的不需要走变更流程
    if detection.status not in (DetectionStatus.COMPLETED, DetectionStatus.FAILED):
        return {'error': f'当前状态（{detection.status}）不支持修改，只有已完成或失败的检测才需走变更登记'}

    updatable_fields = ['raw_data', 'processed_data', 'result_values', 'qc_passed', 'qc_notes']
    has_change = False
    for field in updatable_fields:
        if field in data and data[field] is not None:
            setattr(detection, field, data[field])
            has_change = True

    if not has_change:
        return {'error': '未提供任何可修改的字段'}

    # 将操作人和原因挂到实例，供信号处理器读取
    detection._changed_by_id = operator_id
    detection._changed_by_name = _get_operator_name(operator_id)
    detection._change_reason = change_reason

    detection.save()

    return {
        'id': detection.id,
        'status': detection.status,
        'message': '检测数据已修改，变更日志已写入',
    }


def void_detection(detection_id: int, operator_id: int, reason: str) -> dict:
    """
    作废检测记录（软删除，原始数据保留不变）

    验收标准：
    1. 调用后 is_voided=True，原始数据保留
    2. 已作废的记录不可再次作废
    3. 物理 DELETE 请求在路由层返回 405
    """
    from apps.workorder.models_execution import InstrumentDetection
    from django.utils import timezone

    reason = (reason or '').strip()
    if not reason:
        return {'error': '作废必须填写原因'}

    try:
        detection = InstrumentDetection.objects.get(pk=detection_id)
    except InstrumentDetection.DoesNotExist:
        return {'error': f'检测记录 {detection_id} 不存在'}

    if detection.is_voided:
        return {'error': '该检测记录已作废，不可重复操作'}

    detection.is_voided = True
    detection.voided_reason = reason
    detection.voided_by = operator_id
    detection.voided_at = timezone.now()

    detection._changed_by_id = operator_id
    detection._changed_by_name = _get_operator_name(operator_id)
    detection._change_reason = f'[作废] {reason}'

    detection.save()

    return {
        'id': detection.id,
        'is_voided': True,
        'voided_reason': reason,
        'message': '检测记录已标记为作废，原始数据保留',
    }


def get_detection_audit_log(detection_id: int, page: int = 1, page_size: int = 50) -> dict:
    """
    获取检测记录的完整变更历史

    验收标准：返回包含 old_value/new_value/changed_by/changed_at/reason 的变更列表
    """
    from apps.lab_personnel.models_compliance import FieldChangeLog

    qs = FieldChangeLog.objects.filter(
        model_name='InstrumentDetection',
        record_id=detection_id,
    ).order_by('-changed_at')

    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start:start + page_size].values(
        'id', 'field_name', 'old_value', 'new_value',
        'changed_by_id', 'changed_by_name', 'changed_at', 'reason',
    ))

    return {
        'detection_id': detection_id,
        'total': total,
        'page': page,
        'page_size': page_size,
        'items': items,
    }


def _get_operator_name(account_id: int) -> str:
    """根据 account_id 获取操作人姓名"""
    try:
        from apps.identity.models import Account
        account = Account.objects.filter(pk=account_id).first()
        return account.name if account else str(account_id)
    except Exception:
        return str(account_id)


# ============================================================================
# F7: 仪器数据自动采集 — 数据注入服务
# ============================================================================

def ingest_instrument_data(
    records: list,
    source_file: str,
    data_source: str = 'instrument_import',
    operator_id: int = None,
) -> dict:
    """
    接受仪器 Agent 推送的解析数据，创建 InstrumentDetection 记录

    验收标准：
    1. 创建 InstrumentDetection，data_source='instrument_import'
    2. raw_data 包含完整原始字段
    3. result_values 包含解析后的数值
    """
    from apps.workorder.models_execution import InstrumentDetection, DetectionStatus, DataSource

    if not records:
        return {'error': '推送数据为空'}

    created_ids = []
    errors = []

    for i, record in enumerate(records):
        try:
            subject_code = record.get('subject_code', '')
            instrument_type = record.get('instrument_type', 'unknown')
            detection_date = record.get('detection_date', '')
            detection_time = record.get('detection_time', '')

            # 尝试匹配工单（通过受试者编号）
            work_order = None
            if subject_code:
                work_order = _find_workorder_for_subject(subject_code, detection_date)

            det = InstrumentDetection.objects.create(
                work_order=work_order,
                detection_name=f'{instrument_type}_{detection_date}_{i}',
                detection_method=instrument_type,
                status=DetectionStatus.COMPLETED,
                raw_data=record.get('raw_data', {}),
                processed_data={},
                result_values=record.get('result_values', {}),
                data_file_path=source_file,
                data_source=DataSource.INSTRUMENT_IMPORT,
                operated_by=operator_id,
            )

            # 如果有关联工单，尝试 CRF 自动映射
            if work_order:
                try:
                    from apps.edc.services.crf_auto_fill_service import auto_fill_crf_from_detection
                    auto_fill_crf_from_detection(det.id)
                except Exception as e:
                    logger.warning(f'仪器注入后 CRF 映射失败（detection#{det.id}）: {e}')

            created_ids.append(det.id)
            logger.info(f'仪器数据注入：创建 InstrumentDetection #{det.id}（{instrument_type}，受试者 {subject_code}）')

        except Exception as e:
            errors.append({'index': i, 'error': str(e)})
            logger.error(f'注入第 {i} 条记录失败: {e}')

    return {
        'total': len(records),
        'created_count': len(created_ids),
        'created_ids': created_ids,
        'errors': errors,
        'source_file': source_file,
    }


def _find_workorder_for_subject(subject_code: str, detection_date: str = None):
    """根据受试者编号和日期查找匹配的工单"""
    try:
        from apps.workorder.models import WorkOrder, WorkOrderStatus
        from apps.subject.models import Enrollment

        # 查找入组状态的受试者
        enrollment = Enrollment.objects.filter(
            subject_code=subject_code,
            status='enrolled',
        ).first()

        if not enrollment:
            return None

        # 查找今日相关工单
        from datetime import date
        today = date.today()
        qs = WorkOrder.objects.filter(
            enrollment=enrollment,
            is_deleted=False,
        ).exclude(status__in=[WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED])

        if detection_date:
            qs = qs.filter(scheduled_date=today)

        return qs.order_by('-created_at').first()
    except Exception as e:
        logger.warning(f'查找受试者 {subject_code} 的工单失败: {e}')
        return None

