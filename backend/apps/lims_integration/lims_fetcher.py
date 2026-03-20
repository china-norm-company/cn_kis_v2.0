"""
LIMS 数据采集器（lims.china-norm.com）

技术背景：
  LIMS 基于 Actionsoft AWS BPM 平台（应用 ID: com.qwings.apps.hzpjc），
  无标准 REST API，通过 Session 爬取 + 页面解析方式采集数据。

已验证的系统信息：
  - 登录端点：POST /r/jd（cmd=CLIENT_USER_LOGIN）
  - 密码加密：RSA 公钥加密（模数 rsa_n 硬编码在页面 JS 中）
  - 功能树：POST /r/jd（cmd=mportal2_get_dir_func）
  - 数据页：GET /r/w?cmd=CLIENT_DW_PORTAL&processGroupId=...

7 大中心（145 功能点）已完整探测，processGroupId 对照表见 LIMS_MENU_MAP。
"""
import binascii
import hashlib
import http.cookiejar
import json
import logging
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger('cn_kis.lims.fetcher')

# ============================================================================
# LIMS 系统常量
# ============================================================================

LIMS_BASE_URL = 'http://lims.china-norm.com'
LIMS_APP_ID = 'com.qwings.apps.hzpjc'

# RSA 公钥（从 /commons/js/rsa/rsa.pwd.public.js 提取，固定值）
RSA_MODULUS = (
    '8bcbceb956d3d6c0da8cd8847e50796eac0fb3d67d4901820fa85dcd8edbb30bd25966eb18223e1ace130'
    '8da181897df4559bf97cca6ae9a33a0baf6f53324334a385d2a7cbc186fb5070045080b6c948423e7ddcd'
    '795ac9eaa438317772f4a948409ecec92dfe222a10b4c327e8d0e494cc0aa42ebc786030a105da0637049d'
)
RSA_EXPONENT = '10001'

