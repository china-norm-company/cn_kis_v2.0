"""
对比执行订单数据中出现过的项目编号 与 接待台 product_distribution_work_order.project_no。

执行台「项目管理」资源需求列表条数 = GET /scheduling/execution-orders 返回的 items 长度（按首行项目编号去重后的上传记录数）。
接待台工单总数 = 样品发放工单表中 is_delete=0 的行数（一般一条对应一个项目编号）。

用法：
  python manage.py diff_execution_reception_projects
"""
from django.core.management.base import BaseCommand

from apps.product_distribution.models import ProductDistributionWorkOrder
from apps.scheduling.api import _normalize_execution_order_data, _project_code_from_payload
from apps.scheduling.models import ExecutionOrderUpload
from apps.scheduling.workorder_sync import _row_to_dict


class Command(BaseCommand):
    help = "列出执行订单与接待台工单之间的项目编号差异"

    def handle(self, *args, **options):
        # 1) 任意执行订单、任意行中出现过的项目编号（与同步 _sync_to_reception_workorder 扫描范围一致）
        all_from_rows: set[str] = set()
        for rec in ExecutionOrderUpload.objects.order_by("id"):
            out = _normalize_execution_order_data(rec)
            if not out:
                continue
            headers, rows = out
            for row in rows:
                d = _row_to_dict(headers, row)
                pn = (d.get("项目编号") or "").strip()
                if pn:
                    all_from_rows.add(pn)

        # 2) 与 list_execution_orders 一致：按创建时间倒序，首行项目编号已出现则跳过整条上传
        list_items: list[tuple[int, str | None]] = []
        seen_codes: set[str] = set()
        for rec in ExecutionOrderUpload.objects.order_by("-create_time"):
            out = _normalize_execution_order_data(rec)
            if out is None:
                continue
            headers, rows = out
            project_code = _project_code_from_payload(headers, rows)
            if project_code and project_code in seen_codes:
                continue
            if project_code:
                seen_codes.add(project_code)
            list_items.append((rec.id, project_code))

        first_row_codes = {p for _, p in list_items if p}

        recv = set(
            ProductDistributionWorkOrder.objects.filter(is_delete=0).values_list(
                "project_no", flat=True
            )
        )

        self.stdout.write(
            self.style.NOTICE("=== 统计 ===")
        )
        self.stdout.write(
            f"执行订单 GET /execution-orders 列表条数（资源需求卡片「条数」）: {len(list_items)}"
        )
        self.stdout.write(
            f"首行项目编号去重数量（与项目管理「项目数」口径接近）: {len(first_row_codes)}"
        )
        self.stdout.write(
            f"所有上传、所有行中「项目编号」去重数量: {len(all_from_rows)}"
        )
        self.stdout.write(f"接待台工单 is_delete=0 条数: {len(recv)}")
        self.stdout.write("")

        self._print_diff(
            "执行订单任意行中有、接待台无（可能未同步成功或从未保存触发同步）",
            sorted(all_from_rows - recv),
        )
        self._print_diff(
            "接待台有、执行订单任意行中无（可能手工建单或源数据已删）",
            sorted(recv - all_from_rows),
        )
        self._print_diff(
            "仅 list 首行项目编号集合有、接待台无",
            sorted(first_row_codes - recv),
        )

    def _print_diff(self, title: str, codes: list[str]) -> None:
        self.stdout.write(self.style.WARNING(title))
        if not codes:
            self.stdout.write("  （无）")
        else:
            for c in codes:
                self.stdout.write(f"  {c}")
        self.stdout.write("")
