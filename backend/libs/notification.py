"""
飞书机器人消息通知服务

封装各业务场景的通知模板，统一通过 FeishuClient 发送消息。
支持普通卡片和带操作按钮的交互卡片。

使用方式：
    from libs.notification import notify_work_order_overdue, notify_work_order_assigned
    notify_work_order_overdue(work_order)
    notify_work_order_assigned(work_order, assignee_open_id)
"""
import json
import logging


from libs.feishu_client import feishu_client, FeishuAPIError

logger = logging.getLogger(__name__)

# ============================================================================
# 配置
# ============================================================================

# 通知目标群聊 ID（从环境变量读取，可在 deploy/.env.volcengine.plan-a 中配置）
import os
NOTIFICATION_CHAT_ID = os.getenv('FEISHU_NOTIFICATION_CHAT_ID', '')


def _safe_send(receive_id: str, msg_type: str, content: str, receive_id_type: str = 'chat_id') -> bool:
    """
    安全发送消息（捕获异常，不影响主流程）

    Returns:
        True 发送成功，False 发送失败
    """
    if not receive_id:
        logger.warning("通知发送跳过：未配置 receive_id")
        return False

    try:
        feishu_client.send_message(
            receive_id=receive_id,
            msg_type=msg_type,
            content=content,
            receive_id_type=receive_id_type,
        )
        return True
    except FeishuAPIError as e:
        logger.error(f"飞书通知发送失败: {e}")
        return False
    except Exception as e:
        logger.error(f"飞书通知发送异常: {type(e).__name__}: {e}")
        return False


def _build_card(title: str, color: str, fields: list, note: str = '') -> str:
    """
    构建飞书卡片消息

    Args:
        title: 卡片标题
        color: 主题颜色（blue/red/orange/green/grey）
        fields: 字段列表 [{"name": "xxx", "value": "xxx"}, ...]
        note: 底部备注

    Returns:
        卡片 JSON 字符串
    """
    elements = []

    # 字段区域
    field_elements = []
    for f in fields:
        field_elements.append({
            "is_short": True,
            "text": {
                "tag": "lark_md",
                "content": f"**{f['name']}**\n{f['value']}",
            },
        })
    if field_elements:
        elements.append({"tag": "div", "fields": field_elements})

    # 分割线 + 备注
    if note:
        elements.append({"tag": "hr"})
        elements.append({
            "tag": "note",
            "elements": [{"tag": "plain_text", "content": note}],
        })

    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title},
            "template": color,
        },
        "elements": elements,
    }
    return json.dumps(card)


def _build_card_with_actions(
    title: str,
    color: str,
    fields: list,
    actions: list,
    note: str = '',
) -> str:
    """
    构建带操作按钮的飞书交互卡片

    Args:
        title: 卡片标题
        color: 主题颜色
        fields: 字段列表
        actions: 按钮列表 [{"text": "接受", "type": "primary", "value": {...}}, ...]
        note: 底部备注

    Returns:
        卡片 JSON 字符串
    """
    elements = []

    field_elements = []
    for f in fields:
        field_elements.append({
            "is_short": True,
            "text": {
                "tag": "lark_md",
                "content": f"**{f['name']}**\n{f['value']}",
            },
        })
    if field_elements:
        elements.append({"tag": "div", "fields": field_elements})

    elements.append({"tag": "hr"})

    action_elements = []
    for act in actions:
        action_elements.append({
            "tag": "button",
            "text": {"tag": "plain_text", "content": act["text"]},
            "type": act.get("type", "default"),
            "value": act.get("value", {}),
        })
    if action_elements:
        elements.append({"tag": "action", "actions": action_elements})

    if note:
        elements.append({
            "tag": "note",
            "elements": [{"tag": "plain_text", "content": note}],
        })

    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title},
            "template": color,
        },
        "elements": elements,
    }
    return json.dumps(card)


# ============================================================================
# 业务通知函数
# ============================================================================

