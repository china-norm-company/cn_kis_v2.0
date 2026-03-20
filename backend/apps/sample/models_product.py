"""
产品管理扩展模型

从 cn_kis_test 迁入并适配，覆盖：
- 产品批次 (ProductBatch)
- 产品入库 (ProductReceipt)
- 产品库存 (ProductInventory)
- 产品套件/随机化 (ProductKit)
- 产品分发 (ProductDispensing)
- 产品使用/依从性 (ProductUsage)
- 产品回收 (ProductReturn)
- 产品销毁 (ProductDestruction / ProductDestructionItem)
- 产品召回 (ProductRecall / RecallAction)
"""
from django.db import models

from .models import Product
from .models_material import StorageLocation


class ProductBatch(models.Model):
    """产品批次"""

    STATUS_CHOICES = [
        ('pending', '待入库'),
        ('received', '已入库'),
        ('quarantine', '待检'),
        ('released', '已放行'),
        ('rejected', '已拒收'),
        ('expired', '已过期'),
        ('recalled', '已召回'),
    ]

    batch_no = models.CharField('批号', max_length=100, unique=True, db_index=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='batches', verbose_name='产品')
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    manufacture_date = models.DateField('生产日期', null=True, blank=True)
    expiry_date = models.DateField('有效期至', null=True, blank=True)
    quantity = models.IntegerField('数量')
    unit = models.CharField('单位', max_length=20, default='个')

    received_at = models.DateTimeField('入库时间', null=True, blank=True)
    received_by_id = models.IntegerField('入库人ID', null=True, blank=True)
    received_by_name = models.CharField('入库人', max_length=100, blank=True, default='')

    supplier = models.CharField('供应商', max_length=200, blank=True, default='')
    supplier_batch = models.CharField('供应商批号', max_length=100, blank=True, default='')

    coa_number = models.CharField('COA编号', max_length=100, blank=True, default='')
    coa_file = models.CharField('COA文件', max_length=500, blank=True, default='')
    quality_status = models.CharField('质量状态', max_length=20, blank=True, default='')

    released_at = models.DateTimeField('放行时间', null=True, blank=True)
    released_by_id = models.IntegerField('放行人ID', null=True, blank=True)
    released_by_name = models.CharField('放行人', max_length=100, blank=True, default='')
    release_notes = models.TextField('放行备注', blank=True, default='')

    storage_location = models.ForeignKey(StorageLocation, on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='product_batches',
                                         verbose_name='存储位置')
    storage_conditions = models.TextField('存储条件', blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_product_batch'
        verbose_name = '产品批次'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['product', 'status']),
            models.Index(fields=['expiry_date']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f'{self.product.name} - {self.batch_no}'


class ProductReceipt(models.Model):
    """产品入库记录"""

    STATUS_CHOICES = [
        ('pending', '待验收'),
        ('inspecting', '验收中'),
        ('accepted', '已接收'),
        ('rejected', '已拒收'),
        ('partial', '部分接收'),
    ]

    receipt_no = models.CharField('入库单号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='product_receipts', verbose_name='产品')
    batch = models.ForeignKey(ProductBatch, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='receipts', verbose_name='批次')

    expected_quantity = models.IntegerField('预期数量')
    received_quantity = models.IntegerField('实收数量', default=0)
    accepted_quantity = models.IntegerField('合格数量', default=0)
    rejected_quantity = models.IntegerField('不合格数量', default=0)

    source_type = models.CharField('来源类型', max_length=50, blank=True, default='')
    supplier = models.CharField('供应商', max_length=200, blank=True, default='')
    po_number = models.CharField('采购订单号', max_length=100, blank=True, default='')
    delivery_note = models.CharField('送货单号', max_length=100, blank=True, default='')

    received_at = models.DateTimeField('接收时间', null=True, blank=True)
    received_by_id = models.IntegerField('接收人ID', null=True, blank=True)
    received_by_name = models.CharField('接收人', max_length=100, blank=True, default='')

    packaging_intact = models.BooleanField('包装完好', null=True, blank=True)
    label_correct = models.BooleanField('标签正确', null=True, blank=True)
    quantity_match = models.BooleanField('数量一致', null=True, blank=True)
    documents_complete = models.BooleanField('文件齐全', null=True, blank=True)
    temperature_compliant = models.BooleanField('温度合规', null=True, blank=True)
    appearance_normal = models.BooleanField('外观正常', null=True, blank=True)

    arrival_temperature = models.DecimalField('到货温度', max_digits=5, decimal_places=1,
                                              null=True, blank=True)

    inspected_at = models.DateTimeField('验收时间', null=True, blank=True)
    inspected_by_id = models.IntegerField('验收人ID', null=True, blank=True)
    inspected_by_name = models.CharField('验收人', max_length=100, blank=True, default='')
    inspection_notes = models.TextField('验收备注', blank=True, default='')
    rejection_reason = models.TextField('拒收原因', blank=True, default='')

    storage_location = models.ForeignKey(StorageLocation, on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='product_receipts',
                                         verbose_name='存储位置')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_product_receipt'
        verbose_name = '产品入库'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['product', 'status']),
            models.Index(fields=['received_at']),
        ]

    def __str__(self):
        return f'{self.receipt_no} - {self.product.name}'


