"""
LIMS -> 新系统 P0 主数据映射规范

文件角色：
  本文件是 LIMS 迁移的"主键宪法"——定义每类主数据的
  唯一键规则、字段映射、注入优先级与防冲突策略。

  所有注入函数、冲突检测、回滚命令均以此文件的
  UNIQUE_KEY_RULES 和 FIELD_MAP 为权威依据。
  变更本文件必须同步更新注入器和测试用例。
"""
from typing import Any, Dict, List, Optional


# ============================================================================
# P0 唯一键规则
# ============================================================================
# 格式：{module: {"fields": [...], "fallback": ..., "target_model": ...}}
# fields：按优先级排列，第一个非空值作为唯一键
# fallback：所有字段均为空时使用（通常是内容 hash）

UNIQUE_KEY_RULES: Dict[str, Dict] = {

    # ── 设备/仪器 ──────────────────────────────────────────────────────────
    # 唯一键：设备编号（LIMS 中通常是"设备编号"/"仪器编号"/"NO"等）
    # 注意：LIMS 设备编号可能是"HZPJC-yyy-xxx"格式，直接映射到 ResourceItem.code
    "equipment": {
        "target_model": "resource.ResourceItem",
        "target_table": "t_resource_item",
        "unique_key_field": "code",            # 目标表字段
        "unique_key_sources": [                 # LIMS 原始字段，按优先级
            # 注意：DOM 提取时"设备名称"列是真正的设备编号（如 FSD0405113）
            # "设备编号"列是分页序号（1-20 循环，不唯一）
            "设备名称", "设备编号", "仪器编号", "code", "equipmentCode",
        ],
        "require_unique_key": True,             # 无唯一键时跳过注入
        "allow_update": False,                  # P0 不覆盖已有记录
        "conflict_mode": "suspend",             # 相似时挂起到 LimsConflict
        "similarity_threshold": 0.85,
    },

    # ── 客户 ──────────────────────────────────────────────────────────────
    # 唯一键优先用公司名称（全称）精确匹配；
    # 有统一社会信用代码时用信用代码更可靠
    "client": {
        "target_model": "crm.Client",
        "target_table": "t_client",
        "unique_key_field": "name",
        "unique_key_sources": [
            "客户名称", "委托单位", "单位名称", "clientName", "name",
        ],
        "secondary_key_sources": [             # 辅助精确匹配
            "统一社会信用代码", "信用代码", "taxId",
        ],
        "require_unique_key": True,
        "allow_update": False,
        "conflict_mode": "suspend",
        "similarity_threshold": 0.90,          # 客户名称相似度阈值较高
    },

    # ── 委托/项目 ──────────────────────────────────────────────────────────
    # 唯一键：委托编号（LIMS 中通常带有年份+序号）
    # 委托编号与客户名称共同确保唯一性
    "commission": {
        "target_model": "protocol.Protocol",
        "target_table": "t_protocol",
        "unique_key_field": "code",
        "unique_key_sources": [
            "委托编号", "项目编号", "合同编号", "projectCode", "commissionNo", "code",
        ],
        "require_unique_key": False,           # 无编号时用标题+客户作为组合键
        "composite_key_sources": [             # 无编号时的组合唯一键
            ["项目名称", "客户名称"],
            ["委托项目", "委托单位"],
        ],
        "allow_update": False,
        "conflict_mode": "suspend",
        "similarity_threshold": 0.88,
    },

    "commission_detection": {                  # 委托检测信息归并到 Protocol
        "target_model": "protocol.Protocol",
        "target_table": "t_protocol",
        "unique_key_field": "code",
        "unique_key_sources": [
            "委托编号", "项目编号", "code",
        ],
        "require_unique_key": False,
        "composite_key_sources": [
            ["项目名称", "客户名称"],
        ],
        "allow_update": True,                  # 检测信息可以补充到已有 Protocol
        "conflict_mode": "supplement",         # 不覆盖主字段，只补充空字段
        "similarity_threshold": 0.92,
    },

    # ── 人员 ──────────────────────────────────────────────────────────────
    # 唯一键：工号（最可靠），无工号时用姓名+部门
    # 注意：LIMS 的"人员档案"注入链是 Account -> Staff -> LabStaffProfile
    "personnel": {
        "target_model": "hr.Staff",
        "target_table": "t_staff",
        "unique_key_field": "employee_no",
        "unique_key_sources": [
            "工号", "employeeNo", "员工编号", "人员编号",
        ],
        "composite_key_sources": [
            ["姓名", "部门"],
            ["人员姓名", "所属部门"],
        ],
        "require_unique_key": False,
        "allow_update": False,
        "conflict_mode": "suspend",
        "similarity_threshold": 0.95,          # 人员姓名相似度要求极高
        "cascade_models": [                    # 注入 Staff 后联动创建
            "identity.Account",
            "lab_personnel.LabStaffProfile",
        ],
    },

    # ── 样品/产品 ──────────────────────────────────────────────────────────
    # 唯一键：样品编号（通常包含项目编号前缀+批次）
    # 注意：Product 是产品定义，SampleInstance 是具体实物
    "sample": {
        "target_model": "sample.Product",
        "target_table": "t_product",
        "unique_key_field": "code",
        "unique_key_sources": [
            "样品编号", "产品编号", "sampleCode", "productCode", "code", "NO",
        ],
        "require_unique_key": False,
        "composite_key_sources": [
            ["样品名称", "批号"],
            ["产品名称", "批号"],
        ],
        "allow_update": False,
        "conflict_mode": "suspend",
        "similarity_threshold": 0.88,
        "cascade_models": [
            "sample.SampleInstance",           # 如有库存数量则创建实例
        ],
    },

    "sample_storage": {                        # 入库信息补充 SampleInstance
        "target_model": "sample.SampleInstance",
        "target_table": "t_sample_instance",
        "unique_key_field": "unique_code",
        "unique_key_sources": [
            "样品编号", "库存编号", "uniqueCode", "sampleCode",
        ],
        "require_unique_key": False,
        "allow_update": True,
        "conflict_mode": "supplement",
        "similarity_threshold": 0.92,
    },
}