def notify_work_order_overdue(
    work_order,
    chat_id: str = None,
    assignee_open_id: str = None,
) -> bool:
    """
    工单逾期通知

    对应 FEISHU_NATIVE_SETUP.md 4.1：工单逾期

    Args:
        work_order: WorkOrder 模型实例
        chat_id: 目标群聊 ID（默认用全局配置）
        assignee_open_id: 负责人 open_id（用于 @）
    """
    target = chat_id or NOTIFICATION_CHAT_ID
    card = _build_card(
        title="工单逾期预警",
        color="red",
        fields=[
            {"name": "工单标题", "value": work_order.title},
            {"name": "工单ID", "value": str(work_order.id)},
            {"name": "当前状态", "value": work_order.status},
            {"name": "截止日期", "value": str(work_order.due_date) if work_order.due_date else "未设置"},
        ],
        note="CN KIS 预警助手 - 请尽快处理逾期工单",
    )
    return _safe_send(target, 'interactive', card)


def notify_visit_window_closing(
    visit_node,
    subject_code: str = '',
    days_remaining: int = 0,
    chat_id: str = None,
) -> bool:
    """
    访视窗口期即将关闭通知

    对应 FEISHU_NATIVE_SETUP.md 4.1：访视窗口期即将关闭

    Args:
        visit_node: VisitNode 模型实例
        subject_code: 受试者编号
        days_remaining: 剩余天数
        chat_id: 目标群聊 ID
    """
    target = chat_id or NOTIFICATION_CHAT_ID
    card = _build_card(
        title="访视窗口期即将关闭",
        color="orange",
        fields=[
            {"name": "访视节点", "value": visit_node.name},
            {"name": "受试者", "value": subject_code or "未知"},
            {"name": "剩余天数", "value": f"{days_remaining} 天"},
            {"name": "基准日", "value": f"D{visit_node.baseline_day}"},
        ],
        note="CN KIS 预警助手 - 请确保在窗口期内完成访视",
    )
    return _safe_send(target, 'interactive', card)


def notify_calibration_expiry(
    equipment_name: str,
    equipment_code: str,
    expiry_date: str,
    days_remaining: int,
    responsible: str = '',
    chat_id: str = None,
) -> bool:
    """
    设备校准到期通知

    对应 FEISHU_NATIVE_SETUP.md 4.1：设备校准到期

    Args:
        equipment_name: 设备名称
        equipment_code: 设备编号
        expiry_date: 到期日期字符串
        days_remaining: 剩余天数
        responsible: 负责人
        chat_id: 目标群聊 ID
    """
    target = chat_id or NOTIFICATION_CHAT_ID
    card = _build_card(
        title="设备校准到期预警",
        color="orange",
        fields=[
            {"name": "设备名称", "value": equipment_name},
            {"name": "设备编号", "value": equipment_code},
            {"name": "校准到期日", "value": expiry_date},
            {"name": "剩余天数", "value": f"{days_remaining} 天"},
        ],
        note=f"CN KIS 预警助手 - 负责人: {responsible}" if responsible else "CN KIS 预警助手",
    )
    return _safe_send(target, 'interactive', card)


def notify_sync_result(
    sync_log,
    chat_id: str = None,
) -> bool:
    """
    数据同步结果通知

    对应 FEISHU_NATIVE_SETUP.md 4.2：同步成功/失败时通知管理员

    Args:
        sync_log: SyncLog 模型实例
        chat_id: 目标群聊 ID
    """
    target = chat_id or NOTIFICATION_CHAT_ID
    is_success = sync_log.status == 'success'

    card = _build_card(
        title=f"数据同步{'成功' if is_success else '失败'}",
        color="green" if is_success else "red",
        fields=[
            {"name": "配置", "value": str(sync_log.config)},
            {"name": "状态", "value": sync_log.status},
            {"name": "同步记录数", "value": str(sync_log.records_synced)},
            {"name": "耗时", "value": str(sync_log.completed_at - sync_log.started_at) if sync_log.completed_at else "进行中"},
        ],
        note=f"错误: {sync_log.error_message[:100]}" if sync_log.error_message else "CN KIS 数据同步通知",
    )
    return _safe_send(target, 'interactive', card)