# 各功能模块的 processGroupId（通过 mportal2_get_dir_func 探测获取）
LIMS_MENU_MAP: Dict[str, Dict[str, str]] = {
    # 项目中心
    'commission': {
        'label': '委托信息',
        'pgid': 'obj_c5b7c93989624ab9bee5b8211a9efda3',
        'center': '项目中心',
    },
    'commission_detection': {
        'label': '委托检测信息',
        'pgid': 'obj_54642489b3d446d484429f93a9050595',
        'center': '项目中心',
    },
    'client': {
        'label': '客户信息',
        'pgid': 'obj_adbb91c8d6d240ce8b550adef47fcf7e',
        'center': '项目中心',
    },
    'sample': {
        'label': '样品信息',
        'pgid': 'obj_692dc14d112e4e4284ebd97e7dee9abe',
        'center': '项目中心',
    },
    'sample_storage': {
        'label': '样品入库',
        'pgid': 'obj_32f9b207a2034ad08f5ca2dee58edc24',
        'center': '项目中心',
    },
    'sample_transfer': {
        'label': '子样流转',
        'pgid': 'obj_0c27450a3d1843088071f8b0b59d72a3',
        'center': '项目中心',
    },
    'report_info': {
        'label': '审核信息',
        'pgid': 'obj_47c1a48367354bc8bf0968f512ec87a1',
        'center': '项目中心',
    },
    # 质量中心
    'standard': {
        'label': '标准信息台账',
        'pgid': 'obj_d9c4326e538b47d79cbf6aefc5cb580a',
        'center': '质量中心',
    },
    'method': {
        'label': '方法信息台账',
        'pgid': 'obj_cfbb7bc442e645a5b466cacdee9ab60b',
        'center': '质量中心',
    },
    'detection_project': {
        'label': '检测项目信息',
        'pgid': 'obj_6e603d8a14fa47d483f95f90b00b0d76',
        'center': '质量中心',
    },
    'quality_doc': {
        'label': '文件信息',
        'pgid': 'obj_50dc1bebac5049c3bde3bf85d788aa1d',
        'center': '质量中心',
    },
    'supplier': {
        'label': '供应商档案',
        'pgid': 'obj_5e306a42b74c40f5b3b4a77c67ef2d69',
        'center': '质量中心',
    },
    'supervision_record': {
        'label': '监督记录台账',
        'pgid': 'obj_fd85986b78b947558391b82263c79b3e',
        'center': '质量中心',
    },
    'personnel_auth': {
        'label': '人员授权记录',
        'pgid': 'obj_3a2d6b8848d14c588d1c72b22050603b',
        'center': '质量中心',
    },
    # 人员中心
    'personnel': {
        'label': '人员档案',
        'pgid': 'obj_042c81c95555402282c823da5e9e3921',
        'center': '人员中心',
    },
    'position': {
        'label': '岗位信息',
        'pgid': 'obj_04bf43056aa447d19a5b657cc787b1f0',
        'center': '人员中心',
    },
    'training_record': {
        'label': '培训记录',
        'pgid': 'obj_dde8ead54dba41dfbae0f76a3199e442',
        'center': '人员中心',
    },
    'competency_record': {
        'label': '能力考核记录',
        'pgid': 'obj_eab06e0146054cc7b8f7d3c691bbcb65',
        'center': '人员中心',
    },
    'personnel_auth_ledger': {
        'label': '人员授权台账',
        'pgid': 'obj_ba0a354fb4bc4dba90f57fc1d11fd46a',
        'center': '人员中心',
    },
    # 资源中心
    'equipment': {
        'label': '设备台账',
        'pgid': 'obj_a8f814c34f0b42e78b81e3d0ae69fd61',
        'center': '资源中心',
    },
    'calibration_record': {
        'label': '量值溯源记录',
        'pgid': 'obj_2b19025b8b2f40f594055d038183ff6e',
        'center': '资源中心',
    },
    'period_check_record': {
        'label': '期间核查记录',
        'pgid': 'obj_e96b94664ab04e58b239c8f9454351c3',
        'center': '资源中心',
    },
    'equipment_maintenance_record': {
        'label': '设备维护记录',
        'pgid': 'obj_ff2cb2c7762648b4a77c72ee83789d53',
        'center': '资源中心',
    },
    'equipment_repair_record': {
        'label': '设备维修记录',
        'pgid': 'obj_70a0c6c2f8304d848dc2cbcd0dea6674',
        'center': '资源中心',
    },
    'equipment_history': {
        'label': '设备经历记录',
        'pgid': 'obj_152ba79674b9430bb1b3c2bc334499e9',
        'center': '资源中心',
    },
    'equipment_usage': {
        'label': '设备使用记录',
        'pgid': 'obj_1c8dc1b0fe4a4fb5a6b254e130e459d9',
        'center': '资源中心',
    },
    'reference_material': {
        'label': '标准物质台账',
        'pgid': 'obj_cbd1112406bf45a39a7e10b78c539457',
        'center': '资源中心',
    },
    'consumable': {
        'label': '易耗品台账',
        'pgid': 'obj_75ac812eda46400bb2babb999f54d784',
        'center': '资源中心',
    },
    'group_info': {
        'label': '组别信息',
        'pgid': 'obj_bba4a02b39824fd7bcc8f867917c35c0',
        'center': '资源中心',
    },
    'group_personnel': {
        'label': '组别人员',
        'pgid': 'obj_5d45e9bcb588446ca00e1b7f6e8c9515',
        'center': '资源中心',
    },
    # 财会管理
    'invoice': {
        'label': '开票确认记录',
        'pgid': 'obj_a2da3ef4ef714391a60f36cc4324e3af',
        'center': '财会管理',
    },
}

# 模块分组（用于分阶段采集）
MODULE_TIERS = {
    'tier1': ['equipment', 'personnel', 'commission', 'commission_detection',
              'client', 'sample', 'sample_storage'],
    'tier2': ['standard', 'method', 'detection_project', 'calibration_record',
              'period_check_record', 'equipment_history', 'equipment_usage',
              'reference_material', 'training_record', 'competency_record',
              'personnel_auth_ledger'],
    'tier3': ['quality_doc', 'supplier', 'supervision_record', 'equipment_maintenance_record',
              'equipment_repair_record', 'sample_transfer', 'report_info',
              'invoice', 'group_info', 'group_personnel'],
}


# ============================================================================
# LIMS 会话管理
# ============================================================================

