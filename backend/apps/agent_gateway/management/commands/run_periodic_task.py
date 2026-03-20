"""
管理命令：运行定时任务

用法:
  python manage.py run_periodic_task daily_health          每日健康摘要
  python manage.py run_periodic_task weekly_insights       每周客户洞察
  python manage.py run_periodic_task daily_knowledge       每日知识采集（Agent 驱动）
  python manage.py run_periodic_task weekly_experience     每周项目经验归档
  python manage.py run_periodic_task monthly_standards     每月标准更新
  python manage.py run_periodic_task daily_dropout         每日脱落风险扫描
  python manage.py run_periodic_task weekly_capa           每周 CAPA 趋势分析
  python manage.py run_periodic_task weekly_kb_health      每周知识库健康检查
  python manage.py run_periodic_task weekly_market_intel   每周市场情报采集
  python manage.py run_periodic_task monthly_consumer      每月消费者洞察

可配合 crontab 调度:
  0 6 * * * cd /app && python manage.py run_periodic_task daily_knowledge
  0 9 * * * cd /app && python manage.py run_periodic_task daily_health
  0 9 * * 1 cd /app && python manage.py run_periodic_task weekly_insights
  0 7 * * 2 cd /app && python manage.py run_periodic_task weekly_market_intel
  0 9 15 * * cd /app && python manage.py run_periodic_task monthly_consumer
"""
from django.core.management.base import BaseCommand


TASK_REGISTRY = {
    'daily_health': ('run_daily_health_summary', '每日健康摘要'),
    'weekly_insights': ('run_weekly_insights', '每周客户洞察'),
    'daily_knowledge': ('run_daily_knowledge_ingestion', '每日知识采集'),
    'weekly_experience': ('run_weekly_experience_archive', '每周项目经验归档'),
    'monthly_standards': ('run_monthly_standards_update', '每月标准更新'),
    'daily_dropout': ('run_daily_dropout_risk_scan', '每日脱落风险扫描'),
    'weekly_capa': ('run_weekly_capa_trend_analysis', '每周 CAPA 趋势分析'),
    'weekly_kb_health': ('run_weekly_knowledge_health_check', '每周知识库健康检查'),
    'weekly_market_intel': ('run_weekly_market_intelligence', '每周市场情报采集'),
    'monthly_consumer': ('run_monthly_consumer_insight', '每月消费者洞察'),
}


class Command(BaseCommand):
    help = '运行 Agent 定时任务'

    def add_arguments(self, parser):
        parser.add_argument(
            'task_name',
            type=str,
            choices=list(TASK_REGISTRY.keys()),
            help='任务名称',
        )

    def handle(self, *args, **options):
        task_name = options['task_name']
        func_name, label = TASK_REGISTRY[task_name]

        import importlib
        mod = importlib.import_module('apps.agent_gateway.periodic_tasks')
        func = getattr(mod, func_name)
        result = func()
        self.stdout.write(self.style.SUCCESS(f'{label}已完成: {result}'))
