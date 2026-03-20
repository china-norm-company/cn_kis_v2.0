"""
通知管理 API

S4-8：通知列表、偏好设置
"""
from ninja import Router, Schema, Query
from typing import Optional
from apps.identity.decorators import require_permission, _get_account_from_request

from . import services

router = Router()


class NotificationQueryParams(Schema):
    page: int = 1
    page_size: int = 20


def _record_to_dict(r) -> dict:
    return {
        'id': r.id, 'title': r.title, 'content': r.content[:200],
        'channel': r.channel, 'priority': r.priority, 'status': r.status,
        'source_type': r.source_type, 'source_id': r.source_id,
        'source_workstation': getattr(r, 'source_workstation', '') or '',
        'target_url': getattr(r, 'target_url', '') or '',
        'sent_at': r.sent_at.isoformat() if r.sent_at else None,
        'create_time': r.create_time.isoformat(),
    }


@router.get('/list', summary='我的通知列表')
@require_permission('system.notification.read')
def list_my_notifications(request, params: NotificationQueryParams = Query(...)):
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未登录'}
    result = services.list_notifications(account.id, params.page, params.page_size)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_record_to_dict(r) for r in result['items']],
        'total': result['total'],
    }}


class PreferenceUpdateIn(Schema):
    notification_type: str
    enabled: bool
    preferred_channel: Optional[str] = None


# ============================================================================
# 预警仪表盘
# ============================================================================
@router.get('/alerts/dashboard', summary='预警仪表盘')
@require_permission('system.notification.read')
def alerts_dashboard(request):
    """
    聚合各维度预警：设备校准到期、材料过期、人员GCP到期、工单逾期、窗口期超期。
    """
    from django.utils import timezone
    from datetime import timedelta

    today = timezone.now().date()
    alerts = {
        'equipment_calibration': [],
        'material_expiry': [],
        'personnel_gcp': [],
        'workorder_overdue': [],
        'visit_window': [],
    }

    # 设备校准到期（30天内）
    try:
        from apps.resource.models import ResourceItem
        expiring = ResourceItem.objects.filter(
            is_deleted=False,
            next_calibration_date__isnull=False,
            next_calibration_date__lte=today + timedelta(days=30),
            status__in=['active', 'idle'],
        )
        for item in expiring[:20]:
            days = (item.next_calibration_date - today).days
            alerts['equipment_calibration'].append({
                'type': 'equipment_calibration',
                'severity': 'urgent' if days < 0 else 'high' if days <= 7 else 'normal',
                'title': f'{item.name} 校准{"已过期" if days < 0 else "即将到期"}',
                'message': f'{item.name}({item.code}) 校准日期: {item.next_calibration_date}，{"已过期" if days < 0 else f"剩余 {days} 天"}',
                'source_type': 'resource_item',
                'source_id': item.id,
            })
    except Exception:
        pass

    # 材料/产品过期（30天内）
    try:
        from apps.sample.models import Product
        expiring_products = Product.objects.filter(
            is_deleted=False,
            expiry_date__isnull=False,
            expiry_date__lte=today + timedelta(days=30),
        )
        for p in expiring_products[:20]:
            days = (p.expiry_date - today).days
            alerts['material_expiry'].append({
                'type': 'material_expiry',
                'severity': 'urgent' if days < 0 else 'high' if days <= 7 else 'normal',
                'title': f'{p.name} {"已过期" if days < 0 else "即将过期"}',
                'message': f'{p.name}({p.code}) 有效期: {p.expiry_date}',
                'source_type': 'product',
                'source_id': p.id,
            })
    except Exception:
        pass

    # 人员 GCP 证书到期（30天内）
    try:
        from apps.hr.models import Staff
        expiring_staff = Staff.objects.filter(
            is_deleted=False,
            gcp_expiry_date__isnull=False,
            gcp_expiry_date__lte=today + timedelta(days=30),
        )
        for s in expiring_staff[:20]:
            days = (s.gcp_expiry_date - today).days
            alerts['personnel_gcp'].append({
                'type': 'personnel_gcp',
                'severity': 'urgent' if days < 0 else 'high' if days <= 7 else 'normal',
                'title': f'{s.name} GCP证书{"已过期" if days < 0 else "即将到期"}',
                'message': f'{s.name} GCP到期日: {s.gcp_expiry_date}',
                'source_type': 'staff',
                'source_id': s.id,
            })
    except Exception:
        pass

    # 工单逾期
    try:
        from apps.workorder.models import WorkOrder
        overdue_wos = WorkOrder.objects.filter(
            is_deleted=False,
            due_date__lt=timezone.now(),
            status__in=['pending', 'assigned', 'in_progress'],
        )
        for wo in overdue_wos[:20]:
            alerts['workorder_overdue'].append({
                'type': 'workorder_overdue',
                'severity': 'high',
                'title': f'工单 #{wo.id} 已逾期',
                'message': f'{wo.title} 截止: {wo.due_date}',
                'source_type': 'workorder',
                'source_id': wo.id,
            })
    except Exception:
        pass

    # 访视窗口期超期（复用 visit/window-alerts 逻辑）
    try:
        from apps.scheduling.models import ScheduleSlot, SlotStatus
        active_slots = ScheduleSlot.objects.filter(
            status__in=[SlotStatus.PLANNED, SlotStatus.CONFIRMED],
        ).select_related('visit_node', 'schedule_plan')
        for slot in active_slots:
            node = slot.visit_node
            if not node:
                continue
            plan = slot.schedule_plan
            if plan:
                from datetime import timedelta as td
                baseline_date = plan.start_date + td(days=node.baseline_day)
                window_end = baseline_date + td(days=node.window_after)
                days_left = (window_end - today).days
                if days_left < 0:
                    alerts['visit_window'].append({
                        'type': 'visit_window',
                        'severity': 'urgent',
                        'title': f'{node.name} 已超窗',
                        'message': f'超出 {abs(days_left)} 天',
                        'source_type': 'schedule_slot',
                        'source_id': slot.id,
                    })
                elif days_left <= 3:
                    alerts['visit_window'].append({
                        'type': 'visit_window',
                        'severity': 'high',
                        'title': f'{node.name} 即将超窗',
                        'message': f'剩余 {days_left} 天',
                        'source_type': 'schedule_slot',
                        'source_id': slot.id,
                    })
            if len(alerts['visit_window']) >= 20:
                break
    except Exception:
        pass

    total_count = sum(len(v) for v in alerts.values())
    return {'code': 200, 'msg': 'OK', 'data': {**alerts, 'total_count': total_count}}


