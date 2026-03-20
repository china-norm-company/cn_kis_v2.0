"""
飞书审批集成

对应 FEISHU_NATIVE_SETUP.md 第三节：飞书审批模板配置。
以飞书审批为主引擎：后端发起审批 → 飞书用户审批 → 回调更新后端状态。

审批模板（需在飞书管理后台预先创建）：
- 伦理申请审批（3.1）
- AE 上报审批（3.2）
- 偏差报告审批（3.3）

使用方式：
    from libs.feishu_approval import create_ethics_approval, create_deviation_approval
"""
import json
import logging
import os
from typing import Optional, Dict

from libs.feishu_client import feishu_client, FeishuAPIError

logger = logging.getLogger(__name__)

# ============================================================================
# 审批模板 Code（需在飞书管理后台创建审批模板后填入 .env）
# ============================================================================
APPROVAL_CODE_ETHICS = os.getenv('FEISHU_APPROVAL_CODE_ETHICS', '')
APPROVAL_CODE_AE_REPORT = os.getenv('FEISHU_APPROVAL_CODE_AE_REPORT', '')
APPROVAL_CODE_DEVIATION = os.getenv('FEISHU_APPROVAL_CODE_DEVIATION', '')
APPROVAL_CODE_CONTRACT = os.getenv('FEISHU_APPROVAL_CODE_CONTRACT', '')
APPROVAL_CODE_WORKORDER = os.getenv('FEISHU_APPROVAL_CODE_WORKORDER', '')
APPROVAL_CODE_RESOURCE_DEMAND = os.getenv('FEISHU_APPROVAL_CODE_RESOURCE_DEMAND', '')
APPROVAL_CODE_BUDGET = os.getenv('FEISHU_APPROVAL_CODE_BUDGET', '')
APPROVAL_CODE_INVOICE = os.getenv('FEISHU_APPROVAL_CODE_INVOICE', '')
APPROVAL_CODE_EXPENSE = os.getenv('FEISHU_APPROVAL_CODE_EXPENSE', '')
APPROVAL_CODE_PAYABLE = os.getenv('FEISHU_APPROVAL_CODE_PAYABLE', '')
APPROVAL_CODE_CHANGE_REQUEST = os.getenv('FEISHU_APPROVAL_CODE_CHANGE_REQUEST', '')


def _create_approval(
    approval_code: str,
    open_id: str,
    form_data: list,
    approval_type: str = '审批',
) -> Optional[str]:
    """
    创建飞书审批实例（内部通用方法）

    Args:
        approval_code: 审批定义 code
        open_id: 发起人 open_id
        form_data: 表单数据列表 [{"id":"widget1","type":"input","value":"xxx"}]
        approval_type: 审批类型描述（用于日志）

    Returns:
        instance_code（审批实例 ID），失败返回 None
    """
    if not approval_code:
        logger.warning(f"{approval_type}审批跳过：未配置审批模板 code")
        return None

    if not open_id:
        logger.warning(f"{approval_type}审批跳过：未提供发起人 open_id")
        return None

    try:
        form_json = json.dumps(form_data)
        data = feishu_client.create_approval_instance(
            approval_code=approval_code,
            open_id=open_id,
            form=form_json,
        )
        instance_code = data.get('instance_code', '')
        logger.info(f"{approval_type}审批创建成功: instance_code={instance_code}")
        return instance_code
    except FeishuAPIError as e:
        logger.error(f"{approval_type}审批创建失败: {e}")
        return None
    except Exception as e:
        logger.error(f"{approval_type}审批创建异常: {type(e).__name__}: {e}")
        return None


# ============================================================================
# 伦理申请审批（FEISHU_NATIVE_SETUP.md 3.1）
# ============================================================================

def create_ethics_approval(
    open_id: str,
    project_name: str,
    protocol_version: str,
    application_type: str,
    description: str = '',
) -> Optional[str]:
    """
    发起伦理申请审批

    发起人：项目经理
    审批人：伦理委员会主任（在飞书模板中配置）
    字段：项目名称、协议版本、申请类型（初审/修正/年检）、申请说明

    Args:
        open_id: 发起人 open_id
        project_name: 项目名称
        protocol_version: 协议版本
        application_type: 申请类型（初审/修正/年检）
        description: 申请说明

    Returns:
        instance_code
    """
    form_data = [
        {"id": "project_name", "type": "input", "value": project_name},
        {"id": "protocol_version", "type": "input", "value": protocol_version},
        {"id": "application_type", "type": "input", "value": application_type},
        {"id": "description", "type": "textarea", "value": description},
    ]
    return _create_approval(APPROVAL_CODE_ETHICS, open_id, form_data, "伦理申请")