class LimsSession:
    """
    LIMS 会话封装

    维护登录状态，自动处理会话超时重试。
    RSA 加密密码，通过 CLIENT_USER_LOGIN 命令登录。
    """

    def __init__(self, username: str = 'malm', password: str = 'fushuo@123456'):
        self.username = username
        self.password = password
        self.sid: Optional[str] = None
        self._opener: Optional[urllib.request.OpenerDirector] = None
        self._jar = http.cookiejar.CookieJar()

    def _rsa_encrypt(self, plaintext: str) -> str:
        """RSA 加密密码（使用 LIMS 内置公钥）"""
        try:
            from Crypto.PublicKey import RSA
            from Crypto.Cipher import PKCS1_v1_5
            n = int(RSA_MODULUS, 16)
            e = int(RSA_EXPONENT, 16)
            key = RSA.construct((n, e))
            cipher = PKCS1_v1_5.new(key)
            encrypted = cipher.encrypt(plaintext.encode('utf-8'))
            return binascii.hexlify(encrypted).decode('utf-8')
        except ImportError:
            raise RuntimeError(
                'pycryptodome 未安装，请执行: pip install pycryptodome'
            )

    def _make_opener(self) -> urllib.request.OpenerDirector:
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._jar)
        )
        opener.addheaders = [
            ('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                           'AppleWebKit/537.36 (KHTML, like Gecko) '
                           'Chrome/120.0.0.0 Safari/537.36'),
            ('Accept-Language', 'zh-CN,zh;q=0.9'),
        ]
        return opener

    def login(self) -> bool:
        """登录 LIMS 系统，返回是否成功"""
        self._opener = self._make_opener()
        try:
            self._opener.open(LIMS_BASE_URL + '/', timeout=10)
            encrypted_pwd = self._rsa_encrypt(self.password)
            data = urllib.parse.urlencode({
                'userid': self.username,
                'pwd': encrypted_pwd,
                'cmd': 'CLIENT_USER_LOGIN',
                'sid': '',
                'deviceType': 'pc',
                'pwdEncode': 'RSA',
                'timeZone': '-8',
                'loginUrl': LIMS_BASE_URL + '/',
            }).encode('utf-8')
            req = urllib.request.Request(
                LIMS_BASE_URL + '/r/jd',
                data=data,
                headers={
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': LIMS_BASE_URL + '/',
                },
            )
            resp = self._opener.open(req, timeout=15)
            result = json.loads(resp.read().decode('utf-8'))
            if result.get('result') == 'ok':
                self.sid = result['data']['sid']
                logger.info('LIMS 登录成功，SID: %s...', self.sid[:16])
                return True
            else:
                logger.error('LIMS 登录失败: %s', result.get('msg', ''))
                return False
        except Exception as ex:
            logger.error('LIMS 登录异常: %s', ex)
            return False

    def post_jd(self, params: dict, timeout: int = 15) -> Optional[dict]:
        """向 /r/jd 发送 POST 请求，自动附加 sid"""
        if not self.sid or not self._opener:
            if not self.login():
                return None
        params = dict(params)
        params['sid'] = self.sid
        data = urllib.parse.urlencode(params).encode('utf-8')
        req = urllib.request.Request(
            LIMS_BASE_URL + '/r/jd',
            data=data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
        )
        try:
            resp = self._opener.open(req, timeout=timeout)
            text = resp.read().decode('utf-8', errors='ignore')
            return json.loads(text)
        except Exception as ex:
            logger.warning('LIMS /r/jd 请求失败: %s', ex)
            return None

    def get_page(self, url: str, timeout: int = 20) -> str:
        """GET 请求，返回 HTML 文本"""
        if not self.sid or not self._opener:
            if not self.login():
                return ''
        full_url = url if url.startswith('http') else LIMS_BASE_URL + url
        try:
            resp = self._opener.open(full_url, timeout=timeout)
            return resp.read().decode('utf-8', errors='ignore')
        except Exception as ex:
            logger.warning('LIMS GET %s 失败: %s', url, ex)
            return ''

    def get_module_page(self, pgid: str) -> str:
        """获取指定功能模块页面"""
        url = (f'{LIMS_BASE_URL}/r/w?sid={self.sid}'
               f'&cmd=CLIENT_DW_PORTAL'
               f'&processGroupId={pgid}'
               f'&appId={LIMS_APP_ID}')
        return self.get_page(url)


# ============================================================================
# 数据解析器
# ============================================================================