# ============================================================================
# P0 详细字段映射
# ============================================================================

FIELD_MAP: Dict[str, Dict[str, List[str]]] = {

    # ── 设备字段映射 ───────────────────────────────────────────────────────
    # 格式：{目标字段: [LIMS候选字段名...]}（按优先级）
    "equipment": {
        # 注意：DOM 提取时字段含义：
        # "设备名称" = 真正的设备编号（如 FSD0405113）→ 用作 code
        # "组别名称" = 设备通用名称（如 温湿度记录仪 16）→ 用作 name
        # "设备编号" = 分页序号（1-20循环）→ 不用
        "name":                  ["组别名称", "设备名称_通用", "仪器名称", "name"],
        "code":                  ["设备名称", "设备编号_真实", "SBBH", "equipmentCode"],
        "manufacturer":          ["生产厂家", "生产厂商", "制造商", "厂家", "manufacturer"],
        "model_number":          ["设备规格/型号", "规格型号", "型号", "规格", "model"],
        "serial_number":         ["出厂编号", "序列号", "serialNumber"],
        "status":                ["设备状态", "状态"],
        "location":              ["设备位置", "存放地点", "存放位置", "地点", "location"],
        "last_calibration_date": ["上次校准日期", "最近校准日期", "校准日期"],
        "next_calibration_date": ["下次校准日期", "下次核查时间", "下次校准", "有效期至"],
        "_source":               "lims",
        "_source_batch":         "__batch_no__",
    },

    # ── 人员字段映射 ───────────────────────────────────────────────────────
    "personnel": {
        # hr.Staff 字段
        "name":          ["姓名", "人员姓名", "name"],
        "employee_no":   ["工号", "员工编号", "人员编号", "employeeNo"],
        "position":      ["岗位", "职位", "职务", "position"],
        "department":    ["部门", "所属部门", "department"],
        "phone":         ["手机号", "电话", "手机", "mobile", "phone"],
        "email":         ["邮箱", "email", "Email"],
        "gcp_cert":      ["GCP证书号", "GCP证书", "gcp_cert"],
        "gcp_expiry":    ["GCP到期日", "GCP有效期", "gcp_expiry"],
        # identity.Account 字段（联动创建）
        "_account.display_name": ["姓名", "人员姓名", "name"],
        "_account.username":     ["工号", "员工编号", "employeeNo"],
        "_account.account_type": "__const__:staff",
        "_account.status":       "__const__:active",
        # lab_personnel.LabStaffProfile 字段（联动创建）
        "_lab_profile.lab_role":         ["实验室角色", "岗位类别", "labRole"],
        "_lab_profile.employment_type":  ["雇佣类型", "人员类型", "employmentType"],
        "_lab_profile.competency_level": ["能力等级", "技能等级", "competencyLevel"],
    },

    # ── 客户字段映射 ───────────────────────────────────────────────────────
    "client": {
        # crm.Client 字段
        "name":         ["客户名称", "委托单位", "单位名称", "clientName"],
        "short_name":   ["客户简称", "简称", "shortName"],
        "industry":     ["行业", "所属行业", "industry"],
        "company_type": ["公司类型", "单位类型", "companyType"],
        "description":  ["备注", "说明", "description"],
        # crm.ClientContact 字段（从联系人信息创建）
        "_contact.name":  ["联系人", "联系姓名", "contactName"],
        "_contact.phone": ["联系电话", "联系方式", "contactPhone"],
        "_contact.email": ["联系邮箱", "contactEmail"],
        "_contact.title": ["联系人职位", "contactTitle"],
    },

    # ── 委托/项目字段映射 ──────────────────────────────────────────────────
    "commission": {
        # protocol.Protocol 字段
        "code":              ["委托编号", "项目编号", "commissionNo", "code"],
        "title":             ["项目名称", "委托项目", "title"],
        "status":            ["状态", "项目状态", "status"],
        "product_category":  ["产品类别", "产品品类", "productCategory"],
        "claim_type":        ["功效宣称", "宣称类型", "claimType"],
        "sample_size":       ["样本量", "受试者数量", "sampleSize"],
        "regulatory_standard": ["法规标准", "适用标准", "standard"],
        "description":       ["备注", "项目说明", "description"],
        # 客户关联（注入时查找已有 Client）
        "_sponsor_name":     ["客户名称", "委托单位", "sponsorName"],
    },

    "commission_detection": {
        # 补充 Protocol 的检测方法信息
        "test_methods":      ["检测项目", "检测方法", "testMethods"],
        "code":              ["委托编号", "项目编号", "code"],
        "_supplement_only":  True,             # 只补充空字段，不覆盖
    },

    # ── 样品字段映射 ───────────────────────────────────────────────────────
    "sample": {
        # sample.Product 字段
        "name":              ["样品名称", "产品名称", "sampleName"],
        "code":              ["样品编号", "产品编号", "sampleCode"],
        "batch_number":      ["批号", "批次号", "batchNo"],
        "specification":     ["规格", "规格型号", "specification"],
        "storage_condition": ["储存条件", "保存条件", "storageCondition"],
        "expiry_date":       ["有效期", "失效日期", "expiryDate"],
        "product_type":      ["样品类型", "产品类型", "productType"],
        "description":       ["备注", "说明"],
        # 委托方关联
        "_sponsor_name":     ["客户名称", "委托单位"],
        "_protocol_code":    ["委托编号", "项目编号"],
    },

    "sample_storage": {
        # sample.SampleInstance 字段
        "unique_code":       ["样品编号", "库存编号", "uniqueCode"],
        "status":            ["状态", "库存状态"],
        "storage_location":  ["存储位置", "存放位置", "storageLocation"],
        "retention":         ["留样", "retention"],
    },
}


