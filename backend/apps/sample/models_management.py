"""
样品管理扩展模型

从 cn_kis_test 迁入并适配，覆盖：
- 样品接收验收 (SampleReceipt)
- 样品存储记录 (SampleStorage)
- 样品分发管理 (SampleDistribution)
- 样品检测记录 (SampleTest)
- 样品回收管理 (SampleReturn)
- 样品销毁管理 (SampleDestruction)
- 库存盘点增强 (InventoryCount)
- 样品效期预警 (SampleExpiryAlert)
- 温度监控日志 (TemperatureLog)
"""
from django.db import models

from .models import Product, SampleInstance
from .models_material import StorageLocation


class SampleReceipt(models.Model):
    """样品接收记录"""

    STATUS_CHOICES = [
        ('pending', '待验收'),
        ('inspecting', '验收中'),
        ('accepted', '已接收'),
        ('rejected', '已拒收'),
        ('partial', '部分接收'),
    ]

    receipt_no = models.CharField('接收单号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    supplier = models.CharField('供应商', max_length=200, blank=True, default='')
    shipment_no = models.CharField('发货单号', max_length=100, blank=True, default='')
    courier = models.CharField('物流公司', max_length=100, blank=True, default='')
    tracking_no = models.CharField('物流单号', max_length=100, blank=True, default='')

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='receipts', verbose_name='产品')
    expected_quantity = models.IntegerField('预期数量')
    received_quantity = models.IntegerField('实收数量', default=0)
    accepted_quantity = models.IntegerField('合格数量', default=0)
    rejected_quantity = models.IntegerField('不合格数量', default=0)

    batch_no = models.CharField('批号', max_length=100, blank=True, default='')
    manufacture_date = models.DateField('生产日期', null=True, blank=True)
    expiry_date = models.DateField('有效期至', null=True, blank=True)

    received_at = models.DateTimeField('接收时间', null=True, blank=True)
    received_by_id = models.IntegerField('接收人ID', null=True, blank=True)
    received_by_name = models.CharField('接收人', max_length=100, blank=True, default='')

    inspected_at = models.DateTimeField('验收时间', null=True, blank=True)
    inspected_by_id = models.IntegerField('验收人ID', null=True, blank=True)
    inspected_by_name = models.CharField('验收人', max_length=100, blank=True, default='')

    packaging_ok = models.BooleanField('包装完好', null=True, blank=True)
    label_ok = models.BooleanField('标签正确', null=True, blank=True)
    quantity_ok = models.BooleanField('数量正确', null=True, blank=True)
    document_ok = models.BooleanField('文件齐全', null=True, blank=True)
    temperature_ok = models.BooleanField('温度符合', null=True, blank=True)
    appearance_ok = models.BooleanField('外观正常', null=True, blank=True)

    arrival_temperature = models.DecimalField('到货温度', max_digits=5, decimal_places=1,
                                              null=True, blank=True)

    inspection_notes = models.TextField('验收备注', blank=True, default='')
    rejection_reason = models.TextField('拒收原因', blank=True, default='')

    storage_location = models.ForeignKey(StorageLocation, on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='receipts',
                                         verbose_name='入库位置')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_sample_receipt'
        verbose_name = '样品接收'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['product', 'status']),
            models.Index(fields=['received_at']),
        ]

    def __str__(self):
        return f'{self.receipt_no} - {self.product.name}'


