"""
初始化系统预置角色和权限

Usage:
    python manage.py seed_roles              # 创建/更新角色和权限
    python manage.py seed_roles --reset      # 清空后重建
"""
from django.core.management.base import BaseCommand

from apps.identity.models import Role, Permission, RolePermission, AccountRole
from apps.identity.authz import get_authz_service


# ============================================================================
# 系统预置角色定义
# ============================================================================
SYSTEM_ROLES = [
    # L10 — 系统最高权限
    {'name': 'superadmin', 'display_name': '超级管理员', 'level': 10, 'category': 'management', 'description': '系统最高权限，可访问所有功能和数据'},
    {'name': 'admin', 'display_name': '系统管理员', 'level': 10, 'category': 'management', 'description': '系统管理和配置权限'},

    # L8 — 总监/总经理
    {'name': 'general_manager', 'display_name': '总经理', 'level': 8, 'category': 'management', 'description': '公司级管理，全局数据访问'},
    {'name': 'sales_director', 'display_name': '商务总监', 'level': 8, 'category': 'management', 'description': '统筹商务和客户关系'},
    {'name': 'project_director', 'display_name': '项目总监', 'level': 8, 'category': 'management', 'description': '统筹项目管理和临床执行'},
    {'name': 'tech_director', 'display_name': '技术总监', 'level': 8, 'category': 'technical', 'description': '统筹技术和设备'},
    {'name': 'research_director', 'display_name': '研究总监', 'level': 8, 'category': 'technical', 'description': '统筹研究方向和方案设计'},

    # L6 — 部门经理
    {'name': 'sales_manager', 'display_name': '销售经理', 'level': 6, 'category': 'operation', 'description': '管理销售团队和商机'},
    {'name': 'project_manager', 'display_name': '项目经理', 'level': 6, 'category': 'operation', 'description': '管理临床研究项目执行'},
    {'name': 'quality_manager', 'display_name': '质量经理', 'level': 6, 'category': 'operation', 'description': '质量体系和合规管理'},
    {'name': 'finance_manager', 'display_name': '财务经理', 'level': 6, 'category': 'support', 'description': '财务管理和审批'},
    {'name': 'hr_manager', 'display_name': '人力资源经理', 'level': 6, 'category': 'support', 'description': '人事管理和培训'},
    {'name': 'data_manager', 'display_name': '数据经理', 'level': 6, 'category': 'technical', 'description': '数据管理和分析'},

    # L5 — 主管/高级专员
    {'name': 'crc_supervisor', 'display_name': 'CRC主管', 'level': 5, 'category': 'operation', 'description': 'CRC 团队管理'},
    {'name': 'scheduler', 'display_name': '排程专员', 'level': 5, 'category': 'operation', 'description': '访视和资源排程'},
    {'name': 'customer_success', 'display_name': '客户成功经理', 'level': 5, 'category': 'operation', 'description': '客户服务和售后'},
    {'name': 'researcher', 'display_name': '研究员', 'level': 5, 'category': 'technical', 'description': '参与研究设计和分析'},

    # L4 — 专员/助理
    {'name': 'sales', 'display_name': '销售代表', 'level': 4, 'category': 'operation', 'description': '销售执行和客户开发'},
    {'name': 'business_assistant', 'display_name': '商务助理', 'level': 4, 'category': 'support', 'description': '商务协助和文档处理'},
    {'name': 'it_specialist', 'display_name': 'IT专员', 'level': 4, 'category': 'technical', 'description': '系统维护和技术支持'},
    {'name': 'data_analyst', 'display_name': '数据分析师', 'level': 4, 'category': 'technical', 'description': '数据分析和报表'},

    # L3 — 执行人员
    {'name': 'crc', 'display_name': 'CRC协调员', 'level': 3, 'category': 'operation', 'description': '临床研究协调执行'},
    {'name': 'clinical_executor', 'display_name': '临床执行人员', 'level': 3, 'category': 'operation', 'description': '现场临床操作'},
    {'name': 'technician', 'display_name': '技术员', 'level': 3, 'category': 'technical', 'description': '实验室/设备操作'},
    {'name': 'evaluator', 'display_name': '技术评估员', 'level': 3, 'category': 'technical', 'description': '技术评估和检测执行'},
    {'name': 'receptionist', 'display_name': '前台接待员', 'level': 3, 'category': 'operation', 'description': '前台签到签出与接待队列管理'},
    {'name': 'recruiter', 'display_name': '招募专员', 'level': 3, 'category': 'operation', 'description': '受试者招募'},
    {'name': 'recruitment_manager', 'display_name': '招募经理', 'level': 6, 'category': 'operation', 'description': '招募团队管理、计划审批'},
    {'name': 'lab_personnel', 'display_name': '实验室人员专员', 'level': 3, 'category': 'support', 'description': '实验室人员台日常管理'},
    {'name': 'subject_self', 'display_name': '受试者(自助)', 'level': 1, 'category': 'external', 'description': '受试者通过微信小程序自助访问'},

    # L3 — 职能人员
    {'name': 'finance', 'display_name': '财务人员', 'level': 3, 'category': 'support', 'description': '财务操作'},
    {'name': 'qa', 'display_name': 'QA质量管理', 'level': 3, 'category': 'operation', 'description': '质量检查和偏差报告'},
    {'name': 'hr', 'display_name': 'HR专员', 'level': 3, 'category': 'support', 'description': '人事日常管理'},

    # L1 — 只读/查看者
    {'name': 'viewer', 'display_name': '查看者', 'level': 1, 'category': 'external', 'description': '默认角色，仅可查看基础信息，需管理员分配正式角色'},
]


