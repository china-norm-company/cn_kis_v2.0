"""
设施环境管理工作台 — 业务服务层

覆盖：仪表盘、场地管理、预约管理、环境监控、不合规事件、清洁记录
"""
from datetime import datetime, date, timedelta
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.identity.models import Account
from .models import (
    ResourceItem,
    ResourceCategory,
    ResourceType,
    VenueEnvironmentLog,
    VenueReservation,
)
from .models_facility import (
    EnvironmentIncident, IncidentSeverity, IncidentStatus,
    CleaningRecord, CleaningType, CleaningStatus,
    VenueChangeLog,
    VenueUsageSchedule, VenueMonitorConfig,
)


DEFAULT_ENV_CATEGORY_CODE = 'ENV-GENERAL'


def _environment_venues_qs():
    return ResourceItem.objects.filter(
        is_deleted=False,
        category__resource_type=ResourceType.ENVIRONMENT,
    ).select_related('category')


def _ensure_environment_category():
    category = ResourceCategory.objects.filter(
        resource_type=ResourceType.ENVIRONMENT,
        is_active=True,
    ).order_by('id').first()
    if category:
        return category

    return ResourceCategory.objects.create(
        name='通用场地',
        code=DEFAULT_ENV_CATEGORY_CODE,
        resource_type=ResourceType.ENVIRONMENT,
        description='设施台自动创建的默认环境类别',
        is_active=True,
    )


def _venue_attrs(v):
    attrs = v.attributes if isinstance(v.attributes, dict) else {}
    return attrs


def _parse_dt(raw):
    if isinstance(raw, datetime):
        dt = raw
    else:
        dt = parse_datetime(str(raw)) if raw else None
    if not dt:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _compose_purpose(purpose: str, project_name: str) -> str:
    p = (purpose or '').strip()
    prj = (project_name or '').strip()
    if not prj:
        return p
    return f'[项目:{prj}] {p}'.strip()


def _extract_project_and_purpose(raw: str):
    text = (raw or '').strip()
    if text.startswith('[项目:') and '] ' in text:
        marker, purpose = text.split('] ', 1)
        project_name = marker.replace('[项目:', '').strip()
        return project_name, purpose.strip()
    return '', text


def _account_display_name(account_id):
    if not account_id:
        return ''
    account = Account.objects.filter(id=account_id, is_deleted=False).first()
    if not account:
        return ''
    return account.display_name or account.username


def _reservation_to_dict(r):
    project_name, purpose = _extract_project_and_purpose(r.purpose)
    return {
        'id': r.id,
        'venue_id': r.venue_id,
        'venue_name': r.venue.name,
        'start_time': r.start_time.isoformat(),
        'end_time': r.end_time.isoformat(),
        'purpose': purpose,
        'project_name': project_name,
        'reserved_by_name': _account_display_name(r.reserved_by_id),
        'status': r.status,
        'status_display': r.get_status_display(),
        'create_time': r.create_time.isoformat(),
    }


def _create_environment_incident_from_log(log: VenueEnvironmentLog):
    count = EnvironmentIncident.objects.count() + 1
    incident_no = f'INC-{timezone.now().year}-{count:03d}'
    title = f'环境偏离：{log.venue.name}'
    EnvironmentIncident.objects.create(
        incident_no=incident_no,
        venue=log.venue,
        severity=IncidentSeverity.MAJOR,
        status=IncidentStatus.OPEN,
        title=title,
        description=log.non_compliance_reason,
        deviation_param='temperature/humidity',
        reporter_name='system-auto',
        discovered_at=log.recorded_at,
    )


def _trigger_cross_workstation_workflows(log: VenueEnvironmentLog):
    """环境异常时触发跨台流程：质量偏差 + 物料温度预警。"""
    try:
        from apps.quality.models import Deviation, DeviationStatus, DeviationSeverity

        Deviation.objects.create(
            code=f'DEV-FACILITY-{log.id}',
            title=f'[环境超标] {log.venue.name} temperature/humidity',
            category='环境超标',
            severity=DeviationSeverity.MAJOR,
            status=DeviationStatus.IDENTIFIED,
            reporter='系统自动',
            reported_at=timezone.now().date(),
            project='AUTO',
            description=f'参数: temperature/humidity\n实际值: T={log.temperature}, H={log.humidity}\n限值: {log.non_compliance_reason}',
            source='environment_excursion',
            source_workstation='facility',
            source_record_id=str(log.id),
        )
    except Exception:
        # 跨台失败不阻塞主链路，避免影响环境记录落库
        pass

    try:
        from apps.sample.services.feishu_alert_service import _FeishuAlertService
        attrs = _venue_attrs(log.venue)
        if log.temperature is not None:
            target_temp = float(attrs.get('target_temp', 22))
            temp_tol = float(attrs.get('temp_tolerance', 2))
            _FeishuAlertService().push_temperature_alert(
                location_name=log.venue.name,
                temperature=log.temperature,
                upper_limit=target_temp + temp_tol,
                lower_limit=target_temp - temp_tol,
            )
    except Exception:
        pass


def _ensure_between_cleaning_for_reservation(reservation: VenueReservation):
    marker = f'reservation:{reservation.id}'
    exists = CleaningRecord.objects.filter(
        venue=reservation.venue,
        notes__contains=marker,
        cleaning_type=CleaningType.BETWEEN,
    ).exists()
    if exists:
        return
    CleaningRecord.objects.create(
        venue=reservation.venue,
        cleaning_type=CleaningType.BETWEEN,
        status=CleaningStatus.PENDING,
        cleaning_date=reservation.end_time.date(),
        notes=f'由预约自动生成，{marker}',
    )


