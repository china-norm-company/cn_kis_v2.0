"""
微信小程序订阅消息通知服务

通过微信 subscribeMessage.send API 向受试者推送通知。
微信订阅消息需要：
1. 在微信小程序后台配置消息模板
2. 小程序端调用 Taro.requestSubscribeMessage() 获取用户授权
3. 后端通过本服务发送消息

模板 ID 通过 Django settings 或环境变量配置。
"""
import os
import logging

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

# 微信 access_token 缓存
_access_token_cache = {
    'token': '',
    'expires_at': 0,
}


def get_wechat_access_token() -> str:
    """获取微信小程序 access_token（带内存缓存）"""
    import time
    now = time.time()
    if _access_token_cache['token'] and _access_token_cache['expires_at'] > now + 300:
        return _access_token_cache['token']

    appid = getattr(settings, 'WECHAT_APPID', '') or os.getenv('WECHAT_APPID', '')
    secret = getattr(settings, 'WECHAT_SECRET', '') or os.getenv('WECHAT_SECRET', '')
    if not appid or not secret:
        raise ValueError('WECHAT_APPID 或 WECHAT_SECRET 未配置')

    resp = httpx.get(
        'https://api.weixin.qq.com/cgi-bin/token',
        params={'grant_type': 'client_credential', 'appid': appid, 'secret': secret},
    )
    data = resp.json()
    token = data.get('access_token', '')
    if not token:
        raise ValueError(f"获取微信 access_token 失败: {data.get('errmsg', '未知错误')}")

    _access_token_cache['token'] = token
    _access_token_cache['expires_at'] = now + data.get('expires_in', 7200)
    return token


def send_subscribe_message(
    openid: str,
    template_id: str,
    data: dict,
    page: str = '',
    miniprogram_state: str = 'formal',
) -> bool:
    """
    发送微信订阅消息

    Args:
        openid: 接收者的 openid
        template_id: 消息模板 ID
        data: 模板数据，格式 {"key1": {"value": "xxx"}, ...}
        page: 点击消息后跳转的小程序页面路径
        miniprogram_state: developer/trial/formal

    Returns:
        True 发送成功
    """
    if not openid:
        logger.warning('微信订阅消息跳过：openid 为空')
        return False
    if not template_id:
        logger.warning('微信订阅消息跳过：template_id 为空')
        return False

    try:
        token = get_wechat_access_token()
    except Exception as e:
        logger.error(f'获取微信 access_token 失败: {e}')
        return False

    payload = {
        'touser': openid,
        'template_id': template_id,
        'data': data,
        'miniprogram_state': miniprogram_state,
    }
    if page:
        payload['page'] = page

    try:
        resp = httpx.post(
            f'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token={token}',
            json=payload,
        )
        result = resp.json()
        errcode = result.get('errcode', 0)
        if errcode == 0:
            logger.info(f'微信订阅消息发送成功: openid={openid[:8]}..., template={template_id}')
            return True
        else:
            logger.warning(
                f'微信订阅消息发送失败: errcode={errcode}, errmsg={result.get("errmsg", "")}, '
                f'openid={openid[:8]}..., template={template_id}'
            )
            return False
    except Exception as e:
        logger.error(f'微信订阅消息发送异常: {e}')
        return False


# ============================================================================
# 模板 ID 配置（从环境变量读取，在微信小程序后台配置后填入）
# ============================================================================
TEMPLATE_REGISTRATION_CONFIRM = os.getenv('WX_TPL_REGISTRATION_CONFIRM', '')
TEMPLATE_SCREENING_RESULT = os.getenv('WX_TPL_SCREENING_RESULT', '')
TEMPLATE_VISIT_REMINDER = os.getenv('WX_TPL_VISIT_REMINDER', '')
TEMPLATE_PAYMENT_ARRIVAL = os.getenv('WX_TPL_PAYMENT_ARRIVAL', '')
TEMPLATE_QUESTIONNAIRE_DUE = os.getenv('WX_TPL_QUESTIONNAIRE_DUE', '')
TEMPLATE_AE_FOLLOWUP = os.getenv('WX_TPL_AE_FOLLOWUP', '')
TEMPLATE_QUEUE_CALL = os.getenv('WX_TPL_QUEUE_CALL', '')
TEMPLATE_EXPIRY_ALERT = os.getenv('WX_TPL_EXPIRY_ALERT', '')


def _get_subject_openid(subject) -> str:
    """从 Subject 获取微信 openid"""
    if subject and subject.account and hasattr(subject.account, 'wechat_openid'):
        return subject.account.wechat_openid or ''
    return ''


def _get_subject_openid_by_registration(registration) -> str:
    """从 SubjectRegistration 获取微信 openid（报名阶段可能还没有 Subject）"""
    if hasattr(registration, 'subject') and registration.subject:
        return _get_subject_openid(registration.subject)
    # 通过手机号查找 Account
    if registration.phone:
        try:
            from apps.identity.models import Account
            account = Account.objects.filter(
                wechat_openid__isnull=False
            ).exclude(wechat_openid='').filter(
                subject_profile_ref__phone=registration.phone
            ).first()
            if account:
                return account.wechat_openid
        except Exception:
            pass
    return ''