class SampleStorage(models.Model):
    """样品存储记录"""

    STATUS_CHOICES = [
        ('stored', '存储中'),
        ('retrieved', '已取出'),
        ('transferred', '已转移'),
        ('expired', '已过期'),
        ('destroyed', '已销毁'),
    ]

    sample = models.ForeignKey(SampleInstance, on_delete=models.CASCADE,
                               related_name='storage_records', verbose_name='样品')
    location = models.ForeignKey(StorageLocation, on_delete=models.SET_NULL,
                                 null=True, related_name='stored_samples', verbose_name='存储位置')
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='stored')

    stored_at = models.DateTimeField('入库时间')
    stored_by_id = models.IntegerField('入库人ID', null=True, blank=True)
    stored_by_name = models.CharField('入库人', max_length=100, blank=True, default='')

    retrieved_at = models.DateTimeField('取出时间', null=True, blank=True)
    retrieved_by_id = models.IntegerField('取出人ID', null=True, blank=True)
    retrieved_by_name = models.CharField('取出人', max_length=100, blank=True, default='')
    retrieve_reason = models.CharField('取出原因', max_length=100, blank=True, default='')

    storage_temperature = models.CharField('存储温度', max_length=20, blank=True, default='')
    special_conditions = models.TextField('特殊条件', blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_sample_storage'
        verbose_name = '样品存储记录'
        ordering = ['-stored_at']
        indexes = [
            models.Index(fields=['sample', 'status']),
            models.Index(fields=['location', 'status']),
        ]

    def __str__(self):
        return f'{self.sample.unique_code} @ {self.location}'


class SampleDistribution(models.Model):
    """样品分发记录"""

    STATUS_CHOICES = [
        ('planned', '计划中'),
        ('approved', '已批准'),
        ('distributed', '已分发'),
        ('confirmed', '已确认'),
        ('cancelled', '已取消'),
    ]

    DISTRIBUTION_TYPE_CHOICES = [
        ('subject', '受试者分发'),
        ('center', '中心分发'),
        ('lab', '实验室分发'),
        ('other', '其他'),
    ]

    distribution_no = models.CharField('分发单号', max_length=50, unique=True, db_index=True)
    distribution_type = models.CharField('分发类型', max_length=20,
                                         choices=DISTRIBUTION_TYPE_CHOICES)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='planned')

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='distributions', verbose_name='产品')
    quantity = models.IntegerField('分发数量')

    recipient_type = models.CharField('接收方类型', max_length=50, blank=True, default='')
    recipient_id = models.IntegerField('接收方ID', null=True, blank=True)
    recipient_name = models.CharField('接收方名称', max_length=200, blank=True, default='')

    is_randomized = models.BooleanField('随机分配', default=False)
    randomization_code = models.CharField('随机号', max_length=50, blank=True, default='')
    kit_number = models.CharField('Kit号', max_length=50, blank=True, default='')

    planned_date = models.DateField('计划分发日期', null=True, blank=True)
    planned_by_id = models.IntegerField('计划人ID', null=True, blank=True)
    planned_by_name = models.CharField('计划人', max_length=100, blank=True, default='')

    approved_at = models.DateTimeField('批准时间', null=True, blank=True)
    approved_by_id = models.IntegerField('批准人ID', null=True, blank=True)
    approved_by_name = models.CharField('批准人', max_length=100, blank=True, default='')

    distributed_at = models.DateTimeField('分发时间', null=True, blank=True)
    distributed_by_id = models.IntegerField('分发人ID', null=True, blank=True)
    distributed_by_name = models.CharField('分发人', max_length=100, blank=True, default='')

    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)
    confirmed_by_id = models.IntegerField('确认人ID', null=True, blank=True)
    confirmed_by_name = models.CharField('确认人', max_length=100, blank=True, default='')

    sample_codes = models.JSONField('样品编码列表', default=list, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_sample_distribution'
        verbose_name = '样品分发'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['product', 'status']),
            models.Index(fields=['distribution_type', 'status']),
            models.Index(fields=['distributed_at']),
        ]

    def __str__(self):
        return f'{self.distribution_no} - {self.product.name}'


