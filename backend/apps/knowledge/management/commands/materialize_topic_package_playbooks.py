"""
把 TopicPackage × facet 展开为可执行的专题作战卡。

每个专题包、每个 facet 生成多种卡片：
- 检查清单
- 证据要求
- 风险边界
- 升级规则
- 回答模板
- 审核问题
"""
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import TopicPackage, KnowledgeEntry


CARD_TYPES = [
    ('checklist', '检查清单', 'sop'),
    ('evidence', '证据要求', 'method_reference'),
    ('risk', '风险边界', 'sop'),
    ('escalation', '升级规则', 'sop'),
    ('template', '回答模板', 'proposal_template'),
    ('review', '审核问题', 'faq'),
]


class Command(BaseCommand):
    help = '把 TopicPackage × facet 展开为结构化专题作战卡'

    def add_arguments(self, parser):
        parser.add_argument(
            '--disable-llm-enrich',
            action='store_true',
            help='关闭 LLM 富化，走稳定规则管线',
        )

    def handle(self, *args, **options):
        if options.get('disable_llm_enrich'):
            import apps.knowledge.ingestion_pipeline as pipeline_module

            pipeline_module._LLM_ENRICH_ENABLED = False
            self.stdout.write('已关闭 LLM 富化，使用稳定规则管线落库。')

        created = 0
        skipped = 0
        errors = 0

        packages = TopicPackage.objects.filter(is_deleted=False).order_by('package_id')
        for package in packages:
            for facet in package.DEFAULT_FACETS:
                for card_type, card_label, entry_type in CARD_TYPES:
                    raw = self._build_card(package, facet, card_type, card_label, entry_type)
                    state = self._ingest(raw)
                    created += int(state == 'created')
                    skipped += int(state == 'skipped')
                    errors += int(state == 'error')

        self.stdout.write(
            self.style.SUCCESS(
                f'专题作战卡落库完成: created={created} skipped={skipped} errors={errors}'
            )
        )

    def _ingest(self, raw: RawKnowledgeInput) -> str:
        existed_before = KnowledgeEntry.objects.filter(
            source_type=raw.source_type,
            source_key=raw.source_key,
            is_deleted=False,
        ).exists()
        try:
            result = run_pipeline(raw)
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f'  ✗ 失败: {raw.title[:70]} | {exc}'))
            return 'error'

        if result and result.entry_id:
            KnowledgeEntry.objects.filter(id=result.entry_id).update(
                status='published',
                is_published=True,
            )

        if result and result.entry_id and not existed_before:
            self.stdout.write(self.style.SUCCESS(f'  ✓ [{result.entry_id}] {raw.title[:70]}'))
            return 'created'

        self.stdout.write(f'  - 跳过（已存在）: {raw.title[:70]}')
        return 'skipped'

    def _build_card(self, package: TopicPackage, facet: str, card_type: str, card_label: str, entry_type: str) -> RawKnowledgeInput:
        topic = package.canonical_topic
        required = '是' if package.required_for_release else '否'
        authority = package.source_authority_level

        content = (
            f'专题作战卡\n\n'
            f'专题包：{topic}\n'
            f'专题包ID：{package.package_id}\n'
            f'Facet：{facet}\n'
            f'卡片类型：{card_label}\n'
            f'上线关键专题：{required}\n'
            f'来源权威等级：{authority}\n\n'
            f'卡片目的：把“{topic}”专题中的“{facet}”维度沉淀为标准化可执行资产，'
            f'确保数字员工在检索、回答、审核、升级和交付时有一致依据。\n\n'
            f'标准结构：\n'
            f'1. 该 facet 在本专题中的核心定义与适用边界\n'
            f'2. 应优先引用的法规 / 方法 / SOP / 模板 / FAQ 类型证据\n'
            f'3. 常见误区、风险点和越界情形\n'
            f'4. 需要转人工、升级或审批的节点\n'
            f'5. 输出给客户、受试者或内部团队时的推荐表达方式\n'
        )
        return RawKnowledgeInput(
            title=f'{topic} / {facet} / {card_label}',
            content=content,
            summary=f'{topic} 专题下 {facet} 维度的 {card_label}。',
            entry_type=entry_type,
            source_type='topic_package_playbook',
            source_key=f'pkgplay:{package.package_id}:{facet}:{card_type}',
            namespace='cnkis',
            tags=['专题作战卡', package.package_id, facet, card_type],
            package_id=package.package_id,
            canonical_topic=package.canonical_topic,
            facet=facet,
        )
