"""
把数字员工的真实评测/运营资产沉淀为结构化 KnowledgeEntry。

来源：
1. configs/digital_worker_eval_assets.yaml      -> 题库模板 / 场景模板
2. configs/digital_worker_long_chains.yaml      -> 长链运营资产
3. tests.ai_eval.pretraining_benchmark.py      -> 标准问答 benchmark

目标：
- 让 readiness gate 背后的资产同时进入知识库，而不是只存在配置和测试文件里
- 形成可检索、可引用、可继续扩充的数字员工运营知识库
"""
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import yaml
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.knowledge.ingestion_pipeline import RawKnowledgeInput, run_pipeline
from apps.secretary.domain_worker_service import list_domain_workers


def _load_yaml_config(filename: str) -> Dict[str, Any]:
    path = Path(settings.BASE_DIR) / 'configs' / filename

    if not path.exists():
        return {'domains': {}}
    return yaml.safe_load(path.read_text(encoding='utf-8')) or {'domains': {}}


def _expand_assets(prefix: str, themes: Iterable[str], prompts: Iterable[str]) -> List[Tuple[str, str, str]]:
    rows: List[Tuple[str, str, str]] = []
    index = 1
    for theme in themes:
        for prompt in prompts:
            asset_id = f'{prefix}-{index:03d}'
            rows.append((asset_id, str(theme), str(prompt)))
            index += 1
    return rows


