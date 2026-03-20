"""
易快报到各工作台的字段映射规范

说明：
- 本文件是易快报各模块 API 字段 → 新系统业务模型字段的权威映射文档
- 注入器（ekb_injector.py）使用此规范确保映射一致性
- 字段映射遵循"唯一键优先、内容指纹兜底"的去重原则

工作台落点：
  finance      → ExpenseRequest, ProjectBudget, Invoice
  research     → 只读引用财务数据，不新建主数据
  recruitment  → SubjectPayment（受试者礼金，按费用类型匹配）
  hr           → Account 的 ekuaibao_staff_id 关联映射
  execution    → 只读费用视图，不新建主数据
  quality      → 审批/审计证据索引（EkbInjectionLog 已含）
"""

# ============================================================================
# Phase 1: 主数据映射规范
# ============================================================================

STAFF_MAPPING = {
    # 易快报字段 → 说明 → 系统落点
    'id':           ('易快报员工唯一ID', 'Account.ekuaibao_staff_id'),
    'name':         ('姓名',           'Account.display_name（匹配用，不覆盖）'),
    'staffId':      ('员工号',         'Account.ekuaibao_staff_id（备选）'),
    'departments':  ('部门列表',        'Staff.department（参考）'),
    'updateTime':   ('更新时间戳ms',    'EkbRawRecord.source_updated_at'),
    'isLeave':      ('是否离职',        '不注入，仅在 raw_data 保留'),
}

DEPARTMENT_MAPPING = {
    'id':           ('部门ID',         '知识库记录（档案参考）'),
    'name':         ('部门名称',       '知识库记录'),
    'parentId':     ('父部门ID',       '知识库记录'),
}

FEE_TYPE_MAPPING = {
    'id':       ('费用类型ID',         '知识库记录 + 前端下拉选项参考'),
    'name':     ('费用类型名称',       '映射到 ExpenseType（差旅/采购/招待/其他）'),
    'parentId': ('父类型ID',          '知识库记录'),
}

# ============================================================================
# Phase 2: 核心交易数据映射规范
# ============================================================================

FLOW_MAPPING = {
    # 易快报单据字段映射
    'id':              ('单据唯一ID',    'ExpenseRequest.ekuaibao_id【主键】'),
    'code':            ('单据编号',      'ExpenseRequest.ekuaibao_no + request_no'),
    'title':           ('单据标题',      'ExpenseRequest.description'),
    'state':           ('审批状态',      'ExpenseRequest.approval_status（映射见下）'),
    'amount':          ('报销金额',      'ExpenseRequest.amount'),
    'applicantName':   ('申请人名',      'ExpenseRequest.applicant_name'),
    'applicantId':     ('申请人ID',      '查找 Account.ekuaibao_staff_id → applicant_id'),
    'submitDate':      ('提交日期',      'ExpenseRequest.create_time（覆盖）'),
    'feeTypeName':     ('费用类型名',    '映射到 ExpenseType 枚举'),
    'details':         ('明细列表',      '完整保存在 EkbRawRecord.raw_data，不拆分'),

    # 关联工作台标记
    '_workstation':    'finance',
}

# 审批状态映射（易快报 state → 新系统 approval_status）
FLOW_STATE_MAP = {
    'draft':           'draft',       # 草稿
    'pending':         'submitted',   # 提交中
    'approving':       'submitted',   # 审批中
    'waitingApproval': 'submitted',   # 等待审批
    'approved':        'approved',    # 已审批
    'paying':          'approved',    # 付款中
    'paid':            'reimbursed',  # 已付款/报销
    'rejected':        'rejected',    # 已驳回
    'revoked':         'rejected',    # 已撤销
}

# 费用类型映射（易快报 feeTypeName → 新系统 ExpenseType）
FEE_TYPE_MAP = {
    '差旅':     'travel',
    'travel':   'travel',
    '出差':     'travel',
    '采购':     'procurement',
    'purchase': 'procurement',
    '耗材':     'procurement',
    '招待':     'entertainment',
    '接待':     'entertainment',
    '招募':     'other',       # 受试者招募费用 → 优先归入 recruitment
    '受试者':   'other',       # 受试者礼金 → 优先归入 recruitment
    '礼金':     'other',
    '兼职':     'other',
}

# 特殊规则：含"受试者礼金"关键词的单据优先分发到 recruitment 工作台
RECRUITMENT_EXPENSE_KEYWORDS = ['受试者礼金', '受试者交通', '受试者餐饮', '受试者补贴']

BUDGET_MAPPING = {
    'id':           ('预算唯一ID',   'ProjectBudget.ekuaibao_budget_id【主键】'),
    'name':         ('预算名称',    'ProjectBudget.budget_name'),
    'budgetAmount': ('预算金额',    'ProjectBudget.total_expense'),
    'details':      ('预算节点',    'BudgetItem（逐条注入）'),

    '_workstation': 'finance',
}

