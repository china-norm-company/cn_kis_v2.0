"""
样品发放（产品发放）业务逻辑 — 读写 cn_kis default 库，表与 KIS 结构一致。
"""
import re
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Any, Tuple, List, Dict

# 东八区时间，用于操作时间等
_TZ_UTC8 = timezone(timedelta(hours=8))


def _now_naive_utc8():
    """当前东八区钟表时间，naive datetime，用于直接写入数据库（库内存东八区）."""
    return datetime.now(_TZ_UTC8).replace(tzinfo=None)


def _raw_update_execution_times(execution_id: int, created_at=None, updated_at=None):
    """将执行单的 created_at/updated_at 以东八区钟表时间写回数据库（绕过 ORM 的 UTC 转换）."""
    from django.db import connections
    conn = connections["default"]
    if created_at is not None and updated_at is not None:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE product_distribution_execution SET created_at=%s, updated_at=%s WHERE id=%s",
                [created_at, updated_at, execution_id],
            )
    elif updated_at is not None:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE product_distribution_execution SET updated_at=%s WHERE id=%s",
                [updated_at, execution_id],
            )


def _raw_update_operation_times(operation_id: int, created_at=None, updated_at=None):
    """将产品操作记录的 created_at/updated_at 以东八区钟表时间写回数据库."""
    from django.db import connections
    conn = connections["default"]
    if created_at is not None and updated_at is not None:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE product_distribution_operation SET created_at=%s, updated_at=%s WHERE id=%s",
                [created_at, updated_at, operation_id],
            )
    elif updated_at is not None:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE product_distribution_operation SET updated_at=%s WHERE id=%s",
                [updated_at, operation_id],
            )


def _dt_iso_utc8(dt):
    """将 datetime 转为东八区后再 isoformat，用于接口返回；若为 naive 则按当前时区解释."""
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is None:
        dt = djtzone.make_aware(dt, djtzone.get_current_timezone())
    return dt.astimezone(_TZ_UTC8).isoformat()


def _dt_iso_utc8_stored(dt):
    """执行单/产品操作的时间字段在 DB 中存的是东八区钟表时间(naive)。
    Django 读出时可能被当成 UTC 变成 aware，这里统一按「钟表即东八区」展示，避免多算 8 小时。"""
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is None:
        dt = djtzone.make_aware(dt, djtzone.get_current_timezone())
        return dt.astimezone(_TZ_UTC8).isoformat()
    if dt.utcoffset() == timedelta(0):
        return dt.replace(tzinfo=_TZ_UTC8).isoformat()
    return dt.astimezone(_TZ_UTC8).isoformat()


from django.db import transaction
from django.db.models import Sum, Q, F, Max, Count
from django.utils import timezone as djtzone
from django.db.models.functions import Coalesce

from .models import (
    ProductDistributionWorkOrder,
    ProductDistributionExecution,
    ProductDistributionOperation,
    ProductSampleRequest,
)


def _opt_str(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    t = (s or "").strip()
    return t if t else None


def _execution_progress(project_start: date, project_end: date) -> str:
    today = date.today()
    if today < project_start:
        return "not_started"
    if project_start <= today <= project_end:
        return "in_progress"
    return "completed"


def _chinese_date_to_iso(s: str) -> Optional[str]:
    """将「YYYY年M月D日」转为 YYYY-MM-DD，用于日期匹配。"""
    if not s or not isinstance(s, str):
        return None
    m = re.match(r"(\d{4})年(\d{1,2})月(\d{1,2})日", s.strip())
    if not m:
        return None
    try:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y}-{mo:02d}-{d:02d}"
    except (ValueError, TypeError):
        pass
    return None


def _eo_row_to_dict(headers: list, row) -> dict:
    """执行订单一行与表头对齐（与 scheduling.workorder_sync 一致）。"""
    if not headers:
        return row if isinstance(row, dict) else {}
    if isinstance(row, list):
        vals = list(row) + [""] * max(0, len(headers) - len(row))
        return {headers[i]: vals[i] for i in range(len(headers))}
    if isinstance(row, dict):
        return row
    return {}


def _last_match_row_for_project_in_upload(rec, project_no: str) -> Optional[dict]:
    """单条上传记录内，该项目编号对应的最后一行（与历史扫描逻辑一致）。"""
    if not rec or not getattr(rec, "data", None):
        return None
    data = rec.data if isinstance(rec.data, dict) else {}
    headers = data.get("headers") or []
    rows = data.get("rows") or []
    pno = (project_no or "").strip()
    if not pno:
        return None
    last_match = None
    for row in rows:
        d = _eo_row_to_dict(headers, row)
        if (d.get("项目编号") or "").strip() == pno:
            last_match = d
    return last_match


def _load_execution_order_uploads(limit: int = 50):
    """单次查询执行订单上传表，供概览接口复用，避免每个工单重复扫表。"""
    from apps.scheduling.models import ExecutionOrderUpload

    return list(ExecutionOrderUpload.objects.order_by("-update_time", "-id")[:limit])


def get_project_row_from_execution_orders(project_no: str) -> Optional[dict]:
    """
    按项目编号从执行台 t_execution_order_upload 取项目信息（研究员、督导、项目名称等）。
    与 cn_kis_v1.0 一致：与执行台项目管理同源，不依赖仅写入样品工单的同步链路。
    """
    pno = (project_no or "").strip()
    if not pno:
        return None
    try:
        for rec in _load_execution_order_uploads(120):
            lm = _last_match_row_for_project_in_upload(rec, pno)
            if lm is not None:
                return lm
    except Exception:
        return None
    return None