class ProductInventory(models.Model):
    """产品库存"""

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='inventories', verbose_name='产品')
    batch = models.ForeignKey(ProductBatch, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='inventories', verbose_name='批次')
    location = models.ForeignKey(StorageLocation, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='product_inventories',
                                 verbose_name='存储位置')

    quantity = models.IntegerField('库存数量', default=0)
    reserved_quantity = models.IntegerField('预留数量', default=0)
    available_quantity = models.IntegerField('可用数量', default=0)

    min_quantity = models.IntegerField('最低库存', default=0)
    reorder_point = models.IntegerField('补货点', default=0)

    last_updated = models.DateTimeField('最后更新', auto_now=True)
    last_count_date = models.DateField('最后盘点日期', null=True, blank=True)

    class Meta:
        db_table = 't_product_inventory'
        verbose_name = '产品库存'
        unique_together = [['product', 'batch', 'location']]
        indexes = [
            models.Index(fields=['product', 'location']),
            models.Index(fields=['quantity']),
        ]

    def __str__(self):
        return f'{self.product.name} - {self.quantity}'


class ProductKit(models.Model):
    """产品套件（用于随机化分配）"""

    STATUS_CHOICES = [
        ('available', '可用'),
        ('reserved', '已预留'),
        ('assigned', '已分配'),
        ('distributed', '已分发'),
        ('used', '已使用'),
        ('returned', '已回收'),
        ('cancelled', '已取消'),
    ]

    kit_number = models.CharField('套件号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='available')

    randomization_code = models.CharField('随机号', max_length=50, blank=True, default='',
                                          db_index=True)
    treatment_group = models.CharField('治疗组', max_length=50, blank=True, default='')
    blinding_code = models.CharField('盲态编码', max_length=50, blank=True, default='')

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='kits', verbose_name='产品')
    batch = models.ForeignKey(ProductBatch, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='kits', verbose_name='批次')
    quantity = models.IntegerField('数量', default=1)

    subject_id = models.IntegerField('受试者ID', null=True, blank=True)
    subject_code = models.CharField('受试者编号', max_length=50, blank=True, default='')
    assigned_at = models.DateTimeField('分配时间', null=True, blank=True)
    assigned_by_id = models.IntegerField('分配人ID', null=True, blank=True)
    assigned_by_name = models.CharField('分配人', max_length=100, blank=True, default='')

    distributed_at = models.DateTimeField('分发时间', null=True, blank=True)
    distributed_by_id = models.IntegerField('分发人ID', null=True, blank=True)
    distributed_by_name = models.CharField('分发人', max_length=100, blank=True, default='')
    distribution_visit = models.CharField('分发访视', max_length=50, blank=True, default='')

    storage_location = models.ForeignKey(StorageLocation, on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='product_kits',
                                         verbose_name='存储位置')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_product_kit'
        verbose_name = '产品套件'
        ordering = ['kit_number']
        indexes = [
            models.Index(fields=['product', 'status']),
            models.Index(fields=['randomization_code']),
            models.Index(fields=['subject_id']),
        ]

    def __str__(self):
        return f'Kit-{self.kit_number}'


