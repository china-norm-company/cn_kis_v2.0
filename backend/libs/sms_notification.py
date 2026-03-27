"""
短信通知服务（非验证码类）

通过火山引擎 SMS SDK 发送通知类短信（访视提醒、筛选结果、付款通知等）。
验证码短信已独立使用 send_sms_verify_code / check_sms_verify_code，
本模块仅处理通知类短信。

配置项（环境变量）：
  VOLC_ACCESSKEY / VOLC_SECRETKEY  — 火山引擎主账号 AK/SK
  SMS_ACCOUNT                      — 消息组 ID
  SMS_SIGN_NAME                    — 签名内容
  SMS_PROVIDER                     — volcengine | mock（默认 mock）
"""
import json
import logging
import os
from typing import Optional

try:
    from volcengine.sms.SmsService import SmsService
except Exception:
    SmsService = None

logger = logging.getLogger('cn_kis.sms')

SMS_PROVIDER = os.getenv('SMS_PROVIDER', 'mock')


def send_sms(phone: str, template_id: str, params: Optional[dict] = None) -> bool:
    if not phone or len(phone) < 11:
        logger.warning('短信发送失败: 无效手机号 %s', phone)
        return False

    if SMS_PROVIDER == 'mock':
        logger.info('[MOCK SMS] to=%s, tpl=%s, params=%s', phone, template_id, params)
        return True

    if SMS_PROVIDER == 'volcengine':
        return _send_via_volcengine(phone, template_id, params or {})

    logger.warning('未知 SMS_PROVIDER: %s', SMS_PROVIDER)
    return False


def _send_via_volcengine(phone: str, template_id: str, params: dict) -> bool:
    """火山引擎通知类短信（SDK send_sms）"""
    try:
        ak = os.getenv('VOLC_ACCESSKEY', '')
        sk = os.getenv('VOLC_SECRETKEY', '')
        sms_account = os.getenv('SMS_ACCOUNT', '')
        sign_name = os.getenv('SMS_SIGN_NAME', '')

        if not (SmsService and ak and sk and sms_account):
            logger.error('火山短信配置不完整: 缺少 SmsService/VOLC_ACCESSKEY/VOLC_SECRETKEY/SMS_ACCOUNT')
            return False

        svc = SmsService()
        svc.set_ak(ak)
        svc.set_sk(sk)

        body = {
            'SmsAccount': sms_account,
            'Sign': sign_name,
            'TemplateID': template_id,
            'TemplateParam': json.dumps(params) if params else '{}',
            'PhoneNumbers': phone,
        }

        resp = svc.send_sms(json.dumps(body))
        if isinstance(resp, str):
            resp = json.loads(resp)

        error = (resp or {}).get('ResponseMetadata', {}).get('Error', {})
        if error and error.get('Code'):
            logger.error('火山短信失败: %s', resp)
            return False
        logger.info('火山短信成功: phone=%s, tpl=%s', phone[-4:], template_id)
        return True
    except Exception as e:
        logger.error('火山短信异常: %s', e)
        return False


SMS_TEMPLATES = {
    'visit_reminder': os.getenv('SMS_TPL_VISIT_REMINDER', 'TPL_VISIT'),
    'screening_result': os.getenv('SMS_TPL_SCREENING_RESULT', 'TPL_SCREEN'),
    'payment': os.getenv('SMS_TPL_PAYMENT', 'TPL_PAY'),
    'enrollment': os.getenv('SMS_TPL_ENROLLMENT', 'TPL_ENROLL'),
    'recruitment_invite': os.getenv('SMS_TPL_RECRUITMENT_INVITE', ''),
}


def sms_visit_reminder(phone: str, subject_name: str, visit_date: str, project_name: str = '') -> bool:
    return send_sms(phone, SMS_TEMPLATES['visit_reminder'], {
        'name': subject_name, 'date': visit_date, 'project': project_name,
    })


def sms_screening_result(phone: str, subject_name: str, result: str) -> bool:
    return send_sms(phone, SMS_TEMPLATES['screening_result'], {
        'name': subject_name, 'result': result,
    })


def sms_payment_notification(phone: str, subject_name: str, amount: str) -> bool:
    return send_sms(phone, SMS_TEMPLATES['payment'], {
        'name': subject_name, 'amount': amount,
    })


def sms_enrollment_welcome(phone: str, subject_name: str, project_name: str = '') -> bool:
    return send_sms(phone, SMS_TEMPLATES['enrollment'], {
        'name': subject_name, 'project': project_name,
    })


def sms_recruitment_invite(phone: str, subject_name: str, project_name: str, plan_id: int,
                            miniprogram_path: str = '') -> bool:
    """
    向受试者库中的候选人发送招募邀请短信。

    短信内容（需在火山引擎后台申请审核，模板变量：name/project/appname）：
        【{sign}】{name}您好，我们正在招募"{project}"研究受试者，
        您可能符合参与条件。请微信搜索"{appname}"小程序查看详情并报名。
        如不需要请回复TD退订。

    Args:
        phone:          目标手机号
        subject_name:   受试者姓名（脱敏：仅名字第一字 + "先生/女士" 也可）
        project_name:   招募项目名称（不超过20字）
        plan_id:        招募计划 ID（用于日志追踪，不发送到短信中）
        miniprogram_path: 小程序内跳转路径（未来支持短链时使用，当前留空）

    Returns:
        True 发送成功
    """
    tpl = SMS_TEMPLATES.get('recruitment_invite', '')
    if not tpl:
        logger.warning('招募邀请短信跳过：SMS_TPL_RECRUITMENT_INVITE 未配置 (plan_id=%s)', plan_id)
        return False

    return send_sms(phone, tpl, {
        'name': subject_name,
        'project': project_name[:20],
        'appname': 'UTest受试者',
    })