# ============================================================================
# AE 上报审批（FEISHU_NATIVE_SETUP.md 3.2）
# ============================================================================

def create_ae_report_approval(
    open_id: str,
    subject_code: str,
    event_description: str,
    severity: str,
    occurrence_time: str,
    treatment: str = '',
) -> Optional[str]:
    """
    发起 AE 上报审批

    发起人：研究员/CRA
    审批人：项目医生 → 安全官（在飞书模板中配置多级审批）
    字段：受试者编号、事件描述、严重程度、发生时间、处理措施
    条件：严重/严重时自动加急（在飞书模板中配置条件）

    Args:
        open_id: 发起人 open_id
        subject_code: 受试者编号
        event_description: 事件描述
        severity: 严重程度（轻度/中度/重度/严重）
        occurrence_time: 发生时间
        treatment: 处理措施

    Returns:
        instance_code
    """
    form_data = [
        {"id": "subject_code", "type": "input", "value": subject_code},
        {"id": "event_description", "type": "textarea", "value": event_description},
        {"id": "severity", "type": "input", "value": severity},
        {"id": "occurrence_time", "type": "input", "value": occurrence_time},
        {"id": "treatment", "type": "textarea", "value": treatment},
    ]
    return _create_approval(APPROVAL_CODE_AE_REPORT, open_id, form_data, "AE上报")


# ============================================================================
# 偏差报告审批（FEISHU_NATIVE_SETUP.md 3.3）
# ============================================================================

def create_deviation_approval(
    open_id: str,
    deviation_type: str,
    description: str,
    impact_assessment: str,
    corrective_action: str,
) -> Optional[str]:
    """
    发起偏差报告审批

    发起人：研究员
    审批人：QA主管（在飞书模板中配置）
    抄送：项目经理（在飞书模板中配置）
    字段：偏差类型、偏差描述、影响评估、纠正措施

    Args:
        open_id: 发起人 open_id
        deviation_type: 偏差类型
        description: 偏差描述
        impact_assessment: 影响评估
        corrective_action: 纠正措施

    Returns:
        instance_code
    """
    form_data = [
        {"id": "deviation_type", "type": "input", "value": deviation_type},
        {"id": "description", "type": "textarea", "value": description},
        {"id": "impact_assessment", "type": "textarea", "value": impact_assessment},
        {"id": "corrective_action", "type": "textarea", "value": corrective_action},
    ]
    return _create_approval(APPROVAL_CODE_DEVIATION, open_id, form_data, "偏差报告")


# ============================================================================
# 合同审批
# ============================================================================

def create_contract_approval(
    open_id: str,
    contract_code: str,
    project_name: str,
    client: str,
    amount: str,
) -> Optional[str]:
    """发起合同审批"""
    form_data = [
        {"id": "contract_code", "type": "input", "value": contract_code},
        {"id": "project_name", "type": "input", "value": project_name},
        {"id": "client", "type": "input", "value": client},
        {"id": "amount", "type": "input", "value": amount},
    ]
    return _create_approval(APPROVAL_CODE_CONTRACT, open_id, form_data, "合同")


# ============================================================================
# 工单审批
# ============================================================================

def create_workorder_approval(
    open_id: str,
    workorder_title: str,
    workorder_id: int,
    description: str = '',
) -> Optional[str]:
    """发起工单审批"""
    form_data = [
        {"id": "workorder_title", "type": "input", "value": workorder_title},
        {"id": "workorder_id", "type": "input", "value": str(workorder_id)},
        {"id": "description", "type": "textarea", "value": description},
    ]
    return _create_approval(APPROVAL_CODE_WORKORDER, open_id, form_data, "工单")


# ============================================================================
# 资源需求审批（S1-3）
# ============================================================================