class ProductDispensing(models.Model):
    """产品分发记录

    唯一约束：同一工单（project）+ 受试者（RD）+ 访视编号（visit_code）的活跃记录只能有一条。
    cancelled 状态不受唯一约束，通过服务层 check_existing_active_dispensing 实现。
    """

    STATUS_CHOICES = [
        ('planned', '计划中'),
        ('prepared', '已备货'),
        ('dispensed', '已分发'),
        ('confirmed', '已确认'),
        ('cancelled', '已取消'),
    ]

    dispensing_no = models.CharField('分发单号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='planned')

    subject_id = models.IntegerField('受试者ID')
    subject_code = models.CharField('受试者编号', max_length=50)
    visit_code = models.CharField('访视编号', max_length=50, blank=True, default='')
    visit_date = models.DateField('访视日期', null=True, blank=True)

    kit = models.ForeignKey(ProductKit, on_delete=models.SET_NULL,
                            null=True, blank=True, related_name='dispensings', verbose_name='套件')

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='dispensings', verbose_name='产品')
    batch = models.ForeignKey(ProductBatch, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='dispensings', verbose_name='批次')
    quantity_dispensed = models.IntegerField('分发数量')

    prepared_at = models.DateTimeField('备货时间', null=True, blank=True)
    prepared_by_id = models.IntegerField('备货人ID', null=True, blank=True)
    prepared_by_name = models.CharField('备货人', max_length=100, blank=True, default='')

    dispensed_at = models.DateTimeField('分发时间', null=True, blank=True)
    dispensed_by_id = models.IntegerField('分发人ID', null=True, blank=True)
    dispensed_by_name = models.CharField('分发人', max_length=100, blank=True, default='')

    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)
    subject_signature = models.BooleanField('受试者签名', default=False)

    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='product_dispensings',
        verbose_name='关联工单',
    )
    usage_instructions = models.TextField('使用说明', blank=True, default='')
    next_visit_date = models.DateField('下次访视日期', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_product_dispensing'
        verbose_name = '产品分发'
        ordering = ['-dispensed_at']
        indexes = [
            models.Index(fields=['subject_id', 'status']),
            models.Index(fields=['visit_code', 'status']),
            models.Index(fields=['dispensed_at']),
            # 联合查询：工单+受试者+访视点，用于唯一性检查
            models.Index(fields=['work_order', 'subject_id', 'visit_code']),
        ]

    def __str__(self):
        return f'{self.dispensing_no} - {self.subject_code}'


class ProductUsage(models.Model):
    """产品使用记录（含依从性）"""

    COMPLIANCE_CHOICES = [
        ('full', '完全依从'),
        ('partial', '部分依从'),
        ('non_compliant', '不依从'),
        ('not_assessed', '未评估'),
    ]

    dispensing = models.ForeignKey(ProductDispensing, on_delete=models.CASCADE,
                                   related_name='usages', verbose_name='分发记录')

    period_start = models.DateField('周期开始')
    period_end = models.DateField('周期结束')

    expected_usage = models.IntegerField('预期使用量')
    actual_usage = models.IntegerField('实际使用量', null=True, blank=True)
    remaining_quantity = models.IntegerField('剩余量', null=True, blank=True)

    compliance_status = models.CharField('依从性状态', max_length=20,
                                         choices=COMPLIANCE_CHOICES, default='not_assessed')
    compliance_rate = models.DecimalField('依从性(%)', max_digits=5, decimal_places=2,
                                          null=True, blank=True)

    usage_log = models.JSONField('使用日志', default=list, blank=True)

    deviation_reported = models.BooleanField('报告偏差', default=False)
    deviation_description = models.TextField('偏差描述', blank=True, default='')

    adverse_event_reported = models.BooleanField('报告不良反应', default=False)
    adverse_event_description = models.TextField('不良反应描述', blank=True, default='')

    recorded_at = models.DateTimeField('记录时间', null=True, blank=True)
    recorded_by_id = models.IntegerField('记录人ID', null=True, blank=True)
    recorded_by_name = models.CharField('记录人', max_length=100, blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_product_usage'
        verbose_name = '产品使用记录'
        ordering = ['-period_start']
        indexes = [
            models.Index(fields=['dispensing', 'period_start']),
            models.Index(fields=['compliance_status']),
        ]

    def __str__(self):
        return f'{self.dispensing.subject_code} - {self.period_start}'


class ProductReturn(models.Model):
    """产品回收记录"""

    STATUS_CHOICES = [
        ('pending', '待回收'),
        ('returned', '已回收'),
        ('inspected', '已检验'),
        ('processed', '已处理'),
        ('cancelled', '已取消'),
    ]

    RETURN_REASON_CHOICES = [
        ('completion', '研究完成'),
        ('discontinuation', '中止参与'),
        ('expiry', '产品过期'),
        ('adverse_event', '不良反应'),
        ('quality_issue', '质量问题'),
        ('protocol_change', '方案变更'),
        ('other', '其他'),
    ]

    DISPOSAL_METHOD_CHOICES = [
        ('restock', '重新入库'),
        ('quarantine', '隔离待检'),
        ('destroy', '销毁'),
        ('return_supplier', '退还供应商'),
    ]

    return_no = models.CharField('回收单号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    dispensing = models.ForeignKey(ProductDispensing, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='returns',
                                   verbose_name='分发记录')

    subject_id = models.IntegerField('受试者ID')
    subject_code = models.CharField('受试者编号', max_length=50)

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='product_returns', verbose_name='产品')
    kit = models.ForeignKey(ProductKit, on_delete=models.SET_NULL,
                            null=True, blank=True, related_name='returns', verbose_name='套件')

    return_reason = models.CharField('回收原因', max_length=30, choices=RETURN_REASON_CHOICES)
    return_reason_detail = models.TextField('详细原因', blank=True, default='')

    returned_quantity = models.IntegerField('回收数量')
    unused_quantity = models.IntegerField('未使用量', null=True, blank=True)
    used_quantity = models.IntegerField('已使用量', null=True, blank=True)

    returned_at = models.DateTimeField('回收时间', null=True, blank=True)
    returned_by_id = models.IntegerField('回收人ID', null=True, blank=True)
    returned_by_name = models.CharField('回收人', max_length=100, blank=True, default='')

    condition_on_return = models.CharField('回收时状态', max_length=100, blank=True, default='')
    inspected_at = models.DateTimeField('检验时间', null=True, blank=True)
    inspected_by_id = models.IntegerField('检验人ID', null=True, blank=True)
    inspected_by_name = models.CharField('检验人', max_length=100, blank=True, default='')
    inspection_notes = models.TextField('检验备注', blank=True, default='')

    disposal_method = models.CharField('处理方式', max_length=30,
                                        choices=DISPOSAL_METHOD_CHOICES, blank=True, default='')
    processed_at = models.DateTimeField('处理时间', null=True, blank=True)
    processed_by_id = models.IntegerField('处理人ID', null=True, blank=True)
    processed_by_name = models.CharField('处理人', max_length=100, blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_product_return'
        verbose_name = '产品回收'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['subject_id', 'status']),
            models.Index(fields=['product', 'status']),
            models.Index(fields=['return_reason']),
        ]

    def __str__(self):
        return f'{self.return_no} - {self.subject_code}'