def notify_approval_result(
    title: str,
    approval_type: str,
    status: str,
    applicant: str = '',
    approver: str = '',
    detail: str = '',
    chat_id: str = None,
) -> bool:
    """
    审批结果通知（通用）

    Args:
        title: 审批标题
        approval_type: 审批类型（伦理申请/AE上报/偏差报告）
        status: 审批状态（approved/rejected）
        applicant: 申请人
        approver: 审批人
        detail: 详情说明
        chat_id: 目标群聊 ID
    """
    target = chat_id or NOTIFICATION_CHAT_ID
    is_approved = status == 'approved'

    card = _build_card(
        title=f"{approval_type}审批{'通过' if is_approved else '驳回'}",
        color="green" if is_approved else "red",
        fields=[
            {"name": "标题", "value": title},
            {"name": "类型", "value": approval_type},
            {"name": "申请人", "value": applicant or "未知"},
            {"name": "审批人", "value": approver or "未知"},
        ],
        note=detail[:100] if detail else "CN KIS 审批通知",
    )
    return _safe_send(target, 'interactive', card)


def notify_generic(
    title: str,
    color: str,
    fields: list,
    note: str = '',
    chat_id: str = None,
) -> bool:
    """
    通用通知（自定义内容）

    Args:
        title: 通知标题
        color: 主题颜色（blue/red/orange/green/grey）
        fields: 字段列表 [{"name": "xxx", "value": "xxx"}, ...]
        note: 底部备注
        chat_id: 目标群聊 ID
    """
    target = chat_id or NOTIFICATION_CHAT_ID
    card = _build_card(title=title, color=color, fields=fields, note=note)
    return _safe_send(target, 'interactive', card)


# ============================================================================
# 交互卡片通知（带操作按钮）
# ============================================================================

def notify_work_order_assigned(
    work_order,
    assignee_open_id: str,
) -> bool:
    """
    工单派发通知（交互卡片）

    向被分配人发送带"接受"和"完成"按钮的工单卡片。
    CRC 可以直接在飞书中点击按钮操作工单，无需打开系统。

    飞书卡片按钮回调地址需在飞书开放平台配置：
    应用功能 → 机器人 → 消息卡片请求网址 → 指向 /api/v1/sync/card-callback

    Args:
        work_order: WorkOrder 模型实例
        assignee_open_id: 被分配人的 open_id
    """
    if not assignee_open_id:
        logger.warning(f"工单#{work_order.id} 交互卡片发送跳过：无 open_id")
        return False

    card = _build_card_with_actions(
        title="新工单待处理",
        color="blue",
        fields=[
            {"name": "工单标题", "value": work_order.title},
            {"name": "工单ID", "value": str(work_order.id)},
            {"name": "当前状态", "value": work_order.get_status_display() if hasattr(work_order, 'get_status_display') else work_order.status},
            {"name": "截止日期", "value": str(work_order.due_date) if work_order.due_date else "未设置"},
        ],
        actions=[
            {
                "text": "接受工单",
                "type": "primary",
                "value": {
                    "action": "accept_workorder",
                    "workorder_id": str(work_order.id),
                },
            },
            {
                "text": "完成工单",
                "type": "default",
                "value": {
                    "action": "complete_workorder",
                    "workorder_id": str(work_order.id),
                },
            },
        ],
        note="CN KIS 工单助手 - 点击按钮直接操作",
    )
    result = _safe_send(assignee_open_id, 'interactive', card, receive_id_type='open_id')

    # S3-5 AC-4：同时发送到项目群
    _send_to_project_chat(work_order, card)
    return result


def _send_to_project_chat(work_order, card):
    """S3-5：将通知同步发送到项目群"""
    try:
        # 通过工单关联的 enrollment → protocol → feishu_chat_id
        if not work_order.enrollment_id:
            return
        from apps.subject.models import Enrollment
        enrollment = Enrollment.objects.filter(id=work_order.enrollment_id).first()
        if not enrollment or not enrollment.protocol_id:
            return
        from apps.protocol.models import Protocol
        protocol = Protocol.objects.filter(id=enrollment.protocol_id).first()
        if not protocol or not protocol.feishu_chat_id:
            return

        _safe_send(protocol.feishu_chat_id, 'interactive', card, receive_id_type='chat_id')
    except Exception as e:
        logger.debug(f'项目群通知跳过: {e}')


