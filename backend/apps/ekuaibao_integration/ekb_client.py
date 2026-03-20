"""
易快报 API 客户端（封装认证与所有接口调用）

认证方式：AppKey + AppSecret → getAccessToken（Bearer Token）
Token 有效期约 2 小时，自动刷新。

API 基础文档：https://docs.ekuaibao.com/docs/open-api/getting-started
"""
import hashlib
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Iterator, List, Optional, Tuple

import requests

logger = logging.getLogger('cn_kis.ekuaibao.client')

# ============================================================================
# 配置
# ============================================================================

# 合思易快报（飞书版企业，数据后端在 dd2.hosecloud.com）
# 凭证来自合思系统内「开放接口(新)」，UUID 格式，2026-03-20 验证有效
EKB_BASE_URL = 'https://dd2.hosecloud.com'
EKB_APP_KEY  = 'a827290d-503a-476f-87a0-fa3740cd6e5e'
EKB_APP_SECRET = '97aedd66-a382-4e59-84f9-fff7fe345113'

PAGE_SIZE = 100          # 易快报默认分页大小
REQUEST_TIMEOUT = 30     # 请求超时秒数
RETRY_TIMES = 3          # 失败重试次数
RETRY_SLEEP = 2          # 重试间隔秒数


class EkbAPIError(Exception):
    """易快报 API 错误"""
    def __init__(self, message: str, status_code: int = 0, response_data: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data or {}


class EkbClient:
    """
    易快报 OpenAPI 客户端

    用法：
        client = EkbClient()
        client.authenticate()

        # 获取全量员工
        for page in client.iter_pages('/api/openapi/v1/staffs', params={'hasLeave': False}):
            for staff in page:
                process(staff)

        # 获取全量单据
        for page in client.iter_flows(states=['paid', 'approved']):
            for flow in page:
                process(flow)
    """

    def __init__(self, app_key: str = EKB_APP_KEY, app_secret: str = EKB_APP_SECRET,
                 base_url: str = EKB_BASE_URL):
        self.app_key = app_key
        self.app_secret = app_secret
        self.base_url = base_url
        self._access_token: Optional[str] = None
        self._token_expires_at: Optional[float] = None
        self._corporation_id: str = ''
        self._refresh_token: str = ''
        self._session = requests.Session()
        self._session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        })

    # ------------------------------------------------------------------
    # 认证
    # ------------------------------------------------------------------

    def authenticate(self) -> str:
        """获取 AccessToken，自动缓存"""
        if self._access_token and self._token_expires_at and time.time() < self._token_expires_at:
            return self._access_token

        url = f'{self.base_url}/api/openapi/v1/auth/getAccessToken'
        payload = {
            'appKey': self.app_key,
            'appSecurity': self.app_secret,
        }
        resp = self._session.post(url, json=payload, timeout=REQUEST_TIMEOUT)
        data = self._parse_response(resp, 'getAccessToken')

        value = data.get('value', {})
        token = value.get('accessToken')
        if not token:
            raise EkbAPIError(f'认证失败，未获取到 accessToken，响应: {data}')

        self._access_token = token
        self._corporation_id = value.get('corporationId', '')
        self._refresh_token = value.get('refreshToken', '')
        expire_time = value.get('expireTime', 0)
        if expire_time:
            self._token_expires_at = expire_time / 1000 - 300
        else:
            self._token_expires_at = time.time() + 7200 - 300

        # 钉钉版合思要求 accessToken 通过 query string 传递，不是 header
        logger.info('易快报认证成功，企业ID: %s', self._corporation_id)
        return token

    def test_connection(self) -> dict:
        """测试连接，返回连通性信息"""
        try:
            token = self.authenticate()
            # 用员工列表验证 token 可用（count=1 最小开销）
            data = self._get('/api/openapi/v1/staffs', params={'start': 0, 'count': 1})
            total_staffs = data.get('count', 0)
            return {
                'connected': True,
                'base_url': self.base_url,
                'app_key': self.app_key[:8] + '...',
                'corp_id': self._corporation_id,
                'total_staffs': total_staffs,
                'token_prefix': token[:12] + '...',
            }
        except Exception as ex:
            return {'connected': False, 'error': str(ex)}

    # ------------------------------------------------------------------
    # 基础请求
    # ------------------------------------------------------------------

    def _parse_response(self, resp: requests.Response, endpoint: str) -> dict:
        """解析 API 响应，统一错误处理"""
        try:
            data = resp.json()
        except Exception:
            raise EkbAPIError(f'[{endpoint}] 响应不是 JSON: {resp.text[:200]}',
                              status_code=resp.status_code)

        if not resp.ok:
            error_msg = data.get('errorMessage') or data.get('msg') or str(data)
            raise EkbAPIError(f'[{endpoint}] HTTP {resp.status_code}: {error_msg}',
                              status_code=resp.status_code, response_data=data)

        error_code = data.get('errorCode') or data.get('code')
        if error_code and error_code not in ('ok', 'OK', '0', 0, None, ''):
            error_msg = data.get('errorMessage') or data.get('msg') or str(data)
            raise EkbAPIError(f'[{endpoint}] 业务错误 {error_code}: {error_msg}',
                              response_data=data)
        return data

    def _get(self, path: str, params: dict = None, retry: int = RETRY_TIMES) -> dict:
        """带重试的 GET 请求"""
        self.authenticate()
        url = f'{self.base_url}{path}'
        params = dict(params or {})
        params['accessToken'] = self._access_token
        for attempt in range(retry):
            try:
                resp = self._session.get(url, params=params, timeout=REQUEST_TIMEOUT)
                return self._parse_response(resp, path)
            except EkbAPIError:
                raise
            except Exception as ex:
                if attempt < retry - 1:
                    logger.warning('[%s] 请求失败，第 %d 次重试: %s', path, attempt + 1, ex)
                    time.sleep(RETRY_SLEEP * (attempt + 1))
                else:
                    raise EkbAPIError(f'[{path}] 请求失败（已重试{retry}次）: {ex}')

    def _post(self, path: str, payload: dict = None, params: dict = None,
              retry: int = RETRY_TIMES) -> dict:
        """带重试的 POST 请求"""
        self.authenticate()
        url = f'{self.base_url}{path}'
        params = dict(params or {})
        params['accessToken'] = self._access_token
        for attempt in range(retry):
            try:
                resp = self._session.post(url, json=payload or {}, params=params,
                                          timeout=REQUEST_TIMEOUT)
                return self._parse_response(resp, path)
            except EkbAPIError:
                raise
            except Exception as ex:
                if attempt < retry - 1:
                    logger.warning('[%s] 请求失败，第 %d 次重试: %s', path, attempt + 1, ex)
                    time.sleep(RETRY_SLEEP * (attempt + 1))
                else:
                    raise EkbAPIError(f'[{path}] 请求失败（已重试{retry}次）: {ex}')

    # ------------------------------------------------------------------
    # 通用分页迭代
    # ------------------------------------------------------------------

    def iter_pages(self, path: str, params: dict = None,
                   page_size: int = PAGE_SIZE) -> Iterator[List[dict]]:
        """
        分页迭代 GET 接口，每次 yield 一页数据。

        终止条件（任一满足）：
          1. 返回的 items 为空
          2. 本页条数 < page_size（最后一页）
          3. 累计已获取 >= 响应中的 total count
        """
        params = dict(params or {})
        params['count'] = page_size
        offset = 0
        total_count = None  # 从首次响应中获取

        while True:
            params['start'] = offset
            data = self._get(path, params=params)

            # 获取总记录数（首次请求时）
            if total_count is None:
                total_count = data.get('count', None)

            # 提取 items（不同接口 key 不同）
            items = (data.get('items')
                     or data.get('value', {}).get('items')
                     or data.get('data', {}).get('items')
                     or data.get('value')
                     or [])
            if isinstance(items, dict):
                items = list(items.values())

            if not items:
                break

            yield items
            offset += len(items)

            # 终止判断
            if len(items) < page_size:
                break
            if total_count is not None and offset >= total_count:
                break

            time.sleep(0.2)  # 限流保护

    # ------------------------------------------------------------------
    # Phase 1: 基础主数据接口
    # 已验证可用路径（2026-03-20）
    # ------------------------------------------------------------------

    def get_corporation_info(self) -> dict:
        """获取企业信息"""
        return {
            'id': self._corporation_id,
            'name': '',
            'base_url': self.base_url,
        }

    def iter_departments(self) -> Iterator[List[dict]]:
        """遍历全量部门（114 个）"""
        yield from self.iter_pages('/api/openapi/v1/departments')

    def iter_staffs(self, has_leave: bool = True) -> Iterator[List[dict]]:
        """遍历全量员工（含历史离职，共 677 人）
        使用 v2 路径（v1 返回"不允许调用此接口"）
        """
        yield from self.iter_pages(
            '/api/openapi/v2/staffs',
            params={'hasLeave': str(has_leave).lower()},
        )

    def iter_roles(self) -> Iterator[List[dict]]:
        """遍历角色定义（roledefs 405，此接口不可用，返回空）"""
        return
        yield  # noqa: unreachable

    def iter_fee_types(self) -> Iterator[List[dict]]:
        """遍历费用类型（231 个，响应直接含 items 列表，无 count）"""
        data = self._get('/api/openapi/v1/feeTypes')
        items = data.get('items', data.get('value', {}).get('items', []))
        if isinstance(items, list) and items:
            yield items

    def iter_specifications(self) -> Iterator[List[dict]]:
        """遍历单据模板（14 个，使用 v2 路径）"""
        data = self._get('/api/openapi/v2/specifications')
        items = data.get('items', [])
        if items:
            yield items

    def iter_dimensions(self) -> Iterator[List[dict]]:
        """遍历自定义档案维度定义（15 个维度）"""
        yield from self.iter_pages('/api/openapi/v1/dimensions')

    def iter_dimension_items(self, dimension_id: str) -> Iterator[List[dict]]:
        """遍历指定维度的档案条目（正确路径：/dimensions/items）"""
        yield from self.iter_pages(
            '/api/openapi/v1/dimensions/items',
            params={'dimensionId': dimension_id},
        )

    def iter_all_dimension_items(self) -> Iterator[Tuple[str, List[dict]]]:
        """遍历所有维度的档案条目，yield (dimension_id, items)"""
        for dim_page in self.iter_dimensions():
            for dim in dim_page:
                dim_id = dim.get('id', '')
                if not dim_id:
                    continue
                all_items = []
                for items_page in self.iter_dimension_items(dim_id):
                    all_items.extend(items_page)
                if all_items:
                    yield dim_id, all_items

    def iter_payer_infos(self) -> Iterator[List[dict]]:
        """遍历付款账户"""
        yield from self.iter_pages('/api/openapi/v1/payerInfos')

    def iter_payee_infos(self) -> Iterator[List[dict]]:
        """遍历收款账户"""
        yield from self.iter_pages('/api/openapi/v1/payeeInfos')

    def get_currency_list(self) -> List[dict]:
        """获取币种汇率"""
        data = self._get('/api/openapi/v1/currencies')
        return data.get('value', {}).get('items', data.get('items', []))

    def get_city_groups(self) -> List[dict]:
        """获取城市分组"""
        data = self._get('/api/openapi/v1/cityGroups')
        return data.get('value', {}).get('items', data.get('items', []))

    # ------------------------------------------------------------------
    # Phase 2: 核心交易数据接口
    # ------------------------------------------------------------------

    def iter_flows(
        self,
        doc_type: str = 'expense',
        state: str = None,
        start_date: str = None,
        end_date: str = None,
        order_by: str = 'createTime',
        order_by_type: str = 'asc',
        uid: str = None,
    ) -> Iterator[List[dict]]:
        """
        遍历全量单据（通过 getApplyList 接口，覆盖 2018-2026 全量历史）。

        doc_type: expense（报销单）/ loan（借款单）/ payment（付款单）/
                  requisition（申请单）/ custom（通用审批）/ receipt（收款单）
        state: 单据状态，多个用逗号分隔，如 'paid,archived'，不传查全部
        start_date / end_date: 格式 'YYYY-MM-DD HH:MM:SS'（requests 会自动 URL encode）
        uid: 员工 ID，不传查企业全部
        """
        params: Dict[str, Any] = {
            'type': doc_type,
            'orderBy': order_by,
            'orderByType': order_by_type,
        }
        if state:
            params['state'] = state
        if start_date:
            params['startDate'] = start_date
        if end_date:
            params['endDate'] = end_date
        if uid:
            params['uid'] = uid

        yield from self.iter_pages('/api/openapi/v1.1/docs/getApplyList', params=params)

    def iter_all_flows(self) -> Iterator[List[dict]]:
        """遍历所有类型的单据（报销 + 借款 + 付款 + 申请）"""
        for doc_type in ('expense', 'loan', 'payment', 'requisition'):
            try:
                for page in self.iter_flows(doc_type=doc_type):
                    yield page
            except EkbAPIError as ex:
                logger.warning('采集 %s 类型单据失败: %s', doc_type, ex)

    def get_flow_detail(self, flow_id: str) -> dict:
        """获取单张单据详情"""
        data = self._get(f'/api/openapi/v1/flowDetails/{flow_id}')
        return data.get('value', data)

    def iter_approvals(self) -> Iterator[List[dict]]:
        """遍历审批记录"""
        yield from self.iter_pages('/api/openapi/v1/approvals/getApproveCorpList')

    def iter_loan_infos(self) -> Iterator[List[dict]]:
        """遍历借款信息"""
        yield from self.iter_pages('/api/openapi/v1/loanInfos')

    def iter_repayment_records(self) -> Iterator[List[dict]]:
        """遍历还款记录"""
        yield from self.iter_pages('/api/openapi/v1/repaymentRecords')

    def iter_payment_records(self) -> Iterator[List[dict]]:
        """遍历付款记录"""
        yield from self.iter_pages('/api/openapi/v1/paymentRecords')

    # ------------------------------------------------------------------
    # Phase 3: 预算与发票
    # ------------------------------------------------------------------

    def iter_budgets(self) -> Iterator[List[dict]]:
        """遍历预算包列表（5 个，使用 v2 路径，无分页 count）"""
        data = self._get('/api/openapi/v2/budgets')
        items = data.get('items', [])
        if items:
            yield items

    def get_budget_details(self, budget_id: str) -> dict:
        """获取预算详情（含节点）"""
        data = self._get(f'/api/openapi/v1/budgets/{budget_id}')
        return data.get('value', data)

    def iter_invoices(self) -> Iterator[List[dict]]:
        """遍历发票台账"""
        yield from self.iter_pages('/api/openapi/v2.1/datalink/INVOICE')

    # ------------------------------------------------------------------
    # Phase 4: 附件
    # ------------------------------------------------------------------

    def get_flow_attachments(self, flow_id: str) -> List[dict]:
        """获取单据附件列表"""
        data = self._get(f'/api/openapi/v1/attachments', params={'flowId': flow_id})
        return data.get('value', {}).get('items', data.get('items', []))

    def download_attachment(self, attachment_id: str, save_path: str) -> bool:
        """下载附件到本地路径"""
        self.authenticate()
        url = f'{self.base_url}/api/openapi/v1/attachments/download/{attachment_id}'
        try:
            resp = self._session.get(url, params={'accessToken': self._access_token},
                                     timeout=60, stream=True)
            if resp.ok:
                import os
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                with open(save_path, 'wb') as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                return True
            else:
                logger.warning('附件下载失败 [%s] HTTP %d', attachment_id, resp.status_code)
                return False
        except Exception as ex:
            logger.error('附件下载异常 [%s]: %s', attachment_id, ex)
            return False

    # ------------------------------------------------------------------
    # 增量接口（Phase 5）
    # ------------------------------------------------------------------

    def iter_flows_since(self, since_datetime: datetime) -> Iterator[List[dict]]:
        """增量获取指定时间之后更新的单据（用 updateTime 过滤）"""
        since_str = since_datetime.strftime('%Y-%m-%d %H:%M:%S')
        for doc_type in ('expense', 'loan', 'requisition'):
            try:
                yield from self.iter_flows(
                    doc_type=doc_type,
                    start_date=since_str,
                    order_by='updateTime',
                    order_by_type='asc',
                )
            except EkbAPIError as ex:
                logger.warning('增量采集 %s 失败: %s', doc_type, ex)

    def iter_staffs_since(self, since_datetime: datetime) -> Iterator[List[dict]]:
        """增量获取变更员工"""
        yield from self.iter_pages(
            '/api/openapi/v1/staffs',
            params={'hasLeave': 'true', 'updateTimeFrom': int(since_datetime.timestamp() * 1000)},
        )