@router.post('/preferences/update', summary='更新通知偏好')
@require_permission('system.notification.read')
def update_preference(request, data: PreferenceUpdateIn):
    from .models import NotificationPreference
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未登录'}
    pref, _ = NotificationPreference.objects.update_or_create(
        user_id=account.id,
        notification_type=data.notification_type,
        defaults={
            'enabled': data.enabled,
            **(
                {'preferred_channel': data.preferred_channel}
                if data.preferred_channel else {}
            ),
        },
    )
    return {'code': 200, 'msg': '偏好已更新', 'data': {
        'notification_type': pref.notification_type,
        'enabled': pref.enabled,
        'preferred_channel': pref.preferred_channel,
    }}


@router.get('/inbox', summary='通知收件箱')
@require_permission('system.notification.read')
def notification_inbox(request, page: int = 1, page_size: int = 20,
                       status: Optional[str] = None):
    """站内通知收件箱，带未读计数"""
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未登录'}

    from .models import NotificationRecord
    qs = NotificationRecord.objects.filter(
        recipient_id=account.id,
    ).order_by('-create_time')

    if status == 'unread':
        qs = qs.filter(status__in=['sent', 'delivered'])
    elif status == 'read':
        qs = qs.filter(status='read')

    total = qs.count()
    unread_count = NotificationRecord.objects.filter(
        recipient_id=account.id,
        status__in=['sent', 'delivered'],
    ).count()

    start = (page - 1) * page_size
    items = qs[start:start + page_size]

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_record_to_dict(r) for r in items],
        'total': total,
        'unread_count': unread_count,
    }}


@router.post('/{notification_id}/read', summary='标记已读')
@require_permission('system.notification.read')
def mark_notification_read(request, notification_id: int):
    """标记单条通知为已读"""
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未登录'}

    from .models import NotificationRecord
    try:
        record = NotificationRecord.objects.get(
            id=notification_id,
            recipient_id=account.id,
        )
        if record.status in ('sent', 'delivered'):
            record.status = 'read'
            record.save(update_fields=['status'])
        return {'code': 200, 'msg': '已标记已读', 'data': {'id': record.id, 'status': record.status}}
    except NotificationRecord.DoesNotExist:
        return {'code': 404, 'msg': '通知不存在', 'data': None}


# ============================================================================
# Claw 桥接 API — 供 Claw 技能调用后端能力
# ============================================================================

