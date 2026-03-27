"""
执行订单落库成功后同步知情管理（Protocol）：项目编号/名称、现场筛选计划起止、列表置顶、项目同步时间。

不修改知情签署与配置校验逻辑，仅写入/更新数据。
"""
import logging
from typing import List, Optional

from django.utils import timezone

from apps.protocol.models import Protocol
from apps.protocol.services import protocol_service as protocol_svc
from apps.subject.services.consent_service import _normalize_screening_schedule_for_stats

from .workorder_sync import _first_row_dict, parse_schedule_anchor_screening_range

logger = logging.getLogger(__name__)


def _screening_schedule_from_anchor_range(start_iso: Optional[str], end_iso: Optional[str]) -> List[dict]:
    if not start_iso or not end_iso:
        return []
    if start_iso == end_iso:
        raw = [{'date': start_iso, 'target_count': 1}]
    else:
        raw = [
            {'date': start_iso, 'target_count': 1},
            {'date': end_iso, 'target_count': 1},
        ]
        raw.sort(key=lambda x: x['date'])
    return _normalize_screening_schedule_for_stats(raw)


def sync_execution_order_upload_to_consent(rec) -> None:
    """
    从 ExecutionOrderUpload 同步到知情：按项目编号 upsert Protocol；
    筛选计划来自执行排期锚点行；无日期时 screening_schedule 置空（策略 A 仍更新项目编号/名称）。
    """
    from apps.protocol.api import _get_consent_settings
    from apps.scheduling.api import _normalize_execution_order_data, _project_code_from_payload

    try:
        out = _normalize_execution_order_data(rec)
        if out is None:
            return
        headers, rows = out
        code = _project_code_from_payload(headers, rows)
        code = protocol_svc.normalize_protocol_code(code or '')
        if not code:
            return
        first = _first_row_dict(rec)
        project_name = (first.get('项目名称') or '').strip() or code
        raw_schedule = (first.get('执行排期') or first.get('测试具体排期') or '').strip()
        start_iso, end_iso = parse_schedule_anchor_screening_range(raw_schedule)
        screening_schedule = _screening_schedule_from_anchor_range(start_iso, end_iso)
        now = timezone.now()

        from django.db.models import Min

        existing = Protocol.objects.filter(is_deleted=False, code=code).first()
        if existing:
            min_o = Protocol.objects.filter(is_deleted=False).aggregate(m=Min('consent_display_order'))['m']
            next_order = (min_o - 1) if min_o is not None else 0
            settings = _get_consent_settings(existing)
            settings['screening_schedule'] = screening_schedule
            settings['planned_screening_dates'] = [x['date'] for x in screening_schedule]
            parsed_data = dict(existing.parsed_data) if isinstance(existing.parsed_data, dict) else {}
            parsed_data['consent_settings'] = settings
            existing.title = project_name or existing.title
            existing.consent_display_order = next_order
            existing.project_sync_at = now
            existing.parsed_data = parsed_data
            existing.save(
                update_fields=[
                    'title',
                    'consent_display_order',
                    'project_sync_at',
                    'parsed_data',
                    'update_time',
                ]
            )
            return

        try:
            p = protocol_svc.create_protocol(
                title=project_name,
                code=code,
                screening_schedule=screening_schedule if screening_schedule else None,
                created_by_id=getattr(rec, 'created_by_id', None),
            )
        except ValueError as e:
            logger.warning('execution_order consent sync create_protocol skipped: %s', e)
            return

        if not screening_schedule:
            settings = _get_consent_settings(p)
            settings['screening_schedule'] = []
            settings['planned_screening_dates'] = []
            parsed_data = dict(p.parsed_data) if isinstance(p.parsed_data, dict) else {}
            parsed_data['consent_settings'] = settings
            p.parsed_data = parsed_data
            p.save(update_fields=['parsed_data', 'update_time'])

        p.project_sync_at = now
        p.save(update_fields=['project_sync_at', 'update_time'])
    except Exception:
        logger.exception('sync_execution_order_upload_to_consent failed execution_order_id=%s', getattr(rec, 'id', None))