# ============================================================================
# 角色 → 可访问工作台映射
# ============================================================================
ROLE_WORKBENCH_MAP = {
    # L10: 全部（15 业务 + 3 平台 = 18 个工作台）
    'superadmin': [
        'secretary', 'finance', 'research', 'execution', 'quality',
        'hr', 'crm', 'recruitment', 'equipment', 'material',
        'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception',
        'control-plane', 'admin', 'digital-workforce',
    ],
    'admin': [
        'secretary', 'finance', 'research', 'execution', 'quality',
        'hr', 'crm', 'recruitment', 'equipment', 'material',
        'facility', 'evaluator', 'lab-personnel', 'ethics', 'reception',
        'control-plane', 'admin', 'digital-workforce',
    ],
    # L8: 全局+分管
    'general_manager':   ['secretary', 'digital-workforce', 'research', 'execution', 'quality', 'finance', 'hr', 'crm', 'recruitment', 'control-plane'],
    'sales_director':    ['secretary', 'crm', 'finance'],
    'project_director':  ['secretary', 'research', 'execution', 'quality', 'recruitment'],
    'tech_director':     ['secretary', 'research', 'execution', 'control-plane'],
    'research_director': ['secretary', 'research', 'quality'],
    # L6: 职能+秘书
    'sales_manager':     ['secretary', 'crm'],
    'project_manager':   ['secretary', 'research', 'execution', 'quality'],
    'quality_manager':   ['secretary', 'quality'],
    'finance_manager':   ['secretary', 'finance'],
    'hr_manager':        ['secretary', 'hr'],
    'data_manager':      ['secretary', 'research', 'control-plane'],
    # L5
    'crc_supervisor':    ['secretary', 'execution', 'reception'],
    'scheduler':         ['secretary', 'execution'],
    'customer_success':  ['secretary', 'crm'],
    'researcher':        ['secretary', 'research'],
    # L4
    'sales':             ['secretary', 'crm'],
    'business_assistant':['secretary', 'crm'],
    'it_specialist':     ['secretary', 'control-plane'],
    'data_analyst':      ['secretary', 'research'],
    # L3
    'crc':               ['secretary', 'execution', 'reception'],
    'receptionist':      ['secretary', 'reception'],
    'clinical_executor': ['secretary', 'execution'],
    'technician':        ['secretary', 'execution', 'equipment', 'material', 'facility', 'lab-personnel'],
    'evaluator':         ['secretary', 'evaluator'],
    'recruiter':         ['secretary', 'recruitment'],
    'recruitment_manager': ['secretary', 'recruitment'],
    'lab_personnel':     ['secretary', 'lab-personnel'],
    'subject_self':      [],
    'finance':           ['secretary', 'finance'],
    'qa':                ['secretary', 'quality', 'ethics'],
    'hr':                ['secretary', 'hr'],
    # L1
    'viewer':            ['secretary'],
}