# ============================================================================
# 状态值映射
# ============================================================================
# LIMS 中文状态值 -> 新系统枚举值

STATUS_MAP: Dict[str, Dict[str, str]] = {
    "equipment.status": {
        "在用": "active",
        "正常": "active",
        "使用中": "active",
        "闲置": "idle",
        "维修": "maintenance",
        "维护中": "maintenance",
        "校准中": "calibrating",
        "报废": "retired",
        "停用": "retired",
    },
    "personnel.gcp_status": {
        "有效": "valid",
        "正常": "valid",
        "即将到期": "expiring",
        "到期": "expired",
        "过期": "expired",
        "无": "none",
    },
    "sample.product_type": {
        "测试样品": "test_product",
        "对照品": "reference",
        "标准品": "standard",
        "受试产品": "test_product",
    },
    "sample.status": {
        "在库": "in_stock",
        "已分发": "distributed",
        "已消耗": "consumed",
        "已回收": "returned",
        "已销毁": "destroyed",
    },
    "personnel.lab_role": {
        "仪器操作员": "instrument_operator",
        "操作员": "instrument_operator",
        "医生": "medical_evaluator",
        "医学评估员": "medical_evaluator",
        "CRC": "crc",
        "临床协调员": "crc",
        "仪器保障": "equipment_support",
        "场地保障": "facility_support",
        "样品管理": "sample_manager",
    },
    "personnel.competency_level": {
        "学习期": "L1",
        "见习期": "L2",
        "见习": "L2",
        "独立期": "L3",
        "独立": "L3",
        "专家期": "L4",
        "专家": "L4",
        "带教": "L5",
        "导师": "L5",
    },
    "protocol.status": {
        "进行中": "active",
        "执行中": "active",
        "已完成": "archived",
        "完成": "archived",
        "暂停": "active",
        "终止": "archived",
        "草稿": "draft",
        "新建": "draft",
    },
}