def create_resource_demand_approval(
    open_id: str,
    plan_name: str,
    demand_summary: str,
    demand_id: int,
) -> Optional[str]:
    """
    发起资源需求审批

    发起人：研究经理
    审批人：运营总监（在飞书模板中配置）
    字段：访视计划名称、需求摘要、需求ID
    """
    form_data = [
        {"id": "plan_name", "type": "input", "value": plan_name},
        {"id": "demand_summary", "type": "textarea", "value": demand_summary},
        {"id": "demand_id", "type": "input", "value": str(demand_id)},
    ]
    return _create_approval(
        APPROVAL_CODE_RESOURCE_DEMAND, open_id, form_data, "资源需求"
    )


# ============================================================================
# 审批回调处理
# ============================================================================

def handle_approval_callback(event_data: Dict) -> bool:
    """
    处理飞书审批回调事件

    飞书审批状态变更时，通过 Webhook 回调此函数。
    根据 approval_code 和 instance_code 更新对应的业务记录状态。

    Args:
        event_data: 飞书回调事件数据

    Returns:
        处理成功返回 True
    """
    try:
        approval_code = event_data.get('approval_code', '')
        instance_code = event_data.get('instance_code', '')
        status = event_data.get('status', '')  # APPROVED / REJECTED / CANCELED

        logger.info(
            f"审批回调: approval_code={approval_code}, "
            f"instance_code={instance_code}, status={status}"
        )

        if not instance_code or not status:
            logger.warning("审批回调数据不完整")
            return False

        # 根据 approval_code 路由到对应业务处理
        if approval_code == APPROVAL_CODE_DEVIATION:
            return _handle_deviation_approval(instance_code, status)
        elif approval_code == APPROVAL_CODE_WORKORDER:
            return _handle_workorder_approval(instance_code, status)
        elif approval_code == APPROVAL_CODE_CONTRACT:
            return _handle_contract_approval(instance_code, status)
        elif approval_code == APPROVAL_CODE_ETHICS:
            return _handle_ethics_approval(instance_code, status)
        elif approval_code == APPROVAL_CODE_AE_REPORT:
            return _handle_ae_approval(instance_code, status)
        elif approval_code == APPROVAL_CODE_RESOURCE_DEMAND:
            return _handle_resource_demand_approval(instance_code, status)
        elif approval_code == APPROVAL_CODE_CHANGE_REQUEST:
            return _handle_change_request_approval(instance_code, status)
        else:
            logger.warning(f"未识别的审批模板: {approval_code}")
            return False

    except Exception as e:
        logger.error(f"审批回调处理异常: {e}")
        return False


def _handle_deviation_approval(instance_code: str, status: str) -> bool:
    """处理偏差审批回调"""
    try:
        from apps.quality.models import Deviation
        dev = Deviation.objects.filter(feishu_approval_instance_id=instance_code).first()
        if not dev:
            logger.warning(f"偏差审批回调: 找不到 instance_code={instance_code} 的偏差记录")
            return False

        if status == 'APPROVED':
            dev.status = 'approved'
        elif status == 'REJECTED':
            dev.status = 'rejected'
        elif status == 'CANCELED':
            dev.status = 'open'
        dev.save(update_fields=['status', 'update_time'])
        logger.info(f"偏差#{dev.id} 状态更新为 {dev.status}")

        # 发送审批结果通知
        try:
            from libs.notification import notify_approval_result
            notify_approval_result(
                title=dev.title,
                approval_type="偏差报告",
                status=dev.status,
                applicant=dev.reporter,
            )
        except Exception:
            pass

        return True
    except Exception as e:
        logger.error(f"偏差审批回调处理失败: {e}")
        return False


def _handle_workorder_approval(instance_code: str, status: str) -> bool:
    """处理工单审批回调"""
    try:
        from apps.workorder.models import WorkOrder
        wo = WorkOrder.objects.filter(feishu_approval_instance_id=instance_code).first()
        if not wo:
            logger.warning(f"工单审批回调: 找不到 instance_code={instance_code} 的工单")
            return False

        if status == 'APPROVED':
            wo.status = 'approved'
        elif status == 'REJECTED':
            wo.status = 'rejected'
        wo.save(update_fields=['status', 'update_time'])
        logger.info(f"工单#{wo.id} 状态更新为 {wo.status}")
        return True
    except Exception as e:
        logger.error(f"工单审批回调处理失败: {e}")
        return False