class ClawNotifyIn(Schema):
    """Claw 技能发送通知的输入"""
    event_type: str  # alert|status_change|schedule|daily_digest
    source_module: str  # quality|equipment|scheduling|workorder|hr|finance
    priority: str = 'normal'  # critical|high|normal|low
    title: str
    content: str = ''
    entity_type: str = ''
    entity_id: Optional[int] = None
    action_url: str = ''
    recipients_mode: str = 'auto'  # role|user|auto
    recipient_roles: list = []
    recipient_user_ids: list = []


@router.post('/claw/notify', summary='[Claw] 发送通知')
def claw_send_notification(request, data: ClawNotifyIn):
    """
    Claw 技能统一通知端点。

    feishu-notification-hub Claw 通过此端点向后端发送通知请求，
    后端负责路由到正确的接收人并通过飞书推送。
    """
    from apps.notification.services import send_notification

    recipients = _resolve_recipients(data.recipients_mode, data.recipient_roles, data.recipient_user_ids, data.source_module)

    if not recipients:
        return {'code': 400, 'msg': '无法确定接收人', 'data': None}

    channel = 'feishu_urgent' if data.priority == 'critical' else 'feishu_card'
    sent_count = 0
    errors = []

    for user_id in recipients:
        try:
            send_notification(
                recipient_id=user_id,
                title=data.title,
                content=data.content,
                channel=channel,
                priority=data.priority,
                source_type=f'{data.source_module}.{data.event_type}',
                source_id=data.entity_id,
            )
            sent_count += 1
        except Exception as e:
            errors.append(f'user#{user_id}: {str(e)}')

    return {'code': 200, 'msg': f'已推送 {sent_count} 人', 'data': {
        'sent_count': sent_count,
        'total_recipients': len(recipients),
        'errors': errors[:5] if errors else [],
    }}


@router.get('/claw/alerts', summary='[Claw] 获取全域预警')
def claw_get_alerts(request, severity: Optional[str] = None, domain: Optional[str] = None):
    """
    Claw 技能获取预警数据。

    multi-domain-alert / secretary-orchestrator Claw 通过此端点
    获取全域预警数据用于分析和编排。
    """
    from apps.secretary.alert_service import generate_all_alerts

    alerts = generate_all_alerts()

    if severity:
        alerts = [a for a in alerts if a.get('severity') == severity]
    if domain:
        alerts = [a for a in alerts if a.get('type', '').startswith(domain)]

    by_severity = {}
    by_type = {}
    for a in alerts:
        sev = a.get('severity', 'low')
        by_severity[sev] = by_severity.get(sev, 0) + 1
        atype = a.get('type', 'unknown')
        by_type[atype] = by_type.get(atype, 0) + 1

    return {'code': 200, 'msg': 'OK', 'data': {
        'total': len(alerts),
        'by_severity': by_severity,
        'by_type': by_type,
        'alerts': alerts[:50],
    }}


@router.get('/claw/kpi-snapshot', summary='[Claw] 获取 KPI 快照')
def claw_kpi_snapshot(request):
    """
    Claw 技能获取 KPI 快照。

    business-dashboard / secretary-orchestrator Claw 通过此端点
    获取各模块关键指标用于生成报表。
    """
    from datetime import date, timedelta
    today = date.today()
    kpis = {}

    try:
        from apps.workorder.models import WorkOrder
        total = WorkOrder.objects.filter(is_deleted=False).count()
        completed = WorkOrder.objects.filter(
            is_deleted=False, status__in=['completed', 'approved']
        ).count()
        overdue = WorkOrder.objects.filter(
            is_deleted=False, due_date__lt=today
        ).exclude(status__in=['completed', 'approved', 'cancelled']).count()
        kpis['workorder'] = {'total': total, 'completed': completed, 'overdue': overdue,
                             'completion_rate': f'{completed/total*100:.1f}%' if total else '0%'}
    except Exception:
        kpis['workorder'] = {'error': 'unavailable'}

    try:
        from apps.scheduling.models import ScheduleSlot
        today_visits = ScheduleSlot.objects.filter(scheduled_date=today).count()
        week_visits = ScheduleSlot.objects.filter(
            scheduled_date__gte=today, scheduled_date__lte=today + timedelta(days=7)
        ).count()
        kpis['scheduling'] = {'today_visits': today_visits, 'week_visits': week_visits}
    except Exception:
        kpis['scheduling'] = {'error': 'unavailable'}

    try:
        from apps.quality.models import Deviation, CAPA
        open_dev = Deviation.objects.filter(status__in=['open', 'investigating']).count()
        overdue_capa = CAPA.objects.filter(status='overdue').count()
        kpis['quality'] = {'open_deviations': open_dev, 'overdue_capas': overdue_capa}
    except Exception:
        kpis['quality'] = {'error': 'unavailable'}

    try:
        from apps.resource.models import ResourceItem
        total_eq = ResourceItem.objects.filter(is_deleted=False).count()
        cal_due = ResourceItem.objects.filter(
            is_deleted=False, next_calibration_date__lte=today + timedelta(days=7)
        ).count()
        kpis['equipment'] = {'total': total_eq, 'calibration_due_7d': cal_due}
    except Exception:
        kpis['equipment'] = {'error': 'unavailable'}

    try:
        from apps.protocol.models import Protocol
        active = Protocol.objects.filter(status='active', is_deleted=False).count()
        kpis['projects'] = {'active': active}
    except Exception:
        kpis['projects'] = {'error': 'unavailable'}

    return {'code': 200, 'msg': 'OK', 'data': {
        'date': str(today),
        'kpis': kpis,
    }}