# ============================================================================
# P0 资源类别预设（ResourceCategory 种子数据）
# ============================================================================
# 注入设备前需要确保这些分类已存在于 ResourceCategory

RESOURCE_CATEGORY_SEEDS = [
    # 设备大类
    {"code": "EQ", "name": "设备", "resource_type": "equipment", "parent_code": None},
    {"code": "EQ-SKIN", "name": "皮肤检测仪器", "resource_type": "equipment", "parent_code": "EQ"},
    {"code": "EQ-IMAGING", "name": "成像分析设备", "resource_type": "equipment", "parent_code": "EQ"},
    {"code": "EQ-GENERAL", "name": "通用实验室设备", "resource_type": "equipment", "parent_code": "EQ"},
    {"code": "EQ-LIMS", "name": "LIMS导入设备", "resource_type": "equipment", "parent_code": "EQ"},
    # 标准物质
    {"code": "MAT-REF", "name": "标准物质", "resource_type": "material", "parent_code": None},
    {"code": "MAT-CONS", "name": "易耗品", "resource_type": "material", "parent_code": None},
]


# ============================================================================
# 验证 P0 注入前置条件
# ============================================================================

def validate_p0_preconditions() -> Dict[str, Any]:
    """
    检查 P0 注入前所有必要条件是否满足。
    返回 {'ready': True/False, 'issues': [...]}
    """
    issues = []
    checks = {}

    # 1. 检查 ResourceCategory 种子是否存在
    try:
        from apps.resource.models import ResourceCategory
        missing_cats = []
        for seed in RESOURCE_CATEGORY_SEEDS:
            if not ResourceCategory.objects.filter(code=seed['code']).exists():
                missing_cats.append(seed['code'])
        if missing_cats:
            issues.append(f'缺少 ResourceCategory 种子: {missing_cats}')
        checks['resource_categories'] = len(missing_cats) == 0
    except Exception as ex:
        issues.append(f'ResourceCategory 检查失败: {ex}')
        checks['resource_categories'] = False

    # 2. 检查 identity.Account 表是否可写
    try:
        from apps.identity.models import Account
        Account.objects.count()
        checks['identity_account'] = True
    except Exception as ex:
        issues.append(f'identity.Account 不可访问: {ex}')
        checks['identity_account'] = False

    # 3. 检查 lims_integration 批次表是否存在
    try:
        from apps.lims_integration.models import LimsImportBatch
        LimsImportBatch.objects.count()
        checks['lims_import_batch'] = True
    except Exception as ex:
        issues.append(f'LimsImportBatch 不可访问: {ex}')
        checks['lims_import_batch'] = False

    return {
        'ready': len(issues) == 0,
        'issues': issues,
        'checks': checks,
    }