BUDGET_NODE_MAPPING = {
    'id':           ('节点ID',      'BudgetItem（无唯一键，依赖 budget_id + name）'),
    'name':         ('节点名称',    'BudgetItem.description'),
    'category':     ('费用分类',    '映射到 BudgetCategory'),
    'budgetAmount': ('预算金额',    'BudgetItem.budget_amount'),
    'actualAmount': ('实际金额',    'BudgetItem.actual_amount'),
}

# ============================================================================
# 各工作台数据消费规范
# ============================================================================

WORKSTATION_CONSUMPTION = {
    'finance': {
        '主写表': ['t_expense_request', 't_project_budget', 't_budget_item'],
        '展示优先级': [
            '费用列表（含来源=ekuaibao标签）',
            '费用详情（含易快报单号、原始审批链）',
            '预算执行（易快报预算 vs 系统录入）',
            '对账视图（only_in_ekb / both_mismatch）',
        ],
    },
    'research': {
        '主写表': [],  # 只读，不写
        '引用方式': [
            '通过 protocol_id 关联 t_expense_request（费用归属某协议）',
            '通过 project_code 读取 t_project_budget',
            'ProjectDashboard 展示 total_cost 来自导入的预算数据',
        ],
    },
    'recruitment': {
        '主写表': ['t_subject_payment（如能匹配受试者ID）'],
        '匹配规则': [
            '单据 feeTypeName 含"受试者礼金"关键词',
            '单据 title 含受试者编号（如 S001）',
            '金额在合理区间（<5000/人次）',
            '匹配成功 → 创建 SubjectPayment，payment_method=ekuaibao',
        ],
        '无法匹配': '→ 保留在 t_expense_request（import_source=ekuaibao），人工关联',
    },
    'hr': {
        '主写表': ['Account.ekuaibao_staff_id（仅关联映射，不新建账号）'],
        '引用方式': [
            '员工薪资分析时，关联 ekuaibao_staff_id 查询历史报销',
            '兼职费用单据，通过 applicant_name 关联 Account',
        ],
    },
    'execution': {
        '主写表': [],  # 只读
        '引用方式': [
            '项目费用视图：按 protocol_id 聚合 t_expense_request',
            '预算消耗视图：ProjectBudget 执行率',
            '付款节点：PaymentRecord 关联项目',
        ],
    },
    'quality': {
        '主写表': [],  # 只读，审计索引
        '引用方式': [
            'EkbInjectionLog 本身即为审计日志',
            '附件完整性：EkbAttachmentIndex 检查是否下载成功',
            '变更审计：rolled_back=True 的日志追踪',
            '双轨差异：both_mismatch 作为质量待办',
        ],
    },
}

# ============================================================================
# 唯一键与去重规则
# ============================================================================

UNIQUE_KEY_RULES = {
    'flows': {
        'primary_key': 'ekuaibao_id',          # 精确匹配（第一优先）
        'secondary_key': 'ekuaibao_no',         # 单号匹配（第二优先）
        'content_fingerprint': ['amount', 'applicantId', 'submitDate', 'state'],
        'duplicate_action': 'update_status',    # 仅更新状态，不覆盖金额
    },
    'budgets': {
        'primary_key': 'ekuaibao_budget_id',
        'content_fingerprint': ['name', 'budgetAmount'],
        'duplicate_action': 'skip',             # 预算不自动覆盖
    },
    'staffs': {
        'primary_key': 'ekuaibao_staff_id',
        'match_by': 'display_name',             # 无 ID 时按姓名匹配
        'duplicate_action': 'link_only',        # 只建关联，不覆盖账号
    },
    'invoices': {
        'primary_key': 'invoiceCode',
        'content_fingerprint': ['amount', 'buyerName', 'invoiceDate'],
        'duplicate_action': 'update',
    },
}

# ============================================================================
# 防误删防误改规则
# ============================================================================

IMMUTABILITY_RULES = {
    'EkbRawRecord': {
        'rule': 'NEVER_DELETE_NEVER_MODIFY',
        'description': '原始层永不修改，只追加新批次记录',
        'enforced_by': 'ForeignKey PROTECT + 无 DELETE API',
    },
    'EkbInjectionLog': {
        'rule': 'APPEND_ONLY',
        'description': '注入日志只允许追加和标记回滚，不允许删除',
        'enforced_by': 'ForeignKey PROTECT + rolled_back 标志位',
    },
    'ExpenseRequest（ekuaibao来源）': {
        'rule': 'SOFT_DELETE_ONLY',
        'description': 'import_source=ekuaibao 的记录只允许 is_deleted=True，不允许物理删除',
        'enforced_by': '前端按钮禁用 + 后端 API 检查 import_source',
        'rollback_path': 'rollback_ekuaibao_import --batch BATCH_NO',
    },
}