class ProductDestruction(models.Model):
    """产品销毁记录"""

    STATUS_CHOICES = [
        ('pending', '待销毁'),
        ('approved', '已批准'),
        ('destroyed', '已销毁'),
        ('cancelled', '已取消'),
    ]

    DESTRUCTION_REASON_CHOICES = [
        ('expired', '已过期'),
        ('damaged', '损坏'),
        ('recalled', '召回'),
        ('quality_failure', '质量不合格'),
        ('returned_unused', '回收未使用'),
        ('other', '其他'),
    ]

    DESTRUCTION_METHOD_CHOICES = [
        ('incineration', '焚烧'),
        ('chemical', '化学处理'),
        ('return_supplier', '退还供应商'),
        ('other', '其他'),
    ]

    destruction_no = models.CharField('销毁单号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    destruction_reason = models.CharField('销毁原因', max_length=30,
                                          choices=DESTRUCTION_REASON_CHOICES)
    destruction_reason_detail = models.TextField('详细原因', blank=True, default='')

    destruction_method = models.CharField('销毁方式', max_length=30,
                                          choices=DESTRUCTION_METHOD_CHOICES)
    destruction_location = models.CharField('销毁地点', max_length=200, blank=True, default='')

    total_quantity = models.IntegerField('总数量', default=0)

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
        db_table = 't_product_destruction'
        verbose_name = '产品销毁'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['destroyed_at']),
        ]

    def __str__(self):
        return self.destruction_no


class ProductDestructionItem(models.Model):
    """产品销毁明细"""

    destruction = models.ForeignKey(ProductDestruction, on_delete=models.CASCADE,
                                    related_name='items', verbose_name='销毁单')
    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='destruction_items', verbose_name='产品')
    batch = models.ForeignKey(ProductBatch, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='destruction_items',
                              verbose_name='批次')
    kit = models.ForeignKey(ProductKit, on_delete=models.SET_NULL,
                            null=True, blank=True, related_name='destruction_items',
                            verbose_name='套件')
    quantity = models.IntegerField('数量')

    class Meta:
        db_table = 't_product_destruction_item'
        verbose_name = '产品销毁明细'


