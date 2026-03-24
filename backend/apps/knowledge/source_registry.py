"""
知识源注册表（Knowledge Source Registry）

维护外部/内部知识来源的配置，支持定时采集调度。
每个来源对应一个采集策略，生成 KnowledgeEntry 入库。

预置来源：
  - nmpa-cosm-regs：NMPA 化妆品法规公告（每日）
  - ich-guidelines：ICH 指南更新（每月）
  - pubmed-cosm-efficacy：PubMed 功效评价论文（每周）
  - cnkis-feishu-docs：飞书知识库文档（每日）
  - instrument-manuals：仪器厂商技术文档（手动触发）
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Optional


SourceType = Literal['rss', 'pdf', 'api', 'feishu_api', 'manual', 'n8n']
EntryType = Literal[
    'regulation', 'sop', 'method_reference', 'instrument_spec',
    'paper_abstract', 'faq', 'lesson_learned', 'competitor_intel',
]


@dataclass
class KnowledgeSource:
    """单个知识来源的配置。"""
    source_id: str
    name: str
    source_type: SourceType
    entry_type: EntryType
    namespace: str
    description: str = ''
    url: str = ''
    fetch_schedule: str = ''       # crontab 表达式，如 '0 8 * * *'
    owner_role: str = 'data_manager'
    quality_threshold: float = 0.5  # 低于此分数不入库
    is_active: bool = True
    tags: list[str] = field(default_factory=list)
    last_fetched_at: Optional[datetime] = None
    last_entry_count: int = 0

    def to_dict(self) -> dict:
        return {
            'source_id': self.source_id,
            'name': self.name,
            'source_type': self.source_type,
            'entry_type': self.entry_type,
            'namespace': self.namespace,
            'description': self.description,
            'url': self.url,
            'fetch_schedule': self.fetch_schedule,
            'owner_role': self.owner_role,
            'quality_threshold': self.quality_threshold,
            'is_active': self.is_active,
            'tags': self.tags,
            'last_fetched_at': self.last_fetched_at.isoformat() if self.last_fetched_at else None,
            'last_entry_count': self.last_entry_count,
        }


class KnowledgeSourceRegistry:
    """
    知识源注册表：维护所有知识来源的配置。

    使用方式：
        from apps.knowledge.source_registry import KnowledgeSourceRegistry
        sources = KnowledgeSourceRegistry.list_active()
        source = KnowledgeSourceRegistry.get('nmpa-cosm-regs')
    """

    _sources: dict[str, KnowledgeSource] = {}

    @classmethod
    def register(cls, source: KnowledgeSource) -> None:
        cls._sources[source.source_id] = source

    @classmethod
    def get(cls, source_id: str) -> Optional[KnowledgeSource]:
        return cls._sources.get(source_id)

    @classmethod
    def list_all(cls) -> list[KnowledgeSource]:
        return list(cls._sources.values())

    @classmethod
    def list_active(cls) -> list[KnowledgeSource]:
        return [s for s in cls._sources.values() if s.is_active]

    @classmethod
    def list_by_type(cls, source_type: SourceType) -> list[KnowledgeSource]:
        return [s for s in cls._sources.values() if s.source_type == source_type]


# ────────────────────────────────────────────────────────────────────────────
# 预置知识来源（对接 V1.0 已有采集逻辑）
# ────────────────────────────────────────────────────────────────────────────

KnowledgeSourceRegistry.register(KnowledgeSource(
    source_id='nmpa-cosm-regs',
    name='NMPA 化妆品法规公告',
    source_type='api',
    entry_type='regulation',
    namespace='nmpa_regulation',
    description='国家药品监督管理局化妆品公告，含法规文本、标准更新、批准名单等',
    url='https://www.nmpa.gov.cn/xxgk/ggtg/hzhpggtg/index.html',
    fetch_schedule='0 8 * * *',   # 每日 08:00
    owner_role='data_manager',
    quality_threshold=0.6,
    tags=['NMPA', '法规', '化妆品'],
))

KnowledgeSourceRegistry.register(KnowledgeSource(
    source_id='ich-guidelines',
    name='ICH 指南更新',
    source_type='api',
    entry_type='regulation',
    namespace='ich_regulation',
    description='ICH 临床研究国际协调指南（E系列：E1-E17、Q系列等），含修订版本追踪',
    url='https://www.ich.org/page/efficacy-guidelines',
    fetch_schedule='0 9 1 * *',   # 每月 1 日 09:00
    owner_role='data_manager',
    quality_threshold=0.8,
    tags=['ICH', '国际指南', 'GCP'],
))

KnowledgeSourceRegistry.register(KnowledgeSource(
    source_id='pubmed-cosm-efficacy',
    name='PubMed 功效评价论文',
    source_type='api',
    entry_type='paper_abstract',
    namespace='cnkis',
    description='PubMed 化妆品功效评价相关论文摘要，关键词：cosmetic efficacy, skin hydration, '
                'wrinkle measurement, EEMCO, clinical evaluation',
    url='https://pubmed.ncbi.nlm.nih.gov/',
    fetch_schedule='0 7 * * 0',   # 每周日 07:00
    owner_role='data_manager',
    quality_threshold=0.5,
    tags=['PubMed', '学术论文', '功效评价'],
))

KnowledgeSourceRegistry.register(KnowledgeSource(
    source_id='cnkis-feishu-docs',
    name='飞书知识库文档',
    source_type='feishu_api',
    entry_type='sop',
    namespace='internal_sop',
    description='飞书知识库中的内部 SOP、会议纪要、经验总结等文档',
    url='',  # 通过 feishu_doc_knowledge_extractor 采集
    fetch_schedule='0 6 * * *',   # 每日 06:00
    owner_role='data_manager',
    quality_threshold=0.4,
    tags=['飞书', '内部文档', 'SOP'],
))

KnowledgeSourceRegistry.register(KnowledgeSource(
    source_id='instrument-manuals',
    name='仪器厂商技术文档',
    source_type='pdf',
    entry_type='instrument_spec',
    namespace='cnkis',
    description='Courage+Khazaka、Delfin Technologies、Canfield 等厂商的仪器操作手册和技术规格',
    url='',  # 手动上传 PDF
    fetch_schedule='',  # 手动触发
    owner_role='data_manager',
    quality_threshold=0.7,
    tags=['仪器', '操作手册', 'EEMCO'],
))

KnowledgeSourceRegistry.register(KnowledgeSource(
    source_id='data-collection-l2-constructs',
    name='研究构念库（L2）',
    source_type='manual',
    entry_type='method_reference',
    namespace='cnkis',
    description='六大研究方向的核心研究构念：功效测试、感官评估、多模态情绪、消费者行为、HUT、真实世界研究',
    url='',  # 来源：cn_study_kis/Data_Collection/docs/L2_research_construct_library.md
    fetch_schedule='',  # 版本更新时手动触发
    owner_role='data_manager',
    quality_threshold=0.8,
    tags=['研究构念', 'L2', '功效评价', '方法论'],
))

KnowledgeSourceRegistry.register(KnowledgeSource(
    source_id='data-collection-l5-instruments',
    name='仪器设备库（L5）',
    source_type='manual',
    entry_type='instrument_spec',
    namespace='cnkis',
    description='公司持有的专业测量仪器详细规格：Corneometer、Tewameter、Cutometer 等 EEMCO 推荐仪器',
    url='',  # 来源：cn_study_kis/Data_Collection/docs/L5_instrument_library.md
    fetch_schedule='',
    owner_role='data_manager',
    quality_threshold=0.9,
    tags=['仪器规格', 'L5', 'EEMCO', '测量仪器'],
))

KnowledgeSourceRegistry.register(KnowledgeSource(
    source_id='ibkd-research-ontology',
    name='IBKD 研究知识本体',
    source_type='manual',
    entry_type='method_reference',
    namespace='cnkis',
    description='IBKD 项目沉淀的研究知识本体：六大研究能力全景、消费者洞察→科学验证知识链路',
    url='',  # 来源：cn_study_kis/IBKD/docs/RESEARCH_KNOWLEDGE_ONTOLOGY.md
    fetch_schedule='',
    owner_role='data_manager',
    quality_threshold=0.8,
    tags=['知识本体', 'IBKD', '研究能力', '消费者洞察'],
))
