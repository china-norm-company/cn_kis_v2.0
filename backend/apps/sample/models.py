"""
样品管理模型

来源：cn_kis_test backend/apps/sample/
S3-2：产品定义、样品实例、流转记录
"""
from django.db import models


class Product(models.Model):
    """测试产品定义"""

    class Meta:
        db_table = 't_product'
        verbose_name = '测试产品'
        ordering = ['code']
        indexes = [
            models.Index(fields=['code']),
        ]

    PRODUCT_TYPE_CHOICES = [
        ('test_sample', '测试样品'),
        ('placebo', '对照品'),
        ('standard', '标准品'),
    ]

    name = models.CharField('产品名称', max_length=200)
    code = models.CharField('产品编码', max_length=100, unique=True, db_index=True)
    batch_number = models.CharField('批号', max_length=100, blank=True, default='')
    specification = models.CharField('规格', max_length=100, blank=True, default='')
    storage_condition = models.CharField('存储条件', max_length=200, blank=True, default='')
    expiry_date = models.DateField('有效期至', null=True, blank=True)
    description = models.TextField('描述', blank=True, default='')
    product_type = models.CharField('产品类型', max_length=20, choices=PRODUCT_TYPE_CHOICES,
                                    default='test_sample')
    sponsor = models.CharField('委托方', max_length=200, blank=True, default='')
    protocol_id = models.IntegerField('关联项目ID', null=True, blank=True)
    protocol_name = models.CharField('关联项目名称', max_length=200, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    @property
    def product_type_display(self):
        return dict(self.PRODUCT_TYPE_CHOICES).get(self.product_type, self.product_type)

    @property
    def status(self):
        from datetime import date
        if self.expiry_date and self.expiry_date < date.today():
            return 'expired'
        return 'active'

    def __str__(self):
        return f'{self.name} ({self.code})'


class SampleStatus(models.TextChoices):
    IN_STOCK = 'in_stock', '在库'
    DISTRIBUTED = 'distributed', '已分发'
    CONSUMED = 'consumed', '已消耗'
    RETURNED = 'returned', '已回收'
    DESTROYED = 'destroyed', '已销毁'


class SampleInstance(models.Model):
    """样品实物实例"""

    class Meta:
        db_table = 't_sample_instance'
        verbose_name = '样品实例'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['unique_code']),
            models.Index(fields=['status']),
            models.Index(fields=['protocol']),
        ]

    product = models.ForeignKey(Product, on_delete=models.PROTECT,
                                related_name='instances', verbose_name='所属产品')
    unique_code = models.CharField('唯一编码', max_length=100, unique=True, db_index=True)
    protocol = models.ForeignKey('protocol.Protocol', on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='samples',
                                 verbose_name='关联协议')
    current_holder_id = models.IntegerField('当前持有人ID', null=True, blank=True,
                                             help_text='Enrollment ID')
    current_holder_name = models.CharField('当前持有人', max_length=200, blank=True, default='')
    status = models.CharField('状态', max_length=20, choices=SampleStatus.choices,
                              default=SampleStatus.IN_STOCK, db_index=True)
    storage_location = models.CharField('存储位置', max_length=200, blank=True, default='')
    retention = models.BooleanField('留样', default=False)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.product.name} - {self.unique_code}'


class TransactionType(models.TextChoices):
    INBOUND = 'inbound', '入库'
    DISTRIBUTE = 'distribute', '分发'
    RETURN = 'return', '回收'
    DESTROY = 'destroy', '销毁'


class SampleTransaction(models.Model):
    """样品流转记录"""

    class Meta:
        db_table = 't_sample_transaction'
        verbose_name = '样品流转'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['sample', 'transaction_type']),
        ]

    sample = models.ForeignKey(SampleInstance, on_delete=models.CASCADE,
                               related_name='transactions', verbose_name='样品')
    transaction_type = models.CharField('操作类型', max_length=20,
                                        choices=TransactionType.choices)
    enrollment_id = models.IntegerField('关联入组ID', null=True, blank=True)
    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='sample_transactions',
        verbose_name='关联工单', help_text='工单执行时关联样品（AC-3）',
    )
    operator_name = models.CharField('操作人', max_length=100, blank=True, default='')
    operator_id = models.IntegerField('操作人ID', null=True, blank=True)
    remarks = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.get_transaction_type_display()}: {self.sample.unique_code}'


from .models_management import (  # noqa: E402, F401
    SampleReceipt, SampleStorage, SampleDistribution, SampleTest,
    SampleReturn, SampleDestruction, InventoryCount, SampleExpiryAlert,
    TemperatureLog,
)
from .models_product import (  # noqa: E402, F401
    ProductBatch, ProductReceipt, ProductInventory, ProductKit,
    ProductDispensing, ProductUsage, ProductReturn, ProductDestruction,
    ProductDestructionItem, ProductRecall, RecallAction,
)
