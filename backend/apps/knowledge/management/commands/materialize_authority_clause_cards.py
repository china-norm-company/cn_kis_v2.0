"""
将法规/标准正文切成条款级结构化知识卡。

目标：
- 把公开权威资料从“大段正文”提升为“父法规 + 子条款卡”
- 提高检索时的命中粒度、引用稳定性和专题密度
"""
import re
from typing import List, Tuple

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.knowledge.models import KnowledgeEntry


CHINESE_ARTICLE_RE = re.compile(r'(第[一二三四五六七八九十百千零〇两]+条)')
SECTION_RE = re.compile(r'^([一二三四五六七八九十]+、[^\n]{0,80})$', re.MULTILINE)
NUMERIC_RE = re.compile(r'^(\d+[\.、][^\n]{0,80})$', re.MULTILINE)
EN_ABSTRACT_HEADING_RE = re.compile(
    r'(?:(BACKGROUND|PURPOSE|BACKGROUND/PURPOSE|OBJECTIVE|OBJECTIVES|AIM|AIMS|METHODS|RESULTS|CONCLUSION|CONCLUSIONS):)',
    re.IGNORECASE,
)


class Command(BaseCommand):
    help = '把法规/标准/方法正文切成条款级知识卡'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0, help='最多处理多少个父条目')
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

        qs = KnowledgeEntry.objects.filter(
            is_deleted=False,
            is_published=True,
        ).filter(
            Q(
                namespace__in=[
                    'nmpa_regulation',
                    'regulations',
                    'methodology',
                    'instruments',
                    'ingredients',
                    'compliance',
                    'internal_sop',
                    'cosmetic_research',
                ],
                source_type__in=[
                    'regulation_tracker',
                    'nmpa_import',
                    'ich_import',
                    'gb_standard_import',
                    'manual_ingest',
                    'paper_scout',
                    'pubmed_import',
                    'sccs_import',
                    'sop_sync',
                    'internal',
                ],
            ) |
            Q(namespace='cnkis', source_type__in=['manual_ingest', 'paper_scout', 'pubmed_import', 'sccs_import'])
        ).order_by('id')
        if options['limit']:
            qs = qs[: options['limit']]

        created = 0
        skipped = 0
        errors = 0
        parent_count = 0

        for parent in qs:
            parent_count += 1
            segments = self._split_parent(parent.title, parent.content or '')
            self.stdout.write(f'处理父条目 #{parent.id} {parent.title[:50]} | 切出 {len(segments)} 段')
            for index, (heading, body) in enumerate(segments, start=1):
                raw = self._build_clause_card(parent, index, heading, body)
                state = self._ingest(parent, raw)
                created += int(state == 'created')
                skipped += int(state == 'skipped')
                errors += int(state == 'error')

        self.stdout.write(
            self.style.SUCCESS(
                f'权威条款卡落库完成: parents={parent_count} created={created} skipped={skipped} errors={errors}'
            )
        )

    def _split_parent(self, title: str, content: str) -> List[Tuple[str, str]]:
        text = (content or '').strip()
        if not text:
            return []

        article_segments = self._split_by_heading_regex(text, CHINESE_ARTICLE_RE)
        if len(article_segments) >= 2:
            return article_segments

        section_segments = self._split_by_line_heading(text, SECTION_RE)
        if len(section_segments) >= 2:
            return section_segments

        numeric_segments = self._split_by_line_heading(text, NUMERIC_RE)
        if len(numeric_segments) >= 2:
            return numeric_segments

        en_abstract_segments = self._split_by_inline_heading_regex(text, EN_ABSTRACT_HEADING_RE)
        if len(en_abstract_segments) >= 2:
            return en_abstract_segments

        sentence_chunks = [
            part.strip()
            for part in re.split(r'(?<=。)', text)
            if part.strip()
        ]
        if len(sentence_chunks) == 1:
            sentence_chunks = [
                part.strip()
                for part in re.split(r'(?<=\.)\s+', text)
                if part.strip()
            ]
        return [(f'{title}-片段{idx:02d}', body) for idx, body in enumerate(sentence_chunks, start=1)]

    def _split_by_heading_regex(self, text: str, regex: re.Pattern) -> List[Tuple[str, str]]:
        matches = list(regex.finditer(text))
        if not matches:
            return []
        segments: List[Tuple[str, str]] = []
        for idx, match in enumerate(matches):
            start = match.start()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            chunk = text[start:end].strip()
            heading = match.group(1).strip()
            body = chunk[len(heading):].strip('：: \n')
            if body:
                segments.append((heading, body))
        return segments

    def _split_by_line_heading(self, text: str, regex: re.Pattern) -> List[Tuple[str, str]]:
        matches = list(regex.finditer(text))
        if not matches:
            return []
        segments: List[Tuple[str, str]] = []
        for idx, match in enumerate(matches):
            start = match.start()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            chunk = text[start:end].strip()
            lines = [line.strip() for line in chunk.splitlines() if line.strip()]
            if not lines:
                continue
            heading = lines[0]
            body = '\n'.join(lines[1:]).strip()
            if body:
                segments.append((heading, body))
        return segments

    def _split_by_inline_heading_regex(self, text: str, regex: re.Pattern) -> List[Tuple[str, str]]:
        matches = list(regex.finditer(text))
        if not matches:
            return []
        segments: List[Tuple[str, str]] = []
        for idx, match in enumerate(matches):
            start = match.start()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            chunk = text[start:end].strip()
            heading = match.group(1).upper().strip()
            body = chunk[len(match.group(0)):].strip()
            if body:
                segments.append((heading, body))
        return segments

    def _build_clause_card(
        self,
        parent: KnowledgeEntry,
        index: int,
        heading: str,
        body: str,
    ) -> RawKnowledgeInput:
        inherited_tags = list(parent.tags or [])
        title = f'{parent.title} / {heading}'
        summary = f'{parent.title} 中关于“{heading}”的条款级知识卡。'
        content = (
            f'权威条款卡\n\n'
            f'父条目：{parent.title}\n'
            f'父条目ID：{parent.id}\n'
            f'条款标题：{heading}\n'
            f'来源类型：{parent.source_type}\n'
            f'命名空间：{parent.namespace}\n\n'
            f'条款正文：\n{body}\n'
        )
        return RawKnowledgeInput(
            title=title,
            content=content,
            summary=summary,
            entry_type=parent.entry_type,
            source_type='authority_clause_card',
            source_id=parent.id,
            source_key=f'clause:{parent.id}:{index:03d}',
            namespace=parent.namespace,
            tags=inherited_tags + ['权威条款卡', heading],
            uri=f'{parent.uri}#clause-{index}' if parent.uri else '',
            package_id=parent.topic_package.package_id if parent.topic_package else '',
            canonical_topic=parent.topic_package.canonical_topic if parent.topic_package else '',
            facet=parent.facet or '',
        )

    def _ingest(self, parent: KnowledgeEntry, raw: RawKnowledgeInput) -> str:
        existed_before = KnowledgeEntry.objects.filter(
            source_type=raw.source_type,
            source_id=raw.source_id,
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
                parent=parent,
            )

        if result and result.entry_id and not existed_before:
            self.stdout.write(self.style.SUCCESS(f'  ✓ [{result.entry_id}] {raw.title[:70]}'))
            return 'created'

        self.stdout.write(f'  - 跳过（已存在）: {raw.title[:70]}')
        return 'skipped'