def build_work_order_updated_card(work_order, action_text: str, operator: str = '') -> str:
    """
    构建工单状态更新后的卡片（用于替换原卡片）

    当 CRC 点击"接受"或"完成"按钮后，飞书回调返回此卡片，
    替换原卡片内容，显示最新状态。

    Args:
        work_order: WorkOrder 模型实例
        action_text: 操作说明（如"已接受"/"已完成"）
        operator: 操作人名称
    """
    fields = [
        {"name": "工单标题", "value": work_order.title},
        {"name": "工单ID", "value": str(work_order.id)},
        {"name": "当前状态", "value": work_order.get_status_display() if hasattr(work_order, 'get_status_display') else work_order.status},
    ]
    if operator:
        fields.append({"name": "操作人", "value": operator})

    note = f"CN KIS 工单助手 - {action_text}"

    status_color_map = {
        'pending': 'blue',
        'in_progress': 'orange',
        'completed': 'green',
        'review': 'orange',
        'approved': 'green',
        'rejected': 'red',
        'cancelled': 'grey',
    }
    color = status_color_map.get(work_order.status, 'blue')

    return _build_card(
        title=f"工单{action_text}",
        color=color,
        fields=fields,
        note=note,
    )


# ============================================================================
# S2-1：AE 不良事件通知 + SAE 加急
# ============================================================================
def notify_adverse_event(ae) -> None:
    """
    发送 AE 上报通知

    SAE 时额外发送加急消息（im/v1/messages/{message_id}/urgent）。
    """
    severity_label = ae.get_severity_display() if hasattr(ae, 'get_severity_display') else ae.severity
    sae_tag = '🔴 [SAE] ' if ae.is_sae else ''

    fields = [
        {"name": "事件描述", "value": ae.description[:100]},
        {"name": "严重程度", "value": f'{sae_tag}{severity_label}'},
        {"name": "因果关系", "value": ae.get_relation_display() if hasattr(ae, 'get_relation_display') else ae.relation},
        {"name": "上报日期", "value": str(ae.report_date) if ae.report_date else ''},
        {"name": "入组ID", "value": str(ae.enrollment_id)},
    ]
    if ae.work_order_id:
        fields.append({"name": "关联工单", "value": f'WO#{ae.work_order_id}'})

    color = 'red' if ae.is_sae else 'orange'
    card = _build_card_with_actions(
        title=f'{sae_tag}不良事件上报',
        color=color,
        fields=fields,
        actions=[
            {"text": "确认处理", "type": "primary", "value": {
                "action": "acknowledge_ae", "ae_id": str(ae.id),
            }},
            {"text": "添加随访", "type": "default", "value": {
                "action": "add_ae_followup", "ae_id": str(ae.id),
            }},
        ],
        note='CN KIS 安全管理 - 请及时处理',
    )

    # 发送到默认通知群
    import os
    chat_id = os.getenv('FEISHU_NOTIFICATION_CHAT_ID', '')
    if not chat_id:
        logger.warning('FEISHU_NOTIFICATION_CHAT_ID 未配置，AE 通知跳过')
        return

    try:
        # _build_card 已返回 JSON 字符串，无需再次 json.dumps
        card_content = card if isinstance(card, str) else json.dumps(card)
        message_data = feishu_client.send_message(
            receive_id=chat_id,
            msg_type='interactive',
            content=card_content,
            receive_id_type='chat_id',
        )
        message_id = message_data.get('message_id', '')

        # SAE 加急消息
        if ae.is_sae and message_id:
            _send_urgent_message(message_id)
            ae.feishu_urgent_message_id = message_id
            ae.save(update_fields=['feishu_urgent_message_id', 'update_time'])

        logger.info(f'AE#{ae.id} 通知已发送, is_sae={ae.is_sae}')
    except Exception as e:
        logger.error(f'AE#{ae.id} 通知发送失败: {e}')


