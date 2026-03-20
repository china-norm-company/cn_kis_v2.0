"""
样品管理服务模块

- sample_management_service: 接收、存储、分发、检测、回收、销毁、盘点、温度监控
- feishu_alert_service: 飞书预警推送（效期、低库存、温度异常）
- feishu_approval_service: 飞书审批流程（销毁审批）
"""
from .sample_management_service import (
    create_receipt,
    inspect_receipt,
    list_receipts,
    get_receipt,
    store_sample,
    retrieve_sample,
    list_storage_records,
    create_distribution,
    approve_distribution,
    execute_distribution,
    confirm_distribution,
    list_distributions,
    create_test,
    start_test,
    complete_test,
    review_test,
    list_tests,
    create_return,
    execute_return,
    inspect_return,
    process_return,
    list_returns,
    create_destruction,
    approve_destruction,
    execute_destruction,
    list_destructions,
    create_count,
    start_count,
    submit_count,
    review_count,
    list_counts,
    record_temperature,
    handle_alarm,
    list_temperature_logs,
)
from .feishu_alert_service import feishu_alert_service
from .feishu_approval_service import feishu_approval_service
from .product_service import (
    create_product,
    generate_sample_instances,
    distribute_sample,
    return_sample,
    destroy_sample,
    inbound_sample,
)


def list_samples(
    product_id=None, status=None,
    protocol_id=None, page: int = 1, page_size: int = 20,
) -> dict:
    """列出样品实例（兼容旧 api.py 调用）"""
    from apps.sample.models import SampleInstance
    qs = SampleInstance.objects.all()
    if product_id:
        qs = qs.filter(product_id=product_id)
    if status:
        qs = qs.filter(status=status)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total}

__all__ = [
    'create_receipt',
    'inspect_receipt',
    'list_receipts',
    'get_receipt',
    'store_sample',
    'retrieve_sample',
    'list_storage_records',
    'create_distribution',
    'approve_distribution',
    'execute_distribution',
    'confirm_distribution',
    'list_distributions',
    'create_test',
    'start_test',
    'complete_test',
    'review_test',
    'list_tests',
    'create_return',
    'execute_return',
    'inspect_return',
    'process_return',
    'list_returns',
    'create_destruction',
    'approve_destruction',
    'execute_destruction',
    'list_destructions',
    'create_count',
    'start_count',
    'submit_count',
    'review_count',
    'list_counts',
    'record_temperature',
    'handle_alarm',
    'list_temperature_logs',
    'feishu_alert_service',
    'feishu_approval_service',
    'list_samples',
    'create_product',
    'generate_sample_instances',
    'distribute_sample',
    'return_sample',
    'destroy_sample',
    'inbound_sample',
]
