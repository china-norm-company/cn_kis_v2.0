"""
数字员工真实评估场景库

每个场景包含：
- scenario_id: 唯一标识
- title: 场景名称
- domain: 业务域（secretary/quality/research/execution等）
- user_message: 用户输入
- context: 附加上下文
- expected_keywords: 期望在输出中出现的关键词（用于自动评分）
- is_core: 是否为核心场景（train_agent 默认使用核心场景）
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class TrainingScenario:
    scenario_id: str
    title: str
    domain: str
    user_message: str
    context: dict = field(default_factory=dict)
    expected_keywords: List[str] = field(default_factory=list)
    is_core: bool = False
    difficulty: str = "medium"  # easy / medium / hard


# ─── 核心场景（跨工作台，系统能力基础验证）───────────────────────────────────

CORE_SCENARIOS = [
    TrainingScenario(
        scenario_id="DW-CORE-001",
        title="项目进度查询",
        domain="secretary",
        user_message="帮我查一下 C25005089 项目目前的进展情况，以及还有哪些待办事项。",
        expected_keywords=["项目", "进展", "待办", "受试者"],
        is_core=True,
        difficulty="easy",
    ),
    TrainingScenario(
        scenario_id="DW-CORE-002",
        title="受试者招募分析",
        domain="research",
        user_message="我们现在哪些项目的受试者招募进度落后？给我分析一下原因并提出建议。",
        expected_keywords=["招募", "受试者", "项目", "建议"],
        is_core=True,
        difficulty="medium",
    ),
    TrainingScenario(
        scenario_id="DW-CORE-003",
        title="知识检索-受试者管理规范",
        domain="knowledge",
        user_message="请帮我找一下关于受试者知情同意的操作规范和注意事项。",
        expected_keywords=["知情同意", "受试者", "规范", "操作"],
        is_core=True,
        difficulty="easy",
    ),
    TrainingScenario(
        scenario_id="DW-CORE-004",
        title="财务报销流程咨询",
        domain="finance",
        user_message="差旅费报销需要哪些材料？审批流程是什么？",
        expected_keywords=["报销", "材料", "审批", "差旅"],
        is_core=True,
        difficulty="easy",
    ),
    TrainingScenario(
        scenario_id="DW-CORE-005",
        title="设备使用查询",
        domain="equipment",
        user_message="请告诉我实验室现有哪些检测仪器，哪些需要校准或维护？",
        expected_keywords=["仪器", "设备", "校准", "维护"],
        is_core=True,
        difficulty="medium",
    ),
]

# ─── 秘书工作台场景 ──────────────────────────────────────────────────────────

SECRETARY_SCENARIOS = [
    TrainingScenario(
        scenario_id="DW-SEC-001",
        title="早间邮件摘要",
        domain="secretary",
        user_message="请为我生成今日早间邮件摘要，重点标出需要我今天处理的邮件。",
        expected_keywords=["邮件", "摘要", "处理", "优先级"],
        is_core=False,
    ),
    TrainingScenario(
        scenario_id="DW-SEC-002",
        title="会议安排",
        domain="secretary",
        user_message="帮我在本周五下午安排一个项目启动会，参与人员包括 PI、CRC 和受试者招募负责人。",
        expected_keywords=["会议", "周五", "启动", "安排"],
        is_core=False,
    ),
    TrainingScenario(
        scenario_id="DW-SEC-003",
        title="任务追踪",
        domain="secretary",
        user_message="我有哪些逾期未完成的任务？请帮我整理并按优先级排列。",
        expected_keywords=["任务", "逾期", "优先级", "整理"],
        is_core=False,
    ),
]

# ─── 研究工作台场景 ──────────────────────────────────────────────────────────

RESEARCH_SCENARIOS = [
    TrainingScenario(
        scenario_id="DW-RES-001",
        title="方案解析",
        domain="research",
        user_message="请解析 C25005089 的临床方案，提取关键访视节点和入排标准。",
        expected_keywords=["访视", "入排", "标准", "方案"],
        is_core=False,
    ),
    TrainingScenario(
        scenario_id="DW-RES-002",
        title="受试者匹配",
        domain="research",
        user_message="根据方案 C25001001 的入排标准，帮我找出数据库中可能符合条件的受试者。",
        expected_keywords=["受试者", "匹配", "入排", "筛查"],
        is_core=False,
    ),
]

# ─── 质量工作台场景 ──────────────────────────────────────────────────────────

QUALITY_SCENARIOS = [
    TrainingScenario(
        scenario_id="DW-QUA-001",
        title="数据质疑生成",
        domain="quality",
        user_message="请检查最近提交的 CRF 数据，找出需要发质疑的问题点。",
        expected_keywords=["CRF", "质疑", "数据", "问题"],
        is_core=False,
    ),
]

# ─── 知识检索场景 ────────────────────────────────────────────────────────────

KNOWLEDGE_SCENARIOS = [
    TrainingScenario(
        scenario_id="DW-KNO-001",
        title="SOP知识检索",
        domain="knowledge",
        user_message="请检索关于生物样本采集和处理的标准操作规程。",
        expected_keywords=["SOP", "样本", "采集", "规程"],
        is_core=False,
    ),
    TrainingScenario(
        scenario_id="DW-KNO-002",
        title="法规知识检索",
        domain="knowledge",
        user_message="GCP 中对受试者知情同意的最新要求是什么？",
        expected_keywords=["GCP", "知情同意", "要求", "法规"],
        is_core=False,
    ),
    TrainingScenario(
        scenario_id="DW-KNO-003",
        title="公司运营知识检索",
        domain="knowledge",
        user_message="我们公司历史上招募受试者最成功的项目有哪些？他们用了什么方法？",
        expected_keywords=["招募", "受试者", "方法", "经验"],
        is_core=False,
    ),
]

# ─── 全部场景和核心场景入口 ──────────────────────────────────────────────────

ALL_SCENARIOS = (
    CORE_SCENARIOS
    + SECRETARY_SCENARIOS
    + RESEARCH_SCENARIOS
    + QUALITY_SCENARIOS
    + KNOWLEDGE_SCENARIOS
)


def list_all_scenarios() -> List[TrainingScenario]:
    """返回全部评估场景。"""
    return ALL_SCENARIOS


def list_core_scenarios() -> List[TrainingScenario]:
    """返回核心场景（is_core=True），适合 train_agent 默认批次。"""
    return [s for s in ALL_SCENARIOS if s.is_core]


def get_scenario(scenario_id: str) -> Optional[TrainingScenario]:
    """按 scenario_id 获取单个场景。"""
    for s in ALL_SCENARIOS:
        if s.scenario_id == scenario_id:
            return s
    return None


def list_by_domain(domain: str) -> List[TrainingScenario]:
    """按业务域筛选场景。"""
    return [s for s in ALL_SCENARIOS if s.domain == domain]
