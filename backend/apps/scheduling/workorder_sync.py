"""
维周·执行台 — 工单同步到招招、和序

在「执行订单上传保存」与「详情页编辑保存」后：
1. 直接写入本系统 product_distribution_work_order 表，供接待台工单管理展示（执行台→接待台数据联通）
2. 若配置了 RECRUITMENT_WORKORDER_SYNC_URL / RECEPTION_WORKORDER_SYNC_URL，则额外推送 JSON 到对应 URL

触发时机：
1. 执行订单上传并解析落库后（save_execution_order）
2. 详情页编辑后保存（update_execution_order）

推送内容：
- 招招：项目信息 + 招募计划 + 排期计划
- 和序：项目信息 + 排期计划 + 项目访视 + 样本数量 + 备份数量

若未配置 RECRUITMENT_WORKORDER_SYNC_URL / RECEPTION_WORKORDER_SYNC_URL，则跳过对应推送并打日志。
"""
import json
import logging
import re
from datetime import date, datetime, timedelta

from django.conf import settings

logger = logging.getLogger(__name__)

# 项目信息相关表头（与详情页「项目信息」区块一致）
PROJECT_FIELD_LABELS = {
    '项目编号', '项目名称', '业务类型', '组别', '研究目的',
    '执行时间周期', '排期时间', 'Field work', '执行周期',
}
# 招募计划相关表头（与详情页「招募计划」区块一致）
RECRUITMENT_FIELD_LABELS = {
    '样本组别', '样本数量', '最低样本量', '备份数量', '备份样本量',
    '年龄范围', '年龄配额', '性别要求', '性别配额', '肤质类型', '肤质配额',
    '入组标准', '排除标准', '样本其他要求',
}
# 排期计划相关表头
SCHEDULE_PLAN_FIELD_LABELS = {
    '执行排期', '交付节点', '交付形式', '交付（访视节点）',
}


def _parse_schedule_overall_start_end(raw_schedule: str) -> tuple[str | None, str | None]:
    """
    从「执行排期」文本解析整体开始/结束日期（与前端 getSchedulePlanOverallStartEnd 一致）。
    格式：多行 "访视点: 日期1、日期2、..."，日期支持 YYYY年M月D日、YYYY/M/D。
    返回 (start_iso, end_iso)，解析失败时返回 (None, None)。
    """
    if not raw_schedule or not str(raw_schedule).strip():
        return (None, None)
    text = str(raw_schedule).strip()
    dates_found = []
    for m in re.finditer(r'(\d{4})年(\d{1,2})月(\d{1,2})日', text):
        try:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= mo <= 12 and 1 <= d <= 31:
                dates_found.append(date(y, mo, d))
        except (ValueError, TypeError):
            continue
    for m in re.finditer(r'(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})', text):
        try:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= mo <= 12 and 1 <= d <= 31:
                dates_found.append(date(y, mo, d))
        except (ValueError, TypeError):
            continue
    if not dates_found:
        return (None, None)
    return (
        min(dates_found).isoformat(),
        max(dates_found).isoformat(),
    )


def _parse_date_to_iso(val) -> str | None:
    """将各种日期格式转为 YYYY-MM-DD。支持 ISO 字符串、Excel 序列号、MM/DD 等。"""
    if val is None or (isinstance(val, str) and not val.strip()):
        return None
    s = str(val).strip()
    # 1. 已是 YYYY-MM-DD
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        try:
            date.fromisoformat(s[:10])
            return s[:10]
        except (ValueError, TypeError):
            pass
    # 2. Excel 序列号
    try:
        n = float(val)
        if 1 <= n <= 2958465:
            d = date(1899, 12, 30) + timedelta(days=int(n))
            return d.isoformat()
    except (TypeError, ValueError):
        pass
    # 3. 中文格式 YYYY年M月D日
    m_cn = re.match(r'^(\d{4})年(\d{1,2})月(\d{1,2})日', s)
    if m_cn:
        try:
            y, mo, d = int(m_cn.group(1)), int(m_cn.group(2)), int(m_cn.group(3))
            if 1 <= mo <= 12 and 1 <= d <= 31:
                return date(y, mo, d).isoformat()
        except (ValueError, TypeError):
            pass
    # 4. 其他常见格式
    for fmt in ('%Y/%m/%d', '%Y-%m-%d', '%m/%d/%Y', '%Y%m%d'):
        try:
            parsed = datetime.strptime(s[:10], fmt)
            return parsed.date().isoformat()
        except (ValueError, TypeError):
            continue
    return None


def _row_to_dict(headers: list, row) -> dict:
    """将一行数据与表头对齐为 dict（长度不足补空，避免错位）。"""
    if not headers:
        return row if isinstance(row, dict) else {}
    if isinstance(row, list):
        vals = list(row) + [''] * max(0, len(headers) - len(row))
        return {headers[i]: vals[i] for i in range(len(headers))}
    if isinstance(row, dict):
        return row
    return {}