class LimsPageParser:
    """
    LIMS 页面数据解析器

    AWS BPM 系统的数据列表页通常包含：
    1. HTML 表格（<table> 标签）
    2. 内嵌 JSON 数据（JS 变量或 data-* 属性）
    3. AJAX 分页加载的 JSON 数据

    解析策略：优先 JSON 数据，降级到 HTML 表格解析。
    """

    @staticmethod
    def extract_table_data(html: str) -> List[Dict[str, str]]:
        """解析 HTML 表格为字典列表"""
        rows = []
        table_match = re.search(
            r'<table[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE
        )
        if not table_match:
            return rows

        table_html = table_match.group(1)
        # 提取表头
        header_cells = re.findall(
            r'<th[^>]*>(.*?)</th>', table_html, re.DOTALL | re.IGNORECASE
        )
        headers = [re.sub(r'<[^>]+>', '', h).strip() for h in header_cells]
        if not headers:
            # 尝试第一行 td 作为表头
            first_row = re.search(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL | re.IGNORECASE)
            if first_row:
                headers = [
                    re.sub(r'<[^>]+>', '', td).strip()
                    for td in re.findall(r'<td[^>]*>(.*?)</td>', first_row.group(1), re.DOTALL)
                ]

        # 提取数据行
        data_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL | re.IGNORECASE)
        for row_html in data_rows[1:]:  # 跳过表头行
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row_html, re.DOTALL | re.IGNORECASE)
            cell_values = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
            if cell_values and any(v for v in cell_values):
                if headers:
                    row_dict = dict(zip(headers, cell_values))
                else:
                    row_dict = {f'col_{i}': v for i, v in enumerate(cell_values)}
                rows.append(row_dict)
        return rows

    @staticmethod
    def extract_json_data(html: str) -> List[Dict[str, Any]]:
        """从 JS 变量或内嵌 JSON 中提取数据"""
        records = []

        # 尝试提取 gridData、listData、tableData 等变量
        patterns = [
            r'var\s+(?:gridData|listData|tableData|dataList|rowData)\s*=\s*(\[[\s\S]*?\]);',
            r'data\s*:\s*(\[[\s\S]*?\])\s*[,;]',
            r'"rows"\s*:\s*(\[[\s\S]*?\])',
        ]
        for pattern in patterns:
            m = re.search(pattern, html)
            if m:
                try:
                    data = json.loads(m.group(1))
                    if isinstance(data, list) and data:
                        return data
                except (json.JSONDecodeError, ValueError):
                    continue

        return records

    @staticmethod
    def find_ajax_list_endpoint(html: str, pgid: str) -> Optional[str]:
        """
        尝试从页面 JS 中找到数据加载的 AJAX 端点。
        AWS BPM 通常通过 /r/jd?cmd=xxx 加载列表数据。
        """
        # 查找 cmd 参数模式
        cmd_patterns = re.findall(
            r'cmd["\s:=]+["\']([A-Za-z0-9_.]+)["\']', html
        )
        # 查找 AJAX URL 模式
        ajax_urls = re.findall(
            r'(?:url|action)\s*[:=]\s*["\']([^"\']*(?:/r/jd|/r/rest)[^"\']*)["\']',
            html
        )
        return {
            'cmds': list(set(cmd_patterns)),
            'urls': list(set(ajax_urls)),
        }


# ============================================================================
# 各模块数据采集函数
# ============================================================================

def _compute_record_id(module: str, raw_data: dict) -> str:
    """生成记录的 LIMS 内部标识（从原始数据中提取或生成）"""
    # 常见 ID 字段名
    id_fields = ['id', 'ID', 'recordId', '编号', 'code', 'NO', 'no',
                 '序号', '设备编号', '人员编号', '委托编号', '样品编号']
    for field in id_fields:
        if field in raw_data and raw_data[field]:
            return f'{module}_{raw_data[field]}'
    # 降级：用数据内容 hash
    content = json.dumps(raw_data, sort_keys=True, ensure_ascii=False)
    return f'{module}_{hashlib.md5(content.encode()).hexdigest()[:12]}'