class ProductRecall(models.Model):
    """产品召回记录"""

    STATUS_CHOICES = [
        ('initiated', '已启动'),
        ('in_progress', '进行中'),
        ('completed', '已完成'),
        ('cancelled', '已取消'),
    ]

    RECALL_LEVEL_CHOICES = [
        ('level1', '一级-严重'),
        ('level2', '二级-中等'),
        ('level3', '三级-轻微'),
    ]

    RECALL_REASON_CHOICES = [
        ('quality_defect', '质量缺陷'),
        ('safety_concern', '安全顾虑'),
        ('labeling_error', '标签错误'),
        ('contamination', '污染'),
        ('regulatory', '监管要求'),
        ('voluntary', '自愿召回'),
        ('other', '其他'),
    ]

    recall_no = models.CharField('召回单号', max_length=50, unique=True, db_index=True)
    recall_title = models.CharField('召回标题', max_length=200)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='initiated')
    recall_level = models.CharField('召回级别', max_length=20, choices=RECALL_LEVEL_CHOICES)

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='recalls', verbose_name='产品')
    affected_batches = models.ManyToManyField(ProductBatch, related_name='recalls',
                                              verbose_name='受影响批次', blank=True)

    recall_reason = models.CharField('召回原因', max_length=30, choices=RECALL_REASON_CHOICES)
    recall_description = models.TextField('召回描述')
    health_hazard = models.TextField('健康风险评估', blank=True, default='')

    total_distributed = models.IntegerField('已分发总量', default=0)
    target_recall_quantity = models.IntegerField('目标召回量', default=0)
    actual_recalled_quantity = models.IntegerField('实际召回量', default=0)

    initiated_at = models.DateTimeField('启动时间', auto_now_add=True)
    initiated_by_id = models.IntegerField('启动人ID', null=True, blank=True)
    initiated_by_name = models.CharField('启动人', max_length=100, blank=True, default='')

    recall_strategy = models.TextField('召回策略', blank=True, default='')
    notification_method = models.TextField('通知方式', blank=True, default='')
    subjects_notified = models.IntegerField('已通知受试者数', default=0)

    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    completion_notes = models.TextField('完成备注', blank=True, default='')
    effectiveness_assessment = models.TextField('效果评估', blank=True, default='')

    regulatory_notified = models.BooleanField('已通知监管', default=False)
    regulatory_notification_date = models.DateField('监管通知日期', null=True, blank=True)
    regulatory_report_number = models.CharField('监管报告编号', max_length=100,
                                                 blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_product_recall'
        verbose_name = '产品召回'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['product', 'status']),
            models.Index(fields=['recall_level', 'status']),
        ]

    def __str__(self):
        return f'{self.recall_no} - {self.recall_title}'


class RecallAction(models.Model):
    """召回行动记录"""

    ACTION_TYPE_CHOICES = [
        ('notification', '通知'),
        ('collection', '收集'),
        ('investigation', '调查'),
        ('disposal', '处置'),
        ('report', '报告'),
        ('other', '其他'),
    ]

    STATUS_CHOICES = [
        ('pending', '待执行'),
        ('in_progress', '进行中'),
        ('completed', '已完成'),
        ('cancelled', '已取消'),
    ]

    recall = models.ForeignKey(ProductRecall, on_delete=models.CASCADE,
                               related_name='actions', verbose_name='召回')

    action_type = models.CharField('行动类型', max_length=20, choices=ACTION_TYPE_CHOICES)
    action_description = models.TextField('行动描述')
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')

    target_subject_id = models.IntegerField('目标受试者ID', null=True, blank=True)
    target_subject_code = models.CharField('目标受试者编号', max_length=50, blank=True, default='')
    target_kit = models.ForeignKey(ProductKit, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='recall_actions',
                                   verbose_name='目标套件')

    planned_date = models.DateField('计划日期', null=True, blank=True)
    assigned_to_id = models.IntegerField('负责人ID', null=True, blank=True)
    assigned_to_name = models.CharField('负责人', max_length=100, blank=True, default='')

    executed_at = models.DateTimeField('执行时间', null=True, blank=True)
    executed_by_id = models.IntegerField('执行人ID', null=True, blank=True)
    executed_by_name = models.CharField('执行人', max_length=100, blank=True, default='')
    result = models.TextField('执行结果', blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 't_recall_action'
        verbose_name = '召回行动'
        ordering = ['planned_date']
        indexes = [
            models.Index(fields=['recall', 'status']),
            models.Index(fields=['action_type', 'status']),
        ]

    def __str__(self):
        return f'{self.recall.recall_no} - {self.get_action_type_display()}'