class SampleTest(models.Model):
    """样品检测记录"""

    STATUS_CHOICES = [
        ('pending', '待检测'),
        ('in_progress', '检测中'),
        ('completed', '已完成'),
        ('failed', '检测失败'),
        ('cancelled', '已取消'),
    ]

    RESULT_CHOICES = [
        ('pass', '合格'),
        ('fail', '不合格'),
        ('retest', '需复检'),
        ('pending', '待定'),
    ]

    test_no = models.CharField('检测单号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    sample = models.ForeignKey(SampleInstance, on_delete=models.CASCADE,
                               related_name='tests', verbose_name='样品')

    test_type = models.CharField('检测类型', max_length=100)
    test_items = models.JSONField('检测项目', default=list, blank=True)
    test_method = models.CharField('检测方法', max_length=200, blank=True, default='')
    test_standard = models.CharField('检测标准', max_length=200, blank=True, default='')

    planned_date = models.DateField('计划检测日期', null=True, blank=True)

    started_at = models.DateTimeField('开始时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    tested_by_id = models.IntegerField('检测人ID', null=True, blank=True)
    tested_by_name = models.CharField('检测人', max_length=100, blank=True, default='')

    equipment_used = models.CharField('使用设备', max_length=200, blank=True, default='')
    equipment_calibration_status = models.CharField('设备校准状态', max_length=50,
                                                     blank=True, default='')

    result_status = models.CharField('结果状态', max_length=20, choices=RESULT_CHOICES,
                                     blank=True, default='')
    result_data = models.JSONField('结果数据', default=dict, blank=True)
    result_summary = models.TextField('结果摘要', blank=True, default='')

    deviation_found = models.BooleanField('发现偏差', default=False)
    deviation_description = models.TextField('偏差描述', blank=True, default='')

    reviewed_at = models.DateTimeField('审核时间', null=True, blank=True)
    reviewed_by_id = models.IntegerField('审核人ID', null=True, blank=True)
    reviewed_by_name = models.CharField('审核人', max_length=100, blank=True, default='')
    review_notes = models.TextField('审核备注', blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_sample_test'
        verbose_name = '样品检测'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['sample', 'status']),
            models.Index(fields=['test_type', 'status']),
            models.Index(fields=['result_status']),
        ]

    def __str__(self):
        return f'{self.test_no} - {self.sample.unique_code}'


class SampleReturn(models.Model):
    """样品回收记录"""

    STATUS_CHOICES = [
        ('pending', '待回收'),
        ('returned', '已回收'),
        ('inspected', '已检验'),
        ('processed', '已处理'),
        ('cancelled', '已取消'),
    ]

    RETURN_REASON_CHOICES = [
        ('completion', '研究完成'),
        ('expiry', '过期'),
        ('quality_issue', '质量问题'),
        ('subject_withdrawal', '受试者退出'),
        ('protocol_amendment', '方案变更'),
        ('other', '其他'),
    ]

    return_no = models.CharField('回收单号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    sample = models.ForeignKey(SampleInstance, on_delete=models.CASCADE,
                               related_name='returns', verbose_name='样品')

    return_reason = models.CharField('回收原因', max_length=30, choices=RETURN_REASON_CHOICES)
    return_reason_detail = models.TextField('详细原因', blank=True, default='')

    return_from_type = models.CharField('来源类型', max_length=50, blank=True, default='')
    return_from_id = models.IntegerField('来源ID', null=True, blank=True)
    return_from_name = models.CharField('来源名称', max_length=200, blank=True, default='')

    returned_at = models.DateTimeField('回收时间', null=True, blank=True)
    returned_by_id = models.IntegerField('回收人ID', null=True, blank=True)
    returned_by_name = models.CharField('回收人', max_length=100, blank=True, default='')

    condition_on_return = models.CharField('回收时状态', max_length=100, blank=True, default='')
    remaining_quantity = models.CharField('剩余量', max_length=50, blank=True, default='')
    inspected_at = models.DateTimeField('检验时间', null=True, blank=True)
    inspected_by_id = models.IntegerField('检验人ID', null=True, blank=True)
    inspected_by_name = models.CharField('检验人', max_length=100, blank=True, default='')
    inspection_notes = models.TextField('检验备注', blank=True, default='')

    disposal_method = models.CharField('处理方式', max_length=50, blank=True, default='')
    processed_at = models.DateTimeField('处理时间', null=True, blank=True)
    processed_by_id = models.IntegerField('处理人ID', null=True, blank=True)
    processed_by_name = models.CharField('处理人', max_length=100, blank=True, default='')

    storage_location = models.ForeignKey(StorageLocation, on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='returned_samples',
                                         verbose_name='入库位置')

    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_sample_return'
        verbose_name = '样品回收'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['sample', 'status']),
            models.Index(fields=['return_reason', 'status']),
        ]

    def __str__(self):
        return f'{self.return_no} - {self.sample.unique_code}'