def fetch_module_data(
    session: LimsSession,
    module: str,
    max_pages: int = 50,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    采集指定模块的全量数据。

    返回: (records_list, meta_info)
    每条 record 格式:
      {
        "lims_id": "equipment_XXX",
        "module": "equipment",
        "raw_data": {...},  # 原始字段
        "source_url": "...",
        "scraped_at": "2026-03-18T14:30:00",
      }
    """
    meta = {
        'module': module,
        'pgid': LIMS_MENU_MAP.get(module, {}).get('pgid', ''),
        'label': LIMS_MENU_MAP.get(module, {}).get('label', module),
        'total': 0,
        'pages': 0,
        'errors': [],
        'parse_method': 'unknown',
    }

    if module not in LIMS_MENU_MAP:
        meta['errors'].append(f'未知模块: {module}')
        return [], meta

    pgid = LIMS_MENU_MAP[module]['pgid']
    records = []

    # 访问模块页面
    html = session.get_module_page(pgid)
    if not html or '找不到资源对象' in html or len(html) < 500:
        # 尝试获取模块数据端点信息
        endpoint_info = LimsPageParser.find_ajax_list_endpoint(html, pgid)
        meta['errors'].append(
            f'页面加载失败或返回404。端点信息: {endpoint_info}'
        )
        logger.warning('[%s] 模块页面无效，尝试 AJAX 端点: %s', module, endpoint_info)

        # 尝试通过 AJAX 端点直接查询
        for cmd in (endpoint_info.get('cmds', []) if endpoint_info else []):
            result = session.post_jd({'cmd': cmd, 'appId': LIMS_APP_ID,
                                      'processGroupId': pgid})
            if result and result.get('result') == 'ok':
                data = result.get('data', [])
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            lims_id = _compute_record_id(module, item)
                            records.append({
                                'lims_id': lims_id,
                                'module': module,
                                'raw_data': item,
                                'source_url': f'cmd={cmd}',
                                'scraped_at': datetime.now().isoformat(),
                            })
                    meta['parse_method'] = f'ajax_cmd:{cmd}'
                    break
        meta['total'] = len(records)
        return records, meta

    # 解析页面数据
    page_url = (f'{LIMS_BASE_URL}/r/w?sid={session.sid}'
                f'&cmd=CLIENT_DW_PORTAL&processGroupId={pgid}&appId={LIMS_APP_ID}')

    # 方法1: 提取内嵌 JSON
    json_records = LimsPageParser.extract_json_data(html)
    if json_records:
        meta['parse_method'] = 'embedded_json'
        for item in json_records:
            if isinstance(item, dict):
                lims_id = _compute_record_id(module, item)
                records.append({
                    'lims_id': lims_id,
                    'module': module,
                    'raw_data': item,
                    'source_url': page_url,
                    'scraped_at': datetime.now().isoformat(),
                })
        logger.info('[%s] JSON 方式提取 %d 条记录', module, len(records))

    # 方法2: 解析 HTML 表格
    if not records:
        table_records = LimsPageParser.extract_table_data(html)
        if table_records:
            meta['parse_method'] = 'html_table'
            for item in table_records:
                lims_id = _compute_record_id(module, item)
                records.append({
                    'lims_id': lims_id,
                    'module': module,
                    'raw_data': item,
                    'source_url': page_url,
                    'scraped_at': datetime.now().isoformat(),
                })
            logger.info('[%s] HTML 表格方式提取 %d 条记录', module, len(records))

    # 处理分页（AWS BPM 通常使用 pageNo/pageSize 参数）
    page_num = 1
    while page_num < max_pages:
        next_page_url = (f'{page_url}&pageNo={page_num + 1}&pageSize=50')
        next_html = session.get_page(next_page_url)
        if not next_html or next_html == html:
            break
        next_records_json = LimsPageParser.extract_json_data(next_html)
        next_records_table = LimsPageParser.extract_table_data(next_html) if not next_records_json else []
        next_items = next_records_json or next_records_table
        if not next_items:
            break
        for item in next_items:
            if isinstance(item, dict):
                lims_id = _compute_record_id(module, item)
                records.append({
                    'lims_id': lims_id,
                    'module': module,
                    'raw_data': item,
                    'source_url': next_page_url,
                    'scraped_at': datetime.now().isoformat(),
                })
        page_num += 1
        meta['pages'] = page_num
        time.sleep(0.3)  # 礼貌延迟，避免对 LIMS 造成压力

    meta['total'] = len(records)
    meta['pages'] = max(page_num, 1)
    logger.info('[%s] 采集完成: %d 条记录，%d 页', module, len(records), meta['pages'])
    return records, meta


# ============================================================================
# 主采集入口
# ============================================================================

class LimsFetcher:
    """
    LIMS 全量数据采集器

    自动选择采集方式：
    - 优先使用 Playwright 浏览器自动化（拦截真实 AJAX 请求）
    - 降级到 HTTP Session 爬取（仅能获取静态 HTML 中的数据）

    LIMS 使用 AWS BPM DW 数据视图（Vue 3 SPA），数据通过 AJAX 动态加载，
    必须通过 Playwright 才能完整获取数据。

    使用方式:
        fetcher = LimsFetcher()
        result = fetcher.fetch_all(modules=['equipment', 'personnel'])
    """

    def __init__(
        self,
        username: str = 'malm',
        password: str = 'fushuo@123456',
        request_delay: float = 0.5,
        prefer_playwright: bool = True,
    ):
        self.username = username
        self.password = password
        self.request_delay = request_delay
        self.prefer_playwright = prefer_playwright
        self.session = LimsSession(username, password)
        self._playwright_fetcher = None

        # 检测 Playwright 是否可用
        self._playwright_available = False
        if prefer_playwright:
            try:
                import playwright  # noqa
                self._playwright_available = True
                logger.info('Playwright 可用，将使用浏览器自动化采集')
            except ImportError:
                logger.warning('Playwright 未安装，降级到 HTTP 采集（数据可能不完整）')

    def _get_playwright_fetcher(self):
        if self._playwright_fetcher is None:
            from apps.lims_integration.lims_fetcher_playwright import LimsPlaywrightFetcher
            self._playwright_fetcher = LimsPlaywrightFetcher(
                username=self.username,
                password=self.password,
                headless=True,
            )
        return self._playwright_fetcher

    def fetch_module(self, module: str) -> Tuple[List[Dict], Dict]:
        """采集单个模块"""
        if self._playwright_available:
            logger.info('开始采集模块（Playwright）: %s', module)
            try:
                return self._get_playwright_fetcher().fetch_module(module)
            except Exception as ex:
                logger.warning('[%s] Playwright 采集失败，降级到 HTTP: %s', module, ex)
        # HTTP 降级
        logger.info('开始采集模块（HTTP）: %s', module)
        records, meta = fetch_module_data(self.session, module)
        time.sleep(self.request_delay)
        return records, meta

    def fetch_all(
        self,
        modules: Optional[List[str]] = None,
        tier: Optional[str] = None,
    ) -> Dict[str, Tuple[List[Dict], Dict]]:
        """
        批量采集多个模块。优先使用 Playwright 一次性采集所有模块（共用浏览器实例）。
        """
        if modules:
            target_modules = modules
        elif tier:
            target_modules = MODULE_TIERS.get(tier, [])
        else:
            target_modules = list(LIMS_MENU_MAP.keys())

        if self._playwright_available:
            try:
                logger.info('使用 Playwright 批量采集 %d 个模块', len(target_modules))
                return self._get_playwright_fetcher().fetch_modules(target_modules)
            except Exception as ex:
                logger.warning('Playwright 批量采集失败，降级到 HTTP: %s', ex)

        # HTTP 降级（逐模块）
        if not self.session.login():
            raise RuntimeError('LIMS 登录失败，请检查账号密码')

        results = {}
        total_records = 0
        for module in target_modules:
            try:
                records, meta = fetch_module_data(self.session, module)
                results[module] = (records, meta)
                total_records += len(records)
                logger.info('[%s] 完成: %d 条', module, len(records))
            except Exception as ex:
                logger.error('[%s] 采集异常: %s', module, ex)
                results[module] = ([], {'module': module, 'total': 0, 'errors': [str(ex)]})

        logger.info('全量采集完成: %d 个模块，共 %d 条记录', len(results), total_records)
        return results

    def fetch_tier1(self) -> Dict[str, Tuple[List[Dict], Dict]]:
        """采集 Tier 1 高优先级数据（设备、人员、委托、客户、样品）"""
        return self.fetch_all(tier='tier1')

    def fetch_tier2(self) -> Dict[str, Tuple[List[Dict], Dict]]:
        """采集 Tier 2 数据（标准/方法、校准、培训等）"""
        return self.fetch_all(tier='tier2')

    def fetch_tier3(self) -> Dict[str, Tuple[List[Dict], Dict]]:
        """采集 Tier 3 数据（文件/SOP、供应商、报告等）"""
        return self.fetch_all(tier='tier3')

    def test_connection(self) -> Dict[str, Any]:
        """测试 LIMS 连接，优先使用 Playwright"""
        if self._playwright_available:
            try:
                return self._get_playwright_fetcher().test_connection()
            except Exception as ex:
                logger.warning('Playwright 连接测试失败: %s', ex)

        # HTTP 降级
        success = self.session.login()
        return {
            'connected': success,
            'base_url': LIMS_BASE_URL,
            'username': self.session.username,
            'sid': self.session.sid[:16] + '...' if self.session.sid else None,
            'method': 'http_session',
            'available_modules': list(LIMS_MENU_MAP.keys()),
            'tier1_modules': MODULE_TIERS['tier1'],
        }
