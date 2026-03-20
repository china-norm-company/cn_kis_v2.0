"""
实名认证服务 — 基于火山引擎 SDK (volc-sdk-python)

链路：
  子账号 AK/SK → STS AssumeRole → 临时凭证 →
  VisualService.cert_h5_token → byted_token →
  用户 H5 人脸核身 →
  VisualService.cert_verify_query → 查询结果
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger('cn_kis.identity')


@dataclass
class IdentityProviderPayload:
    byted_token: str
    h5_config_id: str


def get_identity_provider_payload(
    idcard_name: str = '',
    idcard_no: str = '',
) -> IdentityProviderPayload:
    """
    通过 SDK 调用 CertH5Token 获取 byted_token。
    """
    h5_config_id = _get_setting('IDENTITY_VERIFY_H5_CONFIG_ID')
    if not _is_sdk_config_ready():
        logger.warning('identity SDK config not ready')
        return IdentityProviderPayload(byted_token='', h5_config_id=h5_config_id)

    try:
        tmp_cred = _get_sts_credentials()
    except Exception as exc:
        logger.error('STS AssumeRole failed: %s', exc)
        return IdentityProviderPayload(byted_token='', h5_config_id=h5_config_id)

    try:
        byted_token = _call_cert_h5_token(tmp_cred, h5_config_id, idcard_name, idcard_no)
    except Exception as exc:
        logger.error('CertH5Token failed: %s', exc)
        return IdentityProviderPayload(byted_token='', h5_config_id=h5_config_id)

    return IdentityProviderPayload(byted_token=byted_token, h5_config_id=h5_config_id)


def query_verify_result(byted_token: str) -> dict:
    """
    查询认证结果。
    """
    if not byted_token:
        return {'result': False, 'error': 'empty byted_token'}

    try:
        tmp_cred = _get_sts_credentials()
    except Exception as exc:
        logger.error('STS AssumeRole failed for query: %s', exc)
        return {'result': False, 'error': str(exc)}

    from volcengine.visual.VisualService import VisualService
    svc = VisualService()
    svc.set_ak(tmp_cred['ak'])
    svc.set_sk(tmp_cred['sk'])
    svc.set_session_token(tmp_cred['token'])

    form = {
        'req_key': 'cert_verify_query',
        'byted_token': byted_token,
    }

    try:
        resp = svc.cert_verify_query(form)
    except Exception as exc:
        error_str = str(exc)
        import json, re
        m = re.search(r"b'(\{.*\})'", error_str)
        if m:
            try:
                resp = json.loads(m.group(1))
            except Exception:
                return {'result': False, 'error': error_str[:200]}
        else:
            return {'result': False, 'error': error_str[:200]}

    code = resp.get('code') or resp.get('status')
    if code == 10000:
        data = resp.get('data', {})
        source_comp = data.get('source_comp_details', {}) or {}
        return {
            'result': data.get('result', False),
            'images': data.get('images', {}),
            'request_id': resp.get('request_id', ''),
            'risk_result': data.get('risk_result', ''),
            'verify_score': source_comp.get('score'),
            'verify_thresholds': source_comp.get('thresholds', {}),
            'raw_status': code,
            'raw_response': resp,
        }
    return {
        'result': False,
        'error': resp.get('message', 'unknown'),
        'request_id': resp.get('request_id', ''),
        'raw_status': code,
        'raw_response': resp,
    }


def get_identity_provider_config_state() -> dict:
    """
    返回 SDK 配置就绪状态。
    """
    return {
        'sdk_ready': _is_sdk_config_ready(),
        'h5_config_id_set': bool(_get_setting('IDENTITY_VERIFY_H5_CONFIG_ID')),
        'sub_ak_set': bool(_get_setting('VOLC_SUB_ACCESSKEY')),
        'role_trn_set': bool(_get_setting('VOLC_CERT_ROLE_TRN')),
        'callback_token_set': bool(_get_setting('IDENTITY_VERIFY_CALLBACK_TOKEN')),
    }


def idcard_ocr_preview(image_base64: str) -> dict:
    """
    可选增强：身份证 OCR 预填（与 L2 核验解耦，不参与认证结论）。
    """
    if not image_base64:
        return {'ok': False, 'error': 'empty image'}
    if not _is_sdk_config_ready():
        return {'ok': False, 'error': 'sdk config not ready'}
    try:
        tmp_cred = _get_sts_credentials()
    except Exception as exc:
        return {'ok': False, 'error': f'sts failed: {exc}'}

    from volcengine.visual.VisualService import VisualService
    svc = VisualService()
    svc.set_ak(tmp_cred['ak'])
    svc.set_sk(tmp_cred['sk'])
    svc.set_session_token(tmp_cred['token'])
    try:
        # OCR 仅作为信息提取，不用于实名结论；具体 req_key 以控制台配置为准。
        resp = svc.common_handler({
            'req_key': 'idcard_ocr',
            'image_base64': image_base64,
        })
    except Exception as exc:
        return {'ok': False, 'error': str(exc)[:200]}
    return {'ok': True, 'data': resp}


# ─── internal ────────────────────────────────────────────────────────────────

def _get_setting(name: str) -> str:
    return str(getattr(settings, name, '') or '').strip()


def _is_sdk_config_ready() -> bool:
    return all([
        _get_setting('VOLC_SUB_ACCESSKEY'),
        _get_setting('VOLC_SUB_SECRETKEY'),
        _get_setting('VOLC_CERT_ROLE_TRN'),
        _get_setting('IDENTITY_VERIFY_H5_CONFIG_ID'),
    ])


def _get_sts_credentials() -> dict:
    """STS AssumeRole → 临时 AK/SK/Token"""
    from volcengine.sts.StsService import StsService

    sub_ak = _get_setting('VOLC_SUB_ACCESSKEY')
    sub_sk = _get_setting('VOLC_SUB_SECRETKEY')
    role_trn = _get_setting('VOLC_CERT_ROLE_TRN')

    sts = StsService()
    sts.set_ak(sub_ak)
    sts.set_sk(sub_sk)

    resp = sts.assume_role({
        'DurationSeconds': '900',
        'RoleSessionName': 'cn_kis_cert',
        'RoleTrn': role_trn,
    })

    cred = resp.get('Result', {}).get('Credentials', {})
    if not cred.get('AccessKeyId'):
        raise RuntimeError(f'STS AssumeRole returned empty credentials: {resp}')

    return {
        'ak': cred['AccessKeyId'],
        'sk': cred['SecretAccessKey'],
        'token': cred['SessionToken'],
    }


def _call_cert_h5_token(
    tmp_cred: dict,
    h5_config_id: str,
    idcard_name: str,
    idcard_no: str,
) -> str:
    """调用 CertH5Token 获取 byted_token"""
    from volcengine.visual.VisualService import VisualService

    svc = VisualService()
    svc.set_ak(tmp_cred['ak'])
    svc.set_sk(tmp_cred['sk'])
    svc.set_session_token(tmp_cred['token'])

    form = {
        'req_key': 'cert_h5_token',
        'h5_config_id': h5_config_id,
        'sts_token': tmp_cred['token'],
    }
    if idcard_name and idcard_no:
        form['idcard_name'] = idcard_name
        form['idcard_no'] = idcard_no

    import json, re

    try:
        resp = svc.cert_h5_token(form)
    except Exception as exc:
        error_str = str(exc)
        m = re.search(r"b'(\{.*\})'", error_str)
        if m:
            try:
                resp = json.loads(m.group(1))
            except Exception:
                raise RuntimeError(error_str[:300]) from exc
        else:
            raise

    code = resp.get('code') or resp.get('status')
    if code != 10000:
        raise RuntimeError(f'CertH5Token error: {resp.get("message", "")} (code={code})')

    byted_token = (resp.get('data') or {}).get('byted_token', '')
    if not byted_token:
        raise RuntimeError(f'CertH5Token returned empty byted_token: {resp}')

    logger.info('CertH5Token success, byted_token=%s...', byted_token[:20])
    return byted_token
