import json

from django.core.management.base import BaseCommand

from libs.mcp_client import check_mcp_health


class Command(BaseCommand):
    help = '检查已配置 MCP 服务的健康状态与降级路径'

    def add_arguments(self, parser):
        parser.add_argument(
            '--json',
            action='store_true',
            help='输出 JSON 结果，便于监控系统采集',
        )

    def handle(self, *args, **options):
        results = check_mcp_health()
        if options.get('json'):
            self.stdout.write(json.dumps(results, ensure_ascii=False, indent=2))
            return

        self.stdout.write(self.style.SUCCESS('MCP 健康检查'))
        self.stdout.write('=' * 60)
        for server_name, result in results.items():
            status = result.get('status', 'unknown')
            latency_ms = result.get('latency_ms', 0)
            detail = result.get('detail', '')
            fallback = result.get('fallback', '')
            next_action = ''

            if server_name == 'qdrant' and status != 'ok':
                next_action = '请启动/恢复 Qdrant 服务，或确认 QDRANT_URL 指向可访问实例'
            elif server_name == 'reranker' and status != 'ok':
                next_action = '请检查 RERANK_API_KEY / 配额 / 供应商权限'
            elif server_name == 'tavily' and status != 'ok':
                next_action = '请配置 TAVILY_API_KEY，并在恢复后做一次真实搜索验证'
            elif server_name == 'firecrawl' and status != 'ok':
                next_action = '请配置 FIRECRAWL_API_KEY，并在恢复后做一次真实网页提取验证'
            elif server_name == 'graphiti' and status != 'ok':
                next_action = '如需启用 Graphiti，请补齐 GRAPHITI_URL / GRAPHITI_API_KEY 并联调服务'

            if status == 'ok':
                style = self.style.SUCCESS
            elif status == 'skipped':
                style = self.style.WARNING
            else:
                style = self.style.ERROR

            line = f'[{server_name}] {status} | {latency_ms}ms | {detail}'
            if fallback:
                line += f' | fallback={fallback}'
            if next_action:
                line += f' | next={next_action}'
            self.stdout.write(style(line))
