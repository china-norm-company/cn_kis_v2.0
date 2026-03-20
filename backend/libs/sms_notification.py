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