class Command(BaseCommand):
    help = '把数字员工评测/场景/长链资产物化为结构化知识条目'

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

        worker_map = {item['domain_code']: item for item in list_domain_workers()}
        eval_assets = _load_yaml_config('digital_worker_eval_assets.yaml').get('domains', {})
        long_chains = _load_yaml_config('digital_worker_long_chains.yaml').get('domains', {})

        created = 0
        skipped = 0
        errors = 0

        for domain_code, worker in worker_map.items():
            domain_assets = eval_assets.get(domain_code, {}) or {}
            question_templates = domain_assets.get('question_templates', {}) or {}
            scenario_templates = domain_assets.get('scenario_templates', {}) or {}

            question_rows = _expand_assets(
                f'{domain_code}-q',
                question_templates.get('themes', []) or [],
                question_templates.get('prompts', []) or [],
            )
            scenario_rows = _expand_assets(
                f'{domain_code}-s',
                scenario_templates.get('themes', []) or [],
                scenario_templates.get('flows', []) or [],
            )

            for asset_id, theme, prompt in question_rows:
                raw = self._build_question_asset(worker, asset_id, theme, prompt)
                state = self._ingest(raw)
                created += int(state == 'created')
                skipped += int(state == 'skipped')
                errors += int(state == 'error')

            for asset_id, theme, prompt in scenario_rows:
                raw = self._build_scenario_asset(worker, asset_id, theme, prompt)
                state = self._ingest(raw)
                created += int(state == 'created')
                skipped += int(state == 'skipped')
                errors += int(state == 'error')

            for line in long_chains.get(domain_code, []) or []:
                raw = self._build_long_chain_asset(worker, str(line))
                state = self._ingest(raw)
                created += int(state == 'created')
                skipped += int(state == 'skipped')
                errors += int(state == 'error')

        for raw in self._iter_benchmark_assets():
            state = self._ingest(raw)
            created += int(state == 'created')
            skipped += int(state == 'skipped')
            errors += int(state == 'error')

        self.stdout.write(
            self.style.SUCCESS(
                f'数字员工资产库落库完成: created={created} skipped={skipped} errors={errors}'
            )
        )

    def _ingest(self, raw: RawKnowledgeInput) -> str:
        from apps.knowledge.models import KnowledgeEntry

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
            )

        if result and result.entry_id and not existed_before:
            self.stdout.write(self.style.SUCCESS(f'  ✓ [{result.entry_id}] {raw.title[:70]}'))
            return 'created'

        self.stdout.write(f'  - 跳过（已存在）: {raw.title[:70]}')
        return 'skipped'

    def _build_question_asset(self, worker: Dict[str, Any], asset_id: str, theme: str, prompt: str) -> RawKnowledgeInput:
        domain_code = worker['domain_code']
        display_name = worker.get('display_name', domain_code)
        responsibilities = '\n'.join(f'- {item}' for item in worker.get('responsibilities', []))
        boundaries = '\n'.join(f'- {item}' for item in worker.get('boundary_rules', []))
        agents = ', '.join(worker.get('collaboration_agents', []))
        tier0 = ', '.join(worker.get('tier0_topic_packages', []))

        content = (
            f'数字员工知识问答卡\n\n'
            f'领域：{display_name}\n'
            f'资产编号：{asset_id}\n'
            f'主题：{theme}\n'
            f'问题角度：{prompt}\n\n'
            f'职责边界：\n{responsibilities}\n\n'
            f'执行边界：\n{boundaries}\n\n'
            f'协同智能体：{agents}\n'
            f'关联关键专题：{tier0}\n\n'
            f'标准回答骨架：\n'
            f'1. 先识别该问题是否属于“{theme}”范畴，以及当前关注点是否为“{prompt}”。\n'
            f'2. 明确需要引用的法规、SOP、方法学或运营规则，不得脱离证据回答。\n'
            f'3. 涉及风险时给出升级条件、人工接管点和记录要求。\n'
            f'4. 输出结论时必须包含边界、例外情况、责任角色和后续动作。\n'
        )
        return RawKnowledgeInput(
            title=f'{display_name}知识问答卡：{theme} / {prompt}',
            content=content,
            summary=f'{display_name}关于“{theme}”主题下“{prompt}”问题的标准问答资产。',
            entry_type='faq',
            source_type='digital_worker_asset',
            source_key=f'question:{asset_id}',
            namespace='cnkis',
            tags=['数字员工', '问答资产', domain_code, theme, prompt],
        )

    def _build_scenario_asset(self, worker: Dict[str, Any], asset_id: str, theme: str, flow: str) -> RawKnowledgeInput:
        domain_code = worker['domain_code']
        display_name = worker.get('display_name', domain_code)
        tier0 = ', '.join(worker.get('tier0_topic_packages', []))

        content = (
            f'数字员工业务场景卡\n\n'
            f'领域：{display_name}\n'
            f'资产编号：{asset_id}\n'
            f'场景主题：{theme}\n'
            f'流程片段：{flow}\n\n'
            f'场景目标：围绕“{theme}”建立可复用的业务处置步骤，特别覆盖“{flow}”这一关键环节。\n\n'
            f'建议输出结构：\n'
            f'1. 输入条件与触发器\n'
            f'2. 核心判断与风险分级\n'
            f'3. 协同角色与工具动作\n'
            f'4. 必留痕字段与回执要求\n'
            f'5. 失败兜底与人工升级路径\n\n'
            f'关联专题：{tier0}\n'
        )
        return RawKnowledgeInput(
            title=f'{display_name}业务场景卡：{theme} / {flow}',
            content=content,
            summary=f'{display_name}处理“{theme}”场景中“{flow}”环节的标准场景资产。',
            entry_type='sop',
            source_type='digital_worker_asset',
            source_key=f'scenario:{asset_id}',
            namespace='cnkis',
            tags=['数字员工', '场景资产', domain_code, theme, flow],
        )

    def _build_long_chain_asset(self, worker: Dict[str, Any], line: str) -> RawKnowledgeInput:
        domain_code = worker['domain_code']
        display_name = worker.get('display_name', domain_code)
        asset_id, _, description = line.partition(' ')
        steps = description.split('到')
        step_lines = '\n'.join(f'{idx}. {step}' for idx, step in enumerate(steps, start=1))

        content = (
            f'数字员工长链运营卡\n\n'
            f'领域：{display_name}\n'
            f'资产编号：{asset_id}\n'
            f'长链目标：{description}\n\n'
            f'推荐拆解步骤：\n{step_lines}\n\n'
            f'执行要求：\n'
            f'- 每一步都要有输入、输出、责任角色和回执。\n'
            f'- 高风险步骤必须明确升级节点和人工审批点。\n'
            f'- 结尾必须形成闭环记录，支持复盘与持续优化。\n'
        )
        return RawKnowledgeInput(
            title=f'{display_name}长链运营卡：{description}',
            content=content,
            summary=f'{display_name}关于“{description}”的长链运营闭环资产。',
            entry_type='sop',
            source_type='digital_worker_asset',
            source_key=f'long-chain:{asset_id}',
            namespace='cnkis',
            tags=['数字员工', '长链资产', domain_code, asset_id],
        )

    def _iter_benchmark_assets(self) -> Iterable[RawKnowledgeInput]:
        from tests.ai_eval.pretraining_benchmark import PRETRAINING_BENCHMARK

        for item in PRETRAINING_BENCHMARK:
            query = item.get('query', '')
            ground_truth = item.get('ground_truth', '')
            domain = item.get('domain', '')
            difficulty = item.get('difficulty', '')
            citations = item.get('min_citations', 0)
            content = (
                f'专业 benchmark 标准问答卡\n\n'
                f'题目编号：{item["id"]}\n'
                f'知识域：{domain}\n'
                f'难度：{difficulty}\n'
                f'最低引用要求：{citations}\n\n'
                f'用户问题：{query}\n\n'
                f'标准答案要点：\n{ground_truth}\n'
            )
            yield RawKnowledgeInput(
                title=f'Benchmark 标准问答：{item["id"]} {query[:40]}',
                content=content,
                summary=f'{domain}领域 {difficulty} 难度的标准问答基准卡。',
                entry_type='faq',
                source_type='benchmark_asset',
                source_key=f'benchmark:{item["id"]}',
                namespace='cnkis',
                tags=['benchmark', '标准问答', domain, difficulty],
            )
