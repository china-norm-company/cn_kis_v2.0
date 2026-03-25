"""
ekb_normalizer — 易快报数据格式统一化

易快报历史上有两种数据格式并存于 EkbRawRecord 中：

  格式 A（OpenAPI，2026年）
    - code / title / state / type 在顶层
    - amount 在 sumAmount
    - 用户信息在 userProps / owner
    - 人员/档案字段已是可读对象（含 name/code）

  格式 B（飞书内部 API，2018-2026）
    - code / title 等字段全部在 form.* 内
    - amount 在 form.expenseMoney.standard
    - 单据类型在 formType 而非 type
    - 许多字段是纯 ID 字符串，需查 dimension_items 反解
    - state 是小写（'paid'/'archived' 等）

本模块职责：
  1. 自动检测数据格式
  2. 将格式 B 统一化为格式 A 兼容的结构
  3. 尽可能从 form.* 提取可读信息，不可解析的 ID 原样保留
"""
from __future__ import annotations

from datetime import datetime, timezone as _tz, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

_CST = _tz(timedelta(hours=8))


# ============================================================================
# 格式检测
# ============================================================================

def is_feishu_internal_format(raw_data: dict) -> bool:
    """判断是否是飞书内部 API（格式 B）的数据"""
    return 'form' in raw_data and 'code' not in raw_data


# ============================================================================
# 工具函数
# ============================================================================

def _ts_to_date_str(ts) -> Optional[str]:
    """毫秒时间戳 → YYYY-MM-DD 字符串"""
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts) / 1000, tz=_CST).strftime('%Y-%m-%d')
    except Exception:
        return None


def _safe_amount(val) -> str:
    """从各种金额格式中提取数字字符串"""
    if val is None:
        return '0'
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        # 易快报金额对象：{"standard": "796", "standardUnit": "元", ...}
        return val.get('standard', '0') or '0'
    return '0'


def _extract_name_from_id_or_obj(val) -> str:
    """从 ID 字符串或对象中提取可读名称"""
    if not val:
        return ''
    if isinstance(val, dict):
        return val.get('name', '') or val.get('code', '') or ''
    if isinstance(val, str):
        # 纯 ID（如 'nYA6xdjChA7c00:1'），无法还原，返回空
        return ''
    return str(val)


def _map_feishu_state(state: str) -> str:
    """飞书内部 API state → OpenAPI 兼容的 state 大写"""
    mapping = {
        'paid':      'PAID',
        'paying':    'PAYING',
        'archived':  'PAID',      # archived = 已归档 ≈ 已完成
        'approving': 'PROCESSING',
        'rejected':  'REJECTED',
        'draft':     'DRAFT',
        'revoked':   'REJECTED',
    }
    return mapping.get((state or '').lower(), 'PROCESSING')


def _map_feishu_form_type(form_type: str) -> str:
    """飞书内部 API formType → type 字段"""
    mapping = {
        'expense':     'expense',
        'loan':        'loan',
        'requisition': 'requisition',
        'payment':     'payment',
        'apply':       'requisition',
    }
    return mapping.get((form_type or '').lower(), 'expense')


def _extract_approval_chain(logs: list) -> list:
    """从 logs 列表提取审批轨迹（格式 B 的 logs 结构与格式 A 相同）"""
    chain = []
    for log in (logs or []):
        if not isinstance(log, dict):
            continue
        time_ts = log.get('time', 0)
        action = log.get('action', '')
        state = log.get('state', '')
        attrs = log.get('attributes', {}) or {}
        operator_id = log.get('operatorId', '')
        node_name = attrs.get('nodeName', '') or attrs.get('nextName', '')
        chain.append({
            'action':        action,
            'node_name':     node_name,
            'operator_id':   operator_id,
            'operator_name': '',      # 格式 B 只有 operatorId，无 name
            'time':          _ts_to_date_str(time_ts),
            'state':         state,
        })
    return chain


# ============================================================================
# 格式 B → 统一格式（主函数）
# ============================================================================

