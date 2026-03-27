"""商机新建表单：研究组、业务板块、需求阶段（可后续改为配置表）"""

# 商务负责人下拉固定顺序（与 Account 按姓名匹配；无账号时用负 id 占位）
COMMERCIAL_OWNER_NAME_ORDER = [
    '马蓓丽',
    '顾雯雯',
    '孙华',
    '蒋艳雯',
    '李韶',
    '杨管晟',
    '顾晶',
    '卫婷婷',
    '伍虹宇',
    '张红霞',
    '未确认',
]

# 销售阶段（单选，与 models.OpportunityStage 中 lead/deal/won/cancelled/lost 对应）
SALES_STAGE_OPTIONS = [
    {'value': 'lead', 'label': '线索'},
    {'value': 'deal', 'label': '商机'},
    {'value': 'won', 'label': '赢单'},
    {'value': 'cancelled', 'label': '取消'},
    {'value': 'lost', 'label': '输单'},
]

# 研究组（单选）
RESEARCH_GROUPS = [
    'C01',
    'C02',
    'C03',
    'C04',
    'C05',
    'C06',
    'C07',
    'C08',
    'C09',
    'C10',
    'C11',
    'C12',
    'C15',
    '统计组',
    '临床公共组',
    '创新研究组',
    '创新研究院',
    'TBD',
]

# 业务板块（单选）
BUSINESS_SEGMENTS = [
    'E-情绪/感官',
    'C-功效-皮肤',
    'C-功效-头发',
    'S-法规',
    'W-综合',
    'M-彩妆',
    'A-医美',
    'K-口腔',
    'Y-CRO',
    'F-功能食品',
    '孵化',
]

# 业务类型（单选、选填；与前端 FALLBACK_BUSINESS_TYPE_OPTIONS 一致）
BUSINESS_TYPE_OPTIONS = [
    '皮肤',
    '彩妆',
    '医美',
    '母婴',
    '特化',
    '头发/头皮',
    '离体发束',
    '消费者研究',
    '感官',
    '情绪研究',
    '医学CRO',
    '口腔护理',
    '新技术研究',
    '美容仪器',
    '体外',
    '功能型食品',
    '其他',
]

# 需求阶段（多选，与管道阶段 stage 区分）
DEMAND_STAGE_OPTIONS = [
    '早期，只是先来问问可行性和大致的成本',
    '已经有初步的计划了，在比方案的过程中',
    '方案已经大致思路有了，在比价的过程中',
    '基本已经确定了，是常规测试',
    '公司有竞标流程，我们可能是陪标的',
]