def _handle_resource_demand_approval(instance_code: str, status: str) -> bool:
    """处理资源需求审批回调"""
    try:
        from apps.visit.models import ResourceDemand
        demand = ResourceDemand.objects.filter(
            feishu_approval_instance_id=instance_code
        ).first()
        if not demand:
            logger.warning(f"资源需求审批回调: 找不到 instance_code={instance_code}")
            return False

        if status == 'APPROVED':
            demand.status = 'approved'
        elif status == 'REJECTED':
            demand.status = 'rejected'
        elif status == 'CANCELED':
            demand.status = 'draft'
        demand.save(update_fields=['status', 'update_time'])
        logger.info(f"资源需求#{demand.id} 状态更新为 {demand.status}")
        return True
    except Exception as e:
        logger.error(f"资源需求审批回调处理失败: {e}")
        return False


def _handle_contract_approval(instance_code: str, status: str) -> bool:
    """处理合同审批回调"""
    try:
        from apps.finance.models import Contract
        contract = Contract.objects.filter(feishu_approval_id=instance_code).first()
        if not contract:
            logger.warning(f"合同审批回调: 找不到 instance_code={instance_code} 的合同")
            return False

        if status == 'APPROVED':
            contract.status = 'signed'
        elif status == 'REJECTED':
            contract.status = 'negotiating'
        contract.save(update_fields=['status', 'update_time'])
        logger.info(f"合同#{contract.id} 状态更新为 {contract.status}")
        return True
    except Exception as e:
        logger.error(f"合同审批回调处理失败: {e}")
        return False


def _handle_ethics_approval(instance_code: str, status: str) -> bool:
    """处理伦理审批回调"""
    try:
        from apps.ethics.models import EthicsApplication, EthicsApplicationStatus
        app = EthicsApplication.objects.filter(
            feishu_approval_instance_id=instance_code
        ).first()
        if not app:
            logger.warning(f"伦理审批回调: 找不到 instance_code={instance_code}")
            return False

        if status == 'APPROVED':
            app.status = EthicsApplicationStatus.APPROVED
        elif status == 'REJECTED':
            app.status = EthicsApplicationStatus.REJECTED
        elif status == 'CANCELED':
            app.status = EthicsApplicationStatus.DRAFT
        app.save(update_fields=['status', 'update_time'])
        logger.info(f"伦理申请#{app.id} 状态更新为 {app.status}")

        try:
            from libs.notification import notify_approval_result
            notify_approval_result(
                title=str(app),
                approval_type="伦理审批",
                status=app.status,
                applicant=app.application_number,
            )
        except Exception:
            pass

        return True
    except Exception as e:
        logger.error(f"伦理审批回调处理失败: {e}")
        return False


def _handle_ae_approval(instance_code: str, status: str) -> bool:
    """处理 AE 上报审批回调"""
    try:
        from apps.safety.models import AdverseEvent
        ae = AdverseEvent.objects.filter(
            feishu_approval_instance_id=instance_code
        ).first()
        if not ae:
            logger.warning(f"AE审批回调: 找不到 instance_code={instance_code}")
            return False

        if status == 'APPROVED':
            ae.status = 'confirmed'
        elif status == 'REJECTED':
            ae.status = 'rejected'
        elif status == 'CANCELED':
            ae.status = 'draft'
        ae.save(update_fields=['status', 'update_time'])
        logger.info(f"AE#{ae.id} 状态更新为 {ae.status}")

        try:
            from libs.notification import notify_approval_result
            notify_approval_result(
                title=ae.description[:50] if ae.description else f'AE#{ae.id}',
                approval_type="AE上报审批",
                status=ae.status,
                applicant='',
            )
        except Exception:
            pass

        return True
    except Exception as e:
        logger.error(f"AE审批回调处理失败: {e}")
        return False


