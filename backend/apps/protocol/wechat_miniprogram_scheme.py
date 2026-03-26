"""微信小程序 URL Scheme（generatescheme），用于 H5 落地页 302 跳转打开小程序指定页。"""
from __future__ import annotations

import json
import logging
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)


def _ssl_context_for_wechat() -> ssl.SSLContext:
    """使用 certifi CA 包，避免 macOS/部分环境下 urllib 默认证书链不全导致 SSL 校验失败。"""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception as e:  # pragma: no cover - 极端环境回退
        logger.warning('certifi ssl context failed, fallback to default: %s', e)
        return ssl.create_default_context()


def _urlopen(req: urllib.request.Request, *, timeout: float):
    return urllib.request.urlopen(req, timeout=timeout, context=_ssl_context_for_wechat())


# 微信文档：expire_interval 单位秒，最长 30 天；过短会导致用户稍晚扫码即失效
_CONSENT_SCHEME_EXPIRE_SECONDS = 86400  # 1 天

# generatescheme 必须用主包页路径；直接填分包路径时微信常报 invalid weapp pagepath（与是否上传分包无关）。
# 落地后由小程序首页根据 query 再 redirectTo 至下方分包知情页（见 apps/wechat-mini/src/pages/index/index.tsx）。
CONSENT_TEST_SCAN_SCHEME_ENTRY_PATH = 'pages/index/index'
# 最终业务页（供兜底页说明；勿用于 generatescheme 的 path 字段）
CONSENT_TEST_SCAN_MINIPROGRAM_PATH = 'subpackages/pkg/pages/consent/index'


def _scheme_env_version() -> str:
    v = getattr(settings, 'WECHAT_SCHEME_ENV_VERSION', None) or 'release'
    s = str(v).strip().lower()
    return s if s in ('release', 'trial', 'develop') else 'release'


def _wechat_api_err_hint(errcode: int, errmsg: Optional[str]) -> str:
    em = (errmsg or '').strip()
    tips: dict[int, str] = {
        -1: '系统繁忙，请稍后重试',
        40001: '获取 access_token 时 AppSecret 错误，或 access_token 无效',
        40013: 'AppID 无效（请确认填写的是「小程序」AppID，且与微信后台一致）',
        40125: 'Secret 与 AppID 不匹配或未生效',
        40164: (
            '当前服务器出口 IP 未加入小程序「开发设置 → IP 白名单」（获取 token / generatescheme 均需）。'
            '请在微信公众平台把日志中的公网 IP 加入白名单；家庭宽带等出口 IP 变化时需同步更新'
        ),
        40165: 'path 或 query 不合法（请检查分包路径是否已发布、参数是否超长）',
        40097: '参数错误（如 query 过长或含非法字符）',
        44990: '触发频率限制，请稍后再试',
        85079: '小程序未发布或不存在',
    }
    head = tips.get(errcode, f'errcode={errcode}')
    out = f'{head}。官方返回：{em}' if em else head
    if em and 'invalid weapp pagepath' in em.lower():
        out += (
            '。排查：该 path 在微信侧「当前 env_version 对应的已上传代码包」中不存在。'
            '请先在微信开发者工具上传含该页的构建产物（apps/wechat-mini：`pnpm run build:weapp` 后上传 dist）；'
            '若仅体验版含该页可设 WECHAT_SCHEME_ENV_VERSION=trial，已发正式版则 release。'
        )
    return out


def fetch_wechat_access_token_live() -> Tuple[bool, str]:
    """
    供 manage.py 自检：真实请求微信，不调用 generatescheme。
    返回 (成功, 说明)；失败时说明可直接给用户看（不含密钥）。
    """
    appid = (getattr(settings, 'WECHAT_APPID', None) or '').strip()
    secret = (getattr(settings, 'WECHAT_SECRET', None) or '').strip()
    if not appid or not secret:
        return False, '未配置 WECHAT_APPID / WECHAT_SECRET'
    token, hint = _client_credential_token_with_hint()
    if token:
        return True, '已向 api.weixin.qq.com 成功换取 access_token'
    return False, hint


