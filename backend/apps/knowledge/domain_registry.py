"""
数据域注册表 — 洞明·数据台治理骨架

将系统内所有数据资产按业务归属组织为 10 个数据域（domain）。
每个域定义：
  domain_id           : 唯一标识（snake_case）
  label               : 中文显示名
  description         : 职责说明
  domain_type         : 域类型（external/staging/business/content/knowledge/meta）
  lifecycle_stage     : 数据所属生命周期层（raw/staging/formal/content/knowledge/meta）
  tables              : 本域包含的核心表列表
  source_apps         : 数据产生的 Django app 列表
  owner_role          : 数据责任角色
  regulatory          : 管辖框架（来自分类注册表）
  core_responsibilities : 本域核心职责条目列表
  governance_focus    : 治理重点标签列表
  retention_expectation : 数据保留期要求描述
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

LifecycleStage = Literal['raw', 'staging', 'formal', 'content', 'knowledge', 'meta']
OwnerRole = Literal['data_manager', 'tech_director', 'admin', 'compliance_officer']
DomainType = Literal['external', 'staging', 'business', 'content', 'knowledge', 'meta']


@dataclass(frozen=True)
class DataDomain:
    domain_id: str
    label: str
    description: str
    domain_type: DomainType
    lifecycle_stage: LifecycleStage
    tables: list[str]
    source_apps: list[str]
    owner_role: OwnerRole
    regulatory: list[str] = field(default_factory=list)
    color: str = 'slate'
    core_responsibilities: list[str] = field(default_factory=list)
    governance_focus: list[str] = field(default_factory=list)
    retention_expectation: str = ''

    def to_dict(self) -> dict:
        return {
            'domain_id': self.domain_id,
            'label': self.label,
            'description': self.description,
            'domain_type': self.domain_type,
            'lifecycle_stage': self.lifecycle_stage,
            'tables': self.tables,
            'source_apps': self.source_apps,
            'owner_role': self.owner_role,
            'regulatory': self.regulatory,
            'color': self.color,
            'table_count': len(self.tables),
            'core_responsibilities': self.core_responsibilities,
            'governance_focus': self.governance_focus,
            'retention_expectation': self.retention_expectation,
        }


# ── 10 个数据域完整注册 ───────────────────────────────────────────────────────

DOMAIN_REGISTRY: dict[str, DataDomain] = {

    'external_raw_data': DataDomain(
        domain_id='external_raw_data',
        label='外部源数据域',
        description='来自外部系统（LIMS、易快报）的原始采集数据，永久不可变，是所有外部接入的源头',
        domain_type='external',
        lifecycle_stage='raw',
        tables=['t_ekb_raw_record', 't_raw_lims_record'],
        source_apps=['ekuaibao_integration', 'lims_integration'],
        owner_role='admin',
        regulatory=['REG-GCP', 'REG-TAX'],
        color='red',
        core_responsibilities=[
            '保存来自 LIMS 和易快报的原始采集数据，不可修改',
            '维护每条原始记录的注入状态（pending / injected / failed）',
            '作为所有外部接入流程的唯一数据源头',
            '确保外部数据的完整性与可溯性',
        ],
        governance_focus=['不可变性保护', '采集完整性', '注入状态追踪', '来源真实性'],
        retention_expectation='永久保留（根据 REG-GCP 要求最少 15 年，REG-TAX 要求最少 10 年）',
    ),

    'data_intake_staging': DataDomain(
        domain_id='data_intake_staging',
        label='接入暂存域',
        description='外部数据经清洗映射后进入候选队列，等待各业务工作台人工审核后正式接入',
        domain_type='staging',
        lifecycle_stage='staging',
        tables=['t_ext_ingest_candidate'],
        source_apps=['data_intake'],
        owner_role='data_manager',
        regulatory=['REG-INT'],
        color='amber',
        core_responsibilities=[
            '接收来自外部源数据域的原始记录并生成接入候选',
            '对候选数据进行置信度评估和字段映射',
            '向各业务工作台提供待审核候选队列',
            '记录审核决策和接入结果',
        ],
        governance_focus=['候选积压监控', '置信度阈值管理', '审核时效 SLA', '域写入追踪'],
        retention_expectation='候选记录保留 3 年，接入日志永久保留',
    ),

    'subject_data': DataDomain(
        domain_id='subject_data',
        label='受试者数据域',
        description='受试者档案、入组记录等 PHI 核心业务数据，受 GCP+PIPL 双重合规管辖，需假名化',
        domain_type='business',
        lifecycle_stage='formal',
        tables=['t_subject', 't_enrollment'],
        source_apps=['subject'],
        owner_role='data_manager',
        regulatory=['REG-GCP', 'REG-PI'],
        color='rose',
        core_responsibilities=[
            '管理受试者档案（姓名、出生日期、联系方式等 PHI）',
            '记录入组和筛选结果',
            '维护受试者在各项目中的参与状态',
            '执行假名化策略，隔离直接标识符',
        ],
        governance_focus=['PHI 假名化', 'GCP+PIPL 双合规', '访问控制最小化', '数据主体权利响应'],
        retention_expectation='项目结束后至少 15 年（GCP 要求），PIPL 要求在不再需要时删除或匿名化',
    ),

    'project_protocol_data': DataDomain(
        domain_id='project_protocol_data',
        label='方案与执行数据域',
        description='研究方案、访视计划、访视节点、工单等临床执行主干数据，GCP 合规核心',
        domain_type='business',
        lifecycle_stage='formal',
        tables=['t_protocol', 't_visit_plan', 't_visit_node', 't_work_order',
                't_crf_template', 't_crf_record'],
        source_apps=['protocol', 'visit', 'workorder', 'edc'],
        owner_role='data_manager',
        regulatory=['REG-GCP'],
        color='blue',
        core_responsibilities=[
            '管理研究方案及其版本历史',
            '记录访视计划和访视节点执行情况',
            '管理工单创建、分配和完成状态',
            '存储 CRF 模板和 EDC 数据记录',
        ],
        governance_focus=['版本控制', 'GCP 数据完整性', '变更追溯', '电子签名合规'],
        retention_expectation='GCP 要求最少 15 年；CRF 原始记录须永久保留',
    ),

    'execution_detection_data': DataDomain(
        domain_id='execution_detection_data',
        label='执行与检测数据域',
        description='偏差记录、CAPA、数据质疑等质量合规数据，以及 EDC 数据质疑管理',
        domain_type='business',
        lifecycle_stage='formal',
        tables=['t_deviation', 't_capa', 't_sop', 't_data_query'],
        source_apps=['quality'],
        owner_role='data_manager',
        regulatory=['REG-GCP'],
        color='purple',
        core_responsibilities=[
            '记录偏差事件和纠正措施（CAPA）',
            '管理 SOP 文件版本和有效期',
            '处理 EDC 数据质疑的创建、回复和关闭',
            '支持质量审计和稽查跟踪',
        ],
        governance_focus=['偏差闭环时效', 'CAPA 有效性验证', 'SOP 版本合规', '稽查轨迹完整性'],
        retention_expectation='GCP 要求至少 15 年；偏差和 CAPA 记录须永久保留',
    ),

    'finance_data': DataDomain(
        domain_id='finance_data',
        label='财务数据域',
        description='报价单、合同、发票、收款记录等财务数据，受税务法规管辖',
        domain_type='business',
        lifecycle_stage='formal',
        tables=['t_quote', 't_contract', 't_invoice', 't_payment'],
        source_apps=['finance', 'crm'],
        owner_role='data_manager',
        regulatory=['REG-TAX'],
        color='emerald',
        core_responsibilities=[
            '管理项目报价和合同档案',
            '记录发票开具和核销状态',
            '跟踪回款和应付账款',
            '支持财务合规审计',
        ],
        governance_focus=['发票合规性', '税务数据完整性', '回款状态追踪', '财务审计支持'],
        retention_expectation='税务凭证保留 10 年（REG-TAX 要求），合同保留至合同期满后 5 年',
    ),

    'personnel_qualification_data': DataDomain(
        domain_id='personnel_qualification_data',
        label='人事与资质数据域',
        description='员工档案、资质认证、人事合规记录，含个人信息保护要求',
        domain_type='business',
        lifecycle_stage='formal',
        tables=['t_staff', 't_staff_qualification'],
        source_apps=['hr', 'lab_personnel'],
        owner_role='admin',
        regulatory=['REG-PI', 'REG-GCP'],
        color='teal',
        core_responsibilities=[
            '维护员工基础档案和职位信息',
            '记录 GCP 培训完成情况和资质证书',
            '管理人员合规状态（是否有效授权参与研究）',
            '保护员工个人信息，遵守 PIPL',
        ],
        governance_focus=['资质有效期预警', 'GCP 培训合规', 'PIPL 个人信息保护', '离职数据处理'],
        retention_expectation='在职期间全量保留；离职后保留至少 5 年；GCP 相关资质记录至少 15 年',
    ),

    'content_signal_data': DataDomain(
        domain_id='content_signal_data',
        label='内容与信号域',
        description='飞书采集的邮件、IM、任务、日历等上下文数据，以及从中提取的业务信号事件',
        domain_type='content',
        lifecycle_stage='content',
        tables=['t_personal_context'],
        source_apps=['secretary'],
        owner_role='data_manager',
        regulatory=['REG-PI'],
        color='indigo',
        core_responsibilities=[
            '采集和存储飞书 IM、邮件、任务、日历等个人上下文',
            '对内容进行 content_hash 去重',
            '支持内容向知识条目的转化（→ knowledge_asset_data 域）',
            '按 source_type 分类管理不同通道的内容信号',
        ],
        governance_focus=['个人通讯数据最小化', 'PIPL 合规采集', '内容重复治理', '转化率监控'],
        retention_expectation='内容信号保留 2 年；转化为知识条目后可按知识资产保留期处理',
    ),

    'knowledge_asset_data': DataDomain(
        domain_id='knowledge_asset_data',
        label='知识资产域',
        description='经加工结构化的知识条目、图谱实体与关系，1024 维向量嵌入（Qwen3-embedding）',
        domain_type='knowledge',
        lifecycle_stage='knowledge',
        tables=['t_knowledge_entry', 't_knowledge_entity', 't_knowledge_relation'],
        source_apps=['knowledge'],
        owner_role='data_manager',
        regulatory=['REG-INT'],
        color='violet',
        core_responsibilities=[
            '存储经清洗和结构化处理的知识条目',
            '维护知识图谱实体和关系网络',
            '管理 Qwen3-embedding 1024 维向量索引',
            '监控知识条目质量分和向量化覆盖率',
        ],
        governance_focus=['向量化覆盖率监控', '知识质量评分管理', '图谱一致性维护', '来源可溯性'],
        retention_expectation='知识条目永久保留；向量索引与知识条目同步更新，旧版向量在模型升级时迁移',
    ),

    'governance_meta_data': DataDomain(
        domain_id='governance_meta_data',
        label='治理元数据域',
        description='账号、角色、权限、会话 Token、飞书 Token、审计日志等平台基础治理元数据',
        domain_type='meta',
        lifecycle_stage='meta',
        tables=['t_account', 't_role', 't_permission', 't_session_token',
                't_feishu_user_token', 't_audit_log',
                't_data_quality_rule', 't_data_quality_alert'],
        source_apps=['identity', 'audit', 'quality'],
        owner_role='admin',
        regulatory=['REG-INT', 'REG-GCP', 'REG-PI'],
        color='slate',
        core_responsibilities=[
            '管理系统账号、角色和权限映射',
            '维护飞书 Token 生命周期（access/refresh 滚动续期）',
            '记录所有关键操作的审计日志',
            '提供 RBAC 授权基础设施',
            '管理数据质量规则和告警记录',
        ],
        governance_focus=['Token 健康监控', '审计日志完整性', '权限最小化原则', '账号生命周期管理', '数据质量规则治理'],
        retention_expectation='审计日志永久保留（GCP 稽查要求）；会话 Token 过期即清理；账号记录 5 年；质量规则永久保留',
    ),
}


class DomainRegistry:
    """数据域注册表查询 API。"""

    @classmethod
    def all(cls) -> list[DataDomain]:
        return list(DOMAIN_REGISTRY.values())

    @classmethod
    def get(cls, domain_id: str) -> DataDomain | None:
        return DOMAIN_REGISTRY.get(domain_id)

    @classmethod
    def by_lifecycle(cls, stage: LifecycleStage) -> list[DataDomain]:
        return [d for d in DOMAIN_REGISTRY.values() if d.lifecycle_stage == stage]

    @classmethod
    def by_domain_type(cls, domain_type: DomainType) -> list[DataDomain]:
        return [d for d in DOMAIN_REGISTRY.values() if d.domain_type == domain_type]

    @classmethod
    def for_table(cls, table_name: str) -> DataDomain | None:
        """根据表名反查所属域。"""
        for domain in DOMAIN_REGISTRY.values():
            if table_name in domain.tables:
                return domain
        return None

    @classmethod
    def summary(cls) -> dict:
        """返回各域的聚合摘要（不含运行时数据）。"""
        stages = ['raw', 'staging', 'formal', 'content', 'knowledge', 'meta']
        by_stage = {s: [] for s in stages}
        domain_types = ['external', 'staging', 'business', 'content', 'knowledge', 'meta']
        by_type = {t: [] for t in domain_types}
        for d in DOMAIN_REGISTRY.values():
            by_stage[d.lifecycle_stage].append(d.domain_id)
            by_type[d.domain_type].append(d.domain_id)
        return {
            'total_domains': len(DOMAIN_REGISTRY),
            'total_tables': sum(len(d.tables) for d in DOMAIN_REGISTRY.values()),
            'by_lifecycle': {
                s: {'domain_ids': ids, 'count': len(ids)}
                for s, ids in by_stage.items()
            },
            'by_domain_type': {
                t: {'domain_ids': ids, 'count': len(ids)}
                for t, ids in by_type.items()
            },
        }

    @classmethod
    def governance_requirements_for_table(cls, table_name: str) -> dict:
        """返回某表所在域的治理要求摘要。"""
        domain = cls.for_table(table_name)
        if not domain:
            return {}
        return {
            'domain_id': domain.domain_id,
            'domain_label': domain.label,
            'owner_role': domain.owner_role,
            'regulatory': domain.regulatory,
            'governance_focus': domain.governance_focus,
            'retention_expectation': domain.retention_expectation,
        }