def _handle_change_request_approval(instance_code: str, status: str) -> bool:
    """处理变更请求审批回调"""
    try:
        from apps.workflow.models import WorkflowInstance
        instance = WorkflowInstance.objects.filter(
            feishu_approval_instance_id=instance_code
        ).first()
        if not instance:
            logger.warning(f"变更审批回调: 找不到 instance_code={instance_code}")
            return False

        if status == 'APPROVED':
            instance.status = 'approved'
        elif status == 'REJECTED':
            instance.status = 'rejected'
        elif status == 'CANCELED':
            instance.status = 'cancelled'
        instance.save(update_fields=['status', 'update_time'])
        logger.info(f"变更#{instance.id} 状态更新为 {instance.status}")

        try:
            from apps.notification.services import send_notification
            result_label = {'approved': '已批准', 'rejected': '已驳回', 'cancelled': '已取消'}.get(instance.status, instance.status)
            send_notification(
                recipient_id=instance.initiator_id,
                title=f'变更审批结果: {instance.title} - {result_label}',
                source_type='workflow_instance',
                source_id=instance.id,
            )
        except Exception:
            pass

        return True
    except Exception as e:
        logger.error(f"变更审批回调处理失败: {e}")
        return False


# ============================================================================
# 财务审批（预算、开票、费用报销、付款）
# ============================================================================

def create_budget_approval(
    open_id: str,
    budget_no: str,
    project_name: str,
    total_cost: str,
    budget_year: str,
) -> Optional[str]:
    """发起预算审批"""
    form_data = [
        {"id": "budget_no", "type": "input", "value": budget_no},
        {"id": "project_name", "type": "input", "value": project_name},
        {"id": "total_cost", "type": "input", "value": total_cost},
        {"id": "budget_year", "type": "input", "value": budget_year},
    ]
    return _create_approval(APPROVAL_CODE_BUDGET, open_id, form_data, "预算")


def create_invoice_approval(
    open_id: str,
    invoice_code: str,
    client: str,
    amount: str,
    invoice_type: str,
) -> Optional[str]:
    """发起开票审批"""
    form_data = [
        {"id": "invoice_code", "type": "input", "value": invoice_code},
        {"id": "client", "type": "input", "value": client},
        {"id": "amount", "type": "input", "value": amount},
        {"id": "invoice_type", "type": "input", "value": invoice_type},
    ]
    return _create_approval(APPROVAL_CODE_INVOICE, open_id, form_data, "开票")


def create_expense_approval(
    open_id: str,
    request_no: str,
    applicant_name: str,
    expense_type: str,
    amount: str,
    description: str,
) -> Optional[str]:
    """发起费用报销审批"""
    form_data = [
        {"id": "request_no", "type": "input", "value": request_no},
        {"id": "applicant", "type": "input", "value": applicant_name},
        {"id": "expense_type", "type": "input", "value": expense_type},
        {"id": "amount", "type": "input", "value": amount},
        {"id": "description", "type": "input", "value": description},
    ]
    return _create_approval(APPROVAL_CODE_EXPENSE, open_id, form_data, "费用报销")


def create_payable_approval(
    open_id: str,
    record_no: str,
    supplier_name: str,
    amount: str,
    due_date: str,
) -> Optional[str]:
    """发起付款审批"""
    form_data = [
        {"id": "record_no", "type": "input", "value": record_no},
        {"id": "supplier", "type": "input", "value": supplier_name},
        {"id": "amount", "type": "input", "value": amount},
        {"id": "due_date", "type": "input", "value": due_date},
    ]
    return _create_approval(APPROVAL_CODE_PAYABLE, open_id, form_data, "付款")


# ============================================================================
# 变更请求审批（研究台变更管理）
# ============================================================================

def create_change_request_approval(
    open_id: str,
    title: str,
    change_type: str,
    description: str,
    impact_assessment: str = '',
    **kwargs,
) -> Optional[str]:
    """
    发起变更请求审批

    发起人：研究经理
    审批人：项目总监（在飞书模板中配置）
    字段：变更标题、变更类型、变更描述、影响评估

    Args:
        open_id: 发起人 open_id
        title: 变更标题
        change_type: 变更类型（方案修正/排程变更/偏差升级）
        description: 变更描述
        impact_assessment: 影响评估

    Returns:
        instance_code
    """
    form_data = [
        {"id": "title", "type": "input", "value": title},
        {"id": "change_type", "type": "input", "value": change_type},
        {"id": "description", "type": "textarea", "value": description},
        {"id": "impact_assessment", "type": "textarea", "value": impact_assessment},
    ]
    return _create_approval(APPROVAL_CODE_CHANGE_REQUEST, open_id, form_data, "变更请求")
