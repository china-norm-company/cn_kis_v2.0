"""飞书集成 API — 预警推送 + 审批流程"""
from ninja import Router, Schema
from typing import Optional

from apps.sample.services.feishu_alert_service import feishu_alert_service
from apps.sample.services.feishu_approval_service import feishu_approval_service

router = Router(tags=["物料-飞书集成"])


# ===== 预警推送 =====

class AlertPushIn(Schema):
    webhook_url: Optional[str] = None


@router.post("/feishu/alerts/check-and-push")
def check_and_push_alerts(request, payload: AlertPushIn):
    """检查所有预警条件并推送到飞书"""
    result = feishu_alert_service.check_and_push_all_alerts(webhook_url=payload.webhook_url)
    return {'code': 0, 'msg': 'ok', 'data': result}


class ExpiryAlertIn(Schema):
    product_name: str
    batch_no: str
    expiry_date: str
    days_remaining: int
    webhook_url: Optional[str] = None


@router.post("/feishu/alerts/expiry")
def push_expiry_alert(request, payload: ExpiryAlertIn):
    """推送效期预警到飞书"""
    result = feishu_alert_service.push_expiry_alert(
        product_name=payload.product_name,
        batch_no=payload.batch_no,
        expiry_date=payload.expiry_date,
        days_remaining=payload.days_remaining,
        webhook_url=payload.webhook_url,
    )
    return {'code': 0, 'msg': 'ok', 'data': result}


class LowStockAlertIn(Schema):
    consumable_name: str
    current_stock: int
    min_stock: int
    unit: str = '个'
    webhook_url: Optional[str] = None


@router.post("/feishu/alerts/low-stock")
def push_low_stock_alert(request, payload: LowStockAlertIn):
    """推送低库存预警到飞书"""
    result = feishu_alert_service.push_low_stock_alert(
        consumable_name=payload.consumable_name,
        current_stock=payload.current_stock,
        min_stock=payload.min_stock,
        unit=payload.unit,
        webhook_url=payload.webhook_url,
    )
    return {'code': 0, 'msg': 'ok', 'data': result}


class TemperatureAlertIn(Schema):
    location_name: str
    temperature: float
    upper_limit: float
    lower_limit: float
    webhook_url: Optional[str] = None


@router.post("/feishu/alerts/temperature")
def push_temperature_alert(request, payload: TemperatureAlertIn):
    """推送温度异常预警到飞书"""
    result = feishu_alert_service.push_temperature_alert(
        location_name=payload.location_name,
        temperature=payload.temperature,
        upper_limit=payload.upper_limit,
        lower_limit=payload.lower_limit,
        webhook_url=payload.webhook_url,
    )
    return {'code': 0, 'msg': 'ok', 'data': result}


# ===== 审批流程 =====

class DestructionApprovalIn(Schema):
    destruction_id: int
    destruction_no: str
    applicant_name: str
    destruction_reason: str
    destruction_method: str
    sample_count: int


@router.post("/feishu/approval/destruction/create")
def create_destruction_approval(request, payload: DestructionApprovalIn):
    """创建销毁审批飞书实例"""
    result = feishu_approval_service.create_destruction_approval(
        destruction_id=payload.destruction_id,
        destruction_no=payload.destruction_no,
        applicant_name=payload.applicant_name,
        destruction_reason=payload.destruction_reason,
        destruction_method=payload.destruction_method,
        sample_count=payload.sample_count,
    )
    return {'code': 0, 'msg': 'ok', 'data': result}


class ApprovalCallbackIn(Schema):
    instance_code: str
    approval_status: str
    approver_name: str
    comments: str = ''


@router.post("/feishu/approval/callback")
def handle_approval_callback(request, payload: ApprovalCallbackIn):
    """处理飞书审批回调"""
    result = feishu_approval_service.handle_approval_callback(
        instance_code=payload.instance_code,
        approval_status=payload.approval_status,
        approver_name=payload.approver_name,
        comments=payload.comments,
    )
    return {'code': 0, 'msg': 'ok', 'data': result}


@router.get("/feishu/approval/status")
def get_approval_status(request, destruction_id: int = 0):
    """查询审批状态"""
    result = feishu_approval_service.get_approval_status(destruction_id)
    return {'code': 0, 'msg': 'ok', 'data': result}
