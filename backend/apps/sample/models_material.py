"""
物料管理扩展模型

Consumable（耗材）、ConsumableBatch（耗材批次）、ConsumableTransaction（耗材流水）、
ConsumableAlert（耗材预警）、StorageLocation（库位/层级）、InventoryCheck（盘点）、
ExpiryAlert（效期预警）
"""
from django.db import models


class Consumable(models.Model):
    """耗材定义"""

    class Meta:
        db_table = 't_consumable'
        verbose_name = '耗材'
        ordering = ['code']

    UNIT_CHOICES = [
        ('piece', '件'), ('box', '盒'), ('bottle', '瓶'),
        ('pack', '包'), ('liter', '升'), ('kilogram', '千克'),
        ('gram', '克'), ('milliliter', '毫升'), ('other', '其他'),
    ]

    name = models.CharField('名称', max_length=200)
    code = models.CharField('编码', max_length=100, unique=True, db_index=True)
    specification = models.CharField('规格', max_length=100, blank=True, default='')
    unit = models.CharField('单位', max_length=20, choices=UNIT_CHOICES, blank=True, default='')
    current_stock = models.IntegerField('当前库存', default=0)
    safety_stock = models.IntegerField('安全库存', default=0)
    storage_condition = models.CharField('存储条件', max_length=200, blank=True, default='')
    storage_location_text = models.CharField('存储位置', max_length=200, blank=True, default='')
    expiry_date = models.DateField('有效期至', null=True, blank=True)
    category = models.CharField('类别', max_length=50, blank=True, default='')
    last_issue_date = models.DateField('最近领用日期', null=True, blank=True)

    supplier = models.CharField('供应商', max_length=200, blank=True, default='')
    manufacturer = models.CharField('生产厂家', max_length=200, blank=True, default='')
    unit_price = models.DecimalField('单价', max_digits=10, decimal_places=2,
                                     null=True, blank=True)
    has_expiry = models.BooleanField('是否有有效期', default=True)
    default_shelf_life_days = models.IntegerField('默认保质期(天)', null=True, blank=True)
    manager_id = models.IntegerField('负责人ID', null=True, blank=True)
    manager_name = models.CharField('负责人', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    @property
    def status(self):
        from datetime import date, timedelta
        if self.expiry_date and self.expiry_date <= date.today() + timedelta(days=30):
            return 'expiring'
        if self.current_stock < self.safety_stock:
            return 'low_stock'
        return 'normal'

    @property
    def status_display(self):
        mapping = {'expiring': '近效期', 'low_stock': '库存不足', 'normal': '正常'}
        return mapping.get(self.status, '正常')

    def __str__(self):
        return f'{self.name} ({self.code})'


class ConsumableBatch(models.Model):
    """耗材批次"""

    STATUS_CHOICES = [
        ('in_stock', '在库'),
        ('low_stock', '库存不足'),
        ('expired', '已过期'),
        ('depleted', '已用完'),
    ]

    consumable = models.ForeignKey(Consumable, on_delete=models.CASCADE,
                                   related_name='batches', verbose_name='耗材')
    batch_number = models.CharField('批号', max_length=100, unique=True, db_index=True)
    production_date = models.DateField('生产日期', null=True, blank=True)
    expiry_date = models.DateField('有效期至', null=True, blank=True)

    inbound_date = models.DateField('入库日期')
    inbound_quantity = models.IntegerField('入库数量')
    inbound_price = models.DecimalField('入库单价', max_digits=12, decimal_places=2,
                                         null=True, blank=True)

    remaining_quantity = models.IntegerField('剩余数量')
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='in_stock')
    storage_location_text = models.CharField('存储位置', max_length=200, blank=True, default='')
    remarks = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_consumable_batch'
        verbose_name = '耗材批次'
        ordering = ['expiry_date']
        indexes = [
            models.Index(fields=['batch_number']),
            models.Index(fields=['consumable', 'status']),
            models.Index(fields=['expiry_date']),
        ]

    def __str__(self):
        return f'{self.consumable.name} - {self.batch_number}'


class ConsumableTransactionType(models.TextChoices):
    INBOUND = 'inbound', '入库'
    ISSUE = 'issue', '领用'
    RETURN = 'return', '退库'
    ADJUST = 'adjust', '调整'
    SCRAP = 'scrap', '报废'