# ============================================================================
# 字段提取工具函数
# ============================================================================

def extract_mapped_fields(
    raw_data: Dict[str, Any],
    module: str,
    batch_no: str = '',
) -> Dict[str, Any]:
    """
    按 FIELD_MAP 从原始数据提取目标字段。
    返回 {目标字段: 提取值}，跳过空值。
    """
    field_def = FIELD_MAP.get(module, {})
    result = {}

    for target_field, sources in field_def.items():
        # 跳过元信息字段（以 _ 开头）
        if target_field.startswith('_'):
            continue

        if isinstance(sources, list):
            for src in sources:
                val = raw_data.get(src, '')
                if val and str(val).strip():
                    raw_val = str(val).strip()
                    # 状态值映射
                    map_key = f'{module}.{target_field}'
                    if map_key in STATUS_MAP:
                        raw_val = STATUS_MAP[map_key].get(raw_val, raw_val)
                    result[target_field] = raw_val
                    break
        elif isinstance(sources, str) and sources.startswith('__const__:'):
            result[target_field] = sources.split(':', 1)[1]

    # 批次标记
    if batch_no:
        result['_source'] = 'lims'
        result['_source_batch'] = batch_no

    return result


def get_unique_key_value(raw_data: Dict[str, Any], module: str) -> Optional[str]:
    """
    从原始数据提取唯一键值。
    按 UNIQUE_KEY_RULES 优先级尝试各候选字段。
    返回唯一键值，或 None（找不到）。
    """
    rule = UNIQUE_KEY_RULES.get(module)
    if not rule:
        return None

    for src in rule.get('unique_key_sources', []):
        val = raw_data.get(src, '')
        if val and str(val).strip():
            return str(val).strip()

    # 尝试组合键（用 | 连接）
    for combo in rule.get('composite_key_sources', []):
        parts = [str(raw_data.get(f, '')).strip() for f in combo]
        if all(parts):
            return '|'.join(parts)

    return None


# ============================================================================
# LIMS 组别 -> 新系统角色映射（业务关系注入核心）
# ============================================================================

# 实验室人员所在的组别（需要创建 LabStaffProfile）
LAB_GROUPS = {
    # LIMS 一级组别
    '临床测试', '特化测试', '综合研究', '创新研究',
    '医美诊所', '检测实验室', '电信研究',
    # LIMS 具体小组（人员档案的实际 department 字段）
    '评估组', '2D图像组', '3D图像组', '探头组',
    '运营组', '统计组', '知情组', '招募组', '前台组',
    '机动组', '交付组', '综合组',
    '组1', '组2', '组3', '组4', '组5', '组6',
    '组7', '组8', '组9', '组11', '组15',
    '创新研究院', '质量部', '资产组', '测试组', '外部测试',
    'C07', 'C08',
}

# 组别 -> LabRole 映射
GROUP_TO_LAB_ROLE: Dict[str, str] = {
    # LIMS 一级组别
    '临床测试':  'instrument_operator',
    '特化测试':  'instrument_operator',
    '综合研究':  'instrument_operator',
    '创新研究':  'instrument_operator',
    '医美诊所':  'medical_evaluator',
    '检测实验室': 'equipment_support',
    '电信研究':  'instrument_operator',
    # LIMS 具体小组（人员档案中的实际 department 字段）
    '评估组':    'instrument_operator',
    '2D图像组':  'instrument_operator',
    '3D图像组':  'instrument_operator',
    '探头组':    'instrument_operator',
    '运营组':    'crc',
    '统计组':    'crc',
    '知情组':    'crc',
    '招募组':    'crc',
    '前台组':    'crc',
    '机动组':    'instrument_operator',
    '交付组':    'sample_manager',
    '综合组':    'instrument_operator',
    '组1': 'instrument_operator', '组2': 'instrument_operator',
    '组3': 'instrument_operator', '组4': 'instrument_operator',
    '组5': 'instrument_operator', '组6': 'instrument_operator',
    '组7': 'instrument_operator', '组8': 'instrument_operator',
    '组9': 'instrument_operator', '组11': 'instrument_operator',
    '组15': 'instrument_operator',
    '创新研究院': 'instrument_operator',
    '质量部':    'equipment_support',
    '资产组':    'equipment_support',
    '测试组':    'instrument_operator',
    '外部测试':  'instrument_operator',
    'C07': 'instrument_operator',
    'C08': 'instrument_operator',
}

