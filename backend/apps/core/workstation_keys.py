"""
工作台 Key 常量模块 — 唯一真相源来自 backend/configs/workstations.yaml

业务代码中需要判断工作台 key 时，请从此模块导入常量，禁止在 if/elif 链中直接
使用字符串字面量（如 'finance'、'research'），避免工作台重命名时遗漏修改点。

用法示例：
    from apps.core.workstation_keys import WS_FINANCE, BUSINESS_WORKSTATIONS
    if workstation == WS_FINANCE:
        ...
    if workstation in BUSINESS_WORKSTATIONS:
        ...
"""

# ── 业务工作台（15 个）──────────────────────────────────────────────────────
WS_SECRETARY = 'secretary'
WS_FINANCE = 'finance'
WS_RESEARCH = 'research'
WS_EXECUTION = 'execution'
WS_QUALITY = 'quality'
WS_HR = 'hr'
WS_CRM = 'crm'
WS_RECRUITMENT = 'recruitment'
WS_EQUIPMENT = 'equipment'
WS_MATERIAL = 'material'
WS_FACILITY = 'facility'
WS_EVALUATOR = 'evaluator'
WS_LAB_PERSONNEL = 'lab-personnel'
WS_ETHICS = 'ethics'
WS_RECEPTION = 'reception'

# ── 平台工作台（4 个）───────────────────────────────────────────────────────
WS_CONTROL_PLANE = 'control-plane'
WS_ADMIN = 'admin'
WS_DIGITAL_WORKFORCE = 'digital-workforce'
WS_DATA_PLATFORM = 'data-platform'

# 历史数据/旧回调可能出现的 key；禁止作为新业务工作台标识写入
LEGACY_WS_GOVERNANCE = 'governance'
LEGACY_WS_IAM = 'iam'

# ── 分组集合 ────────────────────────────────────────────────────────────────

BUSINESS_WORKSTATIONS: list[str] = [
    WS_SECRETARY, WS_FINANCE, WS_RESEARCH, WS_EXECUTION, WS_QUALITY,
    WS_HR, WS_CRM, WS_RECRUITMENT, WS_EQUIPMENT, WS_MATERIAL,
    WS_FACILITY, WS_EVALUATOR, WS_LAB_PERSONNEL, WS_ETHICS, WS_RECEPTION,
]

PLATFORM_WORKSTATIONS: list[str] = [
    WS_CONTROL_PLANE, WS_ADMIN, WS_DIGITAL_WORKFORCE, WS_DATA_PLATFORM,
]

ALL_WORKSTATIONS: list[str] = BUSINESS_WORKSTATIONS + PLATFORM_WORKSTATIONS

# 独立飞书授权的工作台（使用各自独立应用，不走子衿统一授权）
INDEPENDENT_AUTH_WORKSTATIONS: list[str] = [
    WS_ADMIN,
    WS_DATA_PLATFORM,
]
