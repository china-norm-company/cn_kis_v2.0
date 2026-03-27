"""
招募通知服务

基于已有的 libs/notification.py 通知基础设施，为招募模块提供专用通知。
支持飞书卡片消息和 AnyCross 工作流触发。
"""
import logging
import os

from libs.notification import _safe_send, _build_card, _build_card_with_actions, NOTIFICATION_CHAT_ID
from libs.time_format import format_local_hhmm

logger = logging.getLogger(__name__)

RECRUITMENT_CHAT_ID = os.getenv('RECRUITMENT_NOTIFICATION_CHAT_ID', '')


def _get_chat_id(protocol=None) -> str:
    """获取通知目标群聊 ID，优先使用项目群，其次招募群，最后全局群"""
    if protocol and hasattr(protocol, 'feishu_chat_id') and protocol.feishu_chat_id:
        return protocol.feishu_chat_id
    return RECRUITMENT_CHAT_ID or NOTIFICATION_CHAT_ID


def notify_new_registration(reg, chat_id: str = None) -> bool:
    """
    新报名通知（绿色卡片，含"联系TA"按钮）

    Args:
        reg: SubjectRegistration 模型实例
        chat_id: 目标群聊 ID（可选，默认自动选择）
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("招募通知跳过：未配置通知群聊 ID（新报名: %s）", reg.registration_no)
        return False

    card = _build_card_with_actions(
        title="📋 新报名通知",
        color="green",
        fields=[
            {"name": "报名编号", "value": reg.registration_no},
            {"name": "姓名", "value": reg.name},
            {"name": "手机号", "value": reg.phone},
            {"name": "来源渠道", "value": reg.channel.name if reg.channel else "直接报名"},
            {"name": "所属计划", "value": reg.plan.title if reg.plan else "未知"},
        ],
        actions=[
            {
                "text": "联系TA",
                "type": "primary",
                "value": {"action": "contact_registration", "reg_id": reg.id},
            },
        ],
        note="招招·招募台 - 请及时联系跟进",
    )
    return _safe_send(target, 'interactive', card)


def notify_screening_result(screening, result: str, chat_id: str = None) -> bool:
    """
    筛选结果通知（通过=绿色/不通过=红色）

    Args:
        screening: ScreeningRecord 模型实例
        result: 'pass' 或 'fail'
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("招募通知跳过：未配置通知群聊 ID（筛选结果: %s）", screening.screening_no)
        return False

    reg = screening.registration
    is_pass = result == 'pass'
    card = _build_card(
        title=f"{'✅ 筛选通过' if is_pass else '❌ 筛选未通过'}",
        color="green" if is_pass else "red",
        fields=[
            {"name": "筛选编号", "value": screening.screening_no},
            {"name": "受试者", "value": reg.name if reg else "未知"},
            {"name": "结果", "value": "通过" if is_pass else "未通过"},
            {"name": "备注", "value": screening.notes or "无"},
        ],
        note="招招·招募台 - 筛选评估结果",
    )
    return _safe_send(target, 'interactive', card)


def notify_enrollment_confirmed(enrollment, chat_id: str = None) -> bool:
    """
    入组确认通知（绿色卡片）

    Args:
        enrollment: EnrollmentRecord 模型实例
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("招募通知跳过：未配置通知群聊 ID（入组确认: %s）", enrollment.enrollment_no)
        return False

    reg = enrollment.registration
    card = _build_card(
        title="🎉 入组确认",
        color="green",
        fields=[
            {"name": "入组编号", "value": enrollment.enrollment_no},
            {"name": "受试者", "value": reg.name if reg else "未知"},
            {"name": "所属计划", "value": reg.plan.title if reg and reg.plan else "未知"},
            {"name": "状态", "value": "已确认入组"},
        ],
        note="招招·招募台 - 恭喜新入组！",
    )
    return _safe_send(target, 'interactive', card)


def notify_withdrawal(reg, reason: str, chat_id: str = None) -> bool:
    """
    退出预警通知（红色卡片）

    Args:
        reg: SubjectRegistration 模型实例
        reason: 退出原因
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("招募通知跳过：未配置通知群聊 ID（退出: %s）", reg.registration_no)
        return False

    card = _build_card(
        title="⚠️ 受试者退出预警",
        color="red",
        fields=[
            {"name": "报名编号", "value": reg.registration_no},
            {"name": "姓名", "value": reg.name},
            {"name": "所属计划", "value": reg.plan.title if reg.plan else "未知"},
            {"name": "退出原因", "value": reason or "未说明"},
        ],
        note="招招·招募台 - 请关注退出原因并记录",
    )
    return _safe_send(target, 'interactive', card)


def notify_subject_checkin(subject, checkin, chat_id: str = None) -> bool:
    """
    受试者签到通知（蓝色卡片），发送给对应评估人员。

    Args:
        subject: Subject 模型实例
        checkin: SubjectCheckin 模型实例
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("签到通知跳过：未配置通知群聊 ID (subject=%s)", subject.subject_no)
        return False

    card = _build_card(
        title="📍 受试者已签到",
        color="blue",
        fields=[
            {"name": "受试者", "value": f"{subject.name} ({subject.subject_no})"},
            {"name": "签到时间", "value": format_local_hhmm(checkin.checkin_time)},
            {"name": "位置", "value": checkin.location or "前台"},
        ],
        note="维周·执行台 - 请准备接待",
    )
    return _safe_send(target, 'interactive', card)


def notify_no_show(subject, appointment, chat_id: str = None) -> bool:
    """
    缺席预警通知（橙色卡片），超预约时间 15 分钟未到场。

    Args:
        subject: Subject 模型实例
        appointment: SubjectAppointment 模型实例
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("缺席通知跳过：未配置通知群聊 ID (subject=%s)", subject.subject_no)
        return False

    card = _build_card(
        title="⚠️ 受试者缺席预警",
        color="orange",
        fields=[
            {"name": "受试者", "value": f"{subject.name} ({subject.subject_no})"},
            {"name": "预约时间", "value": appointment.appointment_time.strftime('%H:%M') if appointment.appointment_time else ""},
            {"name": "预约事由", "value": appointment.purpose or ""},
        ],
        note="维周·执行台 - 请联系受试者确认情况",
    )
    return _safe_send(target, 'interactive', card)


