"""
外部数据接入路由器

维护 (source_type, source_module) → target_workstation 的路由规则，
以及每条数据如何从原始层提取 source_snapshot 和生成 source_display_title。

路由表说明：
  - LIMS equipment      → execution（仪器数据归执行工作台）
  - LIMS personnel      → lab_personnel
  - LIMS commission     → execution（委托/工单主流程）
  - LIMS sample         → execution（样品操作）
  - LIMS quality_doc    → quality（质量文件/GMP记录）
  - LIMS calibration    → execution（仪器校准）
  - LIMS training       → hr（培训记录）
  - EKB flows/approvals → finance（报销/审批单）
  - Feishu mail/im      → 按关键词路由（HR/project/quality/other→execution）
  - Feishu approval     → hr（飞书审批通常涉及人事）
  - Feishu doc/wiki     → research（文档归研究台）
"""
from __future__ import annotations


from .models import SourceType, TargetWorkstation


# ── LIMS 模块路由 ──────────────────────────────────────────────────────────────

_LIMS_MODULE_ROUTES: dict[str, str] = {
    'equipment':     TargetWorkstation.EXECUTION,
    'calibration':   TargetWorkstation.EXECUTION,
    'commission':    TargetWorkstation.EXECUTION,
    'sample':        TargetWorkstation.EXECUTION,
    'sample_storage':TargetWorkstation.EXECUTION,
    'standard':      TargetWorkstation.EXECUTION,
    'report':        TargetWorkstation.EXECUTION,
    'personnel':     TargetWorkstation.LAB_PERSONNEL,
    'client':        TargetWorkstation.CRM,
    'quality_doc':   TargetWorkstation.QUALITY,
    'supplier':      TargetWorkstation.QUALITY,
    'training':      TargetWorkstation.HR,
    'material':      TargetWorkstation.EXECUTION,
}

# ── EKB 模块路由 ───────────────────────────────────────────────────────────────

_EKB_MODULE_ROUTES: dict[str, str] = {
    'flows':        TargetWorkstation.FINANCE,
    'approvals':    TargetWorkstation.FINANCE,
    'invoices':     TargetWorkstation.FINANCE,
    'budgets':      TargetWorkstation.FINANCE,
    'fee_types':    TargetWorkstation.FINANCE,
    'staffs':       TargetWorkstation.HR,
    'departments':  TargetWorkstation.HR,
}

# ── 飞书关键词路由（粗粒度意图识别） ────────────────────────────────────────────

_FEISHU_HR_KEYWORDS = frozenset([
    '请假', '休假', '年假', '病假', '离职', '入职', '转正', '调岗',
    '薪资', '绩效', '晋升', '培训', '考勤', '招聘', '面试', '录用',
])
_FEISHU_QUALITY_KEYWORDS = frozenset([
    '偏差', 'deviation', 'CAPA', '审计', '稽查', 'SOP', 'GCP',
    '方案变更', '合规', '质量', '不合格',
])
_FEISHU_FINANCE_KEYWORDS = frozenset([
    '报销', '发票', '预算', '付款', '结算', '财务',
])


def route_source(
    source_type: str,
    source_module: str = '',
    text_hint: str = '',
) -> str:
    """
    根据来源类型和模块（以及可选文本提示）返回目标工作台。

    Args:
        source_type: SourceType 枚举值
        source_module: 细分模块（LIMS/EKB 专用）
        text_hint: 用于飞书消息关键词路由的文本内容

    Returns:
        TargetWorkstation 枚举值（字符串）
    """
    if source_type == SourceType.LIMS:
        return _LIMS_MODULE_ROUTES.get(source_module, TargetWorkstation.EXECUTION)

    if source_type == SourceType.EKUAIBAO:
        return _EKB_MODULE_ROUTES.get(source_module, TargetWorkstation.FINANCE)

    if source_type in (SourceType.FEISHU_MAIL, SourceType.FEISHU_IM):
        lower = text_hint.lower()
        for kw in _FEISHU_HR_KEYWORDS:
            if kw in lower:
                return TargetWorkstation.HR
        for kw in _FEISHU_QUALITY_KEYWORDS:
            if kw.lower() in lower:
                return TargetWorkstation.QUALITY
        for kw in _FEISHU_FINANCE_KEYWORDS:
            if kw in lower:
                return TargetWorkstation.FINANCE
        return TargetWorkstation.EXECUTION

    if source_type == SourceType.FEISHU_APPROVAL:
        return TargetWorkstation.HR

    if source_type in (SourceType.FEISHU_DOC, SourceType.FEISHU_CALENDAR):
        return TargetWorkstation.RESEARCH

    return TargetWorkstation.EXECUTION


def get_target_model(source_type: str, source_module: str = '') -> str:
    """返回建议的目标领域模型名（供 mapped_fields 参考）。"""
    _MAP = {
        (SourceType.LIMS, 'equipment'):     'InstrumentDataSession',
        (SourceType.LIMS, 'calibration'):   'InstrumentDataSession',
        (SourceType.LIMS, 'commission'):    'WorkOrder',
        (SourceType.LIMS, 'sample'):        'Subject',
        (SourceType.LIMS, 'personnel'):     'LabStaffProfile',
        (SourceType.LIMS, 'quality_doc'):   'Deviation',
        (SourceType.LIMS, 'client'):        'Client',
        (SourceType.EKUAIBAO, 'flows'):     'ExpenseRecord',
        (SourceType.EKUAIBAO, 'approvals'): 'ApprovalRecord',
        (SourceType.FEISHU_APPROVAL, ''):   'LeaveRequest',
    }
    return _MAP.get((source_type, source_module), '')
