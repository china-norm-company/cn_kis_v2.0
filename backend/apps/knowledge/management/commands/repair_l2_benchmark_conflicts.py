"""
修复会干扰 L2 快评测的冲突知识项。

当前聚焦两类问题：
1. 保湿宣称被误导为“必须提交人体功效评价报告”
2. ICH E6(R2) 知情同意签署时机缺少与问题同句式的高命中条目
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


MISLEADING_TITLES = [
    '化妆品功效宣称评价规范（2021）：人体功效评价报告要求',
    '化妆品功效宣称评价规范（2021）：人体功效评价报告要求 / 一、须提交人体功效评价报告的功效类别',
    '化妆品功效宣称评价规范（2021）：人体功效评价报告要求 / 二、保湿宣称的特殊规定',
    '化妆品功效宣称评价规范（2021）：人体功效评价报告要求 / 三、人体功效评价报告质量要求',
]

ALIAS_ENTRIES = [
    RawKnowledgeInput(
        title='保湿宣称是否需要人体功效评价报告？',
        content=(
            '结论：不强制要求。保湿属于普通化妆品常见功效，法规要求是具有充分科学依据，'
            '但证据路径可以是文献资料、消费者使用测试或人体功效评价资料，并非强制必须提交人体功效评价报告。'
            '若企业使用“临床证明”“X周见效”等量化强表述，通常应提供更强的人体证据支持，但这不等于把普通保湿宣称一概升级为强制人体功效评价报告。'
        ),
        summary='对“保湿宣称是否需要人体功效评价报告”给出直接否定结论，并区分“充分科学依据”与“强制人体评价报告”两种口径。',
        entry_type='faq',
        source_type='manual_ingest',
        source_key='l2-conflict-fix:moisturizing-claim-exact:001',
        namespace='regulations',
        tags=['保湿宣称', '人体功效评价', '直接问答修复'],
        package_id='efficacy_claims',
        canonical_topic='功效宣称',
        facet='faq_misconceptions',
    ),
    RawKnowledgeInput(
        title='ICH E6(R2) GCP 对知情同意书签署时机有何规定？',
        content=(
            'ICH E6(R2) 4.8 的核心要求是：在进行任何试验相关操作之前，必须先完成知情同意说明并由受试者本人签署、注明日期。'
            '这里的“任何试验相关操作”包括筛查检查、随机分组、采样、研究相关测量、限制既往用药或护肤品使用等。'
            '因此，正确口径不是“R2 未明确”，而是“R2 明确要求在任何试验相关操作开始前取得知情同意”。'
        ),
        summary='直接命中 ICH E6(R2) GCP 关于知情同意签署时机的问题句式，避免回答漂移到 R3。',
        entry_type='regulation',
        source_type='manual_ingest',
        source_key='l2-conflict-fix:ich-e6r2-exact:001',
        namespace='compliance',
        tags=['ICH E6(R2)', 'GCP', '知情同意', '签署时机'],
        package_id='informed_consent',
        canonical_topic='知情同意',
        facet='regulation_boundary',
    ),
]


class Command(BaseCommand):
    help = '修复 L2 快评测中的冲突知识项'

    def handle(self, *args, **options):
        affected = KnowledgeEntry.objects.filter(is_deleted=False).filter(
            title__in=MISLEADING_TITLES
        ) | KnowledgeEntry.objects.filter(
            is_deleted=False,
            source_id=11962,
        ) | KnowledgeEntry.objects.filter(
            is_deleted=False,
            parent_id=11962,
        )
        deleted_count = affected.update(
            is_deleted=True,
            is_published=False,
            update_time=timezone.now(),
        )
        self.stdout.write(self.style.WARNING(f'已下线误导条目: {deleted_count}'))

        created = 0
        updated = 0
        for raw in ALIAS_ENTRIES:
            existed = KnowledgeEntry.objects.filter(
                source_type=raw.source_type,
                source_key=raw.source_key,
                is_deleted=False,
            ).exists()
            result = run_pipeline(raw)
            if result and result.entry_id:
                KnowledgeEntry.objects.filter(id=result.entry_id).update(
                    status='published',
                    is_published=True,
                )
            if existed:
                updated += 1
                self.stdout.write(f'[UPDATE] {raw.title}')
            else:
                created += 1
                self.stdout.write(self.style.SUCCESS(f'[CREATE] {raw.title}'))

        self.stdout.write(self.style.SUCCESS(
            f'L2 冲突修复完成：deleted={deleted_count}, created={created}, updated={updated}'
        ))