def _parse_schedule_plan_raw(text: str) -> Optional[dict]:
    """
    解析「执行排期」文本为结构化数据，与执行台详情页排期计划展示一致。
    """
    if not text or not str(text).strip():
        return None
    text = str(text).strip()
    rows = []
    all_dates = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        colon_idx = line.find(":")
        if colon_idx < 0:
            colon_idx = line.find("：")
        if colon_idx < 0:
            continue
        visit_point = line[:colon_idx].strip()
        date_part = line[colon_idx + 1 :].strip()
        if not visit_point or not date_part:
            continue
        dates = []
        last_y, last_m, last_d = None, None, None
        segments = re.split(r"[、，]\s*", date_part)
        for seg in segments:
            seg = re.sub(r"\s*\([^)]*\)\s*", "", re.sub(r"\s*（[^）]*）\s*", "", seg)).strip()
            if not seg or "\u0335" in seg or "\u0336" in seg:
                continue
            found = False
            for m in re.finditer(r"(\d{4})年(\d{1,2})月(\d{1,2})日", seg):
                try:
                    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
                    if 1 <= mo <= 12 and 1 <= d <= 31:
                        d_obj = date(y, mo, d)
                        dates.append(f"{y}年{mo}月{d}日")
                        all_dates.append(d_obj)
                        last_y, last_m, last_d = y, mo, d
                        found = True
                except (ValueError, TypeError):
                    pass
            if found:
                continue
            for m in re.finditer(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", seg):
                try:
                    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
                    if 1 <= mo <= 12 and 1 <= d <= 31:
                        dates.append(f"{y}年{mo}月{d}日")
                        all_dates.append(date(y, mo, d))
                        last_y, last_m, last_d = y, mo, d
                        found = True
                except (ValueError, TypeError):
                    pass
            if found:
                continue
            md = re.match(r"^(\d{1,2})/(\d{1,2})$", seg)
            if md and last_y is not None:
                try:
                    mo, d = int(md.group(1)), int(md.group(2))
                    if 1 <= mo <= 12 and 1 <= d <= 31:
                        d_obj = date(last_y, mo, d)
                        dates.append(f"{last_y}年{mo}月{d}日")
                        all_dates.append(d_obj)
                        last_m, last_d = mo, d
                        continue
                except (ValueError, TypeError):
                    pass
            day_only = re.match(r"^(\d{1,2})$", seg)
            if day_only and last_y is not None and last_m is not None:
                try:
                    d = int(day_only.group(1))
                    if 1 <= d <= 31:
                        d_obj = date(last_y, last_m, d)
                        dates.append(f"{last_y}年{last_m}月{d}日")
                        all_dates.append(d_obj)
                        last_d = d
                except (ValueError, TypeError):
                    pass
        if dates:
            rows.append({"visitPoint": visit_point, "dates": dates})
    if not rows:
        return None
    overall_start = ""
    overall_end = ""
    if all_dates:
        d_min, d_max = min(all_dates), max(all_dates)
        overall_start = f"{d_min.year}年{d_min.month}月{d_min.day}日"
        overall_end = f"{d_max.year}年{d_max.month}月{d_max.day}日"
    return {
        "rows": rows,
        "overall_start": overall_start,
        "overall_end": overall_end,
    }


def get_schedule_plan_from_execution_order(project_no: str) -> Optional[dict]:
    """按 project_no 从执行台 ExecutionOrderUpload 获取排期计划（与 v1 一致）。"""
    if not project_no or not str(project_no).strip():
        return None
    pno = str(project_no).strip()
    try:
        for rec in _load_execution_order_uploads(50):
            lm = _last_match_row_for_project_in_upload(rec, pno)
            if lm is None:
                continue
            raw = lm.get("执行排期") or lm.get("测试具体排期") or ""
            parsed = _parse_schedule_plan_raw(str(raw).strip())
            if parsed:
                parsed["raw"] = raw
            return parsed
    except Exception:
        pass
    return None


def _eo_row_and_schedule_from_execution_orders(project_no: str) -> Tuple[Optional[dict], Optional[dict]]:
    """
    一次读取 execution_order_upload（最多 120 条），同时得到执行台同步行与排期解析结果。
    原先 work_order_detail 内两次独立查询（排期 50 条 + 项目行 120 条），热路径合并为单次查询。
    """
    pno = (project_no or "").strip()
    if not pno:
        return None, None
    try:
        uploads = _load_execution_order_uploads(120)
    except Exception:
        return None, None
    eo_row = None
    for rec in uploads:
        lm = _last_match_row_for_project_in_upload(rec, pno)
        if lm is not None:
            eo_row = lm
            break
    schedule_plan = None
    for rec in uploads[:50]:
        lm = _last_match_row_for_project_in_upload(rec, pno)
        if lm is None:
            continue
        raw = lm.get("执行排期") or lm.get("测试具体排期") or ""
        parsed = _parse_schedule_plan_raw(str(raw).strip())
        if parsed:
            parsed["raw"] = raw
        schedule_plan = parsed
        break
    return eo_row, schedule_plan


def _display_str_from_eo(eo_row: Optional[dict], key: str, db_val: Optional[str]) -> Optional[str]:
    """执行订单有非空值则优先，否则用工单表字段。"""
    if eo_row:
        raw = eo_row.get(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    return db_val


def _overview_date_to_iso(d_str: str) -> Optional[str]:
    """
    排期单元格中的日期可能是「YYYY年M月D日」、YYYY-MM-DD 或 YYYY/M/D。
    与 counts / by-date 必须使用同一规则，否则会出现月历有角标、当日表格为空。
    """
    s = (d_str or "").strip()
    if not s:
        return None
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        try:
            y, mo, d = int(s[0:4]), int(s[5:7]), int(s[8:10])
            if 1 <= mo <= 12 and 1 <= d <= 31:
                return f"{y}-{mo:02d}-{d:02d}"
        except (ValueError, TypeError):
            pass
    m = re.match(r"^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$", s)
    if m:
        try:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= mo <= 12 and 1 <= d <= 31:
                return f"{y}-{mo:02d}-{d:02d}"
        except (ValueError, TypeError):
            pass
    return _chinese_date_to_iso(s)


def _plans_index_from_uploads(uploads: list) -> dict[str, Optional[dict]]:
    """
    按项目编号建立排期解析结果索引：与 get_schedule_plan_from_execution_order(pno) 单项目语义一致
    （按上传记录顺序，每条记录内同一项目编号取最后一行）。
    """
    result: dict[str, Optional[dict]] = {}
    for rec in uploads:
        if not rec or not getattr(rec, "data", None):
            continue
        data = rec.data if isinstance(rec.data, dict) else {}
        headers = data.get("headers") or []
        rows = data.get("rows") or []
        last_by_pno: dict[str, dict] = {}
        for row in rows:
            d = _eo_row_to_dict(headers, row)
            pno = (d.get("项目编号") or "").strip()
            if pno:
                last_by_pno[pno] = d
        for pno, last_match in last_by_pno.items():
            if pno in result:
                continue
            raw = last_match.get("执行排期") or last_match.get("测试具体排期") or ""
            parsed = _parse_schedule_plan_raw(str(raw).strip())
            if parsed:
                parsed["raw"] = raw
            result[pno] = parsed
    return result


def _sample_size_for_project_from_uploads(uploads: list, pno: str, default: int) -> int:
    """与 v1 一致：取首条上传记录的首行匹配项目编号时的样本量。"""
    for rec in uploads:
        if not rec or not getattr(rec, "data", None):
            continue
        data = rec.data if isinstance(rec.data, dict) else {}
        headers = data.get("headers") or []
        rows = data.get("rows") or []
        first = rows[0] if rows else []
        if isinstance(first, list) and headers:
            first_d = dict(zip(headers, first))
        else:
            first_d = first if isinstance(first, dict) else {}
        if (first_d.get("项目编号") or "").strip() != pno:
            continue
        val = first_d.get("样本量") or first_d.get("样本数量") or first_d.get("最低样本量")
        if val is not None and str(val).strip():
            try:
                return max(0, int(float(str(val).replace(",", ""))))
            except (ValueError, TypeError):
                pass
        break
    return default


def execution_overview_by_date(target_date: str) -> list[dict]:
    """
    按日期返回项目执行概览条目（接待台「项目执行概览」日历）。
    target_date: YYYY-MM-DD。
    返回 [{ project_no, project_name, visit_point, sample_size, visit_sequence, daily_progress }]
    """
    if not target_date or len(target_date) < 10:
        return []
    target_date = target_date[:10]
    items: list[dict] = []
    uploads = _load_execution_order_uploads()
    plans_index = _plans_index_from_uploads(uploads)
    work_orders = list(ProductDistributionWorkOrder.objects.filter(is_delete=0).order_by("-created_at"))
    for wo in work_orders:
        pno = (wo.project_no or "").strip()
        if not pno:
            continue
        plan = plans_index.get(pno)
        if not plan or not plan.get("rows"):
            continue
        default_vc = wo.visit_count or 0
        try:
            sample_size: str | int = _sample_size_for_project_from_uploads(uploads, pno, default_vc)
        except Exception:
            sample_size = default_vc
        for idx, row in enumerate(plan["rows"]):
            dates = row.get("dates") or []
            for d_str in dates:
                iso = _overview_date_to_iso(d_str)
                if iso == target_date:
                    seq = f"V{idx + 1}"
                    items.append({
                        "project_no": pno,
                        "project_name": (wo.project_name or "").strip() or "—",
                        "visit_point": (row.get("visitPoint") or "").strip() or "—",
                        "sample_size": sample_size,
                        "visit_sequence": seq,
                        "daily_progress": "",
                    })
                    break
    return items


def execution_overview_counts_by_month(month_key: str) -> dict[str, int]:
    """
    按月份返回每日项目执行数量（月历角标）。
    month_key: YYYY-MM，如 2026-03
    返回: {"2026-03-01": 3, ...}，仅包含有项目的日期
    """
    if not month_key or len(month_key) < 7:
        return {}
    parts = month_key.split("-")
    if len(parts) < 2:
        return {}
    try:
        y, m = int(parts[0]), int(parts[1])
        if m < 1 or m > 12:
            return {}
    except (ValueError, TypeError):
        return {}
    from calendar import monthrange

    _, last_day = monthrange(y, m)
    prefix = f"{y}-{m:02d}-"
    counts: dict[str, int] = {}
    uploads = _load_execution_order_uploads()
    plans_index = _plans_index_from_uploads(uploads)
    work_orders = list(ProductDistributionWorkOrder.objects.filter(is_delete=0).order_by("-created_at"))
    for wo in work_orders:
        pno = (wo.project_no or "").strip()
        if not pno:
            continue
        plan = plans_index.get(pno)
        if not plan or not plan.get("rows"):
            continue
        for row in plan["rows"]:
            dates = row.get("dates") or []
            for d_str in dates:
                iso = _overview_date_to_iso(d_str)
                if iso and iso.startswith(prefix) and len(iso) >= 10:
                    day = iso[8:10]
                    if day.isdigit() and 1 <= int(day) <= last_day:
                        counts[iso] = counts.get(iso, 0) + 1
    return counts


# ---------- 工单 ----------

def work_order_list(
    keyword: Optional[str] = None,
    project_no: Optional[str] = None,
    project_start_date: Optional[str] = None,
    project_end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductDistributionWorkOrder.objects.filter(is_delete=0)
    if keyword:
        qs = qs.filter(
            Q(work_order_no__icontains=keyword)
            | Q(project_no__icontains=keyword)
            | Q(project_name__icontains=keyword)
            | Q(researcher__icontains=keyword)
            | Q(supervisor__icontains=keyword)
        )
    if project_no:
        qs = qs.filter(project_no=project_no)
    if project_start_date:
        qs = qs.filter(project_start_date__gte=project_start_date)
    if project_end_date:
        qs = qs.filter(project_end_date__lte=project_end_date)
    total = qs.count()
    items = list(
        qs.order_by("-created_at")[(page - 1) * page_size : page * page_size]
    )
    list_data = [
        {
            "id": row.id,
            "work_order_no": row.work_order_no,
            "project_no": row.project_no,
            "project_name": row.project_name,
            "project_start_date": str(row.project_start_date),
            "project_end_date": str(row.project_end_date),
            "visit_count": row.visit_count or 0,
            "researcher": row.researcher,
            "supervisor": row.supervisor,
            "execution_progress": _execution_progress(row.project_start_date, row.project_end_date),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in items
    ]
    return {"list": list_data, "total": total, "page": page, "pageSize": page_size}


def _execution_queryset_for_work_order_row(row: ProductDistributionWorkOrder):
    """与工单关联的执行记录：work_order_id 或 related_project_no=项目编号（历史数据）。"""
    project_no = (row.project_no or "").strip()
    q = Q(work_order_id=row.id)
    if project_no:
        q |= Q(related_project_no=project_no)
    pk_list = list(
        ProductDistributionExecution.objects.filter(is_delete=0)
        .filter(q)
        .values_list("id", flat=True)
        .distinct()
    )
    if not pk_list:
        return ProductDistributionExecution.objects.none()
    return ProductDistributionExecution.objects.filter(id__in=pk_list, is_delete=0).order_by("-created_at")


def work_order_executions_page(work_order_id: int, page: int = 1, page_size: int = 10) -> Optional[dict]:
    """工单下执行记录分页（摘要列表），供接待台分页拉取详情。"""
    try:
        row = ProductDistributionWorkOrder.objects.get(id=work_order_id, is_delete=0)
    except ProductDistributionWorkOrder.DoesNotExist:
        return None
    qs = _execution_queryset_for_work_order_row(row)
    total = qs.count()
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    start = (page - 1) * page_size
    chunk = list(qs[start : start + page_size])
    list_data = [
        {
            "id": e.id,
            "execution_date": str(e.execution_date) if e.execution_date else None,
            "subject_rd": e.subject_rd,
            "subject_initials": e.subject_initials,
            "operator_name": e.operator_name,
            "remark": e.remark,
            "created_at": _dt_iso_utc8_stored(e.created_at),
        }
        for e in chunk
    ]
    return {"list": list_data, "total": total, "page": page, "pageSize": page_size}


def work_order_detail(work_order_id: int, include_executions: bool = True) -> Optional[dict]:
    try:
        row = ProductDistributionWorkOrder.objects.get(id=work_order_id, is_delete=0)
    except ProductDistributionWorkOrder.DoesNotExist:
        return None
    execs = _execution_queryset_for_work_order_row(row)
    exec_total = execs.count()
    if include_executions:
        executions = [
            {
                "id": e.id,
                "execution_date": str(e.execution_date) if e.execution_date else None,
                "subject_rd": e.subject_rd,
                "subject_initials": e.subject_initials,
                "operator_name": e.operator_name,
                "remark": e.remark,
                "created_at": _dt_iso_utc8_stored(e.created_at),
            }
            for e in execs
        ]
    else:
        executions = []
    # 与 cn_kis_v1.0 一致：排期/项目主数据来自执行台 ExecutionOrderUpload，不替代 executions（后者仍来自 product_distribution_execution）
    eo, schedule_plan = _eo_row_and_schedule_from_execution_orders(row.project_no or "")
    start_date = row.project_start_date
    end_date = row.project_end_date
    if schedule_plan and schedule_plan.get("overall_start") and schedule_plan.get("overall_end"):
        exec_start = _chinese_date_to_iso(str(schedule_plan["overall_start"]))
        exec_end = _chinese_date_to_iso(str(schedule_plan["overall_end"]))
        if exec_start and exec_end:
            start_date = date.fromisoformat(exec_start)
            end_date = date.fromisoformat(exec_end)
            if (row.project_start_date != start_date or row.project_end_date != end_date) and row.project_no:
                update_fields = []
                if row.project_start_date != start_date:
                    row.project_start_date = start_date
                    update_fields.append("project_start_date")
                if row.project_end_date != end_date:
                    row.project_end_date = end_date
                    update_fields.append("project_end_date")
                if update_fields:
                    row.save(update_fields=update_fields + ["updated_at"])

    visit_count_out = row.visit_count or 0
    if eo:
        vc = eo.get("访视次数") or eo.get("访视数")
        if vc is not None and str(vc).strip():
            try:
                visit_count_out = max(0, int(float(str(vc).replace(",", ""))))
            except (ValueError, TypeError):
                pass

    return {
        "id": row.id,
        "work_order_no": row.work_order_no,
        "project_no": row.project_no,
        "project_name": _display_str_from_eo(eo, "项目名称", row.project_name) or row.project_name,
        "project_start_date": str(start_date),
        "project_end_date": str(end_date),
        "visit_count": visit_count_out,
        "researcher": _display_str_from_eo(eo, "研究员", row.researcher),
        "supervisor": _display_str_from_eo(eo, "督导", row.supervisor),
        "usage_method": row.usage_method,
        "usage_frequency": row.usage_frequency,
        "precautions": row.precautions,
        "project_requirements": row.project_requirements,
        "execution_progress": _execution_progress(start_date, end_date),
        "executions": executions,
        "executions_total": exec_total,
        "schedule_plan": schedule_plan,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def work_order_generate_no() -> str:
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"WO-{today}-"
    last = (
        ProductDistributionWorkOrder.objects.filter(
            work_order_no__startswith=prefix, is_delete=0
        )
        .order_by("-work_order_no")
        .values_list("work_order_no", flat=True)
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(last.split("-")[-1]) + 1
        except (ValueError, IndexError):
            pass
    return f"{prefix}{seq:03d}"


@transaction.atomic(using="default")
def work_order_create(data: dict, user_id: Optional[int] = None, user_name: Optional[str] = None) -> dict:
    project_no = (data.get("project_no") or "").strip()
    if ProductDistributionWorkOrder.objects.filter(project_no=project_no, is_delete=0).exists():
        raise ValueError("项目编号已存在，无法新建工单")
    start = data.get("project_start_date")
    end = data.get("project_end_date")
    if start and end:
        if date.fromisoformat(end) < date.fromisoformat(start):
            raise ValueError("项目结束日期不能早于启动日期")
    visit_count = data.get("visit_count", 0) or 0
    if visit_count < 0:
        raise ValueError("访视次数错误")

    work_order_no = work_order_generate_no()
    now = datetime.now()
    wo = ProductDistributionWorkOrder(
        work_order_no=work_order_no,
        project_no=project_no,
        project_name=(data.get("project_name") or "").strip(),
        project_start_date=start,
        project_end_date=end,
        visit_count=visit_count,
        researcher=_opt_str(data.get("researcher")),
        supervisor=_opt_str(data.get("supervisor")),
        usage_method=_opt_str(data.get("usage_method")),
        usage_frequency=_opt_str(data.get("usage_frequency")),
        precautions=_opt_str(data.get("precautions")),
        project_requirements=_opt_str(data.get("project_requirements")),
        created_by=user_id,
        updated_by=user_id,
        created_at=now,
        updated_at=now,
    )
    wo.save(using="default")
    return {
        "id": wo.id,
        "work_order_no": wo.work_order_no,
        "project_no": wo.project_no,
        "project_name": wo.project_name,
        "created_at": wo.created_at.isoformat() if wo.created_at else None,
    }


def work_order_upsert_by_project_no(data: dict) -> dict:
    """
    按 project_no 创建或更新工单，供执行台→接待台同步使用。
    若 project_no 已存在则更新，否则新建。返回工单 id 与是否更新。
    """
    project_no = (data.get("project_no") or "").strip()
    if not project_no:
        raise ValueError("project_no 不能为空")
    existing = ProductDistributionWorkOrder.objects.filter(
        project_no=project_no, is_delete=0
    ).first()
    if existing:
        work_order_update(existing.id, data)
        return {"id": existing.id, "updated": True}
    result = work_order_create(data)
    return {"id": result["id"], "updated": False}


@transaction.atomic(using="default")
def work_order_update(work_order_id: int, data: dict, user_id: Optional[int] = None) -> dict:
    try:
        row = ProductDistributionWorkOrder.objects.get(id=work_order_id, is_delete=0)
    except ProductDistributionWorkOrder.DoesNotExist:
        return None

    project_no = data.get("project_no")
    if project_no is not None:
        project_no = project_no.strip()
        if ProductDistributionWorkOrder.objects.filter(project_no=project_no, is_delete=0).exclude(id=work_order_id).exists():
            raise ValueError("项目编号已存在，修改失败")
        row.project_no = project_no
    if "project_name" in data and data["project_name"] is not None:
        row.project_name = (data["project_name"] or "").strip()
    if "project_start_date" in data:
        row.project_start_date = data["project_start_date"]
    if "project_end_date" in data:
        row.project_end_date = data["project_end_date"]
    if "visit_count" in data:
        v = data["visit_count"]
        if v is not None and v < 0:
            raise ValueError("访视次数必须大于等于0")
        row.visit_count = v if v is not None else 0
    if "researcher" in data:
        row.researcher = _opt_str(data["researcher"])
    if "supervisor" in data:
        row.supervisor = _opt_str(data["supervisor"])
    if "usage_method" in data:
        row.usage_method = _opt_str(data["usage_method"])
    if "usage_frequency" in data:
        row.usage_frequency = _opt_str(data["usage_frequency"])
    if "precautions" in data:
        row.precautions = _opt_str(data["precautions"])
    if "project_requirements" in data:
        row.project_requirements = _opt_str(data["project_requirements"])

    # 与 work_order_create 一致：允许开始日=结束日（单日项目）；仅禁止结束早于开始
    if row.project_start_date and row.project_end_date and row.project_end_date < row.project_start_date:
        raise ValueError("项目结束日期不能早于启动日期")
    row.updated_by = user_id
    row.updated_at = datetime.now()
    row.save(using="default", update_fields=[
        "project_no", "project_name", "project_start_date", "project_end_date",
        "visit_count", "researcher", "supervisor", "usage_method", "usage_frequency",
        "precautions", "project_requirements", "updated_by", "updated_at",
    ])
    return {
        "id": row.id,
        "work_order_no": row.work_order_no,
        "project_no": row.project_no,
        "project_name": row.project_name,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# ---------- 枚举（固定选项，与 KIS enum_mappings 语义一致） ----------

EXECUTION_STAGE_OPTIONS = [
    {"value": "washout", "label": "洗脱期"},
    {"value": "t0", "label": "T0阶段"},
    {"value": "visit", "label": "回访阶段"},
]

EXCEPTION_TYPE_OPTIONS = [
    {"value": "", "label": "无异常"},
    {"value": "usage_error", "label": "使用错误"},
    {"value": "diary_error", "label": "日记错误"},
    {"value": "product_damage", "label": "产品损坏"},
    {"value": "distribution_error", "label": "发放错误"},
    {"value": "recovery_error", "label": "回收错误"},
    {"value": "other", "label": "其他"},
]


def enum_execution_stage() -> dict:
    return {"options": EXECUTION_STAGE_OPTIONS}


def enum_exception_type() -> dict:
    return {"options": EXCEPTION_TYPE_OPTIONS}


# ---------- 样品台账与记录 ----------

def sample_ledger_list(
    related_project_no: Optional[str] = None,
    product_code: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = (
        ProductSampleRequest.objects.filter(is_delete=0)
        .values("related_project_no", "product_code")
        .annotate(
            product_name=Max("product_name"),
            unit=Max("unit"),
            project_name=Max("project_name"),
            project_start_date=Max("project_start_date"),
            project_end_date=Max("project_end_date"),
            total_received=Coalesce(
                Sum("quantity", filter=Q(operation_type="receive")), Decimal("0")
            ),
            total_returned=Coalesce(
                Sum("quantity", filter=Q(operation_type="return_to_stock")), Decimal("0")
            ),
        )
        .order_by("related_project_no", "product_code")
    )
    if related_project_no:
        qs = qs.filter(related_project_no=related_project_no)
    if product_code:
        qs = qs.filter(product_code=product_code)
    if keyword:
        # 支持按工单编号搜索：keyword 可能是 work_order_no，需解析为 project_no 再匹配
        project_nos_from_work_order = list(
            ProductDistributionWorkOrder.objects.filter(
                is_delete=0, work_order_no__icontains=keyword
            ).values_list("project_no", flat=True)
        )
        qs = qs.filter(
            Q(related_project_no__icontains=keyword)
            | Q(project_name__icontains=keyword)
            | Q(product_code__icontains=keyword)
            | Q(product_name__icontains=keyword)
            | (Q(related_project_no__in=project_nos_from_work_order) if project_nos_from_work_order else Q(pk__in=[]))
        )
    total = qs.count()
    rows = list(qs[(page - 1) * page_size : page * page_size])

    # 发放/回收来自 product_distribution_operation（is_selected=1, is_delete=0）
    dist_recovery = {}
    op_rows = list(
        ProductDistributionOperation.objects.filter(is_selected=1, is_delete=0).values(
            "execution_id", "product_code", "product_name", "product_distribution", "product_recovery"
        )
    )
    exec_ids = list({o["execution_id"] for o in op_rows})
    exec_proj = {
        e["id"]: e["related_project_no"]
        for e in ProductDistributionExecution.objects.filter(id__in=exec_ids).values("id", "related_project_no")
    }
    for o in op_rows:
        proj = exec_proj.get(o["execution_id"])
        if proj is None:
            continue
        key = (proj, o["product_code"], o["product_name"] or "")
        if key not in dist_recovery:
            dist_recovery[key] = {"total_distributed": Decimal("0"), "total_recovered": Decimal("0")}
        dist_recovery[key]["total_distributed"] += Decimal(str(o.get("product_distribution") or 0))
        dist_recovery[key]["total_recovered"] += Decimal(str(o.get("product_recovery") or 0))

    project_nos = list({r["related_project_no"] for r in rows})
    wo_map = {
        wo.project_no: wo
        for wo in ProductDistributionWorkOrder.objects.filter(project_no__in=project_nos, is_delete=0)
    }
    list_data = []
    for r in rows:
        total_received = r.get("total_received") or Decimal("0")
        total_returned = r.get("total_returned") or Decimal("0")
        pending = total_received - total_returned
        key = (r["related_project_no"], r["product_code"], r.get("product_name") or "")
        dr = dist_recovery.get(key, {})
        total_distributed = dr.get("total_distributed", Decimal("0"))
        total_recovered = dr.get("total_recovered", Decimal("0"))
        wo = wo_map.get(r["related_project_no"])
        project_close_status = "completed" if pending == 0 else ("pending_return" if pending > 0 else "abnormal")
        list_data.append({
            "related_project_no": r["related_project_no"],
            "project_name": wo.project_name if wo else r.get("project_name"),
            "project_start_date": str(wo.project_start_date) if wo and wo.project_start_date else (str(r["project_start_date"]) if r.get("project_start_date") else None),
            "project_end_date": str(wo.project_end_date) if wo and wo.project_end_date else (str(r["project_end_date"]) if r.get("project_end_date") else None),
            "project_close_status": project_close_status,
            "product_name": r.get("product_name") or "",
            "product_code": r["product_code"],
            "unit": r.get("unit") or "",
            "total_received": float(total_received),
            "total_returned": float(total_returned),
            "total_distributed": float(total_distributed),
            "total_recovered": float(total_recovered),
            "pending_return_qty": float(pending),
            "work_order_no": wo.work_order_no if wo else None,
        })
    return {"list": list_data, "total": total, "page": page, "pageSize": page_size}


def sample_order_list(
    keyword: Optional[str] = None,
    related_project_no: Optional[str] = None,
    product_code: Optional[str] = None,
    operation_type: Optional[str] = None,
    operation_date_from: Optional[str] = None,
    operation_date_to: Optional[str] = None,
    purpose: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductSampleRequest.objects.filter(is_delete=0)
    if keyword:
        # 支持按工单编号搜索：keyword 可能是 work_order_no，需解析为 project_no 再匹配
        project_nos_from_work_order = list(
            ProductDistributionWorkOrder.objects.filter(
                is_delete=0, work_order_no__icontains=keyword
            ).values_list("project_no", flat=True)
        )
        qs = qs.filter(
            Q(related_project_no__icontains=keyword)
            | Q(project_name__icontains=keyword)
            | Q(product_code__icontains=keyword)
            | Q(product_name__icontains=keyword)
            | Q(purpose__icontains=keyword)
            | (Q(related_project_no__in=project_nos_from_work_order) if project_nos_from_work_order else Q(pk__in=[]))
        )
    if related_project_no:
        qs = qs.filter(related_project_no=related_project_no)
    if product_code:
        qs = qs.filter(product_code=product_code)
    if operation_type:
        qs = qs.filter(operation_type=operation_type)
    if operation_date_from:
        qs = qs.filter(operation_date__gte=operation_date_from)
    if operation_date_to:
        qs = qs.filter(operation_date__lte=operation_date_to)
    if purpose:
        qs = qs.filter(purpose__icontains=purpose)
    total = qs.count()
    items = list(qs.order_by("-operation_date", "-id")[(page - 1) * page_size : page * page_size])
    project_nos = list({r.related_project_no for r in items})
    wo_map = {wo.project_no: wo for wo in ProductDistributionWorkOrder.objects.filter(project_no__in=project_nos, is_delete=0)}
    list_data = []
    for row in items:
        wo = wo_map.get(row.related_project_no)
        list_data.append({
            "id": row.id,
            "operation_type": row.operation_type,
            "operation_date": str(row.operation_date),
            "related_project_no": row.related_project_no,
            "project_name": wo.project_name if wo else row.project_name,
            "supervisor": wo.supervisor if wo else row.supervisor,
            "product_name": row.product_name,
            "product_code": row.product_code,
            "quantity": float(row.quantity),
            "unit": row.unit,
            "purpose": row.purpose,
            "operator_name": row.operator_name,
            "remark": row.remark,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })
    return {"list": list_data, "total": total, "page": page, "pageSize": page_size}


def sample_order_detail(record_id: int) -> Optional[dict]:
    try:
        row = ProductSampleRequest.objects.get(id=record_id, is_delete=0)
    except ProductSampleRequest.DoesNotExist:
        return None
    wo = None
    try:
        wo = ProductDistributionWorkOrder.objects.get(project_no=row.related_project_no, is_delete=0)
    except ProductDistributionWorkOrder.DoesNotExist:
        pass
    return {
        "id": row.id,
        "operation_type": row.operation_type,
        "operation_date": str(row.operation_date),
        "related_project_no": row.related_project_no,
        "project_name": wo.project_name if wo else row.project_name,
        "project_start_date": str(wo.project_start_date) if wo and wo.project_start_date else (str(row.project_start_date) if row.project_start_date else None),
        "project_end_date": str(wo.project_end_date) if wo and wo.project_end_date else (str(row.project_end_date) if row.project_end_date else None),
        "researcher": wo.researcher if wo else row.researcher,
        "supervisor": wo.supervisor if wo else row.supervisor,
        "product_name": row.product_name,
        "product_code": row.product_code,
        "quantity": float(row.quantity),
        "unit": row.unit,
        "purpose": row.purpose,
        "operator_id": row.operator_id,
        "operator_name": row.operator_name,
        "remark": row.remark,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@transaction.atomic(using="default")
def sample_order_create(data: dict, user_id: Optional[int] = None, user_name: Optional[str] = None) -> dict:
    now = datetime.now()
    row = ProductSampleRequest(
        operation_type=data.get("operation_type", "receive"),
        operation_date=data["operation_date"],
        related_project_no=(data.get("related_project_no") or "").strip(),
        project_name=_opt_str(data.get("project_name")),
        project_start_date=data.get("project_start_date"),
        project_end_date=data.get("project_end_date"),
        researcher=_opt_str(data.get("researcher")),
        supervisor=_opt_str(data.get("supervisor")),
        product_name=(data.get("product_name") or "").strip(),
        product_code=(data.get("product_code") or "").strip(),
        quantity=data.get("quantity", 0),
        unit=_opt_str(data.get("unit")),
        purpose=(data.get("purpose") or "").strip(),
        operator_id=user_id,
        operator_name=user_name,
        remark=_opt_str(data.get("remark")),
        created_by=user_id,
        updated_by=user_id,
        created_at=now,
        updated_at=now,
    )
    row.save(using="default")
    return {
        "id": row.id,
        "operation_type": row.operation_type,
        "operation_date": str(row.operation_date),
        "related_project_no": row.related_project_no,
        "product_name": row.product_name,
        "product_code": row.product_code,
        "quantity": float(row.quantity),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@transaction.atomic(using="default")
def sample_order_update(record_id: int, data: dict, user_id: Optional[int] = None, user_name: Optional[str] = None) -> Optional[dict]:
    try:
        row = ProductSampleRequest.objects.get(id=record_id, is_delete=0)
    except ProductSampleRequest.DoesNotExist:
        return None
    for key in ("operation_type", "operation_date", "related_project_no", "project_name", "project_start_date",
                "project_end_date", "researcher", "supervisor", "product_name", "product_code",
                "quantity", "unit", "purpose", "remark"):
        if key in data:
            v = data[key]
            if key in ("project_name", "researcher", "supervisor", "product_name", "product_code", "unit", "purpose", "remark") and v is not None:
                v = (v or "").strip() or None
            setattr(row, key, v)
    row.updated_by = user_id
    if user_name is not None:
        row.operator_id = user_id
        row.operator_name = _opt_str(user_name) or row.operator_name
    row.updated_at = datetime.now()
    row.save(using="default")
    return sample_order_detail(record_id)


def project_products(related_project_no: str) -> dict:
    if not (related_project_no and related_project_no.strip()):
        return {"list": []}
    rows = (
        ProductSampleRequest.objects.filter(
            related_project_no=related_project_no.strip(), is_delete=0
        )
        .values("product_code", "product_name")
        .distinct()
    )
    list_data = [{"product_code": r["product_code"], "product_name": r["product_name"] or ""} for r in rows]
    return {"list": list_data}


# ---------- 执行记录 ----------

# 待执行工单「无需执行」结案标记，写入 remark 前缀；用于按队列日从待执行列表排除
SKIP_PENDING_MARK = "__SKIP_PENDING__|"


def _skip_pending_tag(qdate: str, work_order_id: int, subject_id: int, checkin_id: Optional[int]) -> str:
    qd = (qdate or "").strip()[:10]
    tag = f"{SKIP_PENDING_MARK}qdate={qd}|wo={int(work_order_id)}|sid={int(subject_id)}|"
    if checkin_id is not None:
        tag += f"cid={int(checkin_id)}|"
    tag += "__"
    return tag


def _skip_pending_closure_exists(qdate: str, work_order_id: int, subject_id: int, checkin_id: Optional[int]) -> bool:
    qd = (qdate or "").strip()[:10]
    q = (
        Q(is_delete=0)
        & Q(remark__contains=SKIP_PENDING_MARK)
        & Q(remark__contains=f"|qdate={qd}|")
        & Q(remark__contains=f"|wo={int(work_order_id)}|")
        & Q(remark__contains=f"|sid={int(subject_id)}|")
    )
    if checkin_id is not None:
        q &= Q(remark__contains=f"|cid={int(checkin_id)}|")
    return ProductDistributionExecution.objects.filter(q).exists()


def pending_execution_skips_for_queue_date(queue_date: str) -> Dict[str, List[dict]]:
    d = (queue_date or "").strip()[:10]
    if len(d) < 10:
        return {"items": []}
    qs = ProductDistributionExecution.objects.filter(is_delete=0, remark__startswith=SKIP_PENDING_MARK)
    items: List[dict] = []
    for row in qs:
        rmk = row.remark or ""
        if f"|qdate={d}|" not in rmk:
            continue
        sid_m = re.search(r"\|sid=(\d+)\|", rmk)
        wo_m = re.search(r"\|wo=(\d+)\|", rmk)
        if not sid_m or not wo_m:
            continue
        cid_m = re.search(r"\|cid=(\d+)\|", rmk)
        items.append({
            "work_order_id": int(wo_m.group(1)),
            "subject_id": int(sid_m.group(1)),
            "checkin_id": int(cid_m.group(1)) if cid_m else None,
            "queue_date": d,
        })
    return {"items": items}


def execution_list(
    work_order_id: Optional[int] = None,
    subject_rd: Optional[str] = None,
    keyword: Optional[str] = None,
    execution_date_from: Optional[str] = None,
    execution_date_to: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    qs = ProductDistributionExecution.objects.filter(is_delete=0)
    if work_order_id is not None:
        qs = qs.filter(work_order_id=work_order_id)
    if subject_rd:
        qs = qs.filter(subject_rd__icontains=subject_rd)
    if keyword:
        qs = qs.filter(
            Q(related_project_no__icontains=keyword)
            | Q(subject_rd__icontains=keyword)
            | Q(subject_initials__icontains=keyword)
            | Q(screening_no__icontains=keyword)
        ) | qs.filter(
            work_order_id__in=ProductDistributionWorkOrder.objects.filter(
                is_delete=0,
            ).filter(
                Q(work_order_no__icontains=keyword)
                | Q(project_no__icontains=keyword)
                | Q(project_name__icontains=keyword)
            ).values_list("id", flat=True)
        )
    if execution_date_from:
        qs = qs.filter(execution_date__gte=execution_date_from)
    if execution_date_to:
        qs = qs.filter(execution_date__lte=execution_date_to)
    total = qs.count()
    items = list(qs.order_by("-execution_date", "-id")[(page - 1) * page_size : page * page_size])
    list_data = [
        {
            "id": row.id,
            "work_order_id": row.work_order_id,
            "related_project_no": row.related_project_no,
            "subject_rd": row.subject_rd,
            "subject_initials": row.subject_initials,
            "screening_no": row.screening_no,
            "execution_date": str(row.execution_date) if row.execution_date else None,
            "operator_name": row.operator_name,
            "exception_type": row.exception_type,
            "remark": row.remark,
            "created_at": _dt_iso_utc8_stored(row.created_at),
            "skip_execution": bool((row.remark or "").startswith(SKIP_PENDING_MARK)),
        }
        for row in items
    ]
    return {"list": list_data, "total": total, "page": page, "pageSize": page_size}


def execution_detail(execution_id: int) -> Optional[dict]:
    try:
        row = ProductDistributionExecution.objects.get(id=execution_id, is_delete=0)
    except ProductDistributionExecution.DoesNotExist:
        return None
    wo = (
        ProductDistributionWorkOrder.objects.filter(id=row.work_order_id, is_delete=0).first()
        if row.work_order_id else None
    )
    ops = list(
        ProductDistributionOperation.objects.filter(
            execution_id=execution_id, is_delete=0
        ).order_by("id")
    )
    products = []
    for op in ops:
        pot = None
        if getattr(op, "product_site_use", 0):
            pot = "site_use"
        elif op.product_distribution:
            pot = "distribution"
        elif op.product_inspection:
            pot = "inspection"
        elif op.product_recovery:
            pot = "recovery"
        products.append({
            "id": op.id,
            "stage": op.stage,
            "execution_cycle": op.execution_cycle,
            "product_code": op.product_code,
            "product_name": op.product_name,
            "bottle_sequence": op.bottle_sequence,
            "is_selected": op.is_selected,
            "product_operation_type": pot,
            "product_distribution": op.product_distribution,
            "product_inspection": op.product_inspection,
            "product_recovery": op.product_recovery,
            "product_site_use": getattr(op, "product_site_use", 0),
            "distribution_weight": float(op.distribution_weight) if op.distribution_weight is not None else None,
            "inspection_weight": float(op.inspection_weight) if op.inspection_weight is not None else None,
            "recovery_weight": float(op.recovery_weight) if op.recovery_weight is not None else None,
            "diary_distribution": op.diary_distribution,
            "diary_inspection": op.diary_inspection,
            "diary_recovery": op.diary_recovery,
            "usage_diagram_file_id": getattr(op, "usage_diagram_file_id", None),
            "operator_name": None,
            "operation_time": _dt_iso_utc8_stored(op.updated_at),
        })
    return {
        "id": row.id,
        "work_order_id": row.work_order_id,
        "related_project_no": row.related_project_no,
        "project_no": wo.project_no if wo else None,
        "project_name": wo.project_name if wo else None,
        "subject_rd": row.subject_rd,
        "subject_initials": row.subject_initials,
        "screening_no": row.screening_no,
        "execution_date": str(row.execution_date) if row.execution_date else None,
        "operator_id": row.operator_id,
        "operator_name": row.operator_name,
        "exception_type": row.exception_type,
        "exception_description": row.exception_description,
        "remark": row.remark,
        "products": products,
        "created_at": _dt_iso_utc8_stored(row.created_at),
        "updated_at": _dt_iso_utc8_stored(row.updated_at),
        "skip_execution": bool((row.remark or "").startswith(SKIP_PENDING_MARK)),
    }


def _product_create_to_dict(p: dict) -> dict:
    pot = (p.get("product_operation_type") or "").strip() or None
    dist = p.get("product_distribution", False) if pot is None else (pot == "distribution")
    insp = p.get("product_inspection", False) if pot is None else (pot == "inspection")
    rec = p.get("product_recovery", False) if pot is None else (pot == "recovery")
    site_use = p.get("product_site_use", False) if pot is None else (pot == "site_use")
    out = {
        "stage": (p.get("stage") or "").strip(),
        "execution_cycle": _opt_str(p.get("execution_cycle")),
        "product_code": (p.get("product_code") or "").strip(),
        "product_name": (p.get("product_name") or "").strip(),
        "bottle_sequence": _opt_str(p.get("bottle_sequence")),
        "is_selected": 1 if p.get("is_selected", 1) else 0,
        "product_distribution": dist,
        "product_inspection": insp,
        "product_recovery": rec,
        "product_site_use": site_use,
        "distribution_weight": p.get("distribution_weight"),
        "inspection_weight": p.get("inspection_weight"),
        "recovery_weight": p.get("recovery_weight"),
        "diary_distribution": bool(p.get("diary_distribution", False)),
        "diary_inspection": bool(p.get("diary_inspection", False)),
        "diary_recovery": bool(p.get("diary_recovery", False)),
    }
    if "usage_diagram_file_id" in p and p.get("usage_diagram_file_id") is not None:
        out["usage_diagram_file_id"] = p.get("usage_diagram_file_id")
    return out


def _op_equals(op: ProductDistributionOperation, row: dict) -> bool:
    """比较已有操作行与待更新数据是否一致，一致则无需更新。"""
    def _eq(a: Any, b: Any) -> bool:
        if a is None and b is None:
            return True
        if a is None or b is None:
            return False
        if isinstance(a, Decimal) and isinstance(b, (int, float)):
            return float(a) == float(b)
        if isinstance(b, Decimal) and isinstance(a, (int, float)):
            return float(a) == float(b)
        return a == b

    return (
        (op.stage or "") == (row.get("stage") or "")
        and (op.execution_cycle or "") == (row.get("execution_cycle") or "")
        and (op.product_code or "") == (row.get("product_code") or "")
        and (op.product_name or "") == (row.get("product_name") or "")
        and (op.bottle_sequence or "") == (row.get("bottle_sequence") or "")
        and op.is_selected == row.get("is_selected", 1)
        and op.product_distribution == (1 if row.get("product_distribution") else 0)
        and op.product_inspection == (1 if row.get("product_inspection") else 0)
        and op.product_recovery == (1 if row.get("product_recovery") else 0)
        and getattr(op, "product_site_use", 0) == (1 if row.get("product_site_use") else 0)
        and _eq(op.distribution_weight, row.get("distribution_weight"))
        and _eq(op.inspection_weight, row.get("inspection_weight"))
        and _eq(op.recovery_weight, row.get("recovery_weight"))
        and op.diary_distribution == (1 if row.get("diary_distribution") else 0)
        and op.diary_inspection == (1 if row.get("diary_inspection") else 0)
        and op.diary_recovery == (1 if row.get("diary_recovery") else 0)
        and _eq(getattr(op, "usage_diagram_file_id", None), row.get("usage_diagram_file_id"))
    )


@transaction.atomic(using="default")
def execution_create(data: dict, user_id: Optional[int] = None, user_name: Optional[str] = None) -> dict:
    work_order_id = data.get("work_order_id")
    if not ProductDistributionWorkOrder.objects.filter(id=work_order_id, is_delete=0).exists():
        raise ValueError("工单不存在")
    related_project_no = (data.get("related_project_no") or "").strip()
    screening_sc = _opt_str(data.get("screening_no"))
    if not screening_sc:
        raise ValueError("请填写受试者SC号")
    skip_execution = bool(data.get("skip_execution"))

    pending_checkin_int: Optional[int] = None
    pending_subject_int: Optional[int] = None
    pending_qdate: Optional[str] = None
    if skip_execution:
        pending_qdate = (data.get("pending_queue_date") or "").strip()[:10]
        if len(pending_qdate) < 10:
            raise ValueError("缺少或无效的队列日期")
        try:
            pending_subject_int = int(data.get("pending_subject_id"))
        except (TypeError, ValueError):
            raise ValueError("缺少受试者标识")
        raw_cid = data.get("pending_checkin_id")
        if raw_cid is not None and raw_cid != "":
            try:
                pending_checkin_int = int(raw_cid)
            except (TypeError, ValueError):
                pending_checkin_int = None
        if _skip_pending_closure_exists(pending_qdate, int(work_order_id), pending_subject_int, pending_checkin_int):
            raise ValueError("该条待执行已标记为无需执行")

    # 同一项目下受试者 SC 号唯一
    if ProductDistributionExecution.objects.filter(
        related_project_no=related_project_no, screening_no=screening_sc, is_delete=0
    ).exists():
        raise ValueError(f"受试者SC号：{screening_sc} 已存在于该项目中")
    subject_rd = (data.get("subject_rd") or "").strip()
    # 仅当填写了 RD 号时校验项目内唯一；未填则允许多条执行记录
    if not skip_execution and subject_rd and ProductDistributionExecution.objects.filter(
        related_project_no=related_project_no, subject_rd=subject_rd, is_delete=0
    ).exists():
        raise ValueError(f"RD号：{subject_rd} 已存在于项目中")

    operator_display_name = _opt_str(data.get("operator_name")) or user_name
    now = _now_naive_utc8()
    user_remark = _opt_str(data.get("remark"))
    merged_remark = user_remark
    if skip_execution and pending_qdate is not None and pending_subject_int is not None:
        tag = _skip_pending_tag(pending_qdate, int(work_order_id), pending_subject_int, pending_checkin_int)
        merged_remark = tag + (f" {user_remark}" if user_remark else "")

    exec_date_raw = data.get("execution_date")
    if skip_execution and pending_qdate:
        exec_date_raw = exec_date_raw or pending_qdate

    exec_row = ProductDistributionExecution(
        work_order_id=work_order_id,
        related_project_no=related_project_no,
        subject_rd=subject_rd,
        subject_initials=(data.get("subject_initials") or "").strip(),
        screening_no=screening_sc,
        execution_date=exec_date_raw,
        operator_id=user_id,
        operator_name=operator_display_name,
        exception_type=_opt_str(data.get("exception_type")),
        exception_description=_opt_str(data.get("exception_description")),
        remark=merged_remark,
        created_by=user_id,
        updated_by=user_id,
        created_at=now,
        updated_at=now,
    )
    exec_row.save(using="default")
    _raw_update_execution_times(exec_row.id, now, now)

    products = [] if skip_execution else (data.get("products") or [])
    for r in products:
        row = _product_create_to_dict(r)
        op = ProductDistributionOperation(
            execution_id=exec_row.id,
            stage=row["stage"],
            execution_cycle=row.get("execution_cycle"),
            product_code=row["product_code"],
            product_name=row["product_name"],
            bottle_sequence=row.get("bottle_sequence"),
            is_selected=row.get("is_selected", 1),
            product_distribution=1 if row.get("product_distribution") else 0,
            product_inspection=1 if row.get("product_inspection") else 0,
            product_recovery=1 if row.get("product_recovery") else 0,
            product_site_use=1 if row.get("product_site_use") else 0,
            distribution_weight=row.get("distribution_weight"),
            inspection_weight=row.get("inspection_weight"),
            recovery_weight=row.get("recovery_weight"),
            diary_distribution=1 if row.get("diary_distribution") else 0,
            diary_inspection=1 if row.get("diary_inspection") else 0,
            diary_recovery=1 if row.get("diary_recovery") else 0,
            usage_diagram_file_id=row.get("usage_diagram_file_id"),
            created_by=user_id,
            updated_by=user_id,
            created_at=now,
            updated_at=now,
        )
        op.save(using="default")
        _raw_update_operation_times(op.id, now, now)

    return {
        "id": exec_row.id,
        "work_order_id": exec_row.work_order_id,
        "related_project_no": exec_row.related_project_no,
        "subject_rd": exec_row.subject_rd,
        "subject_initials": exec_row.subject_initials,
        "screening_no": exec_row.screening_no,
        "execution_date": str(exec_row.execution_date) if exec_row.execution_date else None,
        "created_at": _dt_iso_utc8(now),
    }


@transaction.atomic(using="default")
def execution_update(
    execution_id: int, data: dict, user_id: Optional[int] = None, user_name: Optional[str] = None
) -> Optional[dict]:
    try:
        row = ProductDistributionExecution.objects.get(id=execution_id, is_delete=0)
    except ProductDistributionExecution.DoesNotExist:
        return None

    if "related_project_no" in data and data["related_project_no"] is not None:
        row.related_project_no = (data["related_project_no"] or "").strip()
        # 项目变更后，当前 SC 号在新项目下仍需唯一
        sc_cur = _opt_str(row.screening_no)
        if sc_cur:
            dup = ProductDistributionExecution.objects.filter(
                related_project_no=row.related_project_no, screening_no=sc_cur, is_delete=0
            ).exclude(id=execution_id).first()
            if dup:
                raise ValueError(f"受试者SC号：{sc_cur} 已存在于该项目中")
    if "subject_rd" in data and data["subject_rd"] is not None:
        new_rd = (data["subject_rd"] or "").strip()
        if new_rd:
            other = ProductDistributionExecution.objects.filter(
                related_project_no=row.related_project_no, subject_rd=new_rd, is_delete=0
            ).exclude(id=execution_id).first()
            if other:
                raise ValueError(f"RD号：{new_rd} 已存在于项目中")
        row.subject_rd = new_rd
    if "subject_initials" in data and data["subject_initials"] is not None:
        row.subject_initials = (data["subject_initials"] or "").strip()
    if "screening_no" in data:
        v = _opt_str(data.get("screening_no"))
        if not v:
            raise ValueError("请填写受试者SC号")
        other = ProductDistributionExecution.objects.filter(
            related_project_no=row.related_project_no, screening_no=v, is_delete=0
        ).exclude(id=execution_id).first()
        if other:
            raise ValueError(f"受试者SC号：{v} 已存在于该项目中")
        row.screening_no = v
    if "execution_date" in data:
        row.execution_date = data["execution_date"]
    if "exception_type" in data:
        row.exception_type = _opt_str(data.get("exception_type"))
    if "exception_description" in data:
        row.exception_description = _opt_str(data.get("exception_description"))
    if "remark" in data:
        row.remark = _opt_str(data.get("remark"))
    if "operator_name" in data and data["operator_name"] is not None:
        row.operator_name = _opt_str(data["operator_name"]) or user_name
    elif user_name is not None:
        row.operator_name = user_name
    row.updated_by = user_id
    now_utc8 = _now_naive_utc8()
    row.updated_at = now_utc8
    row.save(using="default")
    _raw_update_execution_times(execution_id, updated_at=now_utc8)

    if "products" in data and data["products"] is not None:
        now = _now_naive_utc8()
        existing_ops = list(
            ProductDistributionOperation.objects.filter(
                execution_id=execution_id, is_delete=0
            ).order_by("id")
        )
        existing_by_id = {op.id: op for op in existing_ops}
        ids_in_payload = set()

        for r in data["products"]:
            op_id = r.get("id") if isinstance(r.get("id"), int) else None
            row_p = _product_create_to_dict(r)

            if op_id is not None and op_id in existing_by_id:
                op = existing_by_id[op_id]
                if _op_equals(op, row_p):
                    ids_in_payload.add(op_id)
                    continue
                op.stage = row_p["stage"]
                op.execution_cycle = row_p.get("execution_cycle")
                op.product_code = row_p["product_code"]
                op.product_name = row_p["product_name"]
                op.bottle_sequence = row_p.get("bottle_sequence")
                op.is_selected = row_p.get("is_selected", 1)
                op.product_distribution = 1 if row_p.get("product_distribution") else 0
                op.product_inspection = 1 if row_p.get("product_inspection") else 0
                op.product_recovery = 1 if row_p.get("product_recovery") else 0
                op.product_site_use = 1 if row_p.get("product_site_use") else 0
                op.distribution_weight = row_p.get("distribution_weight")
                op.inspection_weight = row_p.get("inspection_weight")
                op.recovery_weight = row_p.get("recovery_weight")
                op.diary_distribution = 1 if row_p.get("diary_distribution") else 0
                op.diary_inspection = 1 if row_p.get("diary_inspection") else 0
                op.diary_recovery = 1 if row_p.get("diary_recovery") else 0
                op.usage_diagram_file_id = row_p.get("usage_diagram_file_id")
                op.updated_by = user_id
                op.updated_at = now
                op.save(using="default")
                _raw_update_operation_times(op.id, updated_at=now)
                ids_in_payload.add(op_id)
            else:
                new_op = ProductDistributionOperation(
                    execution_id=execution_id,
                    stage=row_p["stage"],
                    execution_cycle=row_p.get("execution_cycle"),
                    product_code=row_p["product_code"],
                    product_name=row_p["product_name"],
                    bottle_sequence=row_p.get("bottle_sequence"),
                    is_selected=row_p.get("is_selected", 1),
                    product_distribution=1 if row_p.get("product_distribution") else 0,
                    product_inspection=1 if row_p.get("product_inspection") else 0,
                    product_recovery=1 if row_p.get("product_recovery") else 0,
                    product_site_use=1 if row_p.get("product_site_use") else 0,
                    distribution_weight=row_p.get("distribution_weight"),
                    inspection_weight=row_p.get("inspection_weight"),
                    recovery_weight=row_p.get("recovery_weight"),
                    diary_distribution=1 if row_p.get("diary_distribution") else 0,
                    diary_inspection=1 if row_p.get("diary_inspection") else 0,
                    diary_recovery=1 if row_p.get("diary_recovery") else 0,
                    usage_diagram_file_id=row_p.get("usage_diagram_file_id"),
                    created_by=user_id,
                    updated_by=user_id,
                    created_at=now,
                    updated_at=now,
                )
                new_op.save(using="default")
                _raw_update_operation_times(new_op.id, now, now)

        for op in existing_ops:
            if op.id not in ids_in_payload:
                op.is_delete = 1
                op.save(using="default", update_fields=["is_delete"])

    return execution_detail(execution_id)


def execution_delete(execution_id: int) -> bool:
    try:
        row = ProductDistributionExecution.objects.get(id=execution_id, is_delete=0)
    except ProductDistributionExecution.DoesNotExist:
        return False
    row.is_delete = 1
    row.save(using="default", update_fields=["is_delete"])
    return True