# ============================================================================
# 系统权限定义（模块.功能.操作）
# ============================================================================
SYSTEM_PERMISSIONS = [
    # --- 秘书工作台 (dashboard) ---
    ('dashboard', 'overview', 'read', 'global', '查看工作台总览'),
    ('dashboard', 'feishu_scan', 'read', 'personal', '查看飞书信息扫描'),
    ('dashboard', 'project_analysis', 'read', 'global', '查看项目客户分析'),
    ('dashboard', 'hot_topics', 'read', 'global', '查看热点话题'),
    ('dashboard', 'stats', 'read', 'global', '查看统计数据'),
    ('dashboard', 'activities', 'read', 'personal', '查看最近动态'),

    # --- 协议/项目 (protocol) ---
    ('protocol', 'protocol', 'read', 'global', '查看协议'),
    ('protocol', 'protocol', 'create', 'global', '创建协议'),
    ('protocol', 'protocol', 'update', 'global', '编辑协议'),
    ('protocol', 'protocol', 'delete', 'global', '删除协议'),

    # --- 受试者 (subject) ---
    ('subject', 'subject', 'read', 'project', '查看受试者'),
    ('subject', 'subject', 'create', 'project', '创建受试者'),
    ('subject', 'subject', 'update', 'project', '编辑受试者'),
    ('subject', 'enrollment', 'read', 'project', '查看入组记录'),
    ('subject', 'enrollment', 'create', 'project', '创建入组记录'),

    # --- 招募 (subject.recruitment) ---
    ('subject', 'recruitment', 'read', 'project', '查看招募信息'),
    ('subject', 'recruitment', 'create', 'project', '创建招募计划/报名/渠道'),
    ('subject', 'recruitment', 'update', 'project', '更新招募信息'),
    ('subject', 'recruitment', 'approve', 'global', '审批招募计划/策略'),

    # --- 受试者自助 (my) ---
    ('my', 'profile', 'read', 'personal', '受试者查看自己的档案'),
    ('my', 'profile', 'update', 'personal', '受试者更新自己的信息'),
    ('my', 'appointment', 'read', 'personal', '受试者查看预约'),
    ('my', 'appointment', 'create', 'personal', '受试者创建预约'),
    ('my', 'questionnaire', 'read', 'personal', '受试者查看问卷'),
    ('my', 'questionnaire', 'submit', 'personal', '受试者提交问卷'),
    ('my', 'consent', 'read', 'personal', '受试者查看知情同意'),
    ('my', 'consent', 'sign', 'personal', '受试者签署知情同意'),
    ('my', 'support', 'read', 'personal', '受试者查看工单'),
    ('my', 'support', 'create', 'personal', '受试者创建工单'),
    ('my', 'payment', 'read', 'personal', '受试者查看礼金'),

    # --- 访视 (visit) ---
    ('visit', 'plan', 'read', 'project', '查看访视计划'),
    ('visit', 'plan', 'create', 'project', '创建访视计划'),
    ('visit', 'node', 'read', 'project', '查看访视节点'),
    ('visit', 'node', 'update', 'project', '更新访视节点'),
    ('visit', 'demand', 'read', 'project', '查看资源需求'),

    # --- 排程 (scheduling) ---
    ('scheduling', 'plan', 'read', 'project', '查看排程计划'),
    ('scheduling', 'plan', 'create', 'project', '创建排程/上传执行订单'),
    ('scheduling', 'plan', 'update', 'project', '更新排程计划'),

    # --- 工单 (workorder) ---
    ('workorder', 'workorder', 'read', 'project', '查看工单'),
    ('workorder', 'workorder', 'create', 'project', '创建工单'),
    ('workorder', 'workorder', 'update', 'personal', '更新工单'),

    # --- EDC (edc) ---
    ('edc', 'crf', 'read', 'project', '查看CRF'),
    ('edc', 'crf', 'create', 'project', '提交CRF'),
    ('edc', 'crf', 'verify', 'project', '核实CRF'),
    ('edc', 'record', 'read', 'project', '查看EDC记录'),
    ('edc', 'sdv', 'read', 'project', '查看SDV核查'),
    ('edc', 'query', 'read', 'project', '查看数据质疑'),

    # --- CRM (crm) ---
    ('crm', 'client', 'read', 'global', '查看客户'),
    ('crm', 'client', 'create', 'global', '创建客户'),
    ('crm', 'client', 'update', 'global', '编辑客户'),
    ('crm', 'opportunity', 'read', 'global', '查看商机'),
    ('crm', 'opportunity', 'create', 'global', '创建商机'),
    ('crm', 'opportunity', 'update', 'personal', '编辑商机'),
    ('crm', 'ticket', 'read', 'global', '查看售后工单'),
    ('crm', 'ticket', 'create', 'global', '创建售后工单'),

    # --- 质量 (quality) ---
    ('quality', 'deviation', 'read', 'project', '查看偏差'),
    ('quality', 'deviation', 'create', 'project', '报告偏差'),
    ('quality', 'deviation', 'approve', 'global', '审批偏差'),
    ('quality', 'capa', 'read', 'global', '查看CAPA'),
    ('quality', 'capa', 'create', 'global', '创建CAPA'),
    ('quality', 'change', 'read', 'project', '查看变更控制'),
    ('quality', 'audit', 'read', 'global', '查看审计管理'),
    ('quality', 'sop', 'read', 'global', '查看SOP'),
    ('quality', 'sop', 'manage', 'global', '管理SOP'),

    # --- 财务 (finance) ---
    ('finance', 'quote', 'read', 'global', '查看报价'),
    ('finance', 'quote', 'create', 'global', '创建报价'),
    ('finance', 'contract', 'read', 'global', '查看合同'),
    ('finance', 'contract', 'create', 'global', '创建合同'),
    ('finance', 'contract', 'approve', 'global', '审批合同'),
    ('finance', 'invoice', 'read', 'global', '查看发票'),
    ('finance', 'invoice', 'create', 'global', '创建发票'),
    ('finance', 'payment', 'read', 'global', '查看回款'),
    ('finance', 'payment', 'create', 'global', '登记回款'),
    ('finance', 'payable', 'read', 'global', '查看应付管理'),
    ('finance', 'expense', 'read', 'global', '查看费用报销'),
    ('finance', 'cost', 'read', 'global', '查看成本记录'),
    ('finance', 'budget', 'read', 'global', '查看预算管理'),
    ('finance', 'report', 'read', 'global', '查看财务分析报表'),

    # --- 人事 (hr) ---
    ('hr', 'staff', 'read', 'global', '查看员工'),
    ('hr', 'staff', 'manage', 'global', '管理员工资质'),
    ('hr', 'competency', 'read', 'global', '查看胜任力模型'),
    ('hr', 'competency', 'manage', 'global', '管理胜任力模型'),
    ('hr', 'assessment', 'read', 'global', '查看评估'),
    ('hr', 'assessment', 'create', 'global', '创建评估'),
    ('hr', 'training', 'read', 'global', '查看培训'),
    ('hr', 'training', 'manage', 'global', '管理培训'),

    # --- 研究扩展 (feasibility/proposal/closeout) ---
    ('feasibility', 'assessment', 'read', 'project', '查看可行性评估'),
    ('feasibility', 'assessment', 'create', 'global', '创建可行性评估'),
    ('feasibility', 'assessment', 'update', 'global', '编辑可行性评估'),
    ('feasibility', 'assessment', 'approve', 'global', '审批可行性评估'),
    ('proposal', 'proposal', 'read', 'project', '查看方案准备'),
    ('proposal', 'proposal', 'create', 'global', '创建方案'),
    ('proposal', 'proposal', 'update', 'global', '编辑方案'),
    ('closeout', 'closeout', 'read', 'project', '查看结项管理'),
    ('closeout', 'closeout', 'create', 'global', '创建结项'),
    ('closeout', 'closeout', 'update', 'global', '编辑结项'),

    # --- 资源与物料 (resource/sample) ---
    ('resource', 'equipment', 'read', 'global', '查看设备台账'),
    ('resource', 'equipment', 'write', 'global', '维护设备台账'),
    ('resource', 'calibration', 'read', 'global', '查看校准计划'),
    ('resource', 'calibration', 'write', 'global', '维护校准计划'),
    ('resource', 'verification', 'read', 'global', '查看核查计划'),
    ('resource', 'verification', 'write', 'global', '维护核查计划'),
    ('resource', 'maintenance', 'read', 'global', '查看维护工单'),
    ('resource', 'maintenance', 'write', 'global', '维护维护工单'),
    ('resource', 'usage', 'read', 'global', '查看设备使用记录'),
    ('resource', 'usage', 'write', 'global', '维护设备使用记录'),
    ('resource', 'authorization', 'read', 'global', '查看设备授权'),
    ('resource', 'authorization', 'write', 'global', '维护设备授权'),
    ('resource', 'method', 'read', 'global', '查看检测方法'),
    ('resource', 'method', 'write', 'global', '维护检测方法'),
    ('resource', 'venue', 'read', 'global', '查看场地信息'),
    ('resource', 'venue', 'write', 'global', '维护场地信息'),
    ('resource', 'environment', 'read', 'global', '查看环境监控'),
    ('resource', 'environment', 'write', 'global', '维护环境监控'),
    ('resource', 'material', 'read', 'global', '查看物料信息'),
    ('resource', 'material', 'write', 'global', '维护物料信息'),
    ('resource', 'inventory', 'read', 'global', '查看库存信息'),
    ('resource', 'inventory', 'write', 'global', '维护库存流水'),
    ('resource', 'template', 'read', 'global', '查看模板资源'),
    ('resource', 'item', 'read', 'global', '查看资源条目'),
    ('sample', 'instance', 'read', 'project', '查看样本实例'),
    ('resource', 'sample', 'read', 'global', '查看样品管理'),
    ('resource', 'sample', 'dispense', 'project', '发放/领用样品（需同工单+受试者+访视点唯一）'),

    # --- 二维码 (qrcode) ---
    ('qrcode', 'record', 'read', 'project', '查看二维码记录'),
    ('qrcode', 'record', 'create', 'project', '创建二维码记录'),
    ('qrcode', 'record', 'update', 'project', '更新二维码记录'),

    # --- 安全/伦理/文档 ---
    ('safety', 'ae', 'read', 'project', '查看安全事件'),
    ('safety', 'ae', 'create', 'project', '上报/随访安全事件'),
    ('ethics', 'app', 'read', 'project', '查看伦理申请'),
    ('document', 'doc', 'read', 'global', '查看文档'),

    # --- 实验室人员 (lab_personnel) ---
    ('lab_personnel', 'dashboard', 'read', 'global', '查看人员台仪表盘'),
    ('lab_personnel', 'staff', 'read', 'global', '查看人员档案'),
    ('lab_personnel', 'qualification', 'read', 'global', '查看资质矩阵'),
    ('lab_personnel', 'schedule', 'read', 'global', '查看排班管理'),
    ('lab_personnel', 'worktime', 'read', 'global', '查看工时统计'),
    ('lab_personnel', 'risk', 'read', 'global', '查看风险预警'),
    ('lab_personnel', 'dispatch', 'read', 'global', '查看工单派发'),

    # --- 智能体 (agent) ---
    ('agent', 'chat', 'use', 'personal', '使用AI智能体对话'),
    ('agent', 'agent', 'read', 'global', '查看智能体列表'),
    ('agent', 'session', 'read', 'personal', '查看自己的会话'),
    # --- 子衿个人业务助理 (assistant) ---
    ('assistant', 'context', 'read', 'personal', '读取角色授权范围内的跨工作台上下文（只读）'),
    ('assistant', 'summary', 'generate', 'personal', '生成业务摘要/日报/常规分析草稿'),
    ('assistant', 'automation', 'execute', 'personal', '执行自动化动作（默认需人工确认）'),
    ('assistant', 'policy', 'manage', 'personal', '管理子衿动作策略（白名单/阈值/确认门禁）'),
    ('assistant', 'preference', 'manage', 'personal', '管理子衿个人偏好（语气/动作偏好/节律）'),

    # --- 统一平台 (control-plane) ---
    ('control', 'dashboard', 'read', 'global', '查看统一平台总控台'),
    ('control', 'object', 'read', 'global', '查看统一平台对象中心'),
    ('control', 'event', 'read', 'global', '查看统一平台事件中心'),
    ('control', 'ticket', 'read', 'global', '查看统一平台工单中心'),
    ('control', 'network', 'read', 'global', '查看统一平台网络概览'),

    # --- 电子签名 (signature) ---
    ('signature', 'signature', 'read', 'personal', '查看电子签名'),
    ('signature', 'signature', 'create', 'personal', '创建电子签名'),

    # --- 技术评估 (evaluator) ---
    ('evaluator', 'dashboard', 'read', 'personal', '查看评估台工作面板'),
    ('evaluator', 'workorder', 'read', 'personal', '查看我的工单'),
    ('evaluator', 'workorder', 'execute', 'personal', '执行工单（接受/准备/执行/完成）'),
    ('evaluator', 'step', 'read', 'personal', '查看工单步骤'),
    ('evaluator', 'step', 'execute', 'personal', '执行工单步骤'),
    ('evaluator', 'detection', 'create', 'personal', '创建仪器检测'),
    ('evaluator', 'detection', 'execute', 'personal', '执行仪器检测'),
    ('evaluator', 'exception', 'create', 'personal', '上报异常'),
    ('evaluator', 'exception', 'read', 'personal', '查看异常列表'),
    ('evaluator', 'schedule', 'read', 'personal', '查看我的排程'),
    ('evaluator', 'knowledge', 'read', 'global', '查看知识库'),
    ('evaluator', 'profile', 'read', 'personal', '查看我的成长数据'),

    # --- 知识库管理 (knowledge) ---
    ('knowledge', 'entry', 'view', 'global', '查看知识条目'),
    ('knowledge', 'entry', 'create', 'global', '创建知识条目'),
    ('knowledge', 'entry', 'update', 'global', '编辑知识条目'),
    ('knowledge', 'entry', 'delete', 'global', '删除知识条目'),
    ('knowledge', 'entry', 'review', 'global', '审核/发布知识条目'),

    # --- 数字员工中心管理 (dashboard.admin) ---
    ('dashboard', 'admin', 'manage', 'global', '数字员工中心管理（Agent/技能/路由/工作台配置）'),

    # --- 系统管理 (system) ---
    ('system', 'role', 'read', 'global', '查看角色'),
    ('system', 'role', 'manage', 'global', '管理角色'),
    ('system', 'permission', 'manage', 'global', '管理权限'),
    ('system', 'account', 'manage', 'global', '管理账号'),
    ('system', 'audit', 'read', 'global', '查看审计日志'),
    ('system', 'sync', 'manage', 'global', '管理飞书同步'),
    ('system', 'notification', 'read', 'personal', '查看站内通知'),
]