# ============================================================================
# 便捷工厂
# ============================================================================

def get_client() -> EkbClient:
    """获取已配置的易快报客户端（可从 Django settings 读取配置）"""
    try:
        from django.conf import settings
        app_key = getattr(settings, 'EKB_APP_KEY', EKB_APP_KEY)
        app_secret = getattr(settings, 'EKB_APP_SECRET', EKB_APP_SECRET)
    except Exception:
        app_key, app_secret = EKB_APP_KEY, EKB_APP_SECRET
    return EkbClient(app_key=app_key, app_secret=app_secret)


# ============================================================================
# 飞书版易快报客户端（使用 web session token 访问内部 API）
# ============================================================================

EBRIDGE_BASE = 'https://ebridge.serverless.ekuaibao.com'
EKB_SESSION_REFRESH_PATH = '/api/account/v2/session/getAccessToken'
EKB_FLOW_SEARCH_PATH = '/api/flow/v1/flows/search'
EKB_STAFF_ME_PATH = '/api/v1/organization/staffs/me'


class EkbFeishuClient:
    """
    易快报飞书版内部 API 客户端

    认证链路（一次性，由 init_from_oauth_code 完成）：
      飞书 OAuth code
        → ebridge/auth/feishu/toEkbIndex
        → dd2.hosecloud.com web session token
        → 持久化到 EkbWebSession 表

    后续调用（自动刷新）：
      EkbWebSession.get_valid_token()
        若即将过期 → /api/account/v2/session/getAccessToken 刷新
        → 内部 API（/api/flow/v1/flows/search 等）
    """

    CORP_ID = 'nYA6xdjChA7c00'

    def __init__(self):
        self._token: Optional[str] = None
        self._session = requests.Session()
        self._session.headers.update({'Content-Type': 'application/json'})

    # ------------------------------------------------------------------
    # Token 管理
    # ------------------------------------------------------------------

    def _get_token(self) -> str:
        """获取有效 token，优先从 DB 取，过期则刷新"""
        try:
            from apps.ekuaibao_integration.models import EkbWebSession
            token = EkbWebSession.get_valid_token(self.CORP_ID)
            if token:
                self._token = token
                return token

            # DB 中已有记录但过期，尝试刷新
            try:
                obj = EkbWebSession.objects.get(corp_id=self.CORP_ID)
                if obj.web_token:
                    refreshed = self._refresh_token(obj.web_token)
                    if refreshed:
                        EkbWebSession.save_token(
                            corp_id=self.CORP_ID,
                            token=refreshed,
                            open_id=obj.feishu_open_id,
                            staff_name=obj.feishu_staff_name,
                        )
                        self._token = refreshed
                        return refreshed
            except EkbWebSession.DoesNotExist:
                pass
        except Exception as ex:
            logger.warning('EkbFeishuClient._get_token DB 访问失败: %s', ex)

        if self._token:
            return self._token

        raise EkbAPIError(
            '无有效的易快报飞书版 web session token。'
            '请运行: python manage.py init_ekb_feishu_session --code <飞书OAuth code>'
        )

    def _refresh_token(self, old_token: str) -> Optional[str]:
        """通过 /api/account/v2/session/getAccessToken 刷新 token（最长 7 天）"""
        url = (f'{EKB_BASE_URL}{EKB_SESSION_REFRESH_PATH}'
               f'?accessToken={old_token}&expireDate=604800')
        try:
            resp = self._session.get(url, timeout=REQUEST_TIMEOUT)
            data = resp.json()
            new_token = data.get('value', {}).get('accessToken', '')
            if new_token:
                logger.info('EkbFeishuClient: web session token 已刷新')
                return new_token
            logger.warning('EkbFeishuClient: 刷新 token 失败 %s', data)
        except Exception as ex:
            logger.warning('EkbFeishuClient: 刷新 token 异常 %s', ex)
        return None

    @classmethod
    def init_from_oauth_code(cls, feishu_code: str) -> 'EkbFeishuClient':
        """
        通过飞书 OAuth code 完成首次认证，持久化 token。

        :param feishu_code: 飞书 OAuth 授权码（从 /ekb_callback?code=xxx 获取）
        :raises EkbAPIError: 认证失败
        """
        session = requests.Session()
        session.headers.update({'Content-Type': 'application/json'})

        # 1. ebridge 换取 web session token
        url = (f'{EBRIDGE_BASE}/ebridge/auth/feishu/toEkbIndex'
               f'?corpId={cls.CORP_ID}&code={feishu_code}&isApplet=false')
        resp = session.get(url, timeout=30)
        data = resp.json()
        if data.get('code') != '0' or not data.get('result'):
            raise EkbAPIError(f'ebridge 认证失败: {data}')

        # result 是形如 https://dd2.hosecloud.com/web/hybrid.html?accessToken=xxx&... 的 URL
        result_url = data['result']
        import urllib.parse as up
        parsed = up.urlparse(result_url)
        params = up.parse_qs(parsed.query)
        web_token = params.get('accessToken', [''])[0]
        if not web_token:
            raise EkbAPIError(f'ebridge 结果中未找到 accessToken: {result_url}')

        # 2. 刷新为 7 天有效期 token
        client = cls()
        long_token = client._refresh_token(web_token) or web_token

        # 3. 获取员工信息
        open_id, staff_name = '', ''
        try:
            me_url = (f'{EKB_BASE_URL}{EKB_STAFF_ME_PATH}'
                      f'?accessToken={long_token}&corpId={cls.CORP_ID}')
            me_resp = session.get(me_url, timeout=REQUEST_TIMEOUT)
            me_data = me_resp.json().get('value', {}).get('staff', {})
            staff_name = me_data.get('name', '')
        except Exception:
            pass

        # 4. 持久化
        try:
            from apps.ekuaibao_integration.models import EkbWebSession
            EkbWebSession.save_token(
                corp_id=cls.CORP_ID,
                token=long_token,
                open_id=open_id,
                staff_name=staff_name,
            )
            logger.info('EkbFeishuClient: 初始化成功，员工: %s', staff_name)
        except Exception as ex:
            logger.warning('EkbFeishuClient: 持久化 token 失败 %s', ex)

        client._token = long_token
        return client

    # ------------------------------------------------------------------
    # 数据接口
    # ------------------------------------------------------------------

    def search_flows(self, start: int = 0, count: int = 100,
                     filter_by: Optional[str] = None) -> dict:
        """
        搜索单据（内部 API，覆盖 2017 年至今所有历史数据）

        :param start: 偏移量
        :param count: 每页数量（建议 ≤ 100，过大响应慢）
        :param filter_by: 过滤条件，如 'form.code.startsWith("B25")'
        :return: {'count': int, 'items': [...]}
        """
        token = self._get_token()
        url = (f'{EKB_BASE_URL}{EKB_FLOW_SEARCH_PATH}'
               f'?accessToken={token}&corpId={self.CORP_ID}')
        payload: Dict[str, Any] = {'start': start, 'count': count}
        if filter_by:
            payload['filterBy'] = filter_by

        for attempt in range(RETRY_TIMES):
            try:
                resp = self._session.post(url, json=payload, timeout=60)
                data = resp.json()
                if data.get('errorCode') == 401:
                    # token 失效，尝试刷新
                    token = self._get_token()
                    url = (f'{EKB_BASE_URL}{EKB_FLOW_SEARCH_PATH}'
                           f'?accessToken={token}&corpId={self.CORP_ID}')
                    continue
                return data
            except EkbAPIError:
                raise
            except Exception as ex:
                if attempt < RETRY_TIMES - 1:
                    time.sleep(RETRY_SLEEP * (attempt + 1))
                else:
                    raise EkbAPIError(f'search_flows 失败（已重试{RETRY_TIMES}次）: {ex}')

    def iter_all_flows(self, page_size: int = 50) -> Iterator[List[dict]]:
        """
        分页遍历全量单据。
        注：每页请求较慢（~15-20秒），建议 page_size=50。
        """
        total = None
        offset = 0
        while True:
            data = self.search_flows(start=offset, count=page_size)
            if total is None:
                total = data.get('count', 0)
                logger.info('EkbFeishuClient: 全量单据总数 %d', total)
            items = data.get('items', [])
            if not items:
                break
            yield items
            offset += len(items)
            if offset >= total:
                break
            time.sleep(0.5)

    def get_staff_me(self) -> dict:
        """获取当前登录员工信息"""
        token = self._get_token()
        url = (f'{EKB_BASE_URL}{EKB_STAFF_ME_PATH}'
               f'?accessToken={token}&corpId={self.CORP_ID}')
        resp = self._session.get(url, timeout=REQUEST_TIMEOUT)
        return resp.json().get('value', {}).get('staff', {})


def get_feishu_client() -> EkbFeishuClient:
    """获取易快报飞书版客户端（自动从 DB 加载 token）"""
    return EkbFeishuClient()