def _send_urgent_message(message_id: str) -> None:
    """
    发送加急消息

    使用飞书 API: POST im/v1/messages/{message_id}/urgent
    加急类型：应用内加急 + 短信加急
    """
    try:
        feishu_client._request(
            'PATCH',
            f'im/v1/messages/{message_id}/urgent_app',
            json={'user_id_list': []},  # 空列表 = 群内所有人
        )
        logger.info(f'加急消息已发送: message_id={message_id}')
    except Exception as e:
        logger.error(f'加急消息发送失败: {e}')


# ============================================================================
# 评估台协同通知
# ============================================================================

def notify_exception_escalated(
    exception,
    pi_open_id: str = '',
    quality_chat_id: str = None,
) -> bool:
    """
    严重异常上报通知 — 通知 PI 和质量台

    Args:
        exception: WorkOrderException 模型实例
        pi_open_id: PI 的 open_id
        quality_chat_id: 质量管理群聊 ID
    """
    fields = [
        {"name": "异常类型", "value": exception.get_exception_type_display() if hasattr(exception, 'get_exception_type_display') else exception.exception_type},
        {"name": "严重程度", "value": exception.severity},
        {"name": "工单ID", "value": str(exception.work_order_id)},
        {"name": "描述", "value": (exception.description or '')[:100]},
    ]
    if exception.deviation_id:
        fields.append({"name": "关联偏差", "value": f"DEV#{exception.deviation_id}"})

    card = _build_card(
        title="严重异常上报",
        color="red",
        fields=fields,
        note="CN KIS 评估台 - 需要立即关注和处理",
    )

    sent = False
    if pi_open_id:
        sent = _safe_send(pi_open_id, 'interactive', card, receive_id_type='open_id')
    target = quality_chat_id or NOTIFICATION_CHAT_ID
    if target:
        _safe_send(target, 'interactive', card)
        sent = True
    return sent


def notify_subject_checkin(
    subject_name: str,
    checkin_time: str,
    evaluator_open_ids: list = None,
    chat_id: str = None,
) -> bool:
    """
    受试者签到通知 — 通知当日评估人员

    Args:
        subject_name: 受试者编号/姓名
        checkin_time: 签到时间
        evaluator_open_ids: 当日评估人员 open_id 列表
        chat_id: 群聊 ID
    """
    card = _build_card(
        title="受试者已签到",
        color="blue",
        fields=[
            {"name": "受试者", "value": subject_name},
            {"name": "签到时间", "value": checkin_time},
        ],
        note="CN KIS 评估台 - 请准备接诊",
    )

    sent = False
    for open_id in (evaluator_open_ids or []):
        if _safe_send(open_id, 'interactive', card, receive_id_type='open_id'):
            sent = True

    target = chat_id or NOTIFICATION_CHAT_ID
    if target:
        _safe_send(target, 'interactive', card)
        sent = True
    return sent


def notify_workorder_completed(
    work_order,
    reviewer_open_id: str = '',
    chat_id: str = None,
) -> bool:
    """
    工单完成通知 — 通知质量审核人员

    Args:
        work_order: WorkOrder 模型实例
        reviewer_open_id: 质量审核人员 open_id
        chat_id: 群聊 ID
    """
    card = _build_card(
        title="工单执行完成",
        color="green",
        fields=[
            {"name": "工单标题", "value": work_order.title},
            {"name": "工单ID", "value": str(work_order.id)},
            {"name": "负责人", "value": str(work_order.assigned_to) if work_order.assigned_to else "未知"},
        ],
        note="CN KIS 评估台 - 待质量审核",
    )

    sent = False
    if reviewer_open_id:
        sent = _safe_send(reviewer_open_id, 'interactive', card, receive_id_type='open_id')
    target = chat_id or NOTIFICATION_CHAT_ID
    if target:
        _safe_send(target, 'interactive', card)
        sent = True
    return sent


