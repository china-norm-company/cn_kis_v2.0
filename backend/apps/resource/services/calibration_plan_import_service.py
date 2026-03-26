"""
校准计划批量导入服务

支持 Excel（.xlsx）格式，字段与图片模板一致：
- 设备编号、设备名称、设备状态、设备规格/型号、出厂编号
- 溯源方式、校准方式、校准机构、校准方法
- 校准周期(天)、上次校准时间、下次校准时间
- 校准提前提醒(天)、校准提醒人员、量值溯源参数
"""
import logging
from datetime import date, datetime
from typing import Any, List, Optional
import openpyxl

from ..models import ResourceItem, ResourceType, EquipmentCalibration

logger = logging.getLogger(__name__)

EXCEL_COLUMN_MAP = {
    '设备编号': 'code',
    '卡片编码': 'code',
    '设备编码': 'code',
    '设备名称': 'name',
    '设备状态': 'status',
    '设备规格': 'model_number',
    '设备规格/型号': 'model_number',
    '型号': 'model_number',
    '出厂编号': 'serial_number',
    '溯源方式': 'traceability',
    '校准方式': 'calibration_method',
    '校准机构': 'calibration_institution',
    '校准方法': 'calibration_procedure',
    '校准周期': 'calibration_cycle_days',
    '校准周期(天)': 'calibration_cycle_days',
    '上次校准时间': 'calibration_date',
    '上次校准日期': 'calibration_date',
    '校准日期': 'calibration_date',
    '下次校准时间': 'next_due_date',
    '下次校准日期': 'next_due_date',
    '下次到期日': 'next_due_date',
    '校准提前提醒': 'reminder_days',
    '校准提前提醒(天)': 'reminder_days',
    '校准提醒人员': 'reminder_person',
    '量值溯源参数': 'traceability_params',
    '校准类型': 'calibration_type',
    '校准人': 'calibrator',
    '证书编号': 'certificate_no',
    '证书号': 'certificate_no',
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
        if h_clean in EXCEL_COLUMN_MAP:
            col_map[EXCEL_COLUMN_MAP[h_clean]] = idx

    result = []
    for row_idx, row in enumerate(rows[1:], start=2):
        if not row:
            continue
        code = _normalize(row[col_map['code']]) if 'code' in col_map and col_map['code'] < len(row) else ''
        next_due = _parse_date(row[col_map['next_due_date']]) if 'next_due_date' in col_map and col_map['next_due_date'] < len(row) else None
        if not code or not next_due:
            continue

        cal_date = None
        if 'calibration_date' in col_map and col_map['calibration_date'] < len(row):
            cal_date = _parse_date(row[col_map['calibration_date']])

        cal_type = 'internal'
        if 'calibration_type' in col_map and col_map['calibration_type'] < len(row):
            v = _normalize(row[col_map['calibration_type']])
            if '外' in v or v.lower() == 'external':
                cal_type = 'external'

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
            'serial_number': _get('serial_number'),
            'traceability': _get('traceability'),
            'calibration_method': _get('calibration_method'),
            'calibration_institution': _get('calibration_institution'),
            'calibration_procedure': _get('calibration_procedure'),
            'calibration_cycle_days': _get_int('calibration_cycle_days'),
            'calibration_date': cal_date,
            'next_due_date': next_due,
            'reminder_days': _get_int('reminder_days'),
            'reminder_person': _get('reminder_person'),
            'traceability_params': _get('traceability_params'),
            'calibration_type': cal_type,
            'calibrator': _get('calibrator'),
            'certificate_no': _get('certificate_no'),
        })
    return result


def import_calibration_plan_from_rows(
    rows: List[dict],
    created_by_id: Optional[int] = None,
    create_records: bool = True,
) -> dict:
    """
    批量导入校准计划。
    - 根据设备编号匹配设备，更新 next_calibration_date
    - 若 create_records=True，同时创建 EquipmentCalibration 记录
    """
    total = len(rows)
    success = 0
    failed = 0
    created_ids = []
    errors = []

    for r in rows:
        code = r.get('code', '').strip()
        next_due = r.get('next_due_date')
        cal_date = r.get('calibration_date')
        row_num = r.get('row', 0)

        if not code or not next_due:
            failed += 1
            errors.append({'row': row_num, 'code': code, 'message': '设备编号或下次到期日为空'})
            continue

        equip = _equipment_qs().filter(code=code).first()
        if not equip:
            failed += 1
            errors.append({'row': row_num, 'code': code, 'message': f'未找到设备: {code}'})
            continue

        try:
            equip.next_calibration_date = next_due
            update_fields = ['next_calibration_date', 'update_time']

            if cal_date:
                equip.last_calibration_date = cal_date
                update_fields.append('last_calibration_date')

            # 设备基本信息（有则更新）
            if r.get('name'):
                equip.name = r['name']
                update_fields.append('name')
            if r.get('model_number') is not None:
                equip.model_number = r.get('model_number') or ''
                update_fields.append('model_number')
            if r.get('serial_number') is not None:
                equip.serial_number = r.get('serial_number') or ''
                update_fields.append('serial_number')
            if r.get('calibration_cycle_days') is not None:
                equip.calibration_cycle_days = r['calibration_cycle_days']
                update_fields.append('calibration_cycle_days')
            if r.get('status'):
                status_map = {'启用': 'active', '停用': 'idle', '维护': 'maintenance', '报废': 'retired'}
                s = status_map.get(r['status'], r['status'].lower() if r['status'] else None)
                if s and s in ('active', 'idle', 'maintenance', 'retired', 'calibrating', 'reserved'):
                    equip.status = s
                    update_fields.append('status')

            # 扩展属性：溯源方式、校准方式、校准机构、校准方法、提醒天数、提醒人员、量值溯源参数
            attrs = dict(equip.attributes or {})
            for k, v in [
                ('traceability', r.get('traceability')),
                ('calibration_method', r.get('calibration_method')),
                ('calibration_institution', r.get('calibration_institution')),
                ('calibration_procedure', r.get('calibration_procedure')),
                ('reminder_days', r.get('reminder_days')),
                ('reminder_person', r.get('reminder_person')),
                ('traceability_params', r.get('traceability_params')),
            ]:
                if v is not None and v != '':
                    attrs[k] = v
            equip.attributes = attrs
            update_fields.append('attributes')

            equip.save(update_fields=update_fields)

            # 仅当有明确的校准日期且与到期日不同时创建校准记录
            if create_records and cal_date and cal_date != next_due:
                cal = EquipmentCalibration.objects.create(
                    equipment=equip,
                    calibration_type=r.get('calibration_type', 'internal'),
                    calibration_date=cal_date,
                    next_due_date=next_due,
                    calibrator=r.get('calibrator', ''),
                    certificate_no=r.get('certificate_no', ''),
                    result='pass',
                )
                created_ids.append(cal.id)

            success += 1
        except Exception as e:
            failed += 1
            errors.append({'row': row_num, 'code': code, 'message': str(e)})

    return {
        'total': total,
        'success': success,
        'failed': failed,
        'created_ids': created_ids,
        'errors': errors,
    }


def parse_and_import_calibration_plan(file, created_by_id=None, create_records=True) -> dict:
    """入口：解析 Excel 并导入校准计划"""
    rows = parse_excel_rows(file)
    if not rows:
        return {'total': 0, 'success': 0, 'failed': 0, 'created_ids': [], 'errors': [{'row': 0, 'code': '', 'message': '未能解析到有效数据行'}]}
    return import_calibration_plan_from_rows(rows, created_by_id=created_by_id, create_records=create_records)
