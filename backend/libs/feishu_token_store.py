"""
飞书用户令牌持久化与自动续期 — 无 Django 依赖的独立模块

【设计目的】
feishu_client.py 顶层依赖 `from django.conf import settings`，
在 Django 运行时之外（ops/scripts、tests、独立工具）无法直接 import。
本模块将令牌的"读 / 刷新 / 写"逻辑从 feishu_client 抽出，
使任何 Python 上下文都能安全调用，彻底消除"因为 import 困难就绕开写
内联 HTTP token 代码"的根因。

【使用方式 — 在任何上下文】
    from libs.feishu_token_store import FeishuTokenStore

    store = FeishuTokenStore()
    token = store.get_valid_token(
        app_id='cli_xxx',
        app_secret='xxx',
    )
    # token 是有效的 user_access_token，可直接用于飞书 API Authorization 头

    # 在 Django 上下文内同样可用（feishu_client 直接导入本模块）：
    from libs.feishu_token_store import FeishuTokenStore, default_store
    token = default_store.get_valid_token()   # 自动从 settings 或 env 读凭证

【令牌文件位置】
    backend/data/feishu_user_tokens.json

【绝不允许的做法】
    ❌ 在 ops/scripts、tests 或任何其他文件里内联 authen/v2/oauth/token HTTP 调用
    ❌ 用 urllib.request / requests / httpx 自己写 refresh_token 交换逻辑
    ✅ 统一使用本模块的 FeishuTokenStore.get_valid_token()
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

FEISHU_TOKEN_API = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token'
TOKEN_BUFFER_SECONDS = 300  # access_token 过期前 5 分钟开始刷新


def _resolve_store_path() -> Path:
    """
    按优先级确定 token 文件路径（不依赖 Django）：
    1. 环境变量 FEISHU_USER_TOKEN_PATH
    2. backend/data/feishu_user_tokens.json（相对于本文件向上两级）
    """
    env_path = os.environ.get('FEISHU_USER_TOKEN_PATH', '')
    if env_path:
        p = Path(env_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    base = Path(__file__).resolve().parent.parent  # backend/
    p = base / 'data' / 'feishu_user_tokens.json'
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


class FeishuTokenStore:
    """
    飞书 user_access_token 持久化 + 自动续期。

    无任何 Django 依赖，可在 ops/scripts、tests、Django 视图层等任意上下文使用。

    典型用法：
        store = FeishuTokenStore()
        token = store.get_valid_token(app_id=APP_ID, app_secret=APP_SECRET)

    Django 上下文内的用法（自动读凭证）：
        from libs.feishu_token_store import default_store
        token = default_store.get_valid_token()
    """

    def __init__(self, store_path: str | Path | None = None):
        self._path: Path = Path(store_path) if store_path else _resolve_store_path()
        self._path.parent.mkdir(parents=True, exist_ok=True)

    # ── 读写 ──────────────────────────────────────────────────────────────────

    def load(self) -> Optional[Dict[str, Any]]:
        """从文件加载 token 数据，文件不存在或格式错误时返回 None。"""
        if not self._path.exists():
            return None
        try:
            return json.loads(self._path.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning('读取 token 文件失败: %s', exc)
            return None

    def save(self, data: Dict[str, Any]) -> None:
        """
        持久化 token 数据。

        规则（来自 feishu-token-persistence.mdc）：
        - refresh_token 非空时才写入（绝不用空值覆盖）
        - refresh_expires_at 不允许为 None
        """
        existing = self.load() or {}
        # 防止空 refresh_token 覆盖已有值
        if not data.get('refresh_token') and existing.get('refresh_token'):
            data['refresh_token'] = existing['refresh_token']
        data['updated_at'] = time.strftime('%Y-%m-%dT%H:%M:%S')
        self._path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding='utf-8',
        )
        logger.info('user_access_token 已持久化 → %s', self._path)

    def clear(self) -> None:
        if self._path.exists():
            self._path.unlink()

    # ── 刷新 ─────────────────────────────────────────────────────────────────

    def refresh(self, refresh_token: str, app_id: str, app_secret: str) -> Dict[str, Any]:
        """
        用 refresh_token 换取新的 access_token + refresh_token 并持久化。

        飞书 refresh_token 是单次有效（rolling renewal）：
        - 必须立刻把新 refresh_token 写回持久化存储
        - 新 token 写入成功后旧 refresh_token 即作废

        Returns:
            包含 access_token, refresh_token, expires_in 等字段的字典
        Raises:
            RuntimeError: 刷新失败（飞书返回非 0 code）
        """
        resp = httpx.post(
            FEISHU_TOKEN_API,
            json={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'client_id': app_id,
                'client_secret': app_secret,
            },
            headers={'Content-Type': 'application/json'},
            timeout=15.0,
        )
        result = resp.json()
        if result.get('code') != 0:
            raise RuntimeError(
                f"飞书 refresh_token 刷新失败 code={result.get('code')} "
                f"msg={result.get('msg') or result.get('error_description', '未知错误')}"
            )

        existing = self.load() or {}
        new_data = {
            **existing,
            'access_token': result['access_token'],
            'refresh_token': result.get('refresh_token') or existing.get('refresh_token', ''),
            'expires_at': time.time() + result.get('expires_in', 7200) - TOKEN_BUFFER_SECONDS,
            'obtained_at': existing.get('obtained_at', time.strftime('%Y-%m-%dT%H:%M:%S')),
        }
        if result.get('refresh_token_expires_in'):
            new_data['refresh_expires_at'] = (
                time.time() + result['refresh_token_expires_in'] - TOKEN_BUFFER_SECONDS
            )
        self.save(new_data)
        logger.info('user_access_token 已自动续期')
        return new_data

    # ── 主入口 ────────────────────────────────────────────────────────────────

    def get_valid_token(
        self,
        app_id: str | None = None,
        app_secret: str | None = None,
    ) -> str:
        """
        返回有效的 user_access_token（自动处理过期/续期）。

        若未传入凭证，依次从以下来源读取：
          1. 环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET
          2. Django settings（在 Django 上下文内自动可用）

        Raises:
            RuntimeError: token 文件不存在、refresh_token 失效等情况
        """
        _app_id = app_id or os.environ.get('FEISHU_APP_ID', '') or self._get_django_setting('FEISHU_APP_ID')
        _app_secret = app_secret or os.environ.get('FEISHU_APP_SECRET', '') or self._get_django_setting('FEISHU_APP_SECRET')

        data = self.load()
        if not data:
            raise RuntimeError(
                'user_access_token 不存在，请先运行:\n'
                '  python manage.py obtain_feishu_user_token\n'
                '或:\n'
                '  python ops/scripts/init_wiki.py'
            )

        # access_token 未过期 → 直接返回
        if time.time() < data.get('expires_at', 0):
            return data['access_token']

        # access_token 已过期 → 用 refresh_token 续期
        rt = data.get('refresh_token', '')
        if not rt:
            raise RuntimeError(
                'refresh_token 为空，请重新运行 obtain_feishu_user_token'
            )
        if not _app_id or not _app_secret:
            raise RuntimeError(
                '需要 app_id/app_secret 进行 token 续期，'
                '请通过参数或环境变量 FEISHU_APP_ID/FEISHU_APP_SECRET 提供'
            )

        logger.info('user_access_token 已过期，自动续期中...')
        refreshed = self.refresh(rt, _app_id, _app_secret)
        return refreshed['access_token']

    @staticmethod
    def _get_django_setting(key: str, default: str = '') -> str:
        """安全地从 Django settings 读取配置，Django 未初始化时返回 default。"""
        try:
            from django.conf import settings as django_settings  # noqa: PLC0415
            return getattr(django_settings, key, default)
        except Exception:  # noqa: BLE001
            return default


# ── 全局单例（Django 上下文和非 Django 上下文均可用）────────────────────────────
default_store = FeishuTokenStore()