def _client_credential_token_with_hint() -> Tuple[Optional[str], str]:
    """
    换取 client_credential access_token。
    成功：(token, '')；失败：(None, 面向运维的中文说明)。
    """
    appid = (getattr(settings, 'WECHAT_APPID', None) or '').strip()
    secret = (getattr(settings, 'WECHAT_SECRET', None) or '').strip()
    if not appid or not secret:
        return None, (
            '未在环境变量中配置 WECHAT_APPID / WECHAT_SECRET。请在 backend/.env 中填写与 '
            'apps/wechat-mini 一致的小程序 AppID 与 AppSecret，保存后重启 Django。'
        )
    url = (
        'https://api.weixin.qq.com/cgi-bin/token?'
        f'grant_type=client_credential&appid={urllib.parse.quote(appid, safe="")}&secret={urllib.parse.quote(secret, safe="")}'
    )
    try:
        with _urlopen(urllib.request.Request(url), timeout=12) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
    except urllib.error.URLError as e:
        logger.warning('wechat client_credential_token failed (network): %s', e)
        return None, (
            '无法访问微信服务器 https://api.weixin.qq.com（网络错误）。请检查本机能否出网、代理、'
            f'防火墙是否拦截。详情：{e!s}'
        )
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning('wechat client_credential_token failed (parse): %s', e)
        return None, f'解析微信 token 接口响应失败：{e!s}'
    err = raw.get('errcode')
    if err not in (None, 0):
        hint = _wechat_api_err_hint(int(err), raw.get('errmsg'))
        logger.warning('wechat token errcode=%s errmsg=%s', err, raw.get('errmsg'))
        return None, f'换取 access_token 失败：{hint}'
    tok = raw.get('access_token')
    if not tok:
        return None, '微信 token 接口未返回 access_token 字段'
    return str(tok).strip(), ''


def generate_miniprogram_scheme_openlink(path: str, query: str) -> Tuple[Optional[str], str]:
    """
    调用 wxa/generatescheme，返回 (openlink, failure_hint)。
    openlink 非空时 failure_hint 恒为空串；失败时 failure_hint 为面向运维/用户的说明（不含密钥）。
    path 不要前导 /；query 不要带前导 ?。
    """
    token, thint = _client_credential_token_with_hint()
    if not token:
        return None, thint

    api = f'https://api.weixin.qq.com/wxa/generatescheme?access_token={urllib.parse.quote(token, safe="")}'
    body = {
        'jump_wxa': {
            'path': path,
            'query': query,
            'env_version': _scheme_env_version(),
        },
        'is_expire': True,
        'expire_interval': _CONSENT_SCHEME_EXPIRE_SECONDS,
    }
    try:
        req = urllib.request.Request(
            api,
            data=json.dumps(body).encode('utf-8'),
            headers={'Content-Type': 'application/json; charset=utf-8'},
            method='POST',
        )
        with _urlopen(req, timeout=15) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
    except urllib.error.URLError as e:
        logger.warning('generatescheme request failed (network): %s', e)
        return None, f'调用 generatescheme 网络失败：{e!s}'
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning('generatescheme request failed (parse): %s', e)
        return None, f'解析 generatescheme 响应失败：{e!s}'

    err = raw.get('errcode')
    if err not in (None, 0):
        hint = _wechat_api_err_hint(int(err), raw.get('errmsg'))
        logger.warning('generatescheme errcode=%s errmsg=%s', err, raw.get('errmsg'))
        return None, f'generatescheme 失败：{hint}'

    link = raw.get('openlink')
    if not link:
        return None, '微信 generatescheme 成功但未返回 openlink 字段'
    return str(link).strip(), ''
