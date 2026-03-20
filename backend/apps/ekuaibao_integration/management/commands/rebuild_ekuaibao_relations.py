"""
rebuild_ekuaibao_relations — 易快报业务关系完整重建命令

用法：
  # 全量重建（所有步骤）
  python manage.py rebuild_ekuaibao_relations

  # 只重建指定步骤
  python manage.py rebuild_ekuaibao_relations --step 1
  python manage.py rebuild_ekuaibao_relations --step 3
  python manage.py rebuild_ekuaibao_relations --steps 1,2,3

  # 查看各步骤说明
  python manage.py rebuild_ekuaibao_relations --list-steps
"""
import logging

from django.core.management.base import BaseCommand

logger = logging.getLogger('cn_kis.ekuaibao.rebuild_cmd')

STEP_DESCRIPTIONS = {
    1: '677 staffs → Account + Staff + 角色推导（从审批流反向推导）',
    2: '114 departments → 部门层级树 KnowledgeEntity + Staff.department 更新',
    3: '审批流模板 KnowledgeEntity + 每条单据实际审批轨迹 → approval_chain',
    4: '报销→预算关联（expenseLink）+ cost_department + expense_template + client_name',
    5: '知识图谱实体和关系入库（KnowledgeEntity/KnowledgeRelation）',
    6: '业务上下文向量化入 KnowledgeEntry（触发 ingestion_pipeline）',
}


class Command(BaseCommand):
    help = '易快报业务关系完整重建（从组织架构→人员→审批流→知识图谱）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--step', type=int, metavar='N',
            help='只执行指定步骤（1-6）',
        )
        parser.add_argument(
            '--steps', type=str, metavar='1,2,3',
            help='执行指定的多个步骤，逗号分隔',
        )
        parser.add_argument(
            '--list-steps', action='store_true', dest='list_steps',
            help='列出所有步骤说明',
        )
        parser.add_argument(
            '--batch-phase1', type=str, default='20260318_133425',
            help='Phase 1 基础主数据批次号（默认 20260318_133425）',
        )
        parser.add_argument(
            '--batch-phase2', type=str, default='20260318_144803',
            help='Phase 2 交易数据批次号（默认 20260318_144803）',
        )

    def handle(self, *args, **options):
        if options['list_steps']:
            self.stdout.write('=== 重建步骤说明 ===')
            for step_no, desc in STEP_DESCRIPTIONS.items():
                self.stdout.write(f'  Step {step_no}: {desc}')
            return

        batch1 = options['batch_phase1']
        batch2 = options['batch_phase2']

        # 确定要执行的步骤
        if options.get('step'):
            steps = [options['step']]
        elif options.get('steps'):
            steps = [int(s.strip()) for s in options['steps'].split(',') if s.strip()]
        else:
            steps = list(STEP_DESCRIPTIONS.keys())

        self.stdout.write(f'将执行步骤: {steps}')
        self.stdout.write(f'Phase1 批次: {batch1}  Phase2 批次: {batch2}')

        from apps.ekuaibao_integration.ekb_entity_builder import (
            build_staff_accounts, build_department_tree, build_approval_chains,
            build_expense_budget_links, build_knowledge_graph, build_knowledge_entries,
        )

        step_runners = {
            1: lambda: build_staff_accounts(batch2),
            2: lambda: build_department_tree(batch1),
            3: lambda: build_approval_chains(batch2),
            4: lambda: build_expense_budget_links(batch2),
            5: lambda: build_knowledge_graph(),
            6: lambda: build_knowledge_entries(),
        }

        total_stats = {}
        for step_no in steps:
            if step_no not in step_runners:
                self.stdout.write(self.style.WARNING(f'  未知步骤 {step_no}，跳过'))
                continue
            desc = STEP_DESCRIPTIONS[step_no]
            self.stdout.write(f'\n[Step {step_no}] {desc}...')
            try:
                result = step_runners[step_no]()
                total_stats[f'step{step_no}'] = result
                self.stdout.write(self.style.SUCCESS(f'  完成: {result}'))
            except Exception as ex:
                logger.error('Step %d 失败: %s', step_no, ex, exc_info=True)
                self.stdout.write(self.style.ERROR(f'  失败: {ex}'))

        self.stdout.write(self.style.SUCCESS('\n=== 重建完成 ==='))
        for k, v in total_stats.items():
            self.stdout.write(f'  {k}: {v}')