# ============================================================================
# 业务通知函数
# ============================================================================
def notify_registration_confirmed(registration) -> bool:
    """报名确认通知"""
    openid = _get_subject_openid_by_registration(registration)
    if not openid or not TEMPLATE_REGISTRATION_CONFIRM:
        return False
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_REGISTRATION_CONFIRM,
        data={
            'character_string1': {'value': registration.registration_no},
            'thing2': {'value': (registration.plan.title if registration.plan else '项目')[:20]},
            'time3': {'value': registration.create_time.strftime('%Y-%m-%d %H:%M')},
        },
        page='pages/profile/index',
    )


def notify_screening_result_to_subject(registration, result: str, stage: str = '初筛') -> bool:
    """筛选/初筛结果通知（发送给受试者）"""
    openid = _get_subject_openid_by_registration(registration)
    if not openid or not TEMPLATE_SCREENING_RESULT:
        return False
    result_text = '通过' if result == 'pass' else '未通过'
    next_step = '请等待正式筛选安排' if result == 'pass' else '感谢您的参与'
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_SCREENING_RESULT,
        data={
            'phrase1': {'value': f'{stage}{result_text}'},
            'thing2': {'value': next_step[:20]},
        },
        page='pages/profile/index',
    )


def notify_enrollment_welcome(enrollment_record) -> bool:
    """入组欢迎通知"""
    reg = enrollment_record.registration if hasattr(enrollment_record, 'registration') else None
    if not reg:
        return False
    openid = _get_subject_openid_by_registration(reg)
    if not openid or not TEMPLATE_REGISTRATION_CONFIRM:
        return False
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_REGISTRATION_CONFIRM,
        data={
            'character_string1': {'value': enrollment_record.enrollment_no or ''},
            'thing2': {'value': '恭喜您已成功入组！请按访视计划参加项目'},
            'time3': {'value': enrollment_record.create_time.strftime('%Y-%m-%d %H:%M')},
        },
        page='pages/index/index',
    )


def notify_visit_reminder(subject, appointment) -> bool:
    """访视预约提醒"""
    openid = _get_subject_openid(subject)
    if not openid or not TEMPLATE_VISIT_REMINDER:
        return False
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_VISIT_REMINDER,
        data={
            'thing1': {'value': (appointment.purpose or '访视')[:20]},
            'date2': {'value': appointment.appointment_date.strftime('%Y-%m-%d')},
            'thing3': {'value': '请按时到达，如有变动请提前联系'},
        },
        page='pages/appointment/index',
    )


def notify_payment_arrival(subject, payment) -> bool:
    """礼金到账通知"""
    openid = _get_subject_openid(subject)
    if not openid or not TEMPLATE_PAYMENT_ARRIVAL:
        return False
    type_labels = {
        'visit_compensation': '到访礼金',
        'transportation': '交通补贴',
        'meal': '餐饮补贴',
        'completion_bonus': '完成奖金',
        'referral': '推荐奖励',
        'other': '其他补偿',
    }
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_PAYMENT_ARRIVAL,
        data={
            'amount1': {'value': f'¥{payment.amount}'},
            'thing2': {'value': type_labels.get(payment.payment_type, '补偿')[:20]},
            'time3': {'value': payment.paid_at.strftime('%Y-%m-%d %H:%M') if payment.paid_at else ''},
        },
        page='pages/payment/index',
    )


def notify_questionnaire_due(subject, assignment) -> bool:
    """问卷即将到期提醒"""
    openid = _get_subject_openid(subject)
    if not openid or not TEMPLATE_QUESTIONNAIRE_DUE:
        return False
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_QUESTIONNAIRE_DUE,
        data={
            'thing1': {'value': (assignment.template.template_name if assignment.template else '问卷')[:20]},
            'date2': {'value': assignment.due_date.strftime('%Y-%m-%d') if assignment.due_date else ''},
            'thing3': {'value': '请尽快完成填写，避免逾期'},
        },
        page='pages/questionnaire/index',
    )


def notify_ae_followup(subject, adverse_event, followup) -> bool:
    """AE 随访进展通知（发送给受试者）"""
    openid = _get_subject_openid(subject)
    if not openid or not TEMPLATE_AE_FOLLOWUP:
        return False
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_AE_FOLLOWUP,
        data={
            'thing1': {'value': (adverse_event.description or '不良反应事件')[:20]},
            'phrase2': {'value': (followup.current_status or '跟进中')[:5]},
            'date3': {'value': followup.next_followup_date.strftime('%Y-%m-%d') if followup.next_followup_date else '待定'},
        },
        page='pages/report/history',
    )


def notify_queue_call(subject, station_info: str = '') -> bool:
    """叫号通知（请前往窗口）"""
    openid = _get_subject_openid(subject)
    if not openid or not TEMPLATE_QUEUE_CALL:
        return False
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_QUEUE_CALL,
        data={
            'thing1': {'value': f'请前往{station_info or "服务窗口"}'},
            'thing2': {'value': '工作人员已准备好，请尽快前往'},
        },
        page='pages/queue/index',
    )


def notify_product_expiry(subject, product_name: str, expiry_date) -> bool:
    """产品效期预警通知"""
    openid = _get_subject_openid(subject)
    if not openid or not TEMPLATE_EXPIRY_ALERT:
        return False
    return send_subscribe_message(
        openid=openid,
        template_id=TEMPLATE_EXPIRY_ALERT,
        data={
            'thing1': {'value': product_name[:20]},
            'date2': {'value': expiry_date.strftime('%Y-%m-%d') if expiry_date else ''},
            'thing3': {'value': '请在下次访视时携带至现场'},
        },
        page='pages/index/index',
    )