def _first_row_dict(rec):
    """从 ExecutionOrderUpload 的 data 取第一行转为 dict（key 为表头）。与 api._first_row_dict 逻辑一致，避免循环引用。"""
    data = rec.data if isinstance(rec.data, dict) else {}
    headers = data.get('headers') or []
    rows = data.get('rows') or []
    first = rows[0] if rows else []
    if isinstance(first, list) and headers:
        return _row_to_dict(headers, first)
    return first if isinstance(first, dict) else {}


def _merge_same_project_rows(prev: dict, new: dict) -> dict:
    """
    new 覆盖 prev（与「同项目编号以后出现行为准」一致）。
    研究员/督导：若 new 中为空而 prev 非空，则保留 prev，避免多行时末行空白列冲掉前面已填值。
    """
    merged = {**prev, **new}
    for exact, sub in (('研究员', '研究员'), ('督导', '督导')):
        new_c = _cell_by_exact_or_header_contains(new, exact, sub)
        old_c = _cell_by_exact_or_header_contains(prev, exact, sub)
        if old_c and not new_c:
            merged[exact] = old_c
    return merged


def _unique_rows_by_project_no_last_wins(rec):
    """
    执行订单可能有多行（多项目）。同一项目编号出现多行时以后者为准（与详情页编辑非首行一致）。
    研究员/督导：末行为空时保留较早行的非空值（见 _merge_same_project_rows）。
    """
    data = rec.data if isinstance(rec.data, dict) else {}
    headers = data.get('headers') or []
    rows = data.get('rows') or []
    last_by_pn = {}
    for row in rows:
        d = _row_to_dict(headers, row)
        pn = (d.get('项目编号') or '').strip()
        if not pn:
            continue
        if pn in last_by_pn:
            last_by_pn[pn] = _merge_same_project_rows(last_by_pn[pn], d)
        else:
            last_by_pn[pn] = d
    return list(last_by_pn.values())


def _cell_by_exact_or_header_contains(row: dict, exact_key: str, header_substr: str) -> str:
    """
    先取精确表头 exact_key；为空时再找「表头字符串包含 header_substr」的列（兼容模板列名变体）。
    与执行台详情 mapExecutionOrderToSections 展示逻辑对齐的补充。
    """
    v = (row.get(exact_key) or '').strip() if row else ''
    if v:
        return v
    if not row or not header_substr:
        return ''
    for k, val in row.items():
        if header_substr in str(k):
            t = (str(val) if val is not None else '').strip()
            if t:
                return t
    return ''


def _timeline_schedule_supervisor(execution_order_upload_id) -> str:
    """排程核心里维护的督导（执行台「项目排期」可编辑保存，不一定在执行订单行里）。"""
    if not execution_order_upload_id:
        return ''
    try:
        from .models import TimelineSchedule

        ts = TimelineSchedule.objects.filter(
            execution_order_upload_id=execution_order_upload_id
        ).first()
        if ts and (ts.supervisor or '').strip():
            return ts.supervisor.strip()
    except Exception as e:
        logger.debug('读取排程核心督导失败 execution_order_id=%s: %s', execution_order_upload_id, e)
    return ''


def _ensure_serializable(val):
    if val is None:
        return None
    if isinstance(val, (str, int, float, bool)):
        return val
    if isinstance(val, (list, tuple)):
        return [_ensure_serializable(x) for x in val]
    if isinstance(val, dict):
        return {str(k): _ensure_serializable(v) for k, v in val.items()}
    return str(val)


def _build_payload_for_recruitment(rec):
    """组装发给招招的工单：项目信息 + 招募计划 + 排期计划。"""
    first = _first_row_dict(rec)
    project_info = {k: _ensure_serializable(first.get(k)) for k in PROJECT_FIELD_LABELS if k in first}
    recruitment_plan = {k: _ensure_serializable(first.get(k)) for k in RECRUITMENT_FIELD_LABELS if k in first}
    schedule_plan = {k: _ensure_serializable(first.get(k)) for k in SCHEDULE_PLAN_FIELD_LABELS if k in first}
    return {
        'execution_order_id': rec.id,
        'project_info': project_info,
        'recruitment_plan': recruitment_plan,
        'schedule_plan': schedule_plan,
    }


def _build_payload_for_reception(rec):
    """组装发给和序的工单：项目信息 + 排期计划 + 项目访视 + 样本数量 + 备份数量。"""
    first = _first_row_dict(rec)
    project_info = {k: _ensure_serializable(first.get(k)) for k in PROJECT_FIELD_LABELS if k in first}
    schedule_plan = {k: _ensure_serializable(first.get(k)) for k in SCHEDULE_PLAN_FIELD_LABELS if k in first}
    sample_size = first.get('样本数量') or first.get('样本量') or first.get('最低样本量') or ''
    backup_sample_size = first.get('备份数量') or first.get('备份样本量') or ''
    project_visit_raw = first.get('__projectVisitTable')
    project_visit = []
    if project_visit_raw:
        if isinstance(project_visit_raw, list):
            project_visit = [_ensure_serializable(row) for row in project_visit_raw]
        elif isinstance(project_visit_raw, str) and project_visit_raw.strip():
            try:
                parsed = json.loads(project_visit_raw)
                project_visit = [_ensure_serializable(row) for row in parsed] if isinstance(parsed, list) else []
            except (TypeError, ValueError):
                pass
    return {
        'execution_order_id': rec.id,
        'project_info': project_info,
        'schedule_plan': schedule_plan,
        'project_visit': project_visit,
        'sample_size': _ensure_serializable(sample_size),
        'backup_sample_size': _ensure_serializable(backup_sample_size),
    }


