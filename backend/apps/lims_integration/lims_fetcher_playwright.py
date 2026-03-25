"""
LIMS 数据采集器 - Playwright 浏览器自动化版本（DOM 提取方式）

技术方案：
  使用 Playwright 控制 Chromium 浏览器，通过 DOM 提取 LIMS DW 数据视图的
  真实渲染数据，同时拦截 JSON 响应获取字段映射信息。

  已验证：
  - LIMS DW Vue 应用可以正常渲染（设备台账 660 条，33 页）
  - 字段映射通过 colConfigInfo 响应获取（72 个字段）
  - 数据通过 VXE Table 渲染在 DOM 中，可直接提取
  - 分页信息通过 maindata.pageCount 获取

使用方式：
  from apps.lims_integration.lims_fetcher_playwright import LimsPlaywrightFetcher
  fetcher = LimsPlaywrightFetcher()
  data, meta = fetcher.fetch_module('equipment')
  print(f'{meta["total"]} 条设备记录')
"""
import asyncio
import json
import logging
import os
import re
import shutil
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger('cn_kis.lims.playwright')

LIMS_BASE_URL = 'http://lims.china-norm.com:8088'
LIMS_USERNAME = 'malm'
LIMS_PASSWORD = 'fushuo@123456'


def _find_system_chromium() -> Optional[str]:
    """
    查找系统已安装的 Chromium 或 Google Chrome 路径。
    当 playwright 管理的 chromium 未下载完成时使用系统版本。
    支持 Linux 和 macOS。
    """
    candidates = [
        # Linux
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/snap/bin/chromium',
        # macOS
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        os.path.expanduser('~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ]
    for path in candidates:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            logger.info('使用系统 Chromium: %s', path)
            return path
    # 用 shutil.which 补充搜索
    for name in ('chromium', 'chromium-browser', 'google-chrome'):
        found = shutil.which(name)
        if found:
            logger.info('使用系统 Chromium（which）: %s', found)
            return found
    return None

# 各功能模块的 processGroupId 和 appId
LIMS_MODULE_MAP: Dict[str, Dict[str, str]] = {
    # P0 主数据底座
    'equipment': {
        'label': '设备台账',
        'pgid': 'obj_a8f814c34f0b42e78b81e3d0ae69fd61',
        'appId': 'com.qwings.apps.eqmt',
    },
    'personnel': {
        'label': '人员档案',
        'pgid': 'obj_042c81c95555402282c823da5e9e3921',
        'appId': 'com.qwings.apps.hrm',
    },
    'commission': {
        'label': '委托信息',
        'pgid': 'obj_c5b7c93989624ab9bee5b8211a9efda3',
        'appId': 'com.qwings.apps.hzpjc',
    },
    'commission_detection': {
        'label': '委托检测信息',
        'pgid': 'obj_54642489b3d446d484429f93a9050595',
        'appId': 'com.qwings.apps.hzpjc',
    },
    'client': {
        'label': '客户信息',
        'pgid': 'obj_adbb91c8d6d240ce8b550adef47fcf7e',
        'appId': 'com.qwings.apps.hzpjc',
    },
    'sample': {
        'label': '样品信息',
        'pgid': 'obj_692dc14d112e4e4284ebd97e7dee9abe',
        'appId': 'com.qwings.apps.hzpjc',
    },
    'sample_storage': {
        'label': '样品入库',
        'pgid': 'obj_32f9b207a2034ad08f5ca2dee58edc24',
        'appId': 'com.qwings.apps.hzpjc',
    },
    # P1 合规约束
    'standard': {
        'label': '标准信息台账',
        'pgid': 'obj_d9c4326e538b47d79cbf6aefc5cb580a',
        'appId': 'com.qwings.apps.hrm',
    },
    'method': {
        'label': '方法信息台账',
        'pgid': 'obj_cfbb7bc442e645a5b466cacdee9ab60b',
        'appId': 'com.qwings.apps.hrm',
    },
    'calibration_record': {
        'label': '量值溯源记录',
        'pgid': 'obj_2b19025b8b2f40f594055d038183ff6e',
        'appId': 'com.qwings.apps.eqmt',
    },
    'period_check_record': {
        'label': '期间核查记录',
        'pgid': 'obj_e96b94664ab04e58b239c8f9454351c3',
        'appId': 'com.qwings.apps.eqmt',
    },
    'reference_material': {
        'label': '标准物质台账',
        'pgid': 'obj_cbd1112406bf45a39a7e10b78c539457',
        'appId': 'com.qwings.apps.inner.material',
    },
    'consumable': {
        'label': '易耗品台账',
        'pgid': 'obj_75ac812eda46400bb2babb999f54d784',
        'appId': 'com.qwings.apps.inner.material',
    },
    'training_record': {
        'label': '培训记录',
        'pgid': 'obj_dde8ead54dba41dfbae0f76a3199e442',
        'appId': 'com.qwings.apps.hrm',
    },
    'competency_record': {
        'label': '能力考核记录',
        'pgid': 'obj_eab06e0146054cc7b8f7d3c691bbcb65',
        'appId': 'com.qwings.apps.hrm',
    },
    'personnel_auth_ledger': {
        'label': '人员授权台账',
        'pgid': 'obj_ba0a354fb4bc4dba90f57fc1d11fd46a',
        'appId': 'com.qwings.apps.hrm',
    },
    # P2 过程追溯
    'equipment_usage': {
        'label': '设备使用记录',
        'pgid': 'obj_1c8dc1b0fe4a4fb5a6b254e130e459d9',
        'appId': 'com.qwings.apps.eqmt',
    },
    'equipment_history': {
        'label': '设备经历记录',
        'pgid': 'obj_152ba79674b9430bb1b3c2bc334499e9',
        'appId': 'com.qwings.apps.eqmt',
    },
    'equipment_maintenance_record': {
        'label': '设备维护记录',
        'pgid': 'obj_ff2cb2c7762648b4a77c72ee83789d53',
        'appId': 'com.qwings.apps.eqmt',
    },
    'equipment_repair_record': {
        'label': '设备维修记录',
        'pgid': 'obj_70a0c6c2f8304d848dc2cbcd0dea6674',
        'appId': 'com.qwings.apps.eqmt',
    },
    'sample_transfer': {
        'label': '子样流转',
        'pgid': 'obj_0c27450a3d1843088071f8b0b59d72a3',
        'appId': 'com.qwings.apps.hzpjc',
    },
    'group_info': {
        'label': '组别信息',
        'pgid': 'obj_bba4a02b39824fd7bcc8f867917c35c0',
        'appId': 'com.qwings.apps.hzpjc',
    },
    'group_personnel': {
        'label': '组别人员',
        'pgid': 'obj_5d45e9bcb588446ca00e1b7f6e8c9515',
        'appId': 'com.qwings.apps.hzpjc',
    },
    # P3 质量与经营闭环
    'quality_doc': {
        'label': '文件信息',
        'pgid': 'obj_50dc1bebac5049c3bde3bf85d788aa1d',
        'appId': 'com.qwings.apps.hrm',
    },
    'supplier': {
        'label': '供应商档案',
        'pgid': 'obj_5e306a42b74c40f5b3b4a77c67ef2d69',
        'appId': 'com.qwings.apps.hrm',
    },
    'supervision_record': {
        'label': '监督记录台账',
        'pgid': 'obj_fd85986b78b947558391b82263c79b3e',
        'appId': 'com.qwings.apps.hrm',
    },
    'report_info': {
        'label': '审核信息',
        'pgid': 'obj_47c1a48367354bc8bf0968f512ec87a1',
        'appId': 'com.qwings.apps.hzpjc',
    },
    'invoice': {
        'label': '开票确认记录',
        'pgid': 'obj_a2da3ef4ef714391a60f36cc4324e3af',
        'appId': 'com.qwings.apps.hzpjc',
    },
}

MODULE_TIERS = {
    'tier1': ['equipment', 'personnel', 'commission', 'commission_detection',
              'client', 'sample', 'sample_storage'],
    'tier2': ['standard', 'method', 'calibration_record', 'period_check_record',
              'reference_material', 'consumable', 'training_record',
              'competency_record', 'personnel_auth_ledger'],
    'tier3': ['equipment_usage', 'equipment_history', 'equipment_maintenance_record',
              'equipment_repair_record', 'sample_transfer', 'group_info',
              'group_personnel', 'quality_doc', 'supplier', 'supervision_record',
              'report_info', 'invoice'],
}

# DOM 数据提取 JS（注入到页面中执行）
EXTRACT_TABLE_JS = '''() => {
    // 尝试多种 VXE/Element Table 选择器
    const rowSelectors = [
        '.vxe-body--row',
        'tr[class*="body--row"]',
        '.el-table__row',
        'tr.grid-row',
    ];
    const cellSelectors = [
        '.vxe-body--column',
        'td[class*="body--column"]',
        '.el-table__cell',
        'td',
    ];

    let rows = [];
    for (const sel of rowSelectors) {
        rows = document.querySelectorAll(sel);
        if (rows.length > 0) break;
    }

    const data = [];
    rows.forEach(row => {
        let cells = [];
        for (const sel of cellSelectors) {
            cells = row.querySelectorAll(sel);
            if (cells.length > 1) break;
        }
        if (cells.length > 1) {
            const rowData = [];
            cells.forEach(cell => {
                rowData.push(cell.innerText.trim().replace(/\\n/g, ' ').replace(/\\s+/g, ' '));
            });
            if (rowData.some(c => c.length > 0)) {
                data.push(rowData);
            }
        }
    });
    return data;
}'''

GET_HEADERS_JS = '''() => {
    const headerSelectors = [
        '.vxe-header--column .vxe-cell',
        '.vxe-header--column',
        'th[class*="header--column"]',
        '.el-table__header th',
        'th',
    ];
    let headers = [];
    for (const sel of headerSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 2) {
            els.forEach(h => headers.push(h.innerText.trim().replace(/\\n/g, ' ')));
            break;
        }
    }
    return headers;
}'''

GET_PAGINATION_JS = '''() => {
    const pagination = document.querySelector(
        '.el-pagination, .vxe-pager, [class*="pagination"]'
    );
    if (!pagination) return {found: false, text: '', total: 0};
    const text = pagination.innerText;
    const totalMatch = text.match(/共\\s*(\\d+)\\s*条/);
    return {
        found: true,
        text: text.substring(0, 100),
        total: totalMatch ? parseInt(totalMatch[1]) : 0,
    };
}'''


class LimsPlaywrightFetcher:
    """
    LIMS 数据采集器（Playwright 浏览器自动化 + DOM 提取）

    通过 Playwright 控制 Chromium，渲染 DW 数据视图并从 DOM 中提取数据，
    同时拦截 JSON 获取字段映射信息（field -> 中文label）。

    运行要求：
      pip install playwright
      playwright install chromium
    """

    def __init__(
        self,
        username: str = LIMS_USERNAME,
        password: str = LIMS_PASSWORD,
        headless: bool = True,
        page_delay_ms: int = 3000,
        turn_delay_ms: int = 1500,
        executable_path: str = None,
    ):
        self.username = username
        self.password = password
        self.headless = headless
        self.page_delay_ms = page_delay_ms
        self.turn_delay_ms = turn_delay_ms
        # 允许使用系统 chromium（当 playwright 管理的 chromium 未下载时）
        self.executable_path = executable_path or _find_system_chromium()

    # ------------------------------------------------------------------
    # 同步入口
    # ------------------------------------------------------------------

    def fetch_module(self, module: str) -> Tuple[List[Dict], Dict]:
        """同步：采集单个模块的全量数据"""
        return asyncio.run(self._fetch_one_module(module))

    def fetch_modules(self, modules: List[str]) -> Dict[str, Tuple[List[Dict], Dict]]:
        """同步：采集多个模块（复用同一浏览器实例）"""
        return asyncio.run(self._fetch_many_modules(modules))

    def fetch_all(
        self,
        modules: Optional[List[str]] = None,
        tier: Optional[str] = None,
    ) -> Dict[str, Tuple[List[Dict], Dict]]:
        if modules:
            target = modules
        elif tier:
            target = MODULE_TIERS.get(tier, [])
        else:
            target = list(LIMS_MODULE_MAP.keys())
        return self.fetch_modules(target)

    def test_connection(self) -> Dict[str, Any]:
        return asyncio.run(self._test_conn())

    # ------------------------------------------------------------------
    # 登录
    # ------------------------------------------------------------------

    async def _do_login(self, page) -> Tuple[bool, str]:
        """
        执行 LIMS 登录。
        返回 (success, sid)
        """
        from playwright.async_api import TimeoutError as PwTimeout
        try:
            await page.goto(LIMS_BASE_URL, timeout=15000)
            await page.wait_for_selector('#userid', timeout=8000)
            await page.fill('#userid', self.username)
            await page.fill('#pwd', self.password)
            await page.click('.login-button')
            # 等待跳转到主页
            try:
                await page.wait_for_load_state('networkidle', timeout=20000)
            except PwTimeout:
                pass
            # 获取 SID
            sid = await page.evaluate('() => typeof sid !== "undefined" ? sid : ""')
            if sid:
                logger.info('LIMS 登录成功，SID: %s...', sid[:16])
                return True, sid
            # SID 不在当前页面，可能在主页
            current_url = page.url
            logger.warning('登录后 SID 未找到，URL: %s', current_url[:60])
            return True, ''
        except PwTimeout as ex:
            logger.error('LIMS 登录超时: %s', ex)
            return False, ''
        except Exception as ex:
            logger.error('LIMS 登录失败: %s', ex)
            return False, ''

    # ------------------------------------------------------------------
    # 单模块采集（独立浏览器）
    # ------------------------------------------------------------------

    async def _fetch_one_module(self, module: str) -> Tuple[List[Dict], Dict]:
        """采集单个模块（使用独立浏览器实例）"""
        from playwright.async_api import async_playwright

        meta = {
            'module': module,
            'label': LIMS_MODULE_MAP.get(module, {}).get('label', module),
            'total': 0, 'pages': 0, 'errors': [], 'parse_method': 'playwright_dom',
        }
        if module not in LIMS_MODULE_MAP:
            meta['errors'].append(f'未知模块: {module}')
            return [], meta

        module_info = LIMS_MODULE_MAP[module]
        records = []

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=self.headless, executable_path=self.executable_path)
            page = await browser.new_page()
            # 使用 OrderedDict 保留 allColArray 的顺序
            # 格式: [(field_code, label), ...] 有序列表
            col_map_ordered: List[tuple] = []
            # API 返回的完整行数据（所有字段，不受 DOM 可见列限制）
            api_rows_buffer: List[dict] = []

            # 拦截 JSON：同时捕获列配置和完整行数据
            async def on_resp(response):
                try:
                    ct = response.headers.get('content-type', '')
                    if response.status == 200 and 'json' in ct:
                        body = await response.json()
                        if isinstance(body, dict) and body.get('result') == 'ok':
                            data = body.get('data', {})
                            if isinstance(data, dict):
                                # 捕获列配置（只取第一次）
                                if 'colConfigInfo' in data and not col_map_ordered:
                                    for col in data['colConfigInfo'].get('allColArray', []):
                                        f, l = col.get('field', ''), col.get('label', '')
                                        if f and l:
                                            col_map_ordered.append((f, l))
                                # 捕获完整行数据（rows / list / records / data）
                                for key in ('rows', 'list', 'records', 'datas'):
                                    rows = data.get(key)
                                    if isinstance(rows, list) and rows:
                                        api_rows_buffer.extend(rows)
                                        break
                except Exception:
                    pass

            page.on('response', on_resp)

            ok, sid = await self._do_login(page)
            if not ok:
                meta['errors'].append('登录失败')
                await browser.close()
                return [], meta
            if not sid:
                meta['errors'].append('无法获取 SID')
                await browser.close()
                return [], meta

            records, page_count = await self._scrape_module_pages(
                page, module, module_info, sid, col_map_ordered,
                api_rows_override=api_rows_buffer,
            )
            meta['pages'] = page_count
            # 如果 API 行数比 DOM 多，以 API 为准
            if api_rows_buffer and len(api_rows_buffer) > len(records):
                logger.info('[%s] 使用 API 完整行数据: %d 条（DOM抓取: %d 条）',
                            module, len(api_rows_buffer), len(records))
            await browser.close()

        meta['total'] = len(records)
        logger.info('[%s] 完成: %d 条，%d 页', module, len(records), meta['pages'])
        return records, meta

    # ------------------------------------------------------------------
    # 多模块采集（共用浏览器）
    # ------------------------------------------------------------------

    async def _fetch_many_modules(
        self, modules: List[str]
    ) -> Dict[str, Tuple[List[Dict], Dict]]:
        """采集多个模块（复用同一浏览器，减少登录次数）"""
        from playwright.async_api import async_playwright

        results = {}

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=self.headless, executable_path=self.executable_path)
            page = await browser.new_page()

            # 全局 col_maps（按模块存储，保留 allColArray 顺序）
            # 格式: {module: [(field_code, label), ...]}
            col_maps: Dict[str, List[tuple]] = {}
            # API 完整行数据缓冲（按模块存储，不受 DOM 可见列限制）
            api_rows_by_module: Dict[str, List[dict]] = {}
            current = {'module': ''}

            async def on_resp(response):
                try:
                    ct = response.headers.get('content-type', '')
                    if response.status == 200 and 'json' in ct:
                        body = await response.json()
                        if isinstance(body, dict) and body.get('result') == 'ok':
                            data = body.get('data', {})
                            if isinstance(data, dict):
                                m = current['module']
                                # 捕获列配置（每模块只记录一次）
                                if 'colConfigInfo' in data and m and m not in col_maps:
                                    col_maps[m] = []
                                    for col in data['colConfigInfo'].get('allColArray', []):
                                        f, l = col.get('field', ''), col.get('label', '')
                                        if f and l:
                                            col_maps[m].append((f, l))
                                # 捕获完整行数据（每页累积）
                                if m:
                                    for key in ('rows', 'list', 'records', 'datas'):
                                        rows = data.get(key)
                                        if isinstance(rows, list) and rows:
                                            api_rows_by_module.setdefault(m, []).extend(rows)
                                            break
                except Exception:
                    pass

            page.on('response', on_resp)

            # 一次登录
            ok, sid = await self._do_login(page)
            if not ok or not sid:
                await browser.close()
                return {m: ([], {'module': m, 'errors': ['登录失败']}) for m in modules}

            for module in modules:
                if module not in LIMS_MODULE_MAP:
                    results[module] = ([], {'module': module, 'errors': ['未知模块']})
                    continue

                current['module'] = module
                module_info = LIMS_MODULE_MAP[module]
                logger.info('开始采集模块: %s', module)

                records, page_count = await self._scrape_module_pages(
                    page, module, module_info, sid, col_maps.get(module, {}),
                    api_rows_override=api_rows_by_module.get(module, []),
                )
                api_cnt = len(api_rows_by_module.get(module, []))
                if api_cnt > len(records):
                    logger.info('[%s] 使用 API 完整行数据: %d 条（DOM抓取: %d 条）',
                                module, api_cnt, len(records))
                results[module] = (records, {
                    'module': module,
                    'label': module_info.get('label', module),
                    'total': len(records),
                    'pages': page_count,
                    'errors': [] if records else ['无数据'],
                    'parse_method': 'playwright_dom',
                })
                logger.info('[%s] 完成: %d 条', module, len(records))

            await browser.close()

        return results

    # ------------------------------------------------------------------
    # 核心：逐页提取
    # ------------------------------------------------------------------

    async def _scrape_module_pages(
        self,
        page,
        module: str,
        module_info: dict,
        sid: str,
        col_map: dict,
        api_rows_override: List[dict] = None,
    ) -> Tuple[List[Dict], int]:
        """
        导航到模块页面并逐页提取所有数据。

        列名权威来源策略（解决 DOM 表头偏移问题）：
        1. 优先使用 colConfigInfo 中的字段映射（field -> label）
           colConfigInfo 中 allColArray 的顺序与 DOM 可见列一一对应
           field 是 BO 字段名（如 SBMC），label 是中文列名（如 设备名称）
        2. colConfigInfo 中第一个字段如果 label 是"序号/编号"类且值为纯数字，跳过该列
        3. 降级到 DOM GET_HEADERS_JS（如果没有 colConfigInfo）
        """
        records = []

        url = (f'{LIMS_BASE_URL}/r/w?sid={sid}&cmd=CLIENT_DW_PORTAL'
               f'&processGroupId={module_info["pgid"]}'
               f'&appId={module_info["appId"]}')

        try:
            await page.goto(url, timeout=25000, wait_until='domcontentloaded')
            await page.wait_for_timeout(self.page_delay_ms)
        except Exception as ex:
            logger.warning('[%s] 页面导航失败: %s', module, ex)
            return [], 0

        # 获取总条数和页数
        pager_info = await page.evaluate(GET_PAGINATION_JS)
        pager_text = pager_info.get('text', '')
        logger.info('[%s] 分页信息: %s', module, pager_text[:60])

        # 从分页文本提取页数（"共33页" 或 "1234533" 样式的页码）
        page_count = 1
        if pager_text:
            page_nums = re.findall(r'\b(\d+)\b', pager_text.replace('\n', ' '))
            for num_str in reversed(page_nums):
                n = int(num_str)
                if 1 < n < 10000:
                    page_count = n
                    break

        # ── 构建权威表头序列 ──────────────────────────────────────────────
        # col_map 格式: {field_code: label}，如 {'SBMC': '设备名称', 'SBBH': '设备编号'}
        # colConfigInfo.allColArray 中的顺序与 DOM 可见列一一对应
        # 我们用拦截到的 col_map（来自 colConfigInfo）作为权威来源
        if col_map:
            # col_map 中的条目顺序与 DOM 列顺序一致（来自 allColArray）
            # 用 label（中文列名）作为数据的 key，用 field_code 作为别名 key
            authoritative_cols = list(col_map.items())  # [(field_code, label), ...]
            logger.info('[%s] 使用 colConfigInfo 权威列映射: %d 列', module, len(authoritative_cols))
        else:
            # 降级：DOM 表头（可能有偏移）
            dom_headers = await page.evaluate(GET_HEADERS_JS)
            dom_headers = [h for h in dom_headers if h and h not in ['', '操作', '#']]
            authoritative_cols = [(f'col_{i}', h) for i, h in enumerate(dom_headers)]
            logger.warning('[%s] 降级到 DOM 表头（无 colConfigInfo）', module)

        def extract_rows_with_authoritative_cols(dom_rows, auth_cols):
            """
            使用权威列映射从 DOM 行数据提取结构化记录。

            关键逻辑：
            - DOM 数据列数（通常 34-35）可能少于 colConfigInfo 列数（72）
              这是因为 UI 只显示部分列，而 colConfigInfo 包含所有 BO 字段
            - 但 DOM 可见列的顺序与 colConfigInfo 中可见部分的顺序是对应的
            - 需要检测并跳过序号列（值为纯数字 1、2、3... 的第一列）
            """
            result = []
            for row in dom_rows:
                if not row or not any(c.strip() for c in row):
                    continue

                # 检测序号列：第一列值为纯数字且<=200（页内序号）
                start_offset = 0
                if row and row[0].strip().isdigit() and int(row[0].strip()) <= 200:
                    start_offset = 1  # 跳过序号列

                raw = {}
                data_cols = row[start_offset:]  # 去除序号列后的实际数据列

                for i, val in enumerate(data_cols):
                    val = val.strip()
                    if not val:
                        continue
                    if i < len(auth_cols):
                        field_code, label = auth_cols[i]
                        # 用中文标签作为主 key（便于阅读和调试）
                        raw[label] = val
                        # 同时用 BO 字段名作为别名 key（便于精确字段查找）
                        if field_code and field_code != label:
                            raw[field_code] = val
                    else:
                        raw[f'col_extra_{i}'] = val

                if raw:
                    result.append(raw)
            return result

        def build_record(raw, module_name, source_url):
            return {
                'lims_id': _compute_record_id(module_name, raw),
                'module': module_name,
                'raw_data': raw,
                'source_url': source_url,
                'scraped_at': datetime.now().isoformat(),
            }

        # ── 优先使用 API 完整行数据（所有字段，不受 DOM 可见列限制）──────────
        if api_rows_override:
            logger.info('[%s] 使用 API 行数据（%d 条，%d 字段/行），跳过 DOM 分页抓取',
                        module, len(api_rows_override),
                        len(api_rows_override[0]) if api_rows_override else 0)
            # 用 col_map 把 field_code 替换为中文 label（保留双键：field_code + label）
            col_code_to_label = {fc: lbl for fc, lbl in (col_map if col_map else [])}
            for raw_row in api_rows_override:
                if not isinstance(raw_row, dict):
                    continue
                labeled = {}
                for k, v in raw_row.items():
                    label = col_code_to_label.get(k, k)
                    labeled[label] = v
                    if label != k:
                        labeled[k] = v  # 同时保留 field_code 以便 p0_mapping 使用
                records.append(build_record(labeled, module, page.url))
            return records, page_count

        # ── 降级：DOM 分页抓取（仅可见列）──────────────────────────────────
        # 第一页
        dom_rows = await page.evaluate(EXTRACT_TABLE_JS)
        rows = extract_rows_with_authoritative_cols(dom_rows, authoritative_cols)
        for r in rows:
            records.append(build_record(r, module, page.url))

        # 后续页
        current_page = 1
        while current_page < page_count:
            clicked = await self._next_page(page)
            if not clicked:
                break
            await page.wait_for_timeout(self.turn_delay_ms)
            current_page += 1

            dom_rows = await page.evaluate(EXTRACT_TABLE_JS)
            rows = extract_rows_with_authoritative_cols(dom_rows, authoritative_cols)
            for r in rows:
                records.append(build_record(r, module, page.url))

            if current_page % 5 == 0:
                logger.info('[%s] 已采集 %d 页 / %d 页，共 %d 条',
                            module, current_page, page_count, len(records))

        return records, current_page

    async def _next_page(self, page) -> bool:
        """点击下一页，返回是否成功（支持 VXE Table 和 Element Plus）"""
        try:
            for sel in [
                '.vxe-pager--next-btn',             # VXE Table（主选择器）
                '.el-pagination .btn-next',          # Element Plus
                '.vxe-pager .page-next',
                'button[aria-label*="next"]',
                '.btn-next',
            ]:
                btn = await page.query_selector(sel)
                if btn:
                    disabled = await btn.get_attribute('disabled')
                    cls = await btn.get_attribute('class') or ''
                    # 检查各种"禁用"状态
                    if (disabled is None
                            and 'is--disabled' not in cls
                            and 'is-disabled' not in cls
                            and 'disabled' not in cls.lower()):
                        await btn.click()
                        return True
        except Exception as ex:
            logger.debug('翻页失败: %s', ex)
        return False

    # ------------------------------------------------------------------
    # 连接测试
    # ------------------------------------------------------------------

    async def _test_conn(self) -> Dict[str, Any]:
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, executable_path=self.executable_path)
            page = await browser.new_page()
            ok, sid = await self._do_login(page)
            await browser.close()
        return {
            'connected': ok,
            'base_url': LIMS_BASE_URL,
            'username': self.username,
            'sid': (sid[:16] + '...') if sid else None,
            'method': 'playwright_dom',
            'available_modules': list(LIMS_MODULE_MAP.keys()),
            'tier1_modules': MODULE_TIERS['tier1'],
        }


def _compute_record_id(module: str, raw_data: dict) -> str:
    """生成记录唯一标识"""
    import hashlib
    id_fields = ['id', 'ID', '_ID', 'recordId', '编号', 'code', 'NO',
                 '设备编号', 'SBBH', '人员编号', '委托编号', '样品编号']
    for field in id_fields:
        if field in raw_data and raw_data[field]:
            return f'{module}_{raw_data[field]}'
    content = json.dumps(raw_data, sort_keys=True, ensure_ascii=False)
    return f'{module}_{hashlib.md5(content.encode()).hexdigest()[:12]}'