def _refresh_venue_status(venue: ResourceItem):
    now = timezone.now()
    has_future_or_ongoing = VenueReservation.objects.filter(
        venue=venue,
        status='confirmed',
        end_time__gt=now,
    ).exists()
    venue.status = 'reserved' if has_future_or_ongoing else 'active'
    venue.save(update_fields=['status', 'update_time'])


# ============================================================================
# 仪表盘
# ============================================================================

def get_dashboard():
    """设施全景统计"""
    venues = _environment_venues_qs()
    venue_stats = _get_venue_stats(venues)

    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    reservation_today = VenueReservation.objects.filter(start_time__gte=today_start).count()
    reservation_week = VenueReservation.objects.filter(start_time__gte=week_start).count()
    pending_reservations = VenueReservation.objects.filter(status='pending').count()
    confirmed_week = VenueReservation.objects.filter(
        status='confirmed',
        start_time__gte=week_start,
    )
    reserved_hours = 0.0
    for item in confirmed_week:
        reserved_hours += max((item.end_time - item.start_time).total_seconds() / 3600, 0)
    total_capacity_hours = max(venues.count(), 1) * 24 * 7
    utilization_rate = round((reserved_hours / total_capacity_hours) * 100, 1) if total_capacity_hours else 0.0

    incidents_open = EnvironmentIncident.objects.filter(status__in=['open', 'investigating']).count()
    incidents_month = EnvironmentIncident.objects.filter(create_time__month=now.month, create_time__year=now.year).count()

    cleaning_month = CleaningRecord.objects.filter(cleaning_date__month=now.month, cleaning_date__year=now.year).count()
    cleaning_today_pending = CleaningRecord.objects.filter(cleaning_date=now.date(), status='pending').count()

    recent_logs = VenueEnvironmentLog.objects.filter(recorded_at__gte=now - timedelta(hours=24))
    compliant_count = recent_logs.filter(is_compliant=True).count()
    total_logs = recent_logs.count()
    compliance_rate = round(compliant_count / total_logs * 100, 1) if total_logs > 0 else 100.0
    online_venues = venues.filter(environment_logs__recorded_at__gte=now - timedelta(hours=1)).distinct().count()
    sensor_online_rate = round((online_venues / max(venues.count(), 1)) * 100, 1)
    closed_qs = EnvironmentIncident.objects.filter(closed_at__isnull=False)
    avg_response_minutes = 0
    if closed_qs.exists():
        total_minutes = 0
        count = 0
        for i in closed_qs:
            if i.discovered_at and i.closed_at:
                total_minutes += max((i.closed_at - i.discovered_at).total_seconds() / 60, 0)
                count += 1
        avg_response_minutes = round(total_minutes / count, 1) if count else 0
    cleaning_month_qs = CleaningRecord.objects.filter(cleaning_date__month=now.month, cleaning_date__year=now.year)
    cleaning_execution_rate = round(
        cleaning_month_qs.filter(status__in=[CleaningStatus.COMPLETED, CleaningStatus.VERIFIED]).count()
        / max(cleaning_month_qs.count(), 1) * 100, 1
    )

    return {
        'venues': venue_stats,
        'reservations': {
            'today_count': reservation_today,
            'week_count': reservation_week,
            'pending_count': pending_reservations,
            'utilization_rate': utilization_rate,
        },
        'environment': {
            'compliance_rate': compliance_rate,
            'non_compliant_venues': venues.filter(
                environment_logs__is_compliant=False,
                environment_logs__recorded_at__gte=now - timedelta(hours=24),
            ).distinct().count(),
            'sensor_online_rate': sensor_online_rate,
        },
        'incidents': {
            'open_count': incidents_open,
            'month_new': incidents_month,
            'avg_response_minutes': avg_response_minutes,
            'closure_rate': 0,
        },
        'cleaning': {
            'month_count': cleaning_month,
            'execution_rate': cleaning_execution_rate,
            'today_pending': cleaning_today_pending,
            'deep_pending': 0,
        },
    }


def _get_venue_stats(qs=None):
    if qs is None:
        qs = _environment_venues_qs()
    # 实际导入的场地功能（去重，用于筛选下拉）
    distinct_types = qs.values_list('attributes__venue_type', flat=True).distinct()
    venue_types = []
    seen = set()
    for vt in distinct_types:
        if vt and vt not in seen:
            seen.add(vt)
            label = VENUE_TYPE_DISPLAY.get(vt, vt)
            venue_types.append({'value': vt, 'label': label})
    return {
        'total': qs.count(),
        'available': qs.filter(status='active').count(),
        'in_use': qs.filter(status='reserved').count(),
        'maintenance': qs.filter(status='maintenance').count(),
        'non_compliant': 0,
        'venue_types': venue_types,
    }


# ============================================================================
# 场地管理
# ============================================================================

