"""
飞书统一 API 客户端

所有飞书开放平台 API 调用的唯一入口。
功能：Token 缓存、统一错误处理、消息/审批/日历/多维表格 API 封装。

Token 管理策略：
- tenant_access_token：内存缓存，过期前自动刷新（适用大部分 API）
- user_access_token：文件持久化 + 自动刷新（仅用于飞书明确要求用户身份的 API，如创建知识空间）
  用户只需通过 `python manage.py obtain_feishu_user_token` 授权一次，
  系统通过 refresh_token（30天有效，刷新续期）永续维持访问。

使用方式：
    from libs.feishu_client import feishu_client
    feishu_client.send_message(receive_id='ou_xxx', msg_type='text', content='hello')
    # 需要用户身份时：
    token = feishu_client.get_user_token()  # 自动从持久化存储获取+刷新
"""
import json as json_mod
import os
import time
import logging
import threading
from pathlib import Path
from typing import Optional, Dict, Any, List

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

# ============================================================================
# 异常定义
# ============================================================================

class FeishuAPIError(Exception):
    """飞书 API 调用失败"""

    def __init__(self, code: int, msg: str, api: str = ''):
        self.code = code
        self.msg = msg
        self.api = api
        super().__init__(f"飞书API错误 [{api}] code={code}: {msg}")


# ============================================================================
# 用户令牌持久化存储
# ============================================================================

class FeishuUserTokenStore:
    """
    飞书用户令牌持久化存储

    解决的问题：部分飞书 API（如创建知识空间）只接受 user_access_token，
    但 OAuth 授权码是一次性的。本类将 refresh_token 持久化到文件，
    实现"授权一次，永续使用"。

    存储格式（JSON 文件）：
    {
        "access_token": "u-xxx",
        "refresh_token": "ur-xxx",
        "expires_at": 1700000000.0,   # access_token 过期的 Unix 时间戳
        "open_id": "ou_xxx",
        "obtained_at": "2026-02-18T12:00:00"
    }

    refresh_token 有效期 30 天，每次刷新会获得新的 refresh_token（滚动续期），
    只要系统在 30 天内至少使用一次 user_access_token，就永远不会过期。
    """

    DEFAULT_PATH = 'data/feishu_user_tokens.json'

    def __init__(self, store_path: str = None):
        self._explicit_path = store_path
        self._resolved_path: Optional[Path] = None

    @property
    def _path(self) -> Path:
        if self._resolved_path is None:
            if self._explicit_path:
                self._resolved_path = Path(self._explicit_path)
            else:
                base = getattr(settings, 'BASE_DIR', Path(__file__).resolve().parent.parent)
                self._resolved_path = Path(base) / self.DEFAULT_PATH
            self._resolved_path.parent.mkdir(parents=True, exist_ok=True)
        return self._resolved_path

    def load(self) -> Optional[Dict[str, Any]]:
        if not self._path.exists():
            return None
        try:
            return json_mod.loads(self._path.read_text(encoding='utf-8'))
        except (json_mod.JSONDecodeError, OSError) as e:
            logger.warning(f'读取用户令牌文件失败: {e}')
            return None

    def save(self, data: Dict[str, Any]) -> None:
        data['updated_at'] = time.strftime('%Y-%m-%dT%H:%M:%S')
        self._path.write_text(
            json_mod.dumps(data, indent=2, ensure_ascii=False),
            encoding='utf-8',
        )
        logger.info(f'用户令牌已持久化到 {self._path}')

    def clear(self) -> None:
        if self._path.exists():
            self._path.unlink()


class TokenBucketRateLimiter:
    """简单令牌桶限速器，用于高频读取接口的本地节流。"""

    def __init__(self, capacity: int, refill_rate_per_second: float):
        self.capacity = max(float(capacity), 1.0)
        self.refill_rate_per_second = max(float(refill_rate_per_second), 0.0001)
        self.tokens = self.capacity
        self.updated_at = time.time()
        self._lock = threading.Lock()

    def acquire(self, tokens: float = 1.0) -> None:
        required = max(float(tokens), 0.0)
        while True:
            wait_seconds = 0.0
            with self._lock:
                now = time.time()
                elapsed = max(now - self.updated_at, 0.0)
                self.tokens = min(
                    self.capacity,
                    self.tokens + elapsed * self.refill_rate_per_second,
                )
                self.updated_at = now

                if self.tokens >= required:
                    self.tokens -= required
                    return

                missing = required - self.tokens
                wait_seconds = missing / self.refill_rate_per_second

            time.sleep(wait_seconds)


# ============================================================================
# 飞书客户端
# ============================================================================