def normalize(raw_data: dict) -> dict:
    """
    将飞书内部 API 格式（格式 B）规范化为注入器可直接使用的统一格式。
    格式 A 数据原样返回，不做修改。
    返回新 dict，不修改原始数据。
    """
    if not is_feishu_internal_format(raw_data):
        return raw_data  # 格式 A，直接返回

    form = raw_data.get('form', {}) or {}
    logs = raw_data.get('logs', []) or []
    state_raw = raw_data.get('state', '')
    form_type = raw_data.get('formType', 'expense')

    code = form.get('code', '')
    title = form.get('title', '')
    submit_ts = form.get('submitDate', 0)
    expense_money = form.get('expenseMoney', {})
    pay_money = form.get('payMoney', {})
    pay_date_ts = form.get('payDate', 0)

    # 费用承担部门 —— 格式 B 里可能是 ID 字符串
    expense_dept = form.get('expenseDepartment', '')
    dept_name = _extract_name_from_id_or_obj(expense_dept)

    # 单据模板
    spec_id = form.get('specificationId', '')
    template_name = _extract_name_from_id_or_obj(spec_id)

    # 项目引用（可能是 ID）
    project_ref = form.get('项目', '')
    project_name_raw = _extract_name_from_id_or_obj(project_ref)

    # 自定义档案
    u_sector = form.get('u_业务板块', '')
    u_ledger = form.get('u_项目执行台账', '')
    u_ledger_new = form.get('u_项目执行台账新', '')
    u_target = form.get('u_项目标的', '')
    u_archive = form.get('u_项目档案', '')
    u_profit = form.get('u_利润率', '')
    u_samples = form.get('u_样本数量', '')
    u_client_mgr = form.get('u_客户经理', '')
    u_commission = form.get('u_委托来源', '')
    u_req_total = form.get('u_申请总计', '')
    u_req_total_v2 = form.get('u_申请总额', '')
    u_vendor = form.get('u_供应商名称', '')

    # 关联申请单
    expense_link = form.get('expenseLink', {})
    linked_req_code = ''
    if isinstance(expense_link, dict):
        linked_req_code = expense_link.get('code', '') or expense_link.get('id', '')
    elif isinstance(expense_link, str):
        linked_req_code = expense_link

    # 构造与 OpenAPI 格式兼容的 userProps
    user_props = {
        'submitterId':        {'id': form.get('submitterId', ''), 'name': ''},
        'specificationId':    {'name': template_name, 'id': str(spec_id)},
        'expenseDepartment':  {'name': dept_name, 'id': str(expense_dept)},
        'expenseLink':        {'code': linked_req_code},
        'u_业务板块':         {'name': _extract_name_from_id_or_obj(u_sector), 'id': str(u_sector)},
        'u_项目执行台账':     {'name': _extract_name_from_id_or_obj(u_ledger),  'id': str(u_ledger)},
        'u_项目执行台账新':   {'name': _extract_name_from_id_or_obj(u_ledger_new), 'id': str(u_ledger_new)},
        'u_项目标的':         str(_safe_amount(u_target)),
        'u_项目档案':         {'name': _extract_name_from_id_or_obj(u_archive), 'id': str(u_archive), 'code': ''},
        'u_利润率':           _safe_amount(u_profit),
        'u_样本数量':         str(u_samples or ''),
        'u_客户经理':         {'name': _extract_name_from_id_or_obj(u_client_mgr)},
        'u_委托来源':         {'name': _extract_name_from_id_or_obj(u_commission)},
        'u_供应商名称':       _extract_name_from_id_or_obj(u_vendor),
        'u_申请总计':         _safe_amount(u_req_total or u_req_total_v2),
    }

    # 收款信息 — 格式 B 的 payeeId 通常是 ID
    payee_id = form.get('payeeId', '')

    normalized = {
        # 基本标识
        'id':               raw_data.get('id', ''),
        'code':             code,
        'title':            title,
        'type':             _map_feishu_form_type(form_type),
        'state':            _map_feishu_state(state_raw),

        # 金额
        'sumAmount':        _safe_amount(expense_money),
        'payAmount':        _safe_amount(pay_money),

        # 时间戳
        'submitTime':       submit_ts,
        'payTime':          pay_date_ts,
        'createTime':       raw_data.get('createTime', 0),
        'updateTime':       raw_data.get('updateTime', 0),

        # 申请人（格式 B 只有 ownerId，无详情）
        'ownerId':          raw_data.get('ownerId', ''),
        'owner':            {'name': '', 'id': raw_data.get('ownerId', ''), 'departments': []},

        # 业务信息
        'userProps':        user_props,
        'remark':           form.get('description', ''),
        'corporationId':    raw_data.get('corporationId', ''),

        # 审批链
        'logs':             logs,
        'approval_chain':   _extract_approval_chain(logs),

        # 收款信息（格式 B 只有 ID）
        'payeeInfo':        {'id': payee_id, 'name': ''},
        'paymentChannel':   form.get('paymentChannel', ''),
        'paymentAccountId': form.get('paymentAccountId', ''),

        # 票据
        'receiptState':     '',

        # 标记来源格式
        '_source_format':   'feishu_internal',
        '_raw_form':        form,           # 保留完整 form，供后续补全
    }

    return normalized


# ============================================================================
# 从飞书格式 B 提取支付/收款详情（用于 ExpenseRequest 新字段）
# ============================================================================

def extract_payment_info(raw_data: dict) -> dict:
    """
    从原始数据（格式 A 或 B）提取支付和收款信息，
    用于填充 ExpenseRequest 的新字段。
    """
    if is_feishu_internal_format(raw_data):
        form = raw_data.get('form', {}) or {}
        pay_ts = form.get('payDate', 0)
        pay_money = form.get('payMoney', {})
        pay_channel = form.get('paymentChannel', '')
        submit_ts = form.get('submitDate', 0)
        voucher_no = form.get('voucherNo', '')
        invoice_count_raw = form.get('printCount', 0)
        account_period = ''
    else:
        pay_ts = raw_data.get('payTime', 0)
        pay_money = raw_data.get('sumAmount', 0)
        pay_channel = raw_data.get('paymentChannel', '')
        submit_ts = raw_data.get('submitTime', 0)
        up = raw_data.get('userProps', {}) or {}
        voucher_no = up.get('voucherNo', '')
        invoice_count_raw = 0
        account_period = ''

    def _ts_to_date(ts):
        s = _ts_to_date_str(ts)
        if not s:
            return None
        try:
            from datetime import date
            return date.fromisoformat(s)
        except Exception:
            return None

    try:
        inv_count = int(invoice_count_raw or 0)
    except (ValueError, TypeError):
        inv_count = 0

    return {
        'submit_date':      _ts_to_date(submit_ts),
        'payment_date':     _ts_to_date(pay_ts),
        'payment_amount':   _safe_amount(pay_money),
        'payment_method':   pay_channel,
        'voucher_no':       str(voucher_no or ''),
        'invoice_count':    inv_count,
        'account_period':   account_period,
    }