class ConsumableTransaction(models.Model):
    """耗材出入库流水"""

    class Meta:
        db_table = 't_consumable_transaction'
        verbose_name = '耗材流水'
        ordering = ['-create_time']

    consumable = models.ForeignKey(Consumable, on_delete=models.CASCADE,
                                   related_name='transactions', verbose_name='耗材')
    batch = models.ForeignKey(ConsumableBatch, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='transactions',
                              verbose_name='批次')
    transaction_type = models.CharField('操作类型', max_length=20,
                                        choices=ConsumableTransactionType.choices)
    quantity = models.IntegerField('数量', default=0)
    operator_name = models.CharField('操作人', max_length=100, blank=True, default='')
    operator_id = models.IntegerField('操作人ID', null=True, blank=True)
    purpose = models.CharField('用途', max_length=200, blank=True, default='')
    project_code = models.CharField('项目编号', max_length=100, blank=True, default='')
    work_order_id = models.IntegerField('关联工单ID', null=True, blank=True)
    unit_cost = models.DecimalField('单位成本', max_digits=10, decimal_places=2,
                                    null=True, blank=True)
    total_cost = models.DecimalField('总成本', max_digits=12, decimal_places=2,
                                     null=True, blank=True)
    remarks = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.unit_cost and self.quantity:
            self.total_cost = self.unit_cost * self.quantity
        super().save(*args, **kwargs)