class FeishuClient:
    """
    统一飞书 API 客户端

    - tenant_access_token：内存缓存，自动刷新
    - user_access_token：文件持久化 + 自动刷新（通过 refresh_token）
    - 统一错误处理（飞书返回非 0 code 时抛出 FeishuAPIError）
    - 覆盖：消息、审批、日历、多维表格、任务、知识库 API
    """

    BASE_URL = 'https://open.feishu.cn/open-apis'
    TOKEN_BUFFER_SECONDS = 300  # Token 过期前 5 分钟刷新
    DEFAULT_RETRY = 2
    RATE_LIMIT_RETRY = 4
    MESSAGE_RATE_LIMIT_KEY = 'im_messages_per_minute'
    MESSAGE_RATE_LIMIT_CAPACITY = 60
    MESSAGE_RATE_LIMIT_REFILL_PER_SECOND = 1.0

    def __init__(self):
        # app_id 级缓存，避免多工作台共用同一 tenant_token 导致跨应用鉴权失败
        # 结构: {app_id: {"token": str, "expires_at": float}}
        self._tenant_tokens: Dict[str, Dict[str, Any]] = {}
        self._user_token_store = FeishuUserTokenStore()
        self._rate_limiters: Dict[str, TokenBucketRateLimiter] = {}

    # ========================================================================
    # Token 管理
    # ========================================================================

    def get_tenant_token(self, app_id: str = None, app_secret: str = None) -> str:
        """
        获取 tenant_access_token（带缓存）

        有效期内直接返回缓存的 Token，过期前自动刷新。
        """
        app_id = app_id or settings.FEISHU_APP_ID
        app_secret = app_secret or settings.FEISHU_APP_SECRET
        now = time.time()

        cached = self._tenant_tokens.get(app_id)
        if cached and now < float(cached.get('expires_at', 0)):
            token = cached.get('token')
            if isinstance(token, str) and token:
                return token

        resp = httpx.post(
            f'{self.BASE_URL}/auth/v3/tenant_access_token/internal',
            json={'app_id': app_id, 'app_secret': app_secret},
            timeout=10.0,
        )
        data = resp.json()
        if data.get('code') != 0:
            raise FeishuAPIError(
                code=data.get('code', -1),
                msg=data.get('msg', '未知错误'),
                api='auth/v3/tenant_access_token/internal',
            )

        token = data['tenant_access_token']
        expire = data.get('expire', 7200)
        self._tenant_tokens[app_id] = {
            'token': token,
            'expires_at': now + expire - self.TOKEN_BUFFER_SECONDS,
        }
        logger.info(f"飞书 tenant_token 已刷新 app_id={app_id} 有效期 {expire}s")
        return token

    def _headers(self, app_id: str = None, app_secret: str = None) -> Dict[str, str]:
        """构建带 Authorization 的请求头"""
        token = self.get_tenant_token(app_id, app_secret)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }

    def _request(
        self,
        method: str,
        path: str,
        json: Dict = None,
        params: Dict = None,
        timeout: float = 15.0,
        app_id: str = None,
        app_secret: str = None,
        retry: Optional[int] = None,
        rate_limit_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        统一请求方法

        自动带 Token，统一错误处理。
        返回飞书响应的 data 字段。
        """
        url = f'{self.BASE_URL}/{path}'
        headers = self._headers(app_id, app_secret)

        resp = self.request_with_retry(
            method=method,
            url=url,
            headers=headers,
            json=json,
            params=params,
            timeout=timeout,
            retry=self.DEFAULT_RETRY if retry is None else retry,
            rate_limit_key=rate_limit_key,
        )

        if resp.status_code != 200:
            raise FeishuAPIError(
                code=resp.status_code,
                msg=f'HTTP {resp.status_code}: {resp.text[:200]}',
                api=path,
            )

        result = resp.json()
        code = result.get('code', -1)
        if code != 0:
            raise FeishuAPIError(
                code=code,
                msg=result.get('msg', '未知错误'),
                api=path,
            )

        return result.get('data', {})

    def request_with_retry(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        json: Dict = None,
        params: Dict = None,
        timeout: float = 15.0,
        retry: int = 2,
        rate_limit_key: Optional[str] = None,
    ) -> httpx.Response:
        last_exc = None
        for idx in range(retry + 1):
            start = time.time()
            try:
                if rate_limit_key:
                    self._get_rate_limiter(rate_limit_key).acquire()
                resp = httpx.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=json,
                    params=params,
                    timeout=timeout,
                )
                latency = int((time.time() - start) * 1000)
                logger.info(
                    f'feishu_request method={method} url={url} status={resp.status_code} '
                    f'latency_ms={latency} retry={idx} rate_limit_key={rate_limit_key or "-"}'
                )
                if resp.status_code == 429 and idx < retry:
                    delay_seconds = self._resolve_rate_limit_delay(resp, idx)
                    logger.warning(
                        'feishu_request rate limited method=%s url=%s retry=%s sleep=%.2fs',
                        method,
                        url,
                        idx,
                        delay_seconds,
                    )
                    time.sleep(delay_seconds)
                    continue
                if resp.status_code >= 500 and idx < retry:
                    time.sleep(0.3 * (idx + 1))
                    continue
                return resp
            except Exception as e:
                last_exc = e
                if idx < retry:
                    time.sleep(0.3 * (idx + 1))
                    continue
                raise
        if last_exc:
            raise last_exc
        raise RuntimeError('feishu request failed unexpectedly')

    def _get_rate_limiter(self, key: str) -> TokenBucketRateLimiter:
        if key not in self._rate_limiters:
            if key == self.MESSAGE_RATE_LIMIT_KEY:
                self._rate_limiters[key] = TokenBucketRateLimiter(
                    capacity=self.MESSAGE_RATE_LIMIT_CAPACITY,
                    refill_rate_per_second=self.MESSAGE_RATE_LIMIT_REFILL_PER_SECOND,
                )
            else:
                self._rate_limiters[key] = TokenBucketRateLimiter(
                    capacity=60,
                    refill_rate_per_second=1.0,
                )
        return self._rate_limiters[key]

    def _resolve_rate_limit_delay(self, resp: httpx.Response, retry_index: int) -> float:
        retry_after = resp.headers.get('Retry-After') if resp.headers else None
        if retry_after:
            try:
                parsed = float(retry_after)
                if parsed > 0:
                    return parsed
            except (TypeError, ValueError):
                pass
        return float(min(2 ** retry_index, 8))

    # ========================================================================
    # 消息 API（im/v1/messages）
    # ========================================================================

    def send_message(
        self,
        receive_id: str,
        msg_type: str,
        content: str,
        receive_id_type: str = 'open_id',
    ) -> Dict:
        """
        发送消息

        Args:
            receive_id: 接收者 ID（open_id / user_id / chat_id）
            msg_type: 消息类型（text / interactive / post 等）
            content: 消息内容 JSON 字符串
            receive_id_type: ID 类型，默认 open_id

        Returns:
            飞书返回的消息数据
        """
        return self._request(
            'POST',
            f'im/v1/messages?receive_id_type={receive_id_type}',
            json={
                'receive_id': receive_id,
                'msg_type': msg_type,
                'content': content,
            },
        )

    def send_card_message(
        self,
        receive_id: str,
        card: Dict,
        receive_id_type: str = 'open_id',
    ) -> Dict:
        """
        发送卡片消息（interactive 类型）

        Args:
            receive_id: 接收者 ID
            card: 卡片 JSON 结构
            receive_id_type: ID 类型
        """
        import json
        return self.send_message(
            receive_id=receive_id,
            msg_type='interactive',
            content=json.dumps(card),
            receive_id_type=receive_id_type,
        )

    def send_text_to_chat(self, chat_id: str, text: str) -> Dict:
        """发送文本消息到群聊"""
        import json
        return self.send_message(
            receive_id=chat_id,
            msg_type='text',
            content=json.dumps({'text': text}),
            receive_id_type='chat_id',
        )

    def list_bot_chats(
        self,
        page_size: int = 50,
        page_token: str = None,
    ) -> Dict[str, Any]:
        """
        获取当前应用机器人所在的群聊列表（分页）。

        使用 tenant_access_token。用于解析群名称对应的 chat_id（如配置 FEISHU_NOTIFICATION_CHAT_ID）。
        参见：GET /open-apis/im/v1/chats
        """
        params: Dict[str, Any] = {'page_size': min(page_size, 50)}
        if page_token:
            params['page_token'] = page_token
        return self._request('GET', 'im/v1/chats', params=params)

    # ========================================================================
    # 审批 API（approval/v4）
    # ========================================================================

    def create_approval_instance(
        self,
        approval_code: str,
        open_id: str,
        form: str,
        node_approver_open_id_list: List[Dict] = None,
    ) -> Dict:
        """
        创建审批实例

        Args:
            approval_code: 审批定义 code（在飞书管理后台创建的审批模板 code）
            open_id: 发起人的 open_id
            form: 表单内容 JSON 字符串，格式 [{"id":"widget1","type":"input","value":"xxx"}]
            node_approver_open_id_list: 各节点审批人列表（可选）

        Returns:
            包含 instance_code 的字典
        """
        body = {
            'approval_code': approval_code,
            'open_id': open_id,
            'form': form,
        }
        if node_approver_open_id_list:
            body['node_approver_open_id_list'] = node_approver_open_id_list

        return self._request('POST', 'approval/v4/instances', json=body)

    def get_approval_instance(self, instance_id: str) -> Dict:
        """
        查询审批实例详情

        Args:
            instance_id: 审批实例 ID

        Returns:
            审批实例详情
        """
        return self._request('GET', f'approval/v4/instances/{instance_id}')

    # ========================================================================
    # 日历 API（calendar/v4）
    # ========================================================================

    def create_calendar_event(
        self,
        calendar_id: str,
        summary: str,
        start_time: int,
        end_time: int,
        description: str = '',
        location: str = '',
        attendee_ids: List[str] = None,
    ) -> Dict:
        """
        创建日历事件

        Args:
            calendar_id: 日历 ID
            summary: 事件标题
            start_time: 开始时间（Unix 时间戳，秒）
            end_time: 结束时间（Unix 时间戳，秒）
            description: 描述
            location: 地点
            attendee_ids: 参与者 open_id 列表

        Returns:
            包含 event_id 的字典
        """
        event = {
            'summary': summary,
            'start_time': {'timestamp': str(start_time)},
            'end_time': {'timestamp': str(end_time)},
        }
        if description:
            event['description'] = description
        if location:
            event['location'] = {'name': location}

        data = self._request(
            'POST',
            f'calendar/v4/calendars/{calendar_id}/events',
            json=event,
        )

        # 添加参与者
        if attendee_ids and data.get('event', {}).get('event_id'):
            event_id = data['event']['event_id']
            attendees = [{'type': 'user', 'user_id': uid} for uid in attendee_ids]
            try:
                self._request(
                    'POST',
                    f'calendar/v4/calendars/{calendar_id}/events/{event_id}/attendees',
                    json={'attendees': attendees},
                )
            except FeishuAPIError as e:
                logger.warning(f"添加日历参与者失败: {e}")

        return data

    def update_calendar_event(
        self,
        calendar_id: str,
        event_id: str,
        summary: str = None,
        start_time: int = None,
        end_time: int = None,
        description: str = None,
    ) -> Dict:
        """更新日历事件"""
        event = {}
        if summary is not None:
            event['summary'] = summary
        if start_time is not None:
            event['start_time'] = {'timestamp': str(start_time)}
        if end_time is not None:
            event['end_time'] = {'timestamp': str(end_time)}
        if description is not None:
            event['description'] = description

        return self._request(
            'PATCH',
            f'calendar/v4/calendars/{calendar_id}/events/{event_id}',
            json=event,
        )

    def delete_calendar_event(self, calendar_id: str, event_id: str) -> Dict:
        """删除日历事件"""
        return self._request(
            'DELETE',
            f'calendar/v4/calendars/{calendar_id}/events/{event_id}',
        )

    # ========================================================================
    # 用户 Token 请求（user_access_token 调用）
    # ========================================================================

    def _user_headers(self, user_access_token: str) -> Dict[str, str]:
        """构建 user_access_token 请求头"""
        return {
            'Authorization': f'Bearer {user_access_token}',
            'Content-Type': 'application/json',
        }

    def _user_request(
        self,
        method: str,
        path: str,
        user_access_token: str,
        json: Dict = None,
        params: Dict = None,
        timeout: float = 15.0,
        retry: Optional[int] = None,
        rate_limit_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        以 user_access_token 发起请求

        与 _request 类似，但使用用户 Token 而非 tenant Token。
        """
        url = f'{self.BASE_URL}/{path}'
        headers = self._user_headers(user_access_token)

        resp = self.request_with_retry(
            method=method,
            url=url,
            headers=headers,
            json=json,
            params=params,
            timeout=timeout,
            retry=self.RATE_LIMIT_RETRY if retry is None else retry,
            rate_limit_key=rate_limit_key,
        )

        if resp.status_code != 200:
            raise FeishuAPIError(
                code=resp.status_code,
                msg=f'HTTP {resp.status_code}: {resp.text[:200]}',
                api=path,
            )

        result = resp.json()
        code = result.get('code', -1)
        if code != 0:
            raise FeishuAPIError(
                code=code,
                msg=result.get('msg', '未知错误'),
                api=path,
            )

        return result.get('data', {})

    def refresh_user_access_token(
        self, refresh_token: str, app_id: str = None, app_secret: str = None
    ) -> Dict[str, Any]:
        """
        刷新 user_access_token（v2 OAuth 端点）

        Args:
            refresh_token: 飞书 refresh_token
        Returns:
            {'access_token': ..., 'refresh_token': ..., 'expires_in': ..., 'refresh_expires_in': ...}
        """
        _app_id = app_id or settings.FEISHU_APP_ID
        _app_secret = app_secret or settings.FEISHU_APP_SECRET
        resp = httpx.post(
            f'{self.BASE_URL}/authen/v2/oauth/token',
            headers={'Content-Type': 'application/json'},
            json={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'client_id': _app_id,
                'client_secret': _app_secret,
            },
            timeout=10.0,
        )
        result = resp.json()
        if result.get('code') != 0:
            raise FeishuAPIError(
                code=result.get('code', -1),
                msg=result.get('msg') or result.get('error_description', '未知错误'),
                api='authen/v2/oauth/token(refresh)',
            )
        # v2 响应：token 字段在顶层
        data = {}
        for key in ('access_token', 'refresh_token', 'expires_in', 'refresh_expires_in', 'scope', 'token_type'):
            if key in result:
                data[key] = result[key]
        if not data.get('access_token'):
            data = result.get('data', {})
        return data

    # ========================================================================
    # 用户令牌持久化管理（授权一次，永续使用）
    # ========================================================================

    def exchange_code_for_user_token(self, code: str) -> Dict[str, Any]:
        """
        用 OAuth 授权码换取 user_access_token 并持久化（v2 端点）

        Returns:
            持久化的 token 数据（含 access_token, refresh_token, open_id 等）
        """
        resp = httpx.post(
            f'{self.BASE_URL}/authen/v2/oauth/token',
            headers={'Content-Type': 'application/json; charset=utf-8'},
            json={
                'grant_type': 'authorization_code',
                'client_id': settings.FEISHU_APP_ID,
                'client_secret': settings.FEISHU_APP_SECRET,
                'code': code,
            },
            timeout=15.0,
        )
        result = resp.json()
        if result.get('code') != 0:
            raise FeishuAPIError(
                code=result.get('code', -1),
                msg=result.get('msg') or result.get('error_description', '未知错误'),
                api='authen/v2/oauth/token',
            )

        store_data = {
            'access_token': result.get('access_token', ''),
            'refresh_token': result.get('refresh_token', ''),
            'expires_at': time.time() + result.get('expires_in', 7200) - self.TOKEN_BUFFER_SECONDS,
            'open_id': result.get('open_id', ''),
            'name': result.get('name', ''),
            'obtained_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        }
        self._user_token_store.save(store_data)
        logger.info("用户令牌已获取并持久化 (open_id=%s)", store_data['open_id'])
        return store_data

    def get_user_token(self) -> str:
        """
        获取有效的 user_access_token（自动刷新）

        流程：
        1. 从持久化存储加载 token
        2. 如果 access_token 未过期 → 直接返回
        3. 如果已过期 → 用 refresh_token 刷新 → 保存新 token → 返回
        4. 如果 refresh_token 也失效 → 抛出异常，提示重新授权

        Raises:
            FeishuAPIError: refresh_token 失效时，需要重新运行 obtain_feishu_user_token
        """
        store_data = self._user_token_store.load()
        if not store_data:
            raise FeishuAPIError(
                code=-1,
                msg='未找到用户令牌，请先运行: python manage.py obtain_feishu_user_token',
                api='user_token_store',
            )

        now = time.time()
        if now < store_data.get('expires_at', 0):
            return store_data['access_token']

        refresh_token = store_data.get('refresh_token', '')
        if not refresh_token:
            raise FeishuAPIError(
                code=-1,
                msg='refresh_token 为空，请重新运行: python manage.py obtain_feishu_user_token',
                api='user_token_store',
            )

        logger.info('user_access_token 已过期，正在通过 refresh_token 自动刷新...')
        try:
            refreshed = self.refresh_user_access_token(refresh_token)
        except FeishuAPIError:
            self._user_token_store.clear()
            raise FeishuAPIError(
                code=-1,
                msg='refresh_token 已失效（超过30天未使用），请重新运行: python manage.py obtain_feishu_user_token',
                api='user_token_store',
            )

        new_data = {
            'access_token': refreshed['access_token'],
            'refresh_token': refreshed.get('refresh_token', refresh_token),
            'expires_at': now + refreshed.get('expires_in', 7200) - self.TOKEN_BUFFER_SECONDS,
            'open_id': store_data.get('open_id', ''),
            'name': store_data.get('name', ''),
            'obtained_at': store_data.get('obtained_at', ''),
        }
        self._user_token_store.save(new_data)
        logger.info('user_access_token 已自动刷新并持久化')
        return new_data['access_token']

    # 子衿统一授权所需 scope（与前端 DEFAULT_USER_SCOPES 保持一致）
    DEFAULT_USER_SCOPES = (
        'offline_access '
        'contact:user.base:readonly '
        'contact:user.email:readonly '
        'im:chat:readonly '
        'im:message:readonly '
        'calendar:calendar:readonly '
        'calendar:calendar '
        'mail:user_mailbox '
        'mail:user_mailbox.message:readonly '
        'task:task:read '
        'approval:approval:readonly '
        'drive:drive:readonly'
    )

    def get_auth_url(self, redirect_uri: str = None, state: str = 'auth', scope: str = None) -> str:
        """生成飞书 OIDC 授权链接（含完整 scope）"""
        from urllib.parse import quote
        app_id = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '') or settings.FEISHU_APP_ID
        if not redirect_uri:
            redirect_uri = getattr(settings, 'FEISHU_REDIRECT_URI', '') or os.environ.get('FEISHU_REDIRECT_URI', 'http://localhost:8001/login')
        encoded_uri = quote(redirect_uri)
        encoded_scope = quote(scope or self.DEFAULT_USER_SCOPES)
        return (
            f'{self.BASE_URL}/authen/v1/authorize'
            f'?client_id={app_id}'
            f'&redirect_uri={encoded_uri}'
            f'&response_type=code'
            f'&scope={encoded_scope}'
            f'&state={state}'
        )

    # ========================================================================
    # 邮件 API（mail/v1 - user_access_token）
    # ========================================================================

    def list_user_mails(
        self, user_access_token: str, page_size: int = 50, page_token: str = None,
        folder_id: str = 'INBOX',
    ) -> Dict:
        """
        获取用户邮件列表。

        folder_id 可选值：INBOX（收件箱）、SENT（已发送）、TRASH（垃圾桶）、
        UNREAD（未读）、STARRED（星标）；默认 INBOX。
        飞书 API page_size 上限为 50。
        """
        params: Dict[str, Any] = {'page_size': min(page_size, 50), 'folder_id': folder_id}
        if page_token:
            params['page_token'] = page_token
        return self._user_request(
            'GET',
            'mail/v1/user_mailboxes/me/messages',
            user_access_token,
            params=params,
        )

    def get_user_mail(self, user_access_token: str, message_id: str) -> Dict:
        """
        获取单封邮件详情

        Returns:
            包含 message 的字典（含 subject, from, body_html, attachments 等）
        """
        return self._user_request(
            'GET',
            f'mail/v1/user_mailboxes/me/messages/{message_id}',
            user_access_token,
        )

    def get_mail_attachment_download_urls(
        self, user_access_token: str, message_id: str, attachment_ids: List[str],
    ) -> Dict:
        """
        获取邮件附件下载链接（飞书官方接口）。
        接口：GET mail/v1/user_mailboxes/me/messages/{message_id}/attachments/download_url
        参数：attachment_ids（query 数组，重复 key）
        返回：{download_urls: [{attachment_id, download_url}], failed_ids: []}
        注意：下载链接仅可使用两次，有效期两小时；限频 1 次/秒。
        """
        qs = '&'.join(f'attachment_ids={aid}' for aid in attachment_ids[:20])
        url = f'{self.BASE_URL}/mail/v1/user_mailboxes/me/messages/{message_id}/attachments/download_url?{qs}'
        headers = self._user_headers(user_access_token)
        resp = self.request_with_retry(method='GET', url=url, headers=headers, timeout=15.0, retry=self.RATE_LIMIT_RETRY)
        if resp.status_code != 200:
            raise FeishuAPIError(code=resp.status_code, msg=f'HTTP {resp.status_code}: {resp.text[:200]}',
                                 api='mail attachment download_url')
        result = resp.json()
        if result.get('code', -1) != 0:
            raise FeishuAPIError(code=result.get('code', -1), msg=result.get('msg', ''), api='mail attachment download_url')
        return result.get('data', {})

    def download_user_mail_attachment(
        self, user_access_token: str, message_id: str, attachment_id: str,
    ) -> Optional[bytes]:
        """
        下载单个邮件附件：先获取 download_url，再通过 URL 下载文件二进制。
        """
        try:
            data = self.get_mail_attachment_download_urls(
                user_access_token, message_id, [attachment_id],
            )
            urls = data.get('download_urls', [])
            for item in urls:
                if item.get('attachment_id') == attachment_id and item.get('download_url'):
                    import urllib.request
                    with urllib.request.urlopen(item['download_url'], timeout=120) as r:
                        return r.read()
            return None
        except Exception:
            return None

    # ========================================================================
    # 日历 API - 用户日历事件列表（user_access_token）
    # ========================================================================

    def list_user_calendar_events(
        self,
        user_access_token: str,
        start_time: int = None,
        end_time: int = None,
        page_size: int = 50,
    ) -> Dict:
        """
        获取用户主日历事件

        使用 user_access_token，权限 calendar:calendar:readonly。
        先获取用户主日历列表，取第一个 primary 日历的事件。
        """
        # 1. 获取用户日历列表（飞书要求 page_size >= 50）
        calendars_data = self._user_request(
            'GET', 'calendar/v4/calendars', user_access_token, params={'page_size': 50}
        )
        calendar_list = calendars_data.get('calendar_list', [])
        # 找主日历
        primary_cal = None
        for cal in calendar_list:
            if cal.get('role') == 'owner' or cal.get('type') == 'primary':
                primary_cal = cal
                break
        if not primary_cal and calendar_list:
            primary_cal = calendar_list[0]
        if not primary_cal:
            return {'items': []}

        calendar_id = primary_cal.get('calendar_id', '')
        if not calendar_id:
            return {'items': []}

        # 2. 获取事件列表
        params = {'page_size': page_size}
        if start_time:
            params['start_time'] = str(start_time)
        if end_time:
            params['end_time'] = str(end_time)

        events_data = self._user_request(
            'GET',
            f'calendar/v4/calendars/{calendar_id}/events',
            user_access_token,
            params=params,
        )
        return events_data

    # ========================================================================
    # IM 消息 API - 用户聊天列表与消息（user_access_token）
    # ========================================================================

    def list_user_chats(
        self, user_access_token: str, page_size: int = 100, page_token: str = None,
    ) -> Dict:
        """
        获取用户的群聊/单聊列表（支持翻页，飞书上限 100/页）。

        使用 user_access_token，权限 im:chat:readonly 或 im:message:read_as_user。
        """
        params: Dict[str, Any] = {
            'page_size': min(page_size, 100),
            'sort_type': 'ByActiveTimeDesc',
        }
        if page_token:
            params['page_token'] = page_token
        return self._user_request(
            'GET',
            'im/v1/chats',
            user_access_token,
            params=params,
        )

    def list_chat_messages(
        self,
        user_access_token: str,
        container_id: str,
        start_time: str = None,
        end_time: str = None,
        page_size: int = 20,
    ) -> Dict:
        """
        获取聊天中的消息列表

        Args:
            container_id: 聊天 ID（chat_id）
            start_time / end_time: 时间范围（Unix 时间戳字符串，秒）
        """
        params: Dict[str, Any] = {
            'container_id_type': 'chat',
            'container_id': container_id,
            'page_size': page_size,
            'sort_type': 'ByCreateTimeDesc',
        }
        if start_time:
            params['start_time'] = start_time
        if end_time:
            params['end_time'] = end_time
        return self._user_request(
            'GET',
            'im/v1/messages',
            user_access_token,
            params=params,
            retry=self.RATE_LIMIT_RETRY,
            rate_limit_key=self.MESSAGE_RATE_LIMIT_KEY,
        )

    def get_group_messages(
        self,
        group_id: str,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        page_size: int = 50,
        page_token: str = None,
        user_access_token: str = None,
    ) -> List[Dict[str, Any]]:
        """按群组拉取消息，默认启用限流与 429 重试保护。"""
        params: Dict[str, Any] = {
            'container_id_type': 'chat',
            'container_id': group_id,
            'page_size': page_size,
            'sort_type': 'ByCreateTimeDesc',
        }
        if start_time is not None:
            params['start_time'] = str(start_time)
        if end_time is not None:
            params['end_time'] = str(end_time)
        if page_token:
            params['page_token'] = page_token

        fetch_page = (
            lambda current_params: self._user_request(
                'GET',
                'im/v1/messages',
                user_access_token or self.get_user_token(),
                params=current_params,
                retry=self.RATE_LIMIT_RETRY,
                rate_limit_key=self.MESSAGE_RATE_LIMIT_KEY,
            )
            if (user_access_token or self._user_token_store.load())
            else self._request(
                'GET',
                'im/v1/messages',
                params=current_params,
                retry=self.RATE_LIMIT_RETRY,
                rate_limit_key=self.MESSAGE_RATE_LIMIT_KEY,
            )
        )

        items: List[Dict[str, Any]] = []
        current_page_token = page_token
        while True:
            if current_page_token:
                params['page_token'] = current_page_token
            elif 'page_token' in params:
                params.pop('page_token')
            data = fetch_page(params)
            items.extend(data.get('items', []))
            if not data.get('has_more'):
                break
            current_page_token = data.get('page_token')
            if not current_page_token:
                break
        return items

    def get_meeting_minutes(self, meeting_id: str) -> Dict[str, Any]:
        """
        获取会议纪要正文。

        优先读取 minutes 详情，再读取 transcript，最终返回统一的 content/text 字段。
        """
        minute_data: Dict[str, Any] = {}
        transcript_data: Dict[str, Any] = {}

        try:
            minute_data = self._request(
                'GET',
                f'minutes/v1/minutes/{meeting_id}',
                retry=self.RATE_LIMIT_RETRY,
            )
        except FeishuAPIError as exc:
            logger.warning('get_meeting_minutes detail failed meeting_id=%s error=%s', meeting_id, exc)

        try:
            transcript_data = self._request(
                'GET',
                f'minutes/v1/minutes/{meeting_id}/transcript',
                retry=self.RATE_LIMIT_RETRY,
            )
        except FeishuAPIError as exc:
            logger.warning('get_meeting_minutes transcript failed meeting_id=%s error=%s', meeting_id, exc)

        content = self._extract_minutes_content(minute_data, transcript_data)
        if not content and not minute_data and not transcript_data:
            return {}
        return {
            'meeting_id': meeting_id,
            'content': content,
            'text': content,
            'detail': minute_data,
            'transcript': transcript_data,
        }

    def _extract_minutes_content(
        self,
        minute_data: Dict[str, Any],
        transcript_data: Dict[str, Any],
    ) -> str:
        content_candidates: List[str] = []
        minute = minute_data.get('minute', minute_data)
        for key in ('content', 'summary', 'abstract', 'text'):
            value = minute.get(key) if isinstance(minute, dict) else None
            if isinstance(value, str) and value.strip():
                content_candidates.append(value.strip())

        transcript_items = transcript_data.get('items') or transcript_data.get('paragraphs') or transcript_data.get('transcripts') or []
        lines: List[str] = []
        if isinstance(transcript_items, list):
            for item in transcript_items:
                if isinstance(item, str) and item.strip():
                    lines.append(item.strip())
                    continue
                if not isinstance(item, dict):
                    continue
                speaker = item.get('speaker') or item.get('speaker_name') or item.get('speaker_id') or ''
                text = item.get('text') or item.get('content') or item.get('sentence') or ''
                if isinstance(text, str) and text.strip():
                    line = f'{speaker}: {text.strip()}' if speaker else text.strip()
                    lines.append(line)

        transcript_text = '\n'.join(lines).strip()
        if transcript_text:
            content_candidates.append(transcript_text)

        return '\n\n'.join(part for part in content_candidates if part).strip()

    # ========================================================================
    # 任务 API（task/v2 - user_access_token）
    # ========================================================================

    def list_user_tasks(
        self, user_access_token: str, page_size: int = 50, page_token: str = None
    ) -> Dict:
        """
        获取用户任务列表

        使用 user_access_token，权限 task:task:readonly。
        """
        params = {'page_size': page_size}
        if page_token:
            params['page_token'] = page_token
        return self._user_request(
            'GET', 'task/v2/tasks', user_access_token, params=params,
        )

    # ========================================================================
    # 任务 API — 应用身份（task/v2 — tenant_access_token）
    # ========================================================================

    def create_task(
        self,
        summary: str,
        description: str = '',
        due_timestamp: int = None,
        member_open_ids: List[str] = None,
        extra: str = '',
    ) -> Dict:
        """
        创建飞书任务（应用身份）

        工单派发时调用此方法，为被分配的 CRC 创建可操作的飞书任务。
        任务将出现在 CRC 的飞书"任务"列表中。

        Args:
            summary: 任务标题
            description: 任务描述
            due_timestamp: 截止时间 Unix 时间戳（秒），可选
            member_open_ids: 负责人 open_id 列表（设为 assignee 角色）
            extra: 自定义扩展字段（可存工单ID等业务信息），最大 65536 字符

        Returns:
            包含 task 的字典，task.guid 为任务唯一标识
        """
        body: Dict[str, Any] = {
            'summary': summary,
        }
        if description:
            body['description'] = description
        if due_timestamp:
            body['due'] = {
                'timestamp': str(due_timestamp),
                'is_all_day': False,
            }
        if member_open_ids:
            body['members'] = [
                {'id': uid, 'type': 'user', 'role': 'assignee'}
                for uid in member_open_ids
            ]
        if extra:
            body['extra'] = extra

        return self._request('POST', 'task/v2/tasks', json=body)

    def update_task(
        self,
        task_guid: str,
        summary: str = None,
        description: str = None,
        due_timestamp: int = None,
        completed: bool = None,
    ) -> Dict:
        """
        更新飞书任务

        Args:
            task_guid: 任务 GUID（创建时返回的 task.guid）
            summary: 新标题（不更新则不传）
            description: 新描述
            due_timestamp: 新截止时间
            completed: 设为 True 表示标记任务完成

        Returns:
            更新后的 task 字典
        """
        body: Dict[str, Any] = {}
        update_fields = []

        if summary is not None:
            body['summary'] = summary
            update_fields.append('summary')
        if description is not None:
            body['description'] = description
            update_fields.append('description')
        if due_timestamp is not None:
            body['due'] = {
                'timestamp': str(due_timestamp),
                'is_all_day': False,
            }
            update_fields.append('due')
        if completed is not None:
            body['completed_at'] = str(int(time.time())) if completed else '0'
            update_fields.append('completed_at')

        if not update_fields:
            return {}

        return self._request(
            'PATCH',
            f'task/v2/tasks/{task_guid}',
            json={'task': body, 'update_fields': update_fields},
        )

    def add_task_member(
        self,
        task_guid: str,
        member_open_id: str,
        role: str = 'assignee',
    ) -> Dict:
        """
        为飞书任务添加成员

        场景：工单事后追加协作人、转派时添加新负责人。

        Args:
            task_guid: 任务 GUID
            member_open_id: 成员的 open_id
            role: 角色（assignee=负责人, follower=关注人）

        Returns:
            飞书 API 响应 data
        """
        return self._request(
            'POST',
            f'task/v2/tasks/{task_guid}/members',
            json={
                'members': [{'id': member_open_id, 'type': 'user', 'role': role}],
            },
        )

    def complete_task(self, task_guid: str) -> Dict:
        """标记飞书任务为完成"""
        return self.update_task(task_guid, completed=True)

    # ========================================================================
    # 多维表格 API（bitable/v1 — 替代飞书项目，用于状态看板同步）
    # ========================================================================

    def upsert_bitable_record(
        self,
        app_token: str,
        table_id: str,
        fields: Dict[str, Any],
        record_id: str = None,
    ) -> Dict:
        """
        新增或更新多维表格单条记录

        替代原飞书项目 API（project/v2），将协议/商机等状态同步到多维表格看板。
        如果提供 record_id 则更新，否则创建新记录。

        Args:
            app_token: 多维表格 App Token
            table_id: 数据表 ID
            fields: 字段值字典 {"字段名": "值"}
            record_id: 已有记录 ID（更新时提供）

        Returns:
            包含 record 的字典
        """
        if record_id:
            return self._request(
                'PUT',
                f'bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}',
                json={'fields': fields},
            )
        else:
            return self._request(
                'POST',
                f'bitable/v1/apps/{app_token}/tables/{table_id}/records',
                json={'fields': fields},
            )


    # ================================================================
    # 云文档 API（docx/v1, drive/v1）—— S2-2 eTMF
    # ================================================================
    def create_document(
        self,
        folder_token: str,
        title: str,
    ) -> Dict:
        """
        创建飞书云文档

        Args:
            folder_token: 目标文件夹 token
            title: 文档标题

        Returns:
            {"document": {"document_id": "xxx", "title": "xxx"}}
        """
        return self._request(
            'POST',
            'docx/v1/documents',
            json={
                'folder_token': folder_token,
                'title': title,
            },
        )

    def upload_file(
        self,
        folder_token: str,
        file_name: str,
        file_content: bytes,
    ) -> Dict:
        """
        上传文件到飞书云空间

        Returns:
            {"file_token": "xxx"}
        """
        import io
        token = self.get_tenant_token()
        url = f'{self.BASE_URL}/drive/v1/files/upload_all'
        resp = httpx.post(
            url,
            headers={'Authorization': f'Bearer {token}'},
            data={
                'file_name': file_name,
                'parent_type': 'explorer',
                'parent_node': folder_token,
                'size': str(len(file_content)),
            },
            files={
                'file': (file_name, io.BytesIO(file_content)),
            },
            timeout=60.0,
        )
        if resp.status_code != 200:
            raise FeishuAPIError(resp.status_code, f'HTTP {resp.status_code}: {resp.text[:200]}', 'upload_file')
        result = resp.json()
        if result.get('code') != 0:
            raise FeishuAPIError(result.get('code', -1), result.get('msg', '上传失败'), 'upload_file')
        return result.get('data', {})

    def set_permission(
        self,
        file_token: str,
        member_type: str,
        member_id: str,
        perm: str = 'view',
    ) -> Dict:
        """
        设置云文档权限

        Args:
            file_token: 文档 token
            member_type: 用户类型（openid/userid/chat）
            member_id: 成员 ID
            perm: 权限（view/edit/full_access）
        """
        return self._request(
            'POST',
            f'drive/v1/permissions/{file_token}/members',
            json={
                'member_type': member_type,
                'member_id': member_id,
                'perm': perm,
            },
            params={'type': 'doc'},
        )

    # ================================================================
    # 通讯录 API（contact/v3）—— S3-4 通讯录同步
    # ================================================================
    def list_departments(
        self,
        parent_department_id: str = '0',
        page_token: str = '',
        page_size: int = 50,
    ) -> Dict:
        """
        获取部门列表

        Args:
            parent_department_id: 父部门 ID，'0' 表示根部门
        """
        params = {
            'parent_department_id': parent_department_id,
            'page_size': page_size,
        }
        if page_token:
            params['page_token'] = page_token
        return self._request(
            'GET',
            'contact/v3/departments',
            params=params,
        )

    def list_users(
        self,
        department_id: str = '0',
        page_token: str = '',
        page_size: int = 50,
    ) -> Dict:
        """
        获取部门用户列表

        Args:
            department_id: 部门 ID
        """
        params = {
            'department_id': department_id,
            'page_size': page_size,
        }
        if page_token:
            params['page_token'] = page_token
        return self._request(
            'GET',
            'contact/v3/users/find_by_department',
            params=params,
        )

    # ================================================================
    # 通讯录 — 获取单个用户信息（tenant_access_token）
    # ================================================================

    def get_user_info(
        self,
        open_id: str,
        app_id: str = None,
        app_secret: str = None,
    ) -> Dict:
        """
        根据 open_id 获取用户信息（姓名、邮箱、部门等）。

        使用 tenant_access_token，需 contact:user.base:readonly + contact:user.email:readonly。
        返回 data.user 字典。
        """
        return self._request(
            'GET',
            f'contact/v3/users/{open_id}',
            params={'user_id_type': 'open_id'},
            app_id=app_id,
            app_secret=app_secret,
        )

    # ================================================================
    # 邮件 API（tenant_access_token 版，按邮箱地址拉取）
    # ================================================================

    def list_mails_by_address(
        self,
        mailbox_address: str,
        page_size: int = 50,
        page_token: str = None,
        app_id: str = None,
        app_secret: str = None,
        folder_id: str = 'INBOX',
    ) -> Dict:
        """
        使用 tenant_access_token 拉取指定邮箱的邮件列表。

        需 mail:user_mailbox 应用权限。
        mailbox_address 为用户的企业邮箱（如 user@company.feishu.cn）。
        folder_id: INBOX / SENT / TRASH 等，默认 INBOX。
        """
        params: Dict[str, Any] = {'page_size': min(page_size, 50), 'folder_id': folder_id}
        if page_token:
            params['page_token'] = page_token
        return self._request(
            'GET',
            f'mail/v1/user_mailboxes/{mailbox_address}/messages',
            params=params,
            app_id=app_id,
            app_secret=app_secret,
        )

    def get_mail_by_address(
        self,
        mailbox_address: str,
        message_id: str,
        app_id: str = None,
        app_secret: str = None,
    ) -> Dict:
        """
        使用 tenant_access_token 获取单封邮件详情。
        """
        return self._request(
            'GET',
            f'mail/v1/user_mailboxes/{mailbox_address}/messages/{message_id}',
            app_id=app_id,
            app_secret=app_secret,
        )

    def get_mail_attachment_download_urls_by_address(
        self,
        mailbox_address: str,
        message_id: str,
        attachment_ids: List[str],
        app_id: str = None,
        app_secret: str = None,
    ) -> Dict:
        """使用 tenant_access_token 获取邮件附件下载链接。"""
        qs = '&'.join(f'attachment_ids={aid}' for aid in attachment_ids[:20])
        path = f'mail/v1/user_mailboxes/{mailbox_address}/messages/{message_id}/attachments/download_url?{qs}'
        return self._request('GET', path, app_id=app_id, app_secret=app_secret)

    def download_mail_attachment_by_address(
        self,
        mailbox_address: str,
        message_id: str,
        attachment_id: str,
        app_id: str = None,
        app_secret: str = None,
    ) -> Optional[bytes]:
        """使用 tenant_access_token 下载单个邮件附件。"""
        try:
            data = self.get_mail_attachment_download_urls_by_address(
                mailbox_address, message_id, [attachment_id],
                app_id=app_id, app_secret=app_secret,
            )
            for item in data.get('download_urls', []):
                if item.get('attachment_id') == attachment_id and item.get('download_url'):
                    import urllib.request
                    with urllib.request.urlopen(item['download_url'], timeout=120) as r:
                        return r.read()
            return None
        except Exception:
            return None

    # ================================================================
    # 日历 API（tenant_access_token 版）
    # ================================================================

    def list_calendars_by_tenant(
        self,
        app_id: str = None,
        app_secret: str = None,
    ) -> Dict:
        """使用 tenant_access_token 获取日历列表（飞书 page_size >= 50）。"""
        return self._request(
            'GET',
            'calendar/v4/calendars',
            params={'page_size': 50},
            app_id=app_id,
            app_secret=app_secret,
        )

    # ================================================================
    # 群组 API（im/v1）—— S3-5 项目群
    # ================================================================
    def create_chat(
        self,
        name: str,
        description: str = '',
        owner_id: str = '',
    ) -> Dict:
        """
        创建飞书群

        Returns:
            {"chat_id": "oc_xxx"}
        """
        body = {
            'name': name,
            'description': description,
        }
        if owner_id:
            body['owner_id'] = owner_id
        return self._request('POST', 'im/v1/chats', json=body)

    def add_chat_members(
        self,
        chat_id: str,
        id_list: list,
    ) -> Dict:
        """群中添加成员"""
        return self._request(
            'POST',
            f'im/v1/chats/{chat_id}/members',
            json={'id_list': id_list},
        )

    def update_chat(
        self,
        chat_id: str,
        name: str = None,
        description: str = None,
    ) -> Dict:
        """更新群信息"""
        body = {}
        if name:
            body['name'] = name
        if description:
            body['description'] = description
        return self._request('PUT', f'im/v1/chats/{chat_id}', json=body)

    # ================================================================
    # 知识库 API（wiki/v2）—— S4-6 SOP 管理
    # ================================================================
    def create_wiki_space(self, name: str, description: str = '') -> Dict:
        """
        创建知识空间（需要 user_access_token）

        此 API 飞书明确要求用户身份，自动使用持久化的 user_access_token。
        """
        user_token = self.get_user_token()
        return self._user_request('POST', 'wiki/v2/spaces', user_token, json={
            'name': name, 'description': description,
        })

    def add_wiki_space_member(
        self, space_id: str, member_id: str,
        member_type: str = 'openid', member_role: str = 'admin',
    ) -> Dict:
        """
        添加知识空间成员（仅支持真实用户，member_type='openid'）。

        ⚠️ 重要限制：飞书不支持将 App/Bot 添加为知识库成员。
        - member_type='appid' 在飞书 Wiki API 中不可用，调用会返回错误。
        - 知识库操作唯一正确方式：用管理员的 user_access_token 代理执行。
        - 此方法仅用于将真实飞书用户（openid）加为知识库成员。
        """
        user_token = self.get_user_token()
        return self._user_request(
            'POST', f'wiki/v2/spaces/{space_id}/members', user_token,
            json={
                'member_type': member_type,
                'member_id': member_id,
                'member_role': member_role,
            },
        )

    def create_wiki_node(
        self, space_id: str, title: str,
        parent_node_token: str = '', obj_type: str = 'docx',
        use_user_token: bool = False,
    ) -> Dict:
        """
        在知识空间创建节点

        默认使用 tenant_access_token（需应用已是空间成员）。
        若应用尚未加入空间，设置 use_user_token=True。

        注意：node_type="origin" 是飞书 API 必填字段；obj_type 必须用 "docx"（"doc" 已废弃）。
        """
        body: Dict[str, Any] = {
            'node_type': 'origin',
            'obj_type': obj_type,
            'title': title,
        }
        if parent_node_token:
            body['parent_node_token'] = parent_node_token
        if use_user_token:
            user_token = self.get_user_token()
            return self._user_request(
                'POST', f'wiki/v2/spaces/{space_id}/nodes', user_token, json=body,
            )
        return self._request('POST', f'wiki/v2/spaces/{space_id}/nodes', json=body)

    def get_wiki_nodes(self, space_id: str, parent_node_token: str = '') -> Dict:
        """获取知识空间节点列表"""
        params = {}
        if parent_node_token:
            params['parent_node_token'] = parent_node_token
        return self._request('GET', f'wiki/v2/spaces/{space_id}/nodes', params=params)

    # ================================================================
    # 云文档读取 API（docx/v1, drive/v1）
    # ================================================================

    def get_document(self, document_id: str) -> Dict:
        """获取云文档元信息（标题、revision 等）"""
        return self._request('GET', f'docx/v1/documents/{document_id}')

    def get_document_blocks(
        self,
        document_id: str,
        page_size: int = 500,
        page_token: str = None,
    ) -> Dict:
        """获取云文档内容 blocks（文本、图片、嵌入文件等）"""
        params: Dict[str, Any] = {'page_size': page_size}
        if page_token:
            params['page_token'] = page_token
        return self._request(
            'GET', f'docx/v1/documents/{document_id}/blocks', params=params,
        )

    def get_all_document_blocks(self, document_id: str) -> List[Dict]:
        """获取云文档的全部 blocks（自动分页）"""
        all_blocks: List[Dict] = []
        page_token = None
        while True:
            data = self.get_document_blocks(
                document_id, page_size=500, page_token=page_token,
            )
            all_blocks.extend(data.get('items', []))
            if not data.get('has_more'):
                break
            page_token = data.get('page_token')
        return all_blocks

    def list_drive_files(
        self,
        folder_token: str = '',
        page_size: int = 50,
        page_token: str = None,
    ) -> Dict:
        """列出云空间文件夹中的文件"""
        params: Dict[str, Any] = {'page_size': page_size}
        if folder_token:
            params['folder_token'] = folder_token
        if page_token:
            params['page_token'] = page_token
        return self._request('GET', 'drive/v1/files', params=params)

    def download_file(self, file_token: str, timeout: float = 120.0) -> bytes:
        """
        下载云空间文件

        返回文件的原始字节内容。适用于 PPT、PDF、图片等文件。
        """
        token = self.get_tenant_token()
        url = f'{self.BASE_URL}/drive/v1/medias/{file_token}/download'
        resp = httpx.get(
            url,
            headers={'Authorization': f'Bearer {token}'},
            timeout=timeout,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            raise FeishuAPIError(
                resp.status_code,
                f'下载失败 HTTP {resp.status_code}: {resp.text[:200]}',
                f'drive/v1/medias/{file_token}/download',
            )
        return resp.content

    def list_wiki_spaces(self, page_size: int = 50) -> List[Dict]:
        """列出应用可见的所有知识空间"""
        data = self._request(
            'GET', 'wiki/v2/spaces', params={'page_size': page_size},
        )
        return data.get('items', [])

    def get_wiki_node_info(self, token: str) -> Dict:
        """通过 obj_token 或 node_token 获取知识库节点信息"""
        return self._request('GET', 'wiki/v2/spaces/get_node', params={'token': token})

    def search_documents(
        self,
        search_key: str,
        count: int = 20,
        offset: int = 0,
        owner_ids: List[str] = None,
        docs_types: List[str] = None,
    ) -> Dict:
        """
        搜索云文档

        使用 tenant_access_token，搜索范围为应用可见的文档。
        """
        body: Dict[str, Any] = {
            'search_key': search_key,
            'count': count,
            'offset': offset,
        }
        if owner_ids:
            body['owner_ids'] = owner_ids
        if docs_types:
            body['docs_types'] = docs_types

        token = self.get_tenant_token()
        resp = httpx.post(
            f'{self.BASE_URL}/suite/docs-api/search/object',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
            },
            json=body,
            timeout=15.0,
        )
        result = resp.json()
        if result.get('code') != 0:
            raise FeishuAPIError(
                result.get('code', -1),
                result.get('msg', '搜索失败'),
                'suite/docs-api/search/object',
            )
        return result.get('data', {})

    # ================================================================
    # 事件订阅配置 —— S4-7
    # ================================================================
    def list_event_subscriptions(self) -> Dict:
        """获取出站 IP 白名单（用于验证事件订阅配置）"""
        return self._request('GET', 'event/v1/outbound_ip')


# ============================================================================
# 全局单例
# ============================================================================

feishu_client = FeishuClient()