def _sync_to_reception_workorder(rec):
    """将执行订单各行（按项目编号）同步到 product_distribution_work_order，供接待台工单管理展示。
    多行同一项目编号时以后出现的行覆盖（与详情页保存多行一致）。
    启动/结束日期优先从「执行排期」解析；若无则退而使用项目开始/结束时间等。
    """
    row_dicts = _unique_rows_by_project_no_last_wins(rec)
    if not row_dicts:
        logger.debug('执行订单无有效项目编号行，跳过工单同步 execution_order_id=%s', getattr(rec, 'id', None))
        return

    from apps.product_distribution import services as pd_services

    schedule_supervisor = _timeline_schedule_supervisor(getattr(rec, 'id', None))

    for first in row_dicts:
        project_no = (first.get('项目编号') or '').strip()
        if not project_no:
            continue
        raw_schedule = first.get('执行排期') or first.get('测试具体排期') or ''
        schedule_start, schedule_end = _parse_schedule_overall_start_end(raw_schedule)
        if schedule_start and schedule_end:
            project_start_date = schedule_start
            project_end_date = schedule_end
        else:
            start_raw = first.get('项目开始时间') or first.get('开始日期') or first.get('执行开始日期')
            end_raw = first.get('项目结束时间') or first.get('结束日期') or first.get('执行结束日期')
            project_start_date = _parse_date_to_iso(start_raw)
            project_end_date = _parse_date_to_iso(end_raw)
        today = date.today()
        if not project_start_date:
            project_start_date = today.isoformat()
        if not project_end_date:
            project_end_date = (today + timedelta(days=90)).isoformat()
        if project_end_date < project_start_date:
            project_end_date = project_start_date
        visit_count = first.get('访视次数') or first.get('访视数') or 0
        try:
            visit_count = int(visit_count)
        except (TypeError, ValueError):
            visit_count = 0
        visit_count = max(0, visit_count)
        researcher = _cell_by_exact_or_header_contains(first, '研究员', '研究员') or None
        supervisor = _cell_by_exact_or_header_contains(first, '督导', '督导') or None
        if not supervisor and schedule_supervisor:
            supervisor = schedule_supervisor
        payload = {
            'project_no': project_no,
            'project_name': (first.get('项目名称') or '').strip() or project_no,
            'project_start_date': project_start_date,
            'project_end_date': project_end_date,
            'visit_count': visit_count,
            'researcher': researcher,
            'supervisor': supervisor,
        }
        try:
            result = pd_services.work_order_upsert_by_project_no(payload)
            action = '更新' if result.get('updated') else '新建'
            logger.info('工单同步至接待台 %s project_no=%s execution_order_id=%s', action, project_no, rec.id)
        except Exception as e:
            logger.warning('工单同步至接待台失败 execution_order_id=%s project_no=%s: %s', rec.id, project_no, e)


def _post_json(url, payload):
    """向 url 发起 POST，body 为 JSON。失败仅打日志，不抛错。"""
    try:
        import requests
        resp = requests.post(
            url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10,
        )
        if resp.status_code >= 400:
            logger.warning('工单同步 POST %s 返回 %s: %s', url[:50], resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning('工单同步 POST %s 失败: %s', url[:50], e)


def sync_workorders_to_workstations(rec):
    """
    1. 将执行订单同步到 product_distribution_work_order（接待台工单管理）
    2. 若已配置 URL，则额外推送 JSON 到招招、和序
    """
    if not rec or not getattr(rec, 'data', None):
        return
    try:
        _sync_to_reception_workorder(rec)
    except Exception as e:
        logger.warning('工单同步至接待台失败 execution_order_id=%s: %s', getattr(rec, 'id', None), e)
    url_recruitment = getattr(settings, 'RECRUITMENT_WORKORDER_SYNC_URL', None) or ''
    url_reception = getattr(settings, 'RECEPTION_WORKORDER_SYNC_URL', None) or ''
    if not url_recruitment.strip() and not url_reception.strip():
        return
    try:
        if url_recruitment.strip():
            payload = _build_payload_for_recruitment(rec)
            _post_json(url_recruitment.strip(), payload)
            logger.info('工单同步已推送招招 execution_order_id=%s', rec.id)
        if url_reception.strip():
            payload = _build_payload_for_reception(rec)
            _post_json(url_reception.strip(), payload)
            logger.info('工单同步已推送和序 execution_order_id=%s', rec.id)
    except Exception as e:
        logger.warning('工单同步失败 execution_order_id=%s: %s', getattr(rec, 'id', None), e)