# 组别 -> 新系统角色列表映射
# 一个人可以有多个角色（对应多个工作台权限）
GROUP_TO_ROLES: Dict[str, List[str]] = {
    # LIMS 一级组别
    '临床测试':  ['evaluator', 'clinical_executor', 'receptionist'],
    '特化测试':  ['evaluator', 'researcher'],
    '综合研究':  ['researcher'],
    '创新研究':  ['researcher'],
    '医美诊所':  ['evaluator'],
    '检测实验室': ['technician', 'qa'],
    '企发部':    ['admin', 'lab_personnel', 'hr'],
    '市场销售':  ['sales'],
    '电信研究':  ['researcher'],
    '总经理室':  ['admin', 'project_manager'],
    # LIMS 具体小组（人员档案的实际 department 字段）
    '评估组':    ['evaluator', 'clinical_executor'],
    '2D图像组':  ['evaluator', 'clinical_executor'],
    '3D图像组':  ['evaluator', 'clinical_executor'],
    '探头组':    ['evaluator', 'technician'],
    '运营组':    ['clinical_executor', 'receptionist'],
    '统计组':    ['researcher'],
    '知情组':    ['clinical_executor', 'receptionist'],
    '招募组':    ['recruiter', 'receptionist'],
    '前台组':    ['receptionist'],
    '机动组':    ['evaluator', 'clinical_executor'],
    '交付组':    ['clinical_executor'],
    '综合组':    ['researcher', 'clinical_executor'],
    '组1': ['evaluator', 'clinical_executor'],
    '组2': ['evaluator', 'clinical_executor'],
    '组3': ['evaluator', 'clinical_executor'],
    '组4': ['evaluator', 'clinical_executor'],
    '组5': ['evaluator', 'clinical_executor'],
    '组6': ['evaluator', 'clinical_executor'],
    '组7': ['evaluator', 'clinical_executor'],
    '组8': ['evaluator', 'clinical_executor'],
    '组9': ['evaluator', 'clinical_executor'],
    '组11': ['evaluator', 'clinical_executor'],
    '组15': ['evaluator', 'technician'],
    '创新研究院': ['researcher'],
    '质量部':    ['qa', 'technician'],
    '资产组':    ['technician'],
    '测试组':    ['evaluator'],
    '外部测试':  ['evaluator'],
    '运作':      ['clinical_executor'],
    '前台&行政':  ['receptionist', 'admin'],
    '人力行政部':  ['hr', 'admin'],
    '财务部':    ['finance'],
    '市场':      ['sales'],
    'IT':        ['admin'],
    '总经理室':  ['admin', 'project_manager'],
    'C07': ['evaluator'], 'C08': ['evaluator'],
}

# 岗位状态 -> Account.status / Staff.training_status 映射
JOB_STATUS_MAP: Dict[str, Dict[str, str]] = {
    '在岗':   {'account_status': 'active',   'training_status': '在岗'},
    '试用期':  {'account_status': 'active',   'training_status': '试用期'},
    '已离职':  {'account_status': 'inactive', 'training_status': '已离职'},
    'LB46':   {'account_status': 'active',   'training_status': '在岗'},  # 内部等级
    'LB44':   {'account_status': 'active',   'training_status': '在岗'},  # 内部等级
    '劳务人员': {'account_status': 'active',   'training_status': '在岗'},
}

