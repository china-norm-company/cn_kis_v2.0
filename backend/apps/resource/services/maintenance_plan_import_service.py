"""
维护计划批量导入服务

支持 Excel（.xlsx）格式，字段与图片一致：
- 设备编号、设备名称、设备规格/型号、设备状态
- 维护周期(天)、上次维护时间、下次维护时间
- 维护提前提醒(天)、维护提醒人员、维护方法
"""
import logging
from datetime import date, datetime
from typing import Any, List, Optional
import openpyxl

from ..models import ResourceItem, ResourceType

logger = logging.getLogger(__name__)

EXCEL_COLUMN_MAP = {
    '设备编号': 'code',
    '设备编码': 'code',
    '设备名称': 'name',
    '设备状态': 'status',
    '设备规格': 'model_number',
    '设备规格/型号': 'model_number',
    '型号': 'model_number',
    '维护周期': 'maintenance_cycle_days',
    '维护周期(天)': 'maintenance_cycle_days',
    '上次维护时间': 'maintenance_date',
    '上次维护日期': 'maintenance_date',
    '下次维护时间': 'next_due_date',
    '下次维护日期': 'next_due_date',
    '维护提前提醒': 'reminder_days',
    '维护提前提醒(天)': 'reminder_days',
    '维护提醒人员': 'reminder_person',
    '维护方法': 'maintenance_method',
}


def _normalize(val: Any) -> str:
    if val is None:
        return ''
    s = str(val).strip()
    if s.upper() in ('#N/A', 'N/A', 'NA', '-'):
        return ''
    return s


def _parse_int(val: Any) -> Optional[int]:
    if val is None or val == '':
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _parse_date(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date() if hasattr(val, 'date') else val
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d', '%Y-%m-%d %H:%M:%S'):
            try:
                return datetime.strptime(val[:10], fmt).date()
            except ValueError:
                continue
    return None


def _equipment_qs():
    return ResourceItem.objects.filter(
        is_deleted=False,
        category__resource_type=ResourceType.EQUIPMENT,
    )


def parse_excel_rows(file) -> List[dict]:
    """解析 Excel，返回标准化行数据列表"""
    wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
    ws = wb.active
    if not ws:
        return []

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        return []

    header = [str(c).strip() if c is not None else '' for c in rows[0]]
    col_map = {}
    for idx, h in enumerate(header):
        h_clean = _normalize(h)
        if not h_clean:
            continue
        for excel_name, internal in EXCEL_COLUMN_MAP.items():
            if excel_name in h_clean or h_clean in excel_name:
                col_map[internal] = idx
                break

    result = []
    for row_idx, row in enumerate(rows[1:], start=2):
        if not row:
            continue
        code = _normalize(row[col_map['code']]) if 'code' in col_map and col_map['code'] < len(row) else ''
        next_due = _parse_date(row[col_map['next_due_date']]) if 'next_due_date' in col_map and col_map['next_due_date'] < len(row) else None
        if not code or not next_due:
            continue

        maint_date = None
        if 'maintenance_date' in col_map and col_map['maintenance_date'] < len(row):
            maint_date = _parse_date(row[col_map['maintenance_date']])

        def _get(key: str, default=''):
            if key not in col_map or col_map[key] >= len(row):
                return default
            v = row[col_map[key]]
            if v is None:
                return default
            return _normalize(v)

        def _get_int(key: str):
            if key not in col_map or col_map[key] >= len(row):
                return None
            return _parse_int(row[col_map[key]])

        result.append({
            'row': row_idx,
            'code': code,
            'name': _get('name'),
            'status': _get('status'),
            'model_number': _get('model_number'),
            'maintenance_cycle_days': _get_int('maintenance_cycle_days'),
            'maintenance_date': maint_date,
            'next_due_date': next_due,
            'reminder_days': _get_int('reminder_days'),
            'reminder_person': _get('reminder_person'),
            'maintenance_method': _get('maintenance_method'),
        })
    return result


def import_maintenance_plan_from_rows(
    rows: List[dict],
    created_by_id: Optional[int] = None,
) -> dict:
    """批量导入维护计划。根据设备编号匹配设备，更新 next_maintenance_date"""
    total = len(rows)
    success = 0
    failed = 0
    errors = []

    for r in rows:
        code = r.get('code', '').strip()
        next_due = r.get('next_due_date')
        maint_date = r.get('maintenance_date')
        row_num = r.get('row', 0)

        if not code or not next_due:
            failed += 1
            errors.append({'row': row_num, 'code': code, 'message': '设备编号或下次维护时间为空'})
            continue

        equip = _equipment_qs().filter(code=code).first()
        if not equip:
            failed += 1
            errors.append({'row': row_num, 'code': code, 'message': f'未找到设备: {code}'})
            continue

        try:
            equip.next_maintenance_date = next_due
            update_fields = ['next_maintenance_date', 'update_time']

            if maint_date:
                equip.last_maintenance_date = maint_date
                update_fields.append('last_maintenance_date')

            if r.get('name'):
                equip.name = r['name']
                update_fields.append('name')
            if r.get('model_number') is not None:
                equip.model_number = r.get('model_number') or ''
                update_fields.append('model_number')
            if r.get('maintenance_cycle_days') is not None:
                equip.maintenance_cycle_days = r['maintenance_cycle_days']
                update_fields.append('maintenance_cycle_days')
            if r.get('status'):
                status_map = {'启用': 'active', '停用': 'idle', '维护': 'maintenance', '报废': 'retired'}
                s = status_map.get(r['status'], r['status'].lower() if r['status'] else None)
                if s and s in ('active', 'idle', 'maintenance', 'retired', 'calibrating', 'reserved'):
                    equip.status = s
                    update_fields.append('status')

            attrs = dict(equip.attributes or {})
            for k, v in [
                ('maintenance_reminder_days', r.get('reminder_days')),
                ('maintenance_reminder_person', r.get('reminder_person')),
                ('maintenance_method', r.get('maintenance_method')),
            ]:
                if v is not None and v != '':
                    attrs[k] = v
            equip.attributes = attrs
            update_fields.append('attributes')

            equip.save(update_fields=update_fields)
            success += 1
        except Exception as e:
            failed += 1
            errors.append({'row': row_num, 'code': code, 'message': str(e)})

    return {
        'total': total,
        'success': success,
        'failed': failed,
        'created_ids': [],
        'errors': errors,
    }


def parse_and_import_maintenance_plan(file, created_by_id=None) -> dict:
    """入口：解析 Excel 并导入维护计划"""
    rows = parse_excel_rows(file)
    if not rows:
        return {'total': 0, 'success': 0, 'failed': 0, 'created_ids': [], 'errors': [{'row': 0, 'code': '', 'message': '未能解析到有效数据行'}]}
    return import_maintenance_plan_from_rows(rows, created_by_id=created_by_id)