class SampleDestruction(models.Model):
    """样品销毁记录"""

    STATUS_CHOICES = [
        ('pending', '待销毁'),
        ('approved', '已批准'),
        ('destroyed', '已销毁'),
        ('cancelled', '已取消'),
    ]

    DESTRUCTION_METHOD_CHOICES = [
        ('incineration', '焚烧'),
        ('chemical', '化学处理'),
        ('autoclave', '高压灭菌'),
        ('shredding', '粉碎'),
        ('other', '其他'),
    ]

    destruction_no = models.CharField('销毁单号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    destruction_reason = models.CharField('销毁原因', max_length=200)

    samples = models.ManyToManyField(SampleInstance, related_name='destructions',
                                     verbose_name='销毁样品', blank=True)
    sample_count = models.IntegerField('样品数量', default=0)

    destruction_method = models.CharField('销毁方式', max_length=30,
                                          choices=DESTRUCTION_METHOD_CHOICES)
    destruction_location = models.CharField('销毁地点', max_length=200, blank=True, default='')

    requested_at = models.DateTimeField('申请时间', auto_now_add=True)
    requested_by_id = models.IntegerField('申请人ID', null=True, blank=True)
    requested_by_name = models.CharField('申请人', max_length=100, blank=True, default='')

    approved_at = models.DateTimeField('批准时间', null=True, blank=True)
    approved_by_id = models.IntegerField('批准人ID', null=True, blank=True)
    approved_by_name = models.CharField('批准人', max_length=100, blank=True, default='')
    approval_notes = models.TextField('批准备注', blank=True, default='')

    destroyed_at = models.DateTimeField('销毁时间', null=True, blank=True)
    destroyed_by_id = models.IntegerField('执行人ID', null=True, blank=True)
    destroyed_by_name = models.CharField('执行人', max_length=100, blank=True, default='')
    witness = models.CharField('见证人', max_length=100, blank=True, default='')

    destruction_certificate = models.CharField('销毁证明', max_length=500, blank=True, default='')
    destruction_photos = models.JSONField('销毁照片', default=list, blank=True)

    feishu_approval_id = models.CharField('飞书审批实例ID', max_length=100, blank=True, default='')
    feishu_approval_status = models.CharField('飞书审批状态', max_length=20, blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_sample_destruction'
        verbose_name = '样品销毁'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['destroyed_at']),
        ]

    def __str__(self):
        return self.destruction_no