# BO 字段名 -> 人员语义字段映射
# colConfigInfo 修复后，raw_data 中同时包含 BO 字段名（如 XM）和中文标签（如 姓名）
# 这里定义从原始数据提取各业务字段的候选列表
PERSONNEL_FIELD_ALIASES: Dict[str, List[str]] = {
    # 真实姓名：在修复列偏移后，"姓名"列（XINGMING）对应真实姓名
    # 如果还有偏移问题，"性别"列的值才是真实姓名
    'name':        ['姓名', 'XINGMING', 'XM', '性别', 'name'],
    'gender':      ['性别', 'XB', '年龄', 'gender'],
    'age':         ['年龄', 'NL', '籍贯', 'age'],
    'department':  ['组别名称', 'ZBBH', '部门名称', 'department'],
    'join_date':   ['岗位状态', '进入单位日期', 'RZSJ', 'join_date'],
    'job_status':  ['上次考核时间', '岗位状态', 'GWZT', 'job_status'],
    'education':   ['毕业院校', '进入单位日期', 'BYLX', 'education'],
    'school':      ['col_15', '毕业院校', 'BYYXMC', 'school'],
    'major':       ['毕业院校', 'BYZY', 'major'],
    'birthplace':  ['籍贯', 'JG', 'birthplace'],
}


def extract_personnel_name(raw_data: Dict[str, Any]) -> str:
    """
    从人员原始数据中提取真实姓名。

    修复后 colConfigInfo 提供了正确的字段映射，姓名应在"姓名"字段。
    但保留对旧数据（列偏移）的兼容：如果"姓名"字段是纯数字，
    则尝试"性别"字段（列偏移时姓名在此列）。
    """
    # 优先从 BO 字段名提取（colConfigInfo 修复后应有 XINGMING）
    for field in ['姓名', 'XINGMING', 'XM']:
        val = str(raw_data.get(field, '')).strip()
        if val and not val.isdigit() and len(val) >= 2:
            return val

    # 兼容列偏移：姓名实际在"性别"列
    gender_val = str(raw_data.get('性别', '')).strip()
    if gender_val and gender_val not in ('男', '女', 'M', 'F') and len(gender_val) >= 2:
        return gender_val

    return ''


def extract_job_status(raw_data: Dict[str, Any]) -> Dict[str, str]:
    """
    从人员原始数据中提取岗位状态。
    返回 {'account_status': ..., 'training_status': ...}
    """
    # 修复后应在"上次考核时间"（GWZT）字段
    for field in ['上次考核时间', 'GWZT', '岗位状态']:
        val = str(raw_data.get(field, '')).strip()
        if val in JOB_STATUS_MAP:
            return JOB_STATUS_MAP[val]

    return {'account_status': 'active', 'training_status': '未知'}


def extract_department(raw_data: Dict[str, Any]) -> str:
    """从人员原始数据中提取部门/组别"""
    for field in ['组别名称', 'ZBMC', 'ZBBH', '部门名称']:
        val = str(raw_data.get(field, '')).strip()
        if val:
            return val
    return ''


def get_roles_for_group(group: str) -> List[str]:
    """
    根据 LIMS 组别名称返回对应的新系统角色列表。
    支持多组别（逗号分隔），取所有组别角色的并集。
    """
    if not group:
        return ['viewer']

    # 处理多组别（如"临床测试,特化测试"）
    groups = [g.strip() for g in group.replace('，', ',').split(',')]
    role_set = set()
    for g in groups:
        roles = GROUP_TO_ROLES.get(g, [])
        if roles:
            role_set.update(roles)

    # 至少给一个 viewer 角色
    if not role_set:
        role_set.add('viewer')
    return sorted(role_set)


def get_lab_role_for_group(group: str) -> Optional[str]:
    """根据 LIMS 组别获取对应的 LabRole 值"""
    if not group:
        return None
    groups = [g.strip() for g in group.replace('，', ',').split(',')]
    for g in groups:
        if g in GROUP_TO_LAB_ROLE:
            return GROUP_TO_LAB_ROLE[g]
    return None