def _resolve_recipients(mode, roles, user_ids, source_module):
    """根据模式解析通知接收人"""
    result_ids = set()

    if mode == 'user' and user_ids:
        return list(user_ids)

    try:
        from apps.identity.models import Account

        if mode == 'role' and roles:
            accounts = Account.objects.filter(role__in=roles, is_active=True)
            result_ids.update(accounts.values_list('id', flat=True))
        elif mode == 'auto':
            role_map = {
                'quality': ['admin', 'qa_manager'],
                'equipment': ['admin', 'lab_director', 'equipment_manager'],
                'scheduling': ['admin', 'project_manager'],
                'workorder': ['admin', 'project_manager'],
                'hr': ['admin', 'hr_manager'],
                'finance': ['admin', 'finance_manager'],
            }
            target_roles = role_map.get(source_module, ['admin'])
            accounts = Account.objects.filter(role__in=target_roles, is_active=True)
            result_ids.update(accounts.values_list('id', flat=True))
    except Exception:
        pass

    return list(result_ids)


class CardCallbackIn(Schema):
    open_id: str = ''
    action: dict = {}
    token: str = ''


@router.post('/card-callback', summary='飞书交互卡片回调')
def card_callback(request, data: CardCallbackIn):
    """
    处理飞书交互卡片按钮点击回调。
    在飞书开放平台配置消息卡片请求网址指向此端点。
    """
    import logging
    logger = logging.getLogger('cn_kis.notification')

    action_value = data.action.get('value', {})
    action_type = action_value.get('action', '')

    logger.info(f'飞书卡片回调: action={action_type}, open_id={data.open_id[:8]}...')

    if action_type == 'accept_workorder':
        wo_id = action_value.get('workorder_id')
        if wo_id:
            try:
                from apps.workorder.models import WorkOrder
                wo = WorkOrder.objects.filter(id=int(wo_id), status__in=['pending', 'assigned']).first()
                if wo:
                    wo.status = 'in_progress'
                    wo.save(update_fields=['status', 'update_time'])
                    return {'code': 200, 'msg': f'工单 #{wo_id} 已接受'}
            except Exception as e:
                logger.error(f'卡片回调处理失败: {e}')

    elif action_type == 'complete_workorder':
        wo_id = action_value.get('workorder_id')
        if wo_id:
            try:
                from apps.workorder.models import WorkOrder
                wo = WorkOrder.objects.filter(id=int(wo_id), status='in_progress').first()
                if wo:
                    wo.status = 'completed'
                    wo.save(update_fields=['status', 'update_time'])
                    return {'code': 200, 'msg': f'工单 #{wo_id} 已完成'}
            except Exception as e:
                logger.error(f'卡片回调处理失败: {e}')

    elif action_type == 'start_reception':
        return {'code': 200, 'msg': '已确认接待'}

    elif action_type == 'acknowledge_ae':
        ae_id = action_value.get('ae_id')
        if ae_id:
            try:
                from apps.safety.models import AdverseEvent
                ae = AdverseEvent.objects.filter(id=int(ae_id)).first()
                if ae and ae.status in ('reported', 'pending'):
                    ae.status = 'under_investigation'
                    ae.save(update_fields=['status', 'update_time'])
                    return {'code': 200, 'msg': f'AE #{ae_id} 已确认处理'}
            except Exception as e:
                logger.error(f'AE回调处理失败: {e}')

    elif action_type == 'add_ae_followup':
        ae_id = action_value.get('ae_id')
        return {'code': 200, 'msg': f'请在系统中为AE #{ae_id} 添加随访记录'}

    elif action_type == 'reply_query':
        return {'code': 200, 'msg': '请在系统中回复数据质疑'}

    return {'code': 200, 'msg': '回调已处理'}