def list_venues(keyword='', venue_type='', status='', page=1, page_size=20):
    qs = _environment_venues_qs()
    if keyword:
        kw = keyword.strip()
        # 模糊检索：场地名称、编码、所属中心（attributes.center）
        qs = qs.filter(
            Q(name__icontains=kw) | Q(code__icontains=kw) | Q(attributes__center__icontains=kw)
        )
    if venue_type:
        qs = qs.filter(attributes__venue_type=venue_type)
    if status:
        status_map = {'available': 'active', 'in_use': 'reserved', 'maintenance': 'maintenance', 'inactive': 'retired'}
        db_status = status_map.get(status, status)
        qs = qs.filter(status=db_status)

    total = qs.count()
    offset = (page - 1) * page_size
    items = qs[offset:offset + page_size]

    return {
        'items': [_venue_to_dict(v) for v in items],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def get_venue_detail(venue_id):
    venue = _environment_venues_qs().get(id=venue_id)
    data = _venue_to_dict(venue)
    data['equipment_list'] = []
    data['recent_reservations'] = list(
        VenueReservation.objects.filter(venue=venue)[:5].values(
            'id', 'purpose', 'start_time', 'end_time', 'status',
        )
    )
    data['recent_env_logs'] = list(
        VenueEnvironmentLog.objects.filter(venue=venue)[:5].values(
            'id', 'temperature', 'humidity', 'is_compliant', 'recorded_at',
        )
    )
    return data


def get_venue_stats():
    return _get_venue_stats()


def create_venue(data):
    category = _ensure_environment_category()
    attrs = {
        'center': data.get('center', ''),
        'venue_type': data.get('venue_type', ''),
        'env_requirements': data.get('env_requirements', ''),
        'area': data.get('area', 0) or 0,
        'capacity': data.get('capacity', 0) or 0,
        'floor': data.get('floor', ''),
        'building': data.get('building', ''),
        'control_level': data.get('control_level', 'basic'),
        'target_temp': data.get('target_temp', 22),
        'temp_tolerance': data.get('temp_tolerance', 2),
        'target_humidity': data.get('target_humidity', 50),
        'humidity_tolerance': data.get('humidity_tolerance', 10),
        'description': data.get('description', ''),
    }
    status = data.get('status', 'active')
    if status not in ('active', 'reserved', 'maintenance', 'retired', 'idle'):
        status = 'active'
    venue = ResourceItem.objects.create(
        name=data.get('name', ''),
        code=data.get('code', ''),
        category=category,
        status=status,
        attributes=attrs,
    )
    return {'id': venue.id, 'name': venue.name, 'code': venue.code}


def update_venue(venue_id, data):
    venue = _environment_venues_qs().get(id=venue_id)
    base_fields = {'name', 'code', 'status', 'location', 'manager_id'}
    attrs = _venue_attrs(venue).copy()
    attr_fields = {
        'center', 'venue_type', 'env_requirements', 'area', 'capacity',
        'floor', 'building', 'control_level', 'target_temp', 'temp_tolerance',
        'target_humidity', 'humidity_tolerance', 'description',
    }
    for k, v in data.items():
        if k in base_fields and hasattr(venue, k):
            setattr(venue, k, v)
        elif k in attr_fields:
            attrs[k] = v
    venue.attributes = attrs
    venue.save()
    return {'id': venue.id}


# 可变更的场地字段（code 不可变更）
VENUE_CHANGEABLE_FIELDS = {
    'name', 'center', 'area', 'venue_type', 'env_requirements', 'status',
    'floor', 'building', 'capacity', 'description',
    'target_temp', 'temp_tolerance', 'target_humidity', 'humidity_tolerance', 'control_level',
}


def _venue_snapshot_for_log(venue):
    """构建用于变更记录的场地快照（扁平 dict）"""
    attrs = _venue_attrs(venue)
    return {
        'name': venue.name,
        'code': venue.code or '',
        'center': attrs.get('center', ''),
        'area': attrs.get('area', 0),
        'venue_type': attrs.get('venue_type', ''),
        'env_requirements': attrs.get('env_requirements', ''),
        'status': venue.status or 'active',
        'floor': attrs.get('floor', ''),
        'building': attrs.get('building', ''),
        'capacity': attrs.get('capacity', 0),
        'description': attrs.get('description', ''),
        'target_temp': attrs.get('target_temp', 22),
        'temp_tolerance': attrs.get('temp_tolerance', 2),
        'target_humidity': attrs.get('target_humidity', 50),
        'humidity_tolerance': attrs.get('humidity_tolerance', 10),
        'control_level': attrs.get('control_level', 'basic'),
    }


def change_venue(venue_id, data, changed_by_id=None, changed_by_name=''):
    """
    场地信息变更：更新场地并记录变更历史。
    场地编号（code）不允许变更，传入的 code 会被忽略。
    """
    venue = _environment_venues_qs().get(id=venue_id)
    before = _venue_snapshot_for_log(venue)

    # 排除 code，仅更新可变更字段
    base_fields = {'name', 'status'}
    attrs = _venue_attrs(venue).copy()
    attr_fields = {
        'center', 'venue_type', 'env_requirements', 'area', 'capacity',
        'floor', 'building', 'control_level', 'target_temp', 'temp_tolerance',
        'target_humidity', 'humidity_tolerance', 'description',
    }
    for k, v in data.items():
        if k == 'code':
            continue
        if k in base_fields and hasattr(venue, k):
            setattr(venue, k, v)
        elif k in attr_fields:
            attrs[k] = v
    venue.attributes = attrs
    venue.save()

    after = _venue_snapshot_for_log(venue)
    changed_fields = [f for f in VENUE_CHANGEABLE_FIELDS if before.get(f) != after.get(f)]

    if changed_fields:
        VenueChangeLog.objects.create(
            venue=venue,
            venue_code=venue.code or '',
            changed_by_id=changed_by_id,
            changed_by_name=changed_by_name or '',
            before_data=before,
            after_data=after,
            changed_fields=changed_fields,
        )

    return {'id': venue.id, 'changed_fields': changed_fields}


def list_venue_change_logs(venue_id=None, page=1, page_size=20):
    """场地变更历史记录列表"""
    qs = VenueChangeLog.objects.select_related('venue').all().order_by('-change_time')
    if venue_id:
        qs = qs.filter(venue_id=venue_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = qs[offset:offset + page_size]
    return {
        'items': [
            {
                'id': log.id,
                'venue_id': log.venue_id,
                'venue_code': log.venue_code,
                'venue_name': log.venue.name,
                'changed_by_id': log.changed_by_id,
                'changed_by_name': log.changed_by_name,
                'change_time': log.change_time.isoformat() if log.change_time else '',
                'before_data': log.before_data,
                'after_data': log.after_data,
                'changed_fields': log.changed_fields,
            }
            for log in items
        ],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


VENUE_TYPE_DISPLAY = {
    'testing_room': '恒温恒湿测试室',
    'waiting_area': '等候区',
    'washing_area': '洗漱区',
    'storage_room': '存储室',
    'office': '办公室',
    'utility_room': '功能间',
    'reception': '接待',
    '': '',
}

VENUE_STATUS_DISPLAY = {
    'active': '启用',
    'reserved': '使用中',
    'idle': '闲置',
    'maintenance': '维修中',
    'retired': '停用',
}


def _venue_to_dict(v):
    attrs = _venue_attrs(v)
    latest = VenueEnvironmentLog.objects.filter(venue=v).first()
    venue_type = attrs.get('venue_type', '')
    env_req = attrs.get('env_requirements', '')
    if not env_req:
        t, tol_t = attrs.get('target_temp', 22), attrs.get('temp_tolerance', 2)
        h, tol_h = attrs.get('target_humidity', 50), attrs.get('humidity_tolerance', 10)
        env_req = f'{t}±{tol_t}°C, {h}±{tol_h}%RH'
    status = v.status
    status_display = VENUE_STATUS_DISPLAY.get(status, status or '启用')
    return {
        'id': v.id,
        'name': v.name,
        'code': v.code or '',
        'center': attrs.get('center', ''),
        'area': attrs.get('area', 0),
        'capacity': attrs.get('capacity', 0),
        'venue_type': venue_type,
        'venue_type_display': VENUE_TYPE_DISPLAY.get(venue_type, venue_type or ''),
        'env_requirements': env_req,
        'floor': attrs.get('floor', ''),
        'building': attrs.get('building', ''),
        'status': status,
        'status_display': status_display,
        'control_level': attrs.get('control_level', 'basic'),
        'control_level_display': attrs.get('control_level', 'basic'),
        'target_temp': attrs.get('target_temp', 22),
        'temp_tolerance': attrs.get('temp_tolerance', 2),
        'target_humidity': attrs.get('target_humidity', 50),
        'humidity_tolerance': attrs.get('humidity_tolerance', 10),
        'current_temp': latest.temperature if latest else None,
        'current_humidity': latest.humidity if latest else None,
        'is_compliant': latest.is_compliant if latest else True,
        'equipment_count': 0,
        'description': attrs.get('description', ''),
        'create_time': v.create_time.isoformat() if v.create_time else '',
    }


# ============================================================================
# 预约管理
# ============================================================================

def list_reservations(status='', venue_id=None, page=1, page_size=20):
    qs = VenueReservation.objects.select_related('venue').all()
    if status:
        qs = qs.filter(status=status)
    if venue_id:
        qs = qs.filter(venue_id=venue_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = qs[offset:offset + page_size]
    return {
        'items': [_reservation_to_dict(r) for r in items],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def get_reservation_stats():
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    week_reservations = VenueReservation.objects.filter(status='confirmed', start_time__gte=week_start)
    reserved_hours = 0.0
    for item in week_reservations:
        reserved_hours += max((item.end_time - item.start_time).total_seconds() / 3600, 0)
    venue_count = _environment_venues_qs().count()
    capacity_hours = max(venue_count, 1) * 24 * 7
    return {
        'today_count': VenueReservation.objects.filter(start_time__gte=today_start).count(),
        'week_count': VenueReservation.objects.filter(start_time__gte=week_start).count(),
        'pending_count': VenueReservation.objects.filter(status='pending').count(),
        'utilization_rate': round((reserved_hours / capacity_hours) * 100, 1) if capacity_hours else 0.0,
    }


def get_calendar():
    qs = VenueReservation.objects.select_related('venue').all()[:50]
    return {
        'entries': [{
            'id': r.id,
            'venue_name': r.venue.name,
            'start_time': r.start_time.isoformat(),
            'end_time': r.end_time.isoformat(),
            'purpose': _extract_project_and_purpose(r.purpose)[1],
            'project_name': _extract_project_and_purpose(r.purpose)[0],
            'status': r.status,
        } for r in qs],
    }


def _has_reservation_conflict(venue_id, start_dt, end_dt, exclude_id=None):
    qs = VenueReservation.objects.filter(
        venue_id=venue_id,
        status__in=['pending', 'confirmed'],
        start_time__lt=end_dt,
        end_time__gt=start_dt,
    )
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return qs.exists()


def create_reservation(data, account=None):
    start_dt = _parse_dt(data.get('start_time'))
    end_dt = _parse_dt(data.get('end_time'))
    if not start_dt or not end_dt:
        return {'error': '预约时间格式错误，需使用 ISO 时间'}
    if end_dt <= start_dt:
        return {'error': '结束时间必须晚于开始时间'}
    if _has_reservation_conflict(data.get('venue_id'), start_dt, end_dt):
        return {'error': '该场地在当前时间段已有预约，请调整时间'}

    r = VenueReservation.objects.create(
        venue_id=data.get('venue_id'),
        start_time=start_dt,
        end_time=end_dt,
        purpose=_compose_purpose(data.get('purpose', ''), data.get('project_name', '')),
        reserved_by_id=account.id if account else None,
        status='pending',
    )
    return {'id': r.id, 'status': r.status}


def confirm_reservation(reservation_id):
    r = VenueReservation.objects.get(id=reservation_id)
    if _has_reservation_conflict(r.venue_id, r.start_time, r.end_time, exclude_id=r.id):
        return {'error': '确认失败：同时间段存在冲突预约'}
    r.status = 'confirmed'
    r.save(update_fields=['status', 'update_time'])
    # 已确认预约占用场地，降低并发误占用风险
    if r.venue.status == 'active':
        r.venue.status = 'reserved'
        r.venue.save(update_fields=['status', 'update_time'])
    _ensure_between_cleaning_for_reservation(r)
    return {'status': 'confirmed'}


def cancel_reservation(reservation_id):
    r = VenueReservation.objects.get(id=reservation_id)
    r.status = 'cancelled'
    r.save(update_fields=['status', 'update_time'])
    _refresh_venue_status(r.venue)
    return {'status': 'cancelled'}


# ============================================================================
# 环境监控
# ============================================================================

def get_current_environment():
    venues = _environment_venues_qs()
    readings = []
    for v in venues:
        attrs = _venue_attrs(v)
        latest = VenueEnvironmentLog.objects.filter(venue=v).first()
        if latest:
            readings.append({
                'venue_id': v.id,
                'venue_name': v.name,
                'temperature': latest.temperature,
                'humidity': latest.humidity,
                'is_compliant': latest.is_compliant,
                'target_temp': attrs.get('target_temp', 22),
                'temp_tolerance': attrs.get('temp_tolerance', 2),
                'target_humidity': attrs.get('target_humidity', 50),
                'humidity_tolerance': attrs.get('humidity_tolerance', 10),
                'last_updated': latest.recorded_at.isoformat(),
            })
    return {'readings': readings}


def list_environment_logs(venue_id=None, is_compliant=None, page=1, page_size=50):
    qs = VenueEnvironmentLog.objects.select_related('venue').all()
    if venue_id:
        qs = qs.filter(venue_id=venue_id)
    if is_compliant is not None:
        qs = qs.filter(is_compliant=is_compliant)
    total = qs.count()
    offset = (page - 1) * page_size
    items = qs[offset:offset + page_size]
    return {
        'items': [{
            'id': l.id,
            'venue_id': l.venue_id,
            'venue_name': l.venue.name,
            'temperature': l.temperature,
            'humidity': l.humidity,
            'airflow': None,
            'illuminance': None,
            'is_compliant': l.is_compliant,
            'non_compliance_reason': l.non_compliance_reason,
            'recorder_name': '',
            'recorded_at': l.recorded_at.isoformat(),
        } for l in items],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def get_compliance_stats():
    now = timezone.now()
    recent = VenueEnvironmentLog.objects.filter(recorded_at__gte=now - timedelta(days=30))
    total = recent.count()
    compliant = recent.filter(is_compliant=True).count()
    venues = []
    for venue in _environment_venues_qs():
        v_qs = recent.filter(venue=venue)
        v_total = v_qs.count()
        v_ok = v_qs.filter(is_compliant=True).count()
        venues.append({
            'venue_id': venue.id,
            'venue_name': venue.name,
            'compliance_rate': round(v_ok / v_total * 100, 1) if v_total else 100.0,
            'non_compliant_count': v_total - v_ok if v_total else 0,
        })
    return {
        'overall_rate': round(compliant / total * 100, 1) if total > 0 else 100.0,
        'compliant_count': compliant,
        'non_compliant_count': total - compliant,
        'sensor_online_rate': round(
            _environment_venues_qs().filter(environment_logs__recorded_at__gte=now - timedelta(hours=1)).distinct().count()
            / max(_environment_venues_qs().count(), 1) * 100, 1
        ),
        'venues': venues,
    }


def create_environment_log(data, account=None):
    is_compliant = True
    reasons = []
    venue = _environment_venues_qs().filter(id=data.get('venue_id')).first()
    if not venue:
        return {'error': '场地不存在'}
    attrs = _venue_attrs(venue)
    temp = data.get('temperature')
    hum = data.get('humidity')
    target_temp = float(attrs.get('target_temp', 22))
    temp_tol = float(attrs.get('temp_tolerance', 2))
    target_humidity = float(attrs.get('target_humidity', 50))
    humidity_tol = float(attrs.get('humidity_tolerance', 10))
    temp_min, temp_max = target_temp - temp_tol, target_temp + temp_tol
    hum_min, hum_max = target_humidity - humidity_tol, target_humidity + humidity_tol

    if temp is not None and (temp < temp_min or temp > temp_max):
        is_compliant = False
        reasons.append(f'温度 {temp}°C 超出范围({temp_min:.1f}~{temp_max:.1f})')
    if hum is not None and (hum < hum_min or hum > hum_max):
        is_compliant = False
        reasons.append(f'湿度 {hum}% 超出范围({hum_min:.1f}~{hum_max:.1f})')

    log = VenueEnvironmentLog.objects.create(
        venue=venue,
        recorded_at=timezone.now(),
        temperature=temp,
        humidity=hum,
        is_compliant=is_compliant,
        non_compliance_reason='; '.join(reasons),
        recorder_id=account.id if account else None,
    )
    incident_created = False
    if not is_compliant and getattr(settings, 'FACILITY_AUTO_INCIDENT_ENABLED', True):
        _create_environment_incident_from_log(log)
        incident_created = True
        _trigger_cross_workstation_workflows(log)
    return {'id': log.id, 'is_compliant': is_compliant, 'incident_created': incident_created}


# ============================================================================
# 不合规事件
# ============================================================================

def list_incidents(severity='', status='', page=1, page_size=20):
    qs = EnvironmentIncident.objects.select_related('venue').all()
    if severity:
        qs = qs.filter(severity=severity)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    items = qs[offset:offset + page_size]
    return {
        'items': [{
            'id': i.id,
            'incident_no': i.incident_no,
            'venue_id': i.venue_id,
            'venue_name': i.venue.name,
            'severity': i.severity,
            'severity_display': i.get_severity_display(),
            'status': i.status,
            'status_display': i.get_status_display(),
            'title': i.title,
            'description': i.description,
            'deviation_param': i.deviation_param,
            'deviation_duration': i.deviation_duration,
            'affected_tests': i.affected_tests,
            'root_cause': i.root_cause,
            'corrective_action': i.corrective_action,
            'preventive_action': i.preventive_action,
            'reporter_name': i.reporter_name,
            'assigned_to_name': i.assigned_to_name,
            'discovered_at': i.discovered_at.isoformat() if i.discovered_at else '',
            'create_time': i.create_time.isoformat(),
        } for i in items],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def get_incident_stats():
    now = timezone.now()
    open_count = EnvironmentIncident.objects.filter(status__in=['open', 'investigating']).count()
    month_new = EnvironmentIncident.objects.filter(
        create_time__month=now.month, create_time__year=now.year,
    ).count()
    closed = EnvironmentIncident.objects.filter(status='closed').count()
    total = EnvironmentIncident.objects.count()
    return {
        'open_count': open_count,
        'month_new': month_new,
        'avg_response_minutes': 15,
        'closure_rate': round(closed / total * 100, 1) if total > 0 else 0,
    }


def get_incident_detail(incident_id):
    i = EnvironmentIncident.objects.select_related('venue').get(id=incident_id)
    return {
        'id': i.id,
        'incident_no': i.incident_no,
        'venue_id': i.venue_id,
        'venue_name': i.venue.name,
        'severity': i.severity,
        'severity_display': i.get_severity_display(),
        'status': i.status,
        'status_display': i.get_status_display(),
        'title': i.title,
        'description': i.description,
        'deviation_param': i.deviation_param,
        'deviation_duration': i.deviation_duration,
        'affected_tests': i.affected_tests,
        'root_cause': i.root_cause,
        'corrective_action': i.corrective_action,
        'preventive_action': i.preventive_action,
        'reporter_name': i.reporter_name,
        'assigned_to_name': i.assigned_to_name,
        'discovered_at': i.discovered_at.isoformat() if i.discovered_at else '',
        'create_time': i.create_time.isoformat(),
        'closed_at': i.closed_at.isoformat() if i.closed_at else None,
        'timeline': [],
    }


def create_incident(data, account=None):
    count = EnvironmentIncident.objects.count() + 1
    incident_no = f'INC-{timezone.now().year}-{count:03d}'
    i = EnvironmentIncident.objects.create(
        incident_no=incident_no,
        venue_id=data.get('venue_id'),
        severity=data.get('severity', 'minor'),
        title=data.get('title', ''),
        description=data.get('description', ''),
        deviation_param=data.get('deviation_param', ''),
        reporter_name=account.display_name if account else '',
        reporter_id=account.id if account else None,
        discovered_at=timezone.now(),
    )
    return {'id': i.id, 'incident_no': i.incident_no, 'status': i.status}


def update_incident(incident_id, data):
    i = EnvironmentIncident.objects.get(id=incident_id)
    new_status = data.get('status')
    if new_status:
        i.status = new_status
        if new_status == 'closed':
            i.closed_at = timezone.now()
    for field in ['root_cause', 'corrective_action', 'preventive_action', 'assigned_to_name']:
        if field in data:
            setattr(i, field, data[field])
    i.save()
    return {
        'id': i.id,
        'status': i.status,
        'status_display': i.get_status_display(),
    }


# ============================================================================
# 清洁记录
# ============================================================================

def list_cleaning_records(cleaning_type='', venue_id=None, status='', page=1, page_size=20):
    qs = CleaningRecord.objects.select_related('venue').all()
    if cleaning_type:
        qs = qs.filter(cleaning_type=cleaning_type)
    if venue_id:
        qs = qs.filter(venue_id=venue_id)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    offset = (page - 1) * page_size
    items = qs[offset:offset + page_size]
    return {
        'items': [{
            'id': c.id,
            'venue_id': c.venue_id,
            'venue_name': c.venue.name,
            'cleaning_type': c.cleaning_type,
            'type_display': c.get_cleaning_type_display(),
            'cleaner_name': c.cleaner_name,
            'verifier_name': c.verifier_name,
            'status': c.status,
            'status_display': c.get_status_display(),
            'cleaning_date': c.cleaning_date.isoformat(),
            'cleaning_agents': c.cleaning_agents,
            'checklist_items': c.checklist_items,
            'checklist_completed': c.checklist_completed,
            'env_confirmed': c.env_confirmed,
            'create_time': c.create_time.isoformat(),
        } for c in items],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def get_cleaning_stats():
    now = timezone.now()
    month_count = CleaningRecord.objects.filter(
        cleaning_date__month=now.month, cleaning_date__year=now.year,
    ).count()
    today_pending = CleaningRecord.objects.filter(cleaning_date=now.date(), status='pending').count()
    deep_pending = CleaningRecord.objects.filter(cleaning_type='deep', status='pending').count()
    return {
        'month_count': month_count,
        'execution_rate': 100,
        'today_pending': today_pending,
        'deep_pending': deep_pending,
    }


def create_cleaning_record(data, account=None):
    c = CleaningRecord.objects.create(
        venue_id=data.get('venue_id'),
        cleaning_type=data.get('cleaning_type', 'daily'),
        cleaner_name=data.get('cleaner_name', _account_display_name(account.id) if account else ''),
        cleaning_agents=data.get('cleaning_agents', ''),
        cleaning_date=date.today(),
        cleaner_id=account.id if account else None,
        status='pending',
    )
    return {'id': c.id, 'status': c.status}


def update_cleaning_record(cleaning_id, data, account=None):
    c = CleaningRecord.objects.select_related('venue').filter(id=cleaning_id).first()
    if not c:
        return {'error': '清洁记录不存在'}
    new_status = data.get('status')
    if new_status:
        c.status = new_status
    if 'verifier_name' in data:
        c.verifier_name = data.get('verifier_name') or _account_display_name(account.id) if account else ''
    if 'env_confirmed' in data:
        c.env_confirmed = bool(data.get('env_confirmed'))
    if account and c.status == CleaningStatus.VERIFIED and not c.verifier_id:
        c.verifier_id = account.id
    c.save()
    if c.status == CleaningStatus.VERIFIED and c.env_confirmed:
        _refresh_venue_status(c.venue)
    return {'id': c.id, 'status': c.status, 'env_confirmed': c.env_confirmed}


# ============================================================================
# 房间使用时段
# ============================================================================

def is_venue_in_usage_period(venue, now=None):
    """
    判断场地当前是否在使用时段内。
    支持按周重复（days_of_week）和指定日期（specific_date）。
    """
    if now is None:
        now = timezone.now()
    schedules = VenueUsageSchedule.objects.filter(venue=venue, is_enabled=True)
    for s in schedules:
        if s.schedule_type == VenueUsageSchedule.SCHEDULE_TYPE_SPECIFIC:
            if s.specific_date and s.specific_date == now.date():
                if s.start_time <= now.time() <= s.end_time:
                    return True
        else:
            days = s.days_of_week or []
            if not days:
                continue
            if now.weekday() in days and s.start_time <= now.time() <= s.end_time:
                return True
    return False


def _schedule_day_display(s):
    """生成时段显示文本"""
    if s.schedule_type == VenueUsageSchedule.SCHEDULE_TYPE_SPECIFIC and s.specific_date:
        return s.specific_date.strftime('%Y-%m-%d')
    days = s.days_of_week or []
    if not days:
        return '未配置'
    if set(days) == {0, 1, 2, 3, 4, 5, 6}:
        return '每天'
    if set(days) == {0, 1, 2, 3, 4}:
        return '工作日'
    names = ['一', '二', '三', '四', '五', '六', '日']
    return '、'.join(f'周{names[d]}' for d in sorted(days))


def list_venue_usage_schedules(venue_id=None):
    qs = VenueUsageSchedule.objects.select_related('venue').all()
    if venue_id:
        qs = qs.filter(venue_id=venue_id)
    items = []
    for s in qs:
        items.append({
            'id': s.id,
            'venue_id': s.venue_id,
            'venue_name': s.venue.name,
            'venue_code': s.venue.code or '',
            'is_enabled': s.is_enabled,
            'schedule_type': s.schedule_type,
            'days_of_week': s.days_of_week or [],
            'specific_date': s.specific_date.isoformat() if s.specific_date else None,
            'day_display': _schedule_day_display(s),
            'start_time': s.start_time.strftime('%H:%M'),
            'end_time': s.end_time.strftime('%H:%M'),
            'create_time': s.create_time.isoformat(),
        })
    return {'items': items}


def create_venue_usage_schedule(data):
    venue = _environment_venues_qs().filter(id=data.get('venue_id')).first()
    if not venue:
        return {'error': '场地不存在'}
    from django.utils.dateparse import parse_time, parse_date
    start_str = data.get('start_time', '08:00')
    end_str = data.get('end_time', '18:00')
    start_time = parse_time(start_str) if isinstance(start_str, str) else None
    end_time = parse_time(end_str) if isinstance(end_str, str) else None
    if not start_time or not end_time:
        return {'error': '开始/结束时间格式错误，请使用 HH:MM'}
    if start_time >= end_time:
        return {'error': '结束时间必须晚于开始时间'}
    schedule_type = data.get('schedule_type') or VenueUsageSchedule.SCHEDULE_TYPE_RECURRING
    days_of_week = data.get('days_of_week')
    if isinstance(days_of_week, str):
        days_of_week = [int(x) for x in days_of_week.split(',') if x.strip().isdigit()]
    if days_of_week is None:
        days_of_week = [0, 1, 2, 3, 4, 5, 6]
    specific_date = None
    if schedule_type == VenueUsageSchedule.SCHEDULE_TYPE_SPECIFIC:
        sd = data.get('specific_date')
        specific_date = parse_date(sd) if isinstance(sd, str) else sd
        if not specific_date:
            return {'error': '指定日期格式错误，请使用 YYYY-MM-DD'}
    s = VenueUsageSchedule.objects.create(
        venue=venue,
        is_enabled=bool(data.get('is_enabled', True)),
        schedule_type=schedule_type,
        days_of_week=days_of_week,
        specific_date=specific_date,
        start_time=start_time,
        end_time=end_time,
    )
    return {'id': s.id, 'venue_id': s.venue_id}


def update_venue_usage_schedule(schedule_id, data):
    from django.utils.dateparse import parse_time, parse_date
    s = VenueUsageSchedule.objects.filter(id=schedule_id).first()
    if not s:
        return {'error': '使用时段不存在'}
    if 'is_enabled' in data:
        s.is_enabled = bool(data['is_enabled'])
    if 'start_time' in data:
        t = parse_time(str(data['start_time']))
        if t:
            s.start_time = t
    if 'end_time' in data:
        t = parse_time(str(data['end_time']))
        if t:
            s.end_time = t
    if 'schedule_type' in data:
        s.schedule_type = data['schedule_type']
    if 'days_of_week' in data:
        dow = data['days_of_week']
        if isinstance(dow, str):
            dow = [int(x) for x in dow.split(',') if x.strip().isdigit()]
        s.days_of_week = dow or []
    if 'specific_date' in data:
        sd = data['specific_date']
        s.specific_date = parse_date(sd) if isinstance(sd, str) else sd
    s.save()
    return {'id': s.id}


def delete_venue_usage_schedule(schedule_id):
    s = VenueUsageSchedule.objects.filter(id=schedule_id).first()
    if not s:
        return {'error': '使用时段不存在'}
    s.delete()
    return {'deleted': True}


# ============================================================================
# 场地监控人
# ============================================================================

def list_venue_monitors(venue_id=None):
    qs = VenueMonitorConfig.objects.select_related('venue').all()
    if venue_id:
        qs = qs.filter(venue_id=venue_id)
    items = []
    for m in qs:
        account = Account.objects.filter(id=m.monitor_account_id, is_deleted=False).first()
        items.append({
            'id': m.id,
            'venue_id': m.venue_id,
            'venue_name': m.venue.name,
            'monitor_account_id': m.monitor_account_id,
            'monitor_display_name': account.display_name or account.username if account else f'账号#{m.monitor_account_id}',
            'is_primary': m.is_primary,
            'create_time': m.create_time.isoformat(),
        })
    return {'items': items}


def add_venue_monitor(data):
    venue = _environment_venues_qs().filter(id=data.get('venue_id')).first()
    if not venue:
        return {'error': '场地不存在'}
    account_id = int(data.get('monitor_account_id', 0))
    if not account_id:
        return {'error': '请选择监控人'}
    if not Account.objects.filter(id=account_id, is_deleted=False).exists():
        return {'error': '账号不存在'}
    if VenueMonitorConfig.objects.filter(venue=venue, monitor_account_id=account_id).exists():
        return {'error': '该监控人已配置'}
    is_primary = bool(data.get('is_primary', False))
    if is_primary:
        VenueMonitorConfig.objects.filter(venue=venue).update(is_primary=False)
    m = VenueMonitorConfig.objects.create(
        venue=venue,
        monitor_account_id=account_id,
        is_primary=is_primary,
    )
    return {'id': m.id, 'venue_id': m.venue_id}


def remove_venue_monitor(monitor_id):
    m = VenueMonitorConfig.objects.filter(id=monitor_id).first()
    if not m:
        return {'error': '监控人配置不存在'}
    m.delete()
    return {'deleted': True}


def set_venue_primary_monitor(monitor_id):
    m = VenueMonitorConfig.objects.filter(id=monitor_id).first()
    if not m:
        return {'error': '监控人配置不存在'}
    VenueMonitorConfig.objects.filter(venue=m.venue).update(is_primary=False)
    m.is_primary = True
    m.save()
    return {'id': m.id}


def list_accounts_for_monitor(keyword='', page=1, page_size=50):
    """用于监控人选择器的账号列表（简化版）"""
    qs = Account.objects.filter(is_deleted=False)
    if keyword:
        qs = qs.filter(
            Q(display_name__icontains=keyword) |
            Q(username__icontains=keyword) |
            Q(email__icontains=keyword)
        )
    qs = qs.order_by('display_name', 'username')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {
        'items': [{'id': a.id, 'display_name': a.display_name or a.username, 'username': a.username} for a in items],
        'total': total,
        'page': page,
        'page_size': page_size,
    }
