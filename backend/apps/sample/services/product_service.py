"""
产品与样品实例管理服务

提供产品 CRUD、样品实例批量生成、分发、回收、销毁等核心操作。
"""
import logging
from typing import Optional
from apps.sample.models import (
    Product, SampleInstance, SampleTransaction,
    SampleStatus, TransactionType,
)

logger = logging.getLogger(__name__)


def create_product(
    name: str, code: str, batch_number: str = '',
    specification: str = '', storage_condition: str = '',
    expiry_date=None, description: str = '',
) -> Product:
    return Product.objects.create(
        name=name, code=code, batch_number=batch_number,
        specification=specification, storage_condition=storage_condition,
        expiry_date=expiry_date, description=description,
    )


def generate_sample_instances(
    product_id: int, count: int, code_prefix: str = '',
    protocol_id: int = None,
) -> list:
    """批量生成样品实例"""
    product = Product.objects.filter(id=product_id, is_deleted=False).first()
    if not product:
        return []

    prefix = code_prefix or product.code
    existing_count = SampleInstance.objects.filter(product=product).count()

    instances = []
    for i in range(count):
        seq = existing_count + i + 1
        unique_code = f'{prefix}-{seq:04d}'
        instances.append(SampleInstance(
            product=product,
            unique_code=unique_code,
            protocol_id=protocol_id,
            status=SampleStatus.IN_STOCK,
        ))

    SampleInstance.objects.bulk_create(instances)
    return instances


def distribute_sample(
    sample_id: int, enrollment_id: int = None,
    work_order_id: int = None, operator_name: str = '',
    operator_id: int = None, remarks: str = '',
) -> Optional[SampleInstance]:
    """分发样品"""
    sample = SampleInstance.objects.filter(id=sample_id).first()
    if not sample or sample.status != SampleStatus.IN_STOCK:
        return None

    sample.status = SampleStatus.DISTRIBUTED
    sample.current_holder_id = enrollment_id
    sample.save(update_fields=['status', 'current_holder_id', 'update_time'])

    SampleTransaction.objects.create(
        sample=sample, transaction_type=TransactionType.DISTRIBUTE,
        enrollment_id=enrollment_id, work_order_id=work_order_id,
        operator_name=operator_name, operator_id=operator_id, remarks=remarks,
    )
    return sample


def return_sample(
    sample_id: int, operator_name: str = '', operator_id: int = None,
    remarks: str = '',
) -> Optional[SampleInstance]:
    """回收样品"""
    sample = SampleInstance.objects.filter(id=sample_id).first()
    if not sample or sample.status != SampleStatus.DISTRIBUTED:
        return None

    sample.status = SampleStatus.RETURNED
    sample.current_holder_id = None
    sample.save(update_fields=['status', 'current_holder_id', 'update_time'])

    SampleTransaction.objects.create(
        sample=sample, transaction_type=TransactionType.RETURN,
        operator_name=operator_name, operator_id=operator_id, remarks=remarks,
    )
    return sample


def destroy_sample(
    sample_id: int, operator_name: str = '', operator_id: int = None,
    remarks: str = '',
) -> Optional[SampleInstance]:
    """销毁样品"""
    sample = SampleInstance.objects.filter(id=sample_id).first()
    if not sample or sample.status in (SampleStatus.DESTROYED,):
        return None

    sample.status = SampleStatus.DESTROYED
    sample.save(update_fields=['status', 'update_time'])

    SampleTransaction.objects.create(
        sample=sample, transaction_type=TransactionType.DESTROY,
        operator_name=operator_name, operator_id=operator_id, remarks=remarks,
    )
    return sample


def inbound_sample(
    sample_id: int, operator_name: str = '', operator_id: int = None,
    remarks: str = '',
) -> Optional[SampleInstance]:
    """样品入库"""
    sample = SampleInstance.objects.filter(id=sample_id).first()
    if not sample or sample.status not in (SampleStatus.RETURNED,):
        return None

    sample.status = SampleStatus.IN_STOCK
    sample.current_holder_id = None
    sample.save(update_fields=['status', 'current_holder_id', 'update_time'])

    SampleTransaction.objects.create(
        sample=sample, transaction_type=TransactionType.INBOUND,
        operator_name=operator_name, operator_id=operator_id, remarks=remarks,
    )
    return sample