class ConsumableAlert(models.Model):
    """耗材预警"""

    ALERT_TYPE_CHOICES = [
        ('low_stock', '库存不足'),
        ('expiring_soon', '即将过期'),
        ('expired', '已过期'),
        ('out_of_stock', '缺货'),
    ]

    STATUS_CHOICES = [
        ('pending', '待处理'),
        ('acknowledged', '已确认'),
        ('resolved', '已解决'),
        ('ignored', '已忽略'),
    ]

    SEVERITY_CHOICES = [
        ('low', '低'),
        ('medium', '中'),
        ('high', '高'),
        ('critical', '紧急'),
    ]

    consumable = models.ForeignKey(Consumable, on_delete=models.CASCADE,
                                   related_name='alerts', verbose_name='耗材')
    batch = models.ForeignKey(ConsumableBatch, on_delete=models.CASCADE,
                              null=True, blank=True, related_name='alerts', verbose_name='批次')

    alert_type = models.CharField('预警类型', max_length=20, choices=ALERT_TYPE_CHOICES)
    alert_message = models.TextField('预警消息')
    severity = models.CharField('严重程度', max_length=20, choices=SEVERITY_CHOICES,
                                default='medium')

    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    acknowledged_by_id = models.IntegerField('确认人ID', null=True, blank=True)
    acknowledged_by_name = models.CharField('确认人', max_length=100, blank=True, default='')
    acknowledged_at = models.DateTimeField('确认时间', null=True, blank=True)
    resolution_note = models.TextField('处理说明', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_consumable_alert'
        verbose_name = '耗材预警'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['consumable', 'status']),
            models.Index(fields=['alert_type']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f'{self.get_alert_type_display()} - {self.consumable.name}'


class StorageLocation(models.Model):
    """库位定义（支持层级结构）"""

    class Meta:
        db_table = 't_storage_location'
        verbose_name = '库位'
        ordering = ['path', 'zone', 'shelf', 'position']

    ZONE_CHOICES = [
        ('cold', '冷藏区 (2-8°C)'),
        ('cool', '阴凉区 (≤20°C)'),
        ('room', '常温区 (10-30°C)'),
    ]

    TEMPERATURE_ZONE_CHOICES = [
        ('room_temp', '室温 (15-25°C)'),
        ('cool', '冷藏 (2-8°C)'),
        ('frozen_20', '冷冻 (-20°C)'),
        ('frozen_80', '深冷 (-80°C)'),
        ('liquid_nitrogen', '液氮 (-196°C)'),
    ]

    STATUS_CHOICES = [
        ('active', '使用中'),
        ('maintenance', '维护中'),
        ('full', '已满'),
        ('inactive', '停用'),
    ]

    zone = models.CharField('温区', max_length=20, choices=ZONE_CHOICES, blank=True, default='')
    shelf = models.CharField('货架', max_length=20, blank=True, default='')
    position = models.CharField('位置', max_length=20, blank=True, default='')
    temperature = models.DecimalField('当前温度', max_digits=5, decimal_places=1,
                                      null=True, blank=True)
    humidity = models.DecimalField('当前湿度', max_digits=5, decimal_places=1,
                                   null=True, blank=True)

    location_code = models.CharField('位置编码', max_length=50, unique=True, db_index=True,
                                      blank=True, default='')
    name = models.CharField('位置名称', max_length=100, blank=True, default='')
    description = models.TextField('描述', blank=True, default='')

    parent = models.ForeignKey('self', on_delete=models.CASCADE,
                               null=True, blank=True, related_name='children',
                               verbose_name='上级位置')
    level = models.IntegerField('层级', default=1)
    path = models.CharField('路径', max_length=500, blank=True, default='')

    temperature_zone = models.CharField('温度区域', max_length=20,
                                        choices=TEMPERATURE_ZONE_CHOICES, blank=True, default='')
    temperature_min = models.DecimalField('最低温度', max_digits=5, decimal_places=1,
                                          null=True, blank=True)
    temperature_max = models.DecimalField('最高温度', max_digits=5, decimal_places=1,
                                          null=True, blank=True)

    capacity = models.IntegerField('容量', default=0)
    current_count = models.IntegerField('当前存放数', default=0)

    location_status = models.CharField('库位状态', max_length=20, choices=STATUS_CHOICES,
                                        default='active')

    has_temperature_monitor = models.BooleanField('有温度监控', default=False)
    monitor_device_id = models.CharField('监控设备ID', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        if self.location_code and self.name:
            return f'{self.location_code} - {self.name}'
        if self.zone:
            return f'{self.get_zone_display()} {self.shelf}-{self.position}'
        return f'Location-{self.id}'


class InventoryCheckStatus(models.TextChoices):
    IN_PROGRESS = 'in_progress', '盘点中'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'


class InventoryCheck(models.Model):
    """盘点记录"""

    class Meta:
        db_table = 't_inventory_check'
        verbose_name = '盘点记录'
        ordering = ['-check_date']

    check_date = models.DateField('盘点日期')
    status = models.CharField('状态', max_length=20,
                              choices=InventoryCheckStatus.choices,
                              default=InventoryCheckStatus.IN_PROGRESS)
    checker_name = models.CharField('盘点人', max_length=100, blank=True, default='')
    checker_id = models.IntegerField('盘点人ID', null=True, blank=True)
    total_items = models.IntegerField('总物料数', default=0)
    matched_items = models.IntegerField('一致项数', default=0)
    discrepancy_items = models.IntegerField('差异项数', default=0)
    discrepancy_details = models.JSONField('差异详情', default=list, blank=True)
    remarks = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'盘点 {self.check_date} ({self.get_status_display()})'


class ExpiryAlertStatus(models.TextChoices):
    WARNING = 'warning', '预警'
    LOCKED = 'locked', '已锁定'
    HANDLED = 'handled', '已处置'


class ExpiryAlert(models.Model):
    """效期预警"""

    class Meta:
        db_table = 't_expiry_alert'
        verbose_name = '效期预警'
        ordering = ['expiry_date']

    material_name = models.CharField('物料名称', max_length=200)
    material_code = models.CharField('物料编码', max_length=100)
    batch_number = models.CharField('批号', max_length=100, blank=True, default='')
    material_type = models.CharField('物料类型', max_length=20, blank=True, default='')
    expiry_date = models.DateField('到期日')
    location = models.CharField('存储位置', max_length=200, blank=True, default='')
    status = models.CharField('状态', max_length=20,
                              choices=ExpiryAlertStatus.choices,
                              default=ExpiryAlertStatus.WARNING)
    handle_action = models.CharField('处置动作', max_length=50, blank=True, default='')
    handle_remarks = models.TextField('处置备注', blank=True, default='')
    handled_at = models.DateTimeField('处置时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    @property
    def days_remaining(self):
        from datetime import date
        return (self.expiry_date - date.today()).days

    @property
    def alert_level(self):
        days = self.days_remaining
        if days <= 7:
            return 'red'
        elif days <= 30:
            return 'orange'
        elif days <= 90:
            return 'yellow'
        return 'none'

    def __str__(self):
        return f'{self.material_name} 到期: {self.expiry_date}'