# ============================================================================
# 角色 → 权限映射（使用通配符简化）
# ============================================================================
ROLE_PERMISSION_MAP = {
    'superadmin': ['*'],  # 全部权限
    'admin': ['*'],

    'general_manager': [
        'dashboard.*', 'protocol.*', 'subject.*', 'visit.*', 'workorder.*',
        'edc.*', 'crm.*', 'quality.*', 'finance.*', 'hr.*',
        'feasibility.*', 'proposal.*', 'closeout.*',
        'scheduling.plan.read', 'scheduling.plan.create',
        'agent.*', 'assistant.*', 'signature.*', 'control.*', 'system.audit.read',
        'knowledge.*', 'system.notification.read',
    ],

    'sales_director': [
        'dashboard.*', 'crm.*', 'finance.quote.read', 'finance.contract.read',
        'finance.invoice.read', 'finance.payment.read', 'protocol.protocol.read',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'project_director': [
        'dashboard.*', 'protocol.*', 'subject.*', 'visit.*', 'workorder.*',
        'edc.*', 'quality.*', 'safety.ae.read',
        'feasibility.*', 'proposal.*', 'closeout.*',
        'scheduling.plan.read', 'scheduling.plan.create',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'tech_director': [
        'dashboard.*', 'protocol.protocol.read', 'edc.*',
        'subject.subject.read', 'visit.*', 'workorder.*', 'resource.*', 'sample.*',
        'scheduling.plan.read', 'scheduling.plan.create',
        'assistant.context.read', 'assistant.summary.generate', 'control.*',
        'system.notification.read',
    ],
    'research_director': [
        'dashboard.*', 'protocol.*', 'subject.*', 'visit.*',
        'feasibility.*', 'proposal.*', 'closeout.*',
        'quality.deviation.read', 'quality.sop.read',
        'assistant.context.read', 'assistant.summary.generate',
        'agent.chat.use', 'agent.session.read',
        'system.notification.read',
    ],

    'sales_manager': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.feishu_scan.read',
        'dashboard.activities.read', 'crm.*',
        'assistant.context.read', 'assistant.summary.generate', 'assistant.preference.manage',
        'system.notification.read',
    ],
    'project_manager': [
        'dashboard.*', 'protocol.protocol.read', 'protocol.protocol.update',
        'subject.*', 'visit.*', 'workorder.*', 'edc.crf.read', 'edc.crf.verify',
        'quality.deviation.read', 'quality.deviation.create', 'quality.capa.read',
        'safety.ae.read',
        'resource.sample.read', 'resource.sample.dispense',
        'scheduling.plan.read', 'scheduling.plan.create',
        'signature.signature.read', 'signature.signature.create',
        'assistant.context.read', 'assistant.summary.generate', 'assistant.automation.execute', 'assistant.policy.manage', 'assistant.preference.manage',
        'agent.chat.use', 'agent.session.read',
        'system.notification.read',
    ],
    'quality_manager': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.feishu_scan.read',
        'dashboard.activities.read', 'quality.*', 'protocol.protocol.read',
        'safety.ae.read', 'safety.ae.create',
        'signature.*', 'assistant.context.read', 'assistant.summary.generate',
        'knowledge.*', 'agent.chat.use', 'agent.session.read',
        'system.notification.read',
    ],
    'finance_manager': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.feishu_scan.read',
        'dashboard.activities.read', 'finance.*',
        'assistant.context.read', 'assistant.summary.generate',
        'agent.chat.use', 'agent.session.read',
        'system.notification.read',
    ],
    'hr_manager': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.feishu_scan.read',
        'dashboard.activities.read', 'hr.*',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'data_manager': [
        'dashboard.*', 'protocol.protocol.read', 'subject.subject.read',
        'edc.crf.read', 'edc.crf.verify', 'edc.record.read',
        'feasibility.assessment.read', 'proposal.proposal.read', 'closeout.closeout.read',
        'assistant.context.read', 'assistant.summary.generate', 'control.dashboard.read', 'control.object.read', 'control.event.read',
        'system.notification.read',
    ],

    'crc_supervisor': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.feishu_scan.read',
        'dashboard.activities.read',
        'subject.*', 'visit.*', 'workorder.*', 'edc.crf.read', 'edc.crf.create',
        'resource.sample.read', 'resource.sample.dispense',
        'scheduling.plan.read', 'scheduling.plan.create',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'scheduler': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'visit.*', 'workorder.workorder.read',
        'system.notification.read',
        'scheduling.plan.read', 'scheduling.plan.create',
    ],
    'customer_success': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.feishu_scan.read',
        'dashboard.activities.read',
        'crm.client.read', 'crm.ticket.read', 'crm.ticket.create',
        'assistant.context.read', 'assistant.summary.generate', 'assistant.preference.manage',
        'system.notification.read',
    ],
    'researcher': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.feishu_scan.read',
        'dashboard.activities.read',
        'protocol.protocol.read', 'protocol.protocol.create', 'protocol.protocol.update', 'subject.subject.read', 'visit.plan.read',
        'feasibility.assessment.read', 'proposal.proposal.read', 'closeout.closeout.read',
        'assistant.context.read', 'assistant.summary.generate',
        'knowledge.entry.view', 'knowledge.entry.create',
        'system.notification.read',
    ],

    'sales': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.feishu_scan.read',
        'dashboard.activities.read',
        'crm.client.read', 'crm.client.create', 'crm.client.update',
        'crm.opportunity.read', 'crm.opportunity.create', 'crm.opportunity.update',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'business_assistant': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'crm.client.read', 'crm.opportunity.read',
        'assistant.context.read', 'assistant.summary.generate', 'assistant.automation.execute', 'assistant.policy.manage', 'assistant.preference.manage',
        'system.notification.read',
    ],
    'it_specialist': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'control.*',
        'system.notification.read',
    ],
    'data_analyst': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'protocol.protocol.read', 'subject.subject.read', 'edc.crf.read',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],

    'crc': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'subject.subject.read', 'subject.subject.update', 'subject.enrollment.read',
        'visit.node.read', 'visit.node.update',
        'workorder.workorder.read', 'workorder.workorder.update',
        'edc.crf.read', 'edc.crf.create',
        'resource.sample.read', 'resource.sample.dispense',
        'scheduling.plan.read', 'scheduling.plan.create',
        'assistant.context.read', 'assistant.summary.generate',
        'agent.chat.use',
        'system.notification.read',
    ],
    'clinical_executor': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'visit.node.read', 'visit.node.update',
        'workorder.workorder.read', 'workorder.workorder.update',
        'edc.crf.read', 'edc.crf.create', 'resource.*', 'sample.*',
        'resource.sample.dispense',
        'scheduling.plan.read', 'scheduling.plan.create',
        'agent.chat.use',
        'system.notification.read',
    ],
    'technician': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'workorder.workorder.read', 'workorder.workorder.update',
        'edc.crf.read', 'edc.crf.create', 'resource.*', 'sample.*',
        'scheduling.plan.read', 'scheduling.plan.create',
        'resource.sample.dispense',
        'agent.chat.use',
        'system.notification.read'
    ],
    'evaluator': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'evaluator.*',
        'workorder.workorder.read', 'workorder.workorder.update',
        'edc.crf.read', 'edc.crf.create',
        'quality.sop.read', 'quality.deviation.read',
        'system.notification.read',
    ],
    'receptionist': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'subject.subject.read', 'subject.subject.create', 'subject.subject.update',
        'qrcode.record.read', 'qrcode.record.create', 'qrcode.record.update',
        'visit.plan.read', 'visit.node.read',
        'workorder.workorder.read',
        'system.notification.read',
    ],
    'recruiter': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'subject.subject.read', 'subject.subject.create', 'subject.subject.update',
        'subject.recruitment.read', 'subject.recruitment.create', 'subject.recruitment.update',
        # 招募台物料：模板/预约文档「通过、驳回」与计划审批等（与业务约定：专员可处理待办审批）
        'subject.recruitment.approve',
        'agent.chat.use', 'agent.session.read',
        'system.notification.read',
    ],
    'recruitment_manager': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'subject.*', 'subject.recruitment.*',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'lab_personnel': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'lab_personnel.*',
        'system.notification.read',
    ],
    'subject_self': [
        'my.*',
        'edc.crf.read',
        'edc.crf.create',
        'agent.chat.use',
        'agent.session.read',
        'system.notification.read',
    ],

    'finance': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'finance.quote.read', 'finance.contract.read',
        'finance.invoice.read', 'finance.invoice.create',
        'finance.payment.read', 'finance.payment.create',
        'finance.payable.read', 'finance.expense.read', 'finance.cost.read',
        'finance.budget.read', 'finance.report.read',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'qa': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'quality.deviation.read', 'quality.deviation.create',
        'quality.capa.read', 'quality.sop.read',
        'quality.change.read', 'quality.audit.read', 'edc.record.read',
        'safety.ae.read', 'safety.ae.create',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'hr': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'hr.staff.read', 'hr.training.read', 'hr.assessment.read',
        'assistant.context.read', 'assistant.summary.generate',
        'system.notification.read',
    ],
    'viewer': [
        'dashboard.overview.read', 'dashboard.stats.read', 'dashboard.activities.read',
        'agent.chat.use', 'agent.agent.read', 'agent.session.read',
        'assistant.summary.generate', 'assistant.preference.manage',
        'system.notification.read',
    ],
}