class InventoryCount(models.Model):
    """库存盘点记录（增强版）"""

    STATUS_CHOICES = [
        ('planned', '计划中'),
        ('in_progress', '盘点中'),
        ('completed', '已完成'),
        ('reviewed', '已审核'),
        ('cancelled', '已取消'),
    ]

    COUNT_TYPE_CHOICES = [
        ('full', '全面盘点'),
        ('partial', '部分盘点'),
        ('spot', '抽盘'),
        ('cycle', '循环盘点'),
    ]

    count_no = models.CharField('盘点单号', max_length=50, unique=True, db_index=True)
    count_type = models.CharField('盘点类型', max_length=20, choices=COUNT_TYPE_CHOICES)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='planned')

    location = models.ForeignKey(StorageLocation, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='inventory_counts',
                                 verbose_name='盘点位置')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL,
                                null=True, blank=True, related_name='inventory_counts',
                                verbose_name='盘点产品')

    planned_date = models.DateField('计划盘点日期')
    planned_by_id = models.IntegerField('计划人ID', null=True, blank=True)
    planned_by_name = models.CharField('计划人', max_length=100, blank=True, default='')

    started_at = models.DateTimeField('开始时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    counted_by_id = models.IntegerField('盘点人ID', null=True, blank=True)
    counted_by_name = models.CharField('盘点人', max_length=100, blank=True, default='')

    system_quantity = models.IntegerField('系统数量', default=0)
    actual_quantity = models.IntegerField('实际数量', default=0)
    variance = models.IntegerField('差异数量', default=0)
    variance_rate = models.DecimalField('差异率(%)', max_digits=5, decimal_places=2,
                                        null=True, blank=True)

    variance_details = models.JSONField('差异明细', default=list, blank=True)

    reviewed_at = models.DateTimeField('审核时间', null=True, blank=True)
    reviewed_by_id = models.IntegerField('审核人ID', null=True, blank=True)
    reviewed_by_name = models.CharField('审核人', max_length=100, blank=True, default='')
    review_notes = models.TextField('审核备注', blank=True, default='')

    adjustment_made = models.BooleanField('已调整', default=False)
    adjustment_reason = models.TextField('调整原因', blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_inventory_count'
        verbose_name = '库存盘点'
        ordering = ['-planned_date']
        indexes = [
            models.Index(fields=['status', 'planned_date']),
            models.Index(fields=['location', 'status']),
        ]

    def __str__(self):
        return self.count_no


class SampleExpiryAlert(models.Model):
    """样品关联效期预警"""

    ALERT_LEVEL_CHOICES = [
        ('warning', '预警'),
        ('critical', '紧急'),
        ('expired', '已过期'),
    ]

    STATUS_CHOICES = [
        ('active', '有效'),
        ('acknowledged', '已确认'),
        ('resolved', '已处理'),
        ('ignored', '已忽略'),
    ]

    sample = models.ForeignKey(SampleInstance, on_delete=models.CASCADE,
                               related_name='expiry_alerts', verbose_name='样品')
    alert_level = models.CharField('预警级别', max_length=20, choices=ALERT_LEVEL_CHOICES)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='active')

    expiry_date = models.DateField('有效期')
    days_to_expiry = models.IntegerField('剩余天数')

    acknowledged_at = models.DateTimeField('确认时间', null=True, blank=True)
    acknowledged_by_id = models.IntegerField('确认人ID', null=True, blank=True)
    acknowledged_by_name = models.CharField('确认人', max_length=100, blank=True, default='')

    resolved_at = models.DateTimeField('处理时间', null=True, blank=True)
    resolved_by_id = models.IntegerField('处理人ID', null=True, blank=True)
    resolved_by_name = models.CharField('处理人', max_length=100, blank=True, default='')
    resolution = models.TextField('处理措施', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        db_table = 't_sample_expiry_alert'
        verbose_name = '样品效期预警'
        ordering = ['expiry_date']
        indexes = [
            models.Index(fields=['alert_level', 'status']),
            models.Index(fields=['expiry_date']),
        ]

    def __str__(self):
        return f'{self.sample.unique_code} - {self.get_alert_level_display()}'


class TemperatureLog(models.Model):
    """温度监控日志"""

    STATUS_CHOICES = [
        ('normal', '正常'),
        ('warning', '预警'),
        ('alarm', '报警'),
    ]

    location = models.ForeignKey(StorageLocation, on_delete=models.CASCADE,
                                 related_name='temperature_logs', verbose_name='存储位置')

    temperature = models.DecimalField('温度', max_digits=5, decimal_places=1)
    humidity = models.DecimalField('湿度(%)', max_digits=5, decimal_places=1,
                                   null=True, blank=True)

    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='normal')

    recorded_at = models.DateTimeField('记录时间')
    source = models.CharField('数据来源', max_length=50, blank=True, default='')
    device_id = models.CharField('设备ID', max_length=100, blank=True, default='')

    alarm_triggered = models.BooleanField('触发报警', default=False)
    alarm_handled = models.BooleanField('已处理', default=False)
    handled_by_id = models.IntegerField('处理人ID', null=True, blank=True)
    handled_by_name = models.CharField('处理人', max_length=100, blank=True, default='')
    handled_at = models.DateTimeField('处理时间', null=True, blank=True)
    handling_notes = models.TextField('处理备注', blank=True, default='')

    class Meta:
        db_table = 't_temperature_log'
        verbose_name = '温度监控日志'
        ordering = ['-recorded_at']
        indexes = [
            models.Index(fields=['location', 'recorded_at']),
            models.Index(fields=['status', 'alarm_triggered']),
        ]

    def __str__(self):
        return f'{self.location} - {self.temperature}°C @ {self.recorded_at}'
