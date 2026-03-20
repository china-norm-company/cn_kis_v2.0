"""
变更控制模型

包含：变更申请的全生命周期管理
"""
from django.db import models


class ChangeType(models.TextChoices):
    PROTOCOL = 'protocol', '协议变更'
    SOP = 'sop', 'SOP变更'
    PERSONNEL = 'personnel', '人员变更'
    EQUIPMENT = 'equipment', '设备变更'
    SUPPLIER = 'supplier', '供应商变更'
    OTHER = 'other', '其他'


class ChangeRisk(models.TextChoices):
    HIGH = 'high', '高风险'
    MEDIUM = 'medium', '中风险'
    LOW = 'low', '低风险'


class ChangeStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    REVIEWING = 'reviewing', '审查中'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已驳回'
    IMPLEMENTING = 'implementing', '实施中'
    VERIFIED = 'verified', '已验证'
    CLOSED = 'closed', '已关闭'


# 变更申请：与 models.py 中定义一致，避免同一 app 内重复注册
from .models import ChangeRequest  # noqa: E402, F401
