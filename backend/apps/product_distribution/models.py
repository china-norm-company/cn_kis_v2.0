"""
样品发放（产品发放）— 表在 cn_kis default 库中，结构与 KIS 样品发放一致。
表：product_distribution_work_order, product_distribution_execution,
    product_distribution_operation, product_sample_request
"""
from django.db import models


class ProductDistributionWorkOrder(models.Model):
    """产品发放工单表 - 对应 product_distribution_work_order"""
    id = models.BigAutoField(primary_key=True)
    work_order_no = models.CharField(max_length=100, unique=True)
    project_no = models.CharField(max_length=100)
    project_name = models.CharField(max_length=255)
    project_start_date = models.DateField()
    project_end_date = models.DateField()
    visit_count = models.IntegerField(default=0)
    researcher = models.CharField(max_length=100, null=True, blank=True)
    supervisor = models.CharField(max_length=100, null=True, blank=True)
    usage_method = models.TextField(null=True, blank=True)
    usage_frequency = models.CharField(max_length=255, null=True, blank=True)
    precautions = models.TextField(null=True, blank=True)
    project_requirements = models.TextField(null=True, blank=True)
    created_by = models.BigIntegerField(null=True, blank=True)
    updated_by = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    is_delete = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'product_distribution_work_order'


class ProductDistributionExecution(models.Model):
    """产品发放执行记录表 - 对应 product_distribution_execution"""
    id = models.BigAutoField(primary_key=True)
    work_order_id = models.BigIntegerField()
    related_project_no = models.CharField(max_length=100)
    subject_rd = models.CharField(max_length=100)
    subject_initials = models.CharField(max_length=50)
    screening_no = models.CharField(max_length=100, null=True, blank=True)
    execution_date = models.DateField(null=True, blank=True)
    operator_id = models.BigIntegerField(null=True, blank=True)
    operator_name = models.CharField(max_length=100, null=True, blank=True)
    exception_type = models.CharField(max_length=50, null=True, blank=True)
    exception_description = models.TextField(null=True, blank=True)
    remark = models.TextField(null=True, blank=True)
    created_by = models.BigIntegerField(null=True, blank=True)
    updated_by = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    is_delete = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'product_distribution_execution'


class ProductDistributionOperation(models.Model):
    """产品操作记录表 - 对应 product_distribution_operation"""
    id = models.BigAutoField(primary_key=True)
    execution_id = models.BigIntegerField()
    stage = models.CharField(max_length=50)
    execution_cycle = models.CharField(max_length=100, null=True, blank=True)
    product_code = models.CharField(max_length=100)
    product_name = models.CharField(max_length=255)
    bottle_sequence = models.CharField(max_length=50, null=True, blank=True)
    is_selected = models.IntegerField(default=1)
    product_distribution = models.IntegerField(default=0)
    product_inspection = models.IntegerField(default=0)
    product_recovery = models.IntegerField(default=0)
    product_site_use = models.IntegerField(default=0)
    distribution_weight = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    inspection_weight = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    recovery_weight = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    diary_distribution = models.IntegerField(default=0)
    diary_inspection = models.IntegerField(default=0)
    diary_recovery = models.IntegerField(default=0)
    usage_diagram_file_id = models.BigIntegerField(null=True, blank=True)
    created_by = models.BigIntegerField(null=True, blank=True)
    updated_by = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    is_delete = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'product_distribution_operation'


class ProductSampleRequest(models.Model):
    """产品领用退库记录表 - 对应 product_sample_request"""
    id = models.BigAutoField(primary_key=True)
    operation_type = models.CharField(max_length=50)
    operation_date = models.DateField()
    related_project_no = models.CharField(max_length=100)
    project_name = models.CharField(max_length=255, null=True, blank=True)
    project_start_date = models.DateField(null=True, blank=True)
    project_end_date = models.DateField(null=True, blank=True)
    researcher = models.CharField(max_length=100, null=True, blank=True)
    supervisor = models.CharField(max_length=100, null=True, blank=True)
    product_name = models.CharField(max_length=255)
    product_code = models.CharField(max_length=100)
    quantity = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    unit = models.CharField(max_length=50, null=True, blank=True)
    purpose = models.CharField(max_length=255)
    operator_id = models.BigIntegerField(null=True, blank=True)
    operator_name = models.CharField(max_length=100, null=True, blank=True)
    remark = models.TextField(null=True, blank=True)
    created_by = models.BigIntegerField(null=True, blank=True)
    updated_by = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    is_delete = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'product_sample_request'