class Command(BaseCommand):
    help = '初始化系统预置角色和权限'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='清空后重建')

    def handle(self, *args, **options):
        if options['reset']:
            self.stdout.write('清空角色权限数据...')
            RolePermission.objects.all().delete()
            Permission.objects.all().delete()
            Role.objects.filter(is_system=True).delete()

        self._seed_roles()
        self._seed_permissions()
        self._seed_role_permissions()
        self._clear_authz_cache()

        self.stdout.write(self.style.SUCCESS('角色权限种子数据初始化完成'))

    def _seed_roles(self):
        created = 0
        updated = 0
        for role_data in SYSTEM_ROLES:
            name = role_data['name']
            defaults = {
                'display_name': role_data['display_name'],
                'level': role_data['level'],
                'category': role_data['category'],
                'description': role_data['description'],
                'is_system': True,
                'is_active': True,
            }
            _, was_created = Role.objects.update_or_create(
                name=name, defaults=defaults,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(f'  角色: 新建 {created}, 更新 {updated}')

    def _seed_permissions(self):
        created = 0
        for module, function, action, scope, desc in SYSTEM_PERMISSIONS:
            _, was_created = Permission.objects.update_or_create(
                module=module, function=function, action=action,
                defaults={'scope': scope, 'description': desc},
            )
            if was_created:
                created += 1

        self.stdout.write(f'  权限: 新建 {created}, 总计 {Permission.objects.count()}')

    def _seed_role_permissions(self):
        created = 0
        all_permissions = {str(p): p for p in Permission.objects.all()}

        for role_name, perm_patterns in ROLE_PERMISSION_MAP.items():
            role = Role.objects.filter(name=role_name).first()
            if not role:
                continue

            matched_perms = set()
            for pattern in perm_patterns:
                if pattern == '*':
                    matched_perms = set(all_permissions.values())
                    break
                elif pattern.endswith('.*'):
                    prefix = pattern[:-2]
                    for code, perm in all_permissions.items():
                        if code.startswith(prefix + '.'):
                            matched_perms.add(perm)
                else:
                    if pattern in all_permissions:
                        matched_perms.add(all_permissions[pattern])

            for perm in matched_perms:
                _, was_created = RolePermission.objects.get_or_create(
                    role=role, permission=perm,
                )
                if was_created:
                    created += 1

        self.stdout.write(f'  角色-权限关联: 新建 {created}, 总计 {RolePermission.objects.count()}')

    def _clear_authz_cache(self):
        """清除所有账号的权限缓存，使新角色权限立即生效"""
        account_ids = AccountRole.objects.values_list('account_id', flat=True).distinct()
        authz = get_authz_service()
        for aid in account_ids:
            authz.clear_cache(aid)
        self.stdout.write(f'  已清除 {len(account_ids)} 个账号的权限缓存')
