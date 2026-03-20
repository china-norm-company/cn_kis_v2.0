"""
仪器数据采集中间件 (I1)

以 VISIA-CR 为先行示范，支持：
1. 文件上传解析：解析 VISIA 导出的 CSV/XML 文件
2. 直采 API 对接：与仪器控制软件通信获取实时数据
3. 数据标准化：将不同仪器的测量数据统一为 InstrumentMeasurement 格式
4. 自动关联：根据受试者 ID、时间窗自动关联到访视和工单
"""
import csv
import io
import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from django.db import transaction
from django.utils import timezone

from .models import (
    InstrumentDataSession,
    InstrumentDataSource,
    InstrumentMeasurement,
)

logger = logging.getLogger(__name__)

VISIA_METRICS = [
    'spots', 'wrinkles', 'texture', 'pores', 'uv_spots',
    'brown_spots', 'red_areas', 'porphyrins',
]

VISIA_ZONES = ['full_face', 'forehead', 'cheek_l', 'cheek_r', 'chin', 'nose']


class InstrumentMiddleware:
    """仪器数据采集中间件基类"""

    @staticmethod
    def parse_and_store(
        instrument_type: str,
        file_content: bytes,
        file_name: str,
        subject_id: int,
        operator_id: Optional[int] = None,
        visit_id: Optional[int] = None,
        work_order_id: Optional[int] = None,
        metadata: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        parser = _get_parser(instrument_type)
        if not parser:
            return {'success': False, 'message': f'不支持的仪器类型: {instrument_type}'}

        try:
            parsed_data = parser(file_content, file_name)
        except Exception as e:
            logger.error('Parse %s file failed: %s', instrument_type, e)
            return {'success': False, 'message': f'文件解析失败: {e}'}

        session_time = parsed_data.get('session_time') or timezone.now()

        with transaction.atomic():
            session = InstrumentDataSession.objects.create(
                instrument_type=instrument_type,
                instrument_serial=parsed_data.get('instrument_serial', ''),
                subject_id=subject_id,
                visit_id=visit_id,
                work_order_id=work_order_id,
                operator_id=operator_id,
                session_time=session_time,
                raw_file_path=file_name,
                parsed=True,
                metadata=metadata or {},
            )

            measurements = []
            for m in parsed_data.get('measurements', []):
                measurements.append(InstrumentMeasurement(
                    session=session,
                    metric_name=m['metric_name'],
                    metric_value=m['metric_value'],
                    unit=m.get('unit', ''),
                    zone=m.get('zone', ''),
                    percentile=m.get('percentile'),
                    reference_range=m.get('reference_range', {}),
                    metadata=m.get('metadata', {}),
                ))
            InstrumentMeasurement.objects.bulk_create(measurements)

            if visit_id:
                _auto_link_to_crf(session, measurements)

        return {
            'success': True,
            'session_id': session.id,
            'measurement_count': len(measurements),
            'session_time': session.session_time.isoformat(),
        }

    @staticmethod
    def get_subject_history(
        subject_id: int,
        instrument_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        qs = InstrumentDataSession.objects.filter(subject_id=subject_id, parsed=True)
        if instrument_type:
            qs = qs.filter(instrument_type=instrument_type)
        qs = qs.order_by('-session_time')[:limit]

        results = []
        for session in qs:
            measurements = list(session.measurements.all().values(
                'metric_name', 'metric_value', 'unit', 'zone', 'percentile',
            ))
            results.append({
                'session_id': session.id,
                'instrument_type': session.instrument_type,
                'session_time': session.session_time.isoformat(),
                'visit_id': session.visit_id,
                'work_order_id': session.work_order_id,
                'measurement_count': len(measurements),
                'measurements': measurements,
            })
        return results

    @staticmethod
    def get_metric_trend(
        subject_id: int,
        metric_name: str,
        instrument_type: str = InstrumentDataSource.VISIA,
        zone: str = 'full_face',
        days: int = 365,
    ) -> List[Dict[str, Any]]:
        """获取受试者特定指标的趋势数据"""
        cutoff = timezone.now() - timedelta(days=days)
        measurements = InstrumentMeasurement.objects.filter(
            session__subject_id=subject_id,
            session__instrument_type=instrument_type,
            session__parsed=True,
            session__session_time__gte=cutoff,
            metric_name=metric_name,
            zone=zone,
        ).select_related('session').order_by('session__session_time')

        return [{
            'session_time': m.session.session_time.isoformat(),
            'value': m.metric_value,
            'unit': m.unit,
            'percentile': m.percentile,
            'visit_id': m.session.visit_id,
        } for m in measurements]

    @staticmethod
    def compare_sessions(
        session_id_before: int,
        session_id_after: int,
    ) -> Dict[str, Any]:
        """比较两次采集会话的指标差异"""
        before = InstrumentDataSession.objects.filter(id=session_id_before, parsed=True).first()
        after = InstrumentDataSession.objects.filter(id=session_id_after, parsed=True).first()

        if not before or not after:
            return {'success': False, 'message': '会话不存在'}

        before_metrics = {
            (m.metric_name, m.zone): m
            for m in before.measurements.all()
        }
        after_metrics = {
            (m.metric_name, m.zone): m
            for m in after.measurements.all()
        }

        comparisons = []
        all_keys = set(before_metrics.keys()) | set(after_metrics.keys())
        for key in sorted(all_keys):
            b = before_metrics.get(key)
            a = after_metrics.get(key)
            entry = {
                'metric_name': key[0],
                'zone': key[1],
                'before': b.metric_value if b else None,
                'after': a.metric_value if a else None,
            }
            if b and a and b.metric_value != 0:
                entry['change_pct'] = round((a.metric_value - b.metric_value) / abs(b.metric_value) * 100, 2)
            comparisons.append(entry)

        return {
            'success': True,
            'before_session': {
                'id': before.id,
                'time': before.session_time.isoformat(),
            },
            'after_session': {
                'id': after.id,
                'time': after.session_time.isoformat(),
            },
            'comparisons': comparisons,
        }


def _get_parser(instrument_type: str):
    parsers = {
        InstrumentDataSource.VISIA: _parse_visia,
        'visia': _parse_visia,
        InstrumentDataSource.CORNEOMETER: _parse_corneometer_csv,
        'corneometer': _parse_corneometer_csv,
        InstrumentDataSource.CUTOMETER: _parse_generic_csv,
        'cutometer': _parse_generic_csv,
        InstrumentDataSource.MEXAMETER: _parse_generic_csv,
        'mexameter': _parse_generic_csv,
    }
    return parsers.get(instrument_type)


def _parse_visia(content: bytes, filename: str) -> Dict[str, Any]:
    """
    解析 VISIA-CR 导出文件（支持 CSV 和 XML 格式）。

    VISIA 典型导出包含 8 个维度的面部分析数据：
    spots, wrinkles, texture, pores, uv_spots, brown_spots, red_areas, porphyrins
    """
    text = content.decode('utf-8', errors='replace')

    if filename.lower().endswith('.xml'):
        return _parse_visia_xml(text)
    return _parse_visia_csv(text)


def _parse_visia_csv(text: str) -> Dict[str, Any]:
    reader = csv.DictReader(io.StringIO(text))
    measurements = []
    serial = ''
    session_time = None

    for row in reader:
        if not serial and 'serial' in row:
            serial = row['serial']
        if not session_time and 'date' in row:
            try:
                session_time = datetime.fromisoformat(row['date'])
            except (ValueError, TypeError):
                pass

        zone = row.get('zone', 'full_face').strip().lower() or 'full_face'
        for metric in VISIA_METRICS:
            val = row.get(metric)
            if val is None:
                continue
            try:
                fval = float(val)
            except (ValueError, TypeError):
                continue
            entry: Dict[str, Any] = {
                'metric_name': metric,
                'metric_value': fval,
                'unit': 'score',
                'zone': zone,
            }
            pct = row.get(f'{metric}_percentile')
            if pct:
                try:
                    entry['percentile'] = float(pct)
                except (ValueError, TypeError):
                    pass
            measurements.append(entry)

    return {
        'instrument_serial': serial,
        'session_time': session_time,
        'measurements': measurements,
    }


def _parse_visia_xml(text: str) -> Dict[str, Any]:
    root = ET.fromstring(text)
    measurements = []
    serial = ''
    session_time = None

    serial_el = root.find('.//SerialNumber')
    if serial_el is not None and serial_el.text:
        serial = serial_el.text.strip()

    date_el = root.find('.//AnalysisDate')
    if date_el is not None and date_el.text:
        try:
            session_time = datetime.fromisoformat(date_el.text.strip())
        except (ValueError, TypeError):
            pass

    for analysis in root.iter('Analysis'):
        zone = (analysis.get('zone') or analysis.findtext('Zone') or 'full_face').lower()
        for metric in VISIA_METRICS:
            el = analysis.find(metric) or analysis.find(metric.title())
            if el is None:
                continue
            try:
                fval = float(el.text.strip())
            except (ValueError, TypeError, AttributeError):
                continue
            entry: Dict[str, Any] = {
                'metric_name': metric,
                'metric_value': fval,
                'unit': 'score',
                'zone': zone,
            }
            pct_el = analysis.find(f'{metric}_percentile')
            if pct_el is not None and pct_el.text:
                try:
                    entry['percentile'] = float(pct_el.text.strip())
                except (ValueError, TypeError):
                    pass
            measurements.append(entry)

    return {
        'instrument_serial': serial,
        'session_time': session_time,
        'measurements': measurements,
    }


def _parse_corneometer_csv(content: bytes, filename: str) -> Dict[str, Any]:
    text = content.decode('utf-8', errors='replace')
    reader = csv.DictReader(io.StringIO(text))
    measurements = []
    serial = ''
    session_time = None

    for row in reader:
        if not serial:
            serial = row.get('device_serial', row.get('serial', ''))
        if not session_time:
            dt = row.get('datetime', row.get('date', ''))
            if dt:
                try:
                    session_time = datetime.fromisoformat(dt)
                except (ValueError, TypeError):
                    pass

        zone = row.get('zone', row.get('site', '')).strip().lower() or 'unknown'
        val = row.get('value', row.get('moisture', ''))
        try:
            fval = float(val)
        except (ValueError, TypeError):
            continue
        measurements.append({
            'metric_name': 'moisture',
            'metric_value': fval,
            'unit': 'AU',
            'zone': zone,
        })

    return {
        'instrument_serial': serial,
        'session_time': session_time,
        'measurements': measurements,
    }


def _parse_generic_csv(content: bytes, filename: str) -> Dict[str, Any]:
    text = content.decode('utf-8', errors='replace')
    reader = csv.DictReader(io.StringIO(text))
    measurements = []
    serial = ''
    session_time = None

    for row in reader:
        if not serial:
            serial = row.get('serial', '')
        if not session_time:
            dt = row.get('datetime', row.get('date', ''))
            if dt:
                try:
                    session_time = datetime.fromisoformat(dt)
                except (ValueError, TypeError):
                    pass

        metric = row.get('metric', row.get('parameter', '')).strip()
        val = row.get('value', '')
        if not metric or not val:
            continue
        try:
            fval = float(val)
        except (ValueError, TypeError):
            continue
        measurements.append({
            'metric_name': metric,
            'metric_value': fval,
            'unit': row.get('unit', ''),
            'zone': row.get('zone', row.get('site', '')).strip().lower(),
        })

    return {
        'instrument_serial': serial,
        'session_time': session_time,
        'measurements': measurements,
    }


def _auto_link_to_crf(session: InstrumentDataSession, measurements: list):
    """尝试将仪器数据自动回填到 CRF 记录"""
    if not session.visit_id:
        return
    try:
        from apps.edc.models import CRFRecord
        crfs = CRFRecord.objects.filter(
            visit_id=session.visit_id,
            status__in=['pending', 'in_progress'],
        )
        for crf in crfs:
            template_data = crf.template_data or {}
            instrument_fields = [
                f for f in template_data.get('fields', [])
                if f.get('data_source') == session.instrument_type
            ]
            if not instrument_fields:
                continue

            updates = {}
            for field in instrument_fields:
                target_metric = field.get('metric_name', '')
                target_zone = field.get('zone', '')
                for m in measurements:
                    if (m.metric_name == target_metric and
                            (not target_zone or m.zone == target_zone)):
                        updates[field['field_key']] = m.metric_value
                        break

            if updates:
                data = dict(crf.data or {})
                data.update(updates)
                crf.data = data
                crf.save(update_fields=['data'])
                logger.info(
                    'Auto-linked %d fields from %s session %s to CRF %s',
                    len(updates), session.instrument_type, session.id, crf.id,
                )
    except Exception as e:
        logger.warning('Auto CRF linking failed: %s', e)