def notify_pre_screening_result(record, chat_id: str = None) -> bool:
    """
    初筛结果通知：通过=绿色，不通过=红色，待复核=橙色。

    Args:
        record: PreScreeningRecord 模型实例
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("初筛通知跳过：未配置通知群聊 ID (ps=%s)", record.pre_screening_no)
        return False

    result = record.result
    if result == 'pass':
        title = "✅ 初筛通过"
        color = "green"
        extra_msg = "建议安排正式筛选"
    elif result == 'pending':
        title = "🔍 初筛需 PI 复核"
        color = "orange"
        extra_msg = "请 PI 尽快复核"
    else:
        title = "❌ 初筛未通过"
        color = "red"
        reasons = ', '.join(record.fail_reasons) if record.fail_reasons else '未说明'
        extra_msg = f"原因：{reasons}"

    card = _build_card(
        title=title,
        color=color,
        fields=[
            {"name": "初筛编号", "value": record.pre_screening_no},
            {"name": "受试者", "value": record.subject.name if record.subject else ""},
            {"name": "结果", "value": record.get_result_display()},
            {"name": "说明", "value": extra_msg},
        ],
        note="招招·招募台 - 初筛评估结果",
    )
    return _safe_send(target, 'interactive', card)


def notify_pre_screening_review_needed(record, chat_id: str = None) -> bool:
    """
    初筛 PI 复核通知（橙色卡片），发送给 PI/研究者。

    Args:
        record: PreScreeningRecord 模型实例
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("PI复核通知跳过：未配置通知群聊 ID (ps=%s)", record.pre_screening_no)
        return False

    card = _build_card(
        title="🔬 初筛需 PI 复核",
        color="orange",
        fields=[
            {"name": "初筛编号", "value": record.pre_screening_no},
            {"name": "受试者", "value": record.subject.name if record.subject else ""},
            {"name": "评估员备注", "value": record.notes or "无"},
        ],
        note="招招·招募台 - 请 PI 审核初筛结果",
    )
    return _safe_send(target, 'interactive', card)


def notify_reception_event(subject, event_type: str, detail: str, chat_id: str = None) -> bool:
    """
    前台事件上报通知（红色卡片），发送给质量/安全管理人员。

    Args:
        subject: Subject 模型实例
        event_type: 'deviation' / 'adverse_event'
        detail: 事件描述
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id()
    if not target:
        logger.warning("前台事件通知跳过：未配置通知群聊 ID")
        return False

    type_label = '偏差事件' if event_type == 'deviation' else '不良事件'
    card = _build_card(
        title=f"🚨 前台上报：{type_label}",
        color="red",
        fields=[
            {"name": "受试者", "value": f"{subject.name} ({subject.subject_no})" if subject else "未知"},
            {"name": "事件类型", "value": type_label},
            {"name": "详情", "value": detail or "无"},
        ],
        note="维周·执行台 - 前台接待上报",
    )
    return _safe_send(target, 'interactive', card)


def notify_daily_summary(plan=None, chat_id: str = None) -> bool:
    """
    每日招募摘要通知（蓝色卡片）
    汇总当日新报名、筛选通过/不通过、入组数量。

    Args:
        plan: RecruitmentPlan 模型实例（可选，为 None 时汇总全部）
        chat_id: 目标群聊 ID
    """
    target = chat_id or _get_chat_id(plan)
    if not target:
        logger.warning("招募每日摘要跳过：未配置通知群聊 ID")
        return False

    try:
        from datetime import date
        from apps.subject.models import SubjectRegistration
        today = date.today()

        base_qs = SubjectRegistration.objects.filter(create_time__date=today)
        if plan:
            base_qs = base_qs.filter(plan=plan)

        new_count = base_qs.count()
        passed = base_qs.filter(status='screening_passed').count()
        failed = base_qs.filter(status='screening_failed').count()
        enrolled = base_qs.filter(status='enrolled').count()

        plan_title = plan.title if plan else '全部计划'
        card = _build_card(
            title="📊 每日招募摘要",
            color="blue",
            fields=[
                {"name": "日期", "value": str(today)},
                {"name": "招募计划", "value": plan_title},
                {"name": "新报名", "value": str(new_count)},
                {"name": "筛选通过", "value": str(passed)},
                {"name": "筛选未通过", "value": str(failed)},
                {"name": "已入组", "value": str(enrolled)},
            ],
            note="招招·招募台 - 每日招募进展",
        )
        return _safe_send(target, 'interactive', card)
    except Exception as e:
        logger.error(f'招募每日摘要发送失败: {e}')
        return False


def trigger_recruitment_event(event_type: str, data: dict) -> bool:
    """
    触发 AnyCross 招募事件回调

    Args:
        event_type: 事件类型（registration_created, screening_completed, enrollment_confirmed, registration_withdrawn）
        data: 事件数据
    """
    try:
        from apps.feishu_sync.services import trigger_anycross_webhook
        return trigger_anycross_webhook(event_type, data)
    except ImportError:
        logger.warning("AnyCross webhook 不可用，跳过事件: %s", event_type)
        return False
    except Exception as e:
        logger.error("AnyCross 招募事件触发失败 [%s]: %s", event_type, e)
        return False