def notify_deviation_created(
    deviation,
    quality_manager_open_id: str = '',
    chat_id: str = None,
) -> bool:
    """
    偏差自动创建通知 — 通知质量经理

    Args:
        deviation: Deviation 模型实例
        quality_manager_open_id: 质量经理 open_id
        chat_id: 群聊 ID
    """
    card = _build_card(
        title="偏差记录自动创建",
        color="orange",
        fields=[
            {"name": "偏差标题", "value": deviation.title},
            {"name": "偏差ID", "value": str(deviation.id)},
            {"name": "来源", "value": deviation.source or '工单异常'},
            {"name": "严重程度", "value": deviation.severity or '未分级'},
        ],
        note="CN KIS 质量管理 - 由工单异常自动触发",
    )

    sent = False
    if quality_manager_open_id:
        sent = _safe_send(quality_manager_open_id, 'interactive', card, receive_id_type='open_id')
    target = chat_id or NOTIFICATION_CHAT_ID
    if target:
        _safe_send(target, 'interactive', card)
        sent = True
    return sent


def notify_data_query_created(query, crc_open_id: str = '', chat_id: str = '') -> bool:
    """数据质疑创建通知"""
    card = _build_card_with_actions(
        title="数据质疑",
        color="orange",
        fields=[
            {"name": "质疑内容", "value": getattr(query, 'question', str(query))[:100]},
            {"name": "关联CRF", "value": str(getattr(query, 'crf_record_id', '-'))},
            {"name": "状态", "value": "待回复"},
        ],
        actions=[
            {"text": "去回复", "type": "primary", "value": {"action": "reply_query", "query_id": str(query.id)}},
        ],
        note="CN KIS 数据管理 - 请及时回复",
    )
    sent = False
    if crc_open_id:
        sent = _safe_send(crc_open_id, 'interactive', card, receive_id_type='open_id')
    target = chat_id or NOTIFICATION_CHAT_ID
    if target:
        _safe_send(target, 'interactive', card)
        sent = True
    return sent


def notify_schedule_changed(subject_name: str, old_date: str, new_date: str,
                            reason: str = '', open_id: str = '', chat_id: str = '') -> bool:
    """排程变更通知"""
    card = _build_card(
        title="排程变更通知",
        color="blue",
        fields=[
            {"name": "受试者", "value": subject_name},
            {"name": "原日期", "value": old_date},
            {"name": "新日期", "value": new_date},
            {"name": "变更原因", "value": reason or "未说明"},
        ],
        note="CN KIS 排程管理",
    )
    sent = False
    if open_id:
        sent = _safe_send(open_id, 'interactive', card, receive_id_type='open_id')
    target = chat_id or NOTIFICATION_CHAT_ID
    if target:
        _safe_send(target, 'interactive', card)
        sent = True
    return sent


def notify_questionnaire_due(subject_name: str, questionnaire_name: str,
                             due_date: str, open_id: str = '', chat_id: str = '') -> bool:
    """问卷即将到期通知"""
    card = _build_card(
        title="问卷即将到期",
        color="orange",
        fields=[
            {"name": "受试者", "value": subject_name},
            {"name": "问卷", "value": questionnaire_name},
            {"name": "截止日期", "value": due_date},
        ],
        note="CN KIS 问卷管理 - 请提醒受试者及时完成",
    )
    sent = False
    if open_id:
        sent = _safe_send(open_id, 'interactive', card, receive_id_type='open_id')
    target = chat_id or NOTIFICATION_CHAT_ID
    if target:
        _safe_send(target, 'interactive', card)
        sent = True
    return sent


def notify_next_subject(evaluator_open_id: str, subject_info: dict) -> bool:
    """通知评估员“下一位受试者已就绪”"""
    card = _build_card_with_actions(
        title="下一位受试者已就绪",
        color="green",
        fields=[
            {"name": "受试者编号", "value": subject_info.get('subject_no', '')},
            {"name": "签到时间", "value": subject_info.get('checkin_time', '')},
        ],
        actions=[
            {"text": "开始接待", "type": "primary", "value": {
                "action": "start_reception",
                "subject_id": str(subject_info.get('subject_id', '')),
            }},
        ],
        note="CN KIS 前台叫号系统",
    )
    return _safe_send(evaluator_open_id, 'interactive', card, receive_id_type='open_id')
