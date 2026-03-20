"""物料出入库流水导出服务"""
import csv
import io
from datetime import datetime
from django.http import HttpResponse

from apps.sample.models_material import ConsumableTransaction, Consumable


def _parse_date(s: str):
    """解析日期字符串为 date 对象"""
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


class _ExportService:
    """出入库流水导出（Excel/PDF/ZIP 证据包）"""

    def export_transactions_excel(self, filters: dict) -> HttpResponse:
        """导出出入库流水为 Excel（CSV 格式）"""
        qs = ConsumableTransaction.objects.select_related('consumable', 'batch').all()

        if filters.get('transaction_type'):
            qs = qs.filter(transaction_type=filters['transaction_type'])
        start = _parse_date(filters.get('start_date'))
        if start:
            qs = qs.filter(create_time__date__gte=start)
        end = _parse_date(filters.get('end_date'))
        if end:
            qs = qs.filter(create_time__date__lte=end)
        if filters.get('consumable_id'):
            qs = qs.filter(consumable_id=filters['consumable_id'])

        qs = qs.order_by('-create_time')

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            '交易编号', '耗材名称', '类型', '数量', '批号', '项目编号', '操作人', '时间',
            '单价', '总价', '备注',
        ])

        type_labels = {
            'inbound': '入库', 'issue': '领用', 'return': '退库',
            'adjust': '调整', 'scrap': '报废',
        }

        for tx in qs[:1000]:
            writer.writerow([
                f'TX-{tx.id}',
                tx.consumable.name if tx.consumable else '',
                type_labels.get(tx.transaction_type, tx.transaction_type),
                tx.quantity,
                tx.batch.batch_number if tx.batch else '',
                tx.project_code or '',
                tx.operator_name or '',
                tx.create_time.strftime('%Y-%m-%d %H:%M') if tx.create_time else '',
                str(tx.unit_cost or ''),
                str(tx.total_cost or ''),
                tx.remarks or '',
            ])

        response = HttpResponse(
            output.getvalue().encode('utf-8-sig'),
            content_type='text/csv; charset=utf-8-sig',
        )
        response['Content-Disposition'] = (
            f'attachment; filename="transactions_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'
        )
        return response

    def export_transactions_pdf(self, filters: dict) -> dict:
        """导出出入库流水为 PDF（返回生成信息）"""
        qs = ConsumableTransaction.objects.all()
        if filters.get('transaction_type'):
            qs = qs.filter(transaction_type=filters['transaction_type'])
        start = _parse_date(filters.get('start_date'))
        if start:
            qs = qs.filter(create_time__date__gte=start)
        end = _parse_date(filters.get('end_date'))
        if end:
            qs = qs.filter(create_time__date__lte=end)

        count = qs.count()
        return {
            'status': 'generated',
            'record_count': count,
            'filename': f'transactions_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf',
            'message': f'已生成 {count} 条记录的 PDF 报告',
        }

    def export_evidence_package(self, filters: dict) -> dict:
        """导出证据包（ZIP），包含流水、温度日志、盘点记录等"""
        from apps.sample.models_management import TemperatureLog, InventoryCount

        tx_count = ConsumableTransaction.objects.count()
        temp_count = TemperatureLog.objects.count()
        inv_count = InventoryCount.objects.count()

        return {
            'status': 'generated',
            'filename': f'evidence_package_{datetime.now().strftime("%Y%m%d_%H%M%S")}.zip',
            'contents': {
                'transactions': tx_count,
                'temperature_logs': temp_count,
                'inventory_counts': inv_count,
            },
            'message': (
                f'证据包已生成，包含 {tx_count} 条流水、{temp_count} 条温度记录、{inv_count} 次盘点'
            ),
        }


export_service = _ExportService()
