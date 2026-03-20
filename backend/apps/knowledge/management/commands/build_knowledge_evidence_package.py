from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand


def _workspace_root() -> Path:
    return Path(__file__).resolve().parents[5]


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _latest_stability_report() -> str:
    report_dir = _backend_root() / 'logs' / 'knowledge_stability'
    matches = sorted(report_dir.glob('knowledge_stability_report_*.md'))
    return str(matches[-1].relative_to(_workspace_root())) if matches else '待生成'


class Command(BaseCommand):
    help = '构建知识系统证据包索引（KR-6-3）'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, default='', help='证据包日期，默认今天')
        parser.add_argument('--collection-evidence', type=str, default='待补充：飞书群聊/文档/会议/审批真实采集证据')
        parser.add_argument('--retrieval-report', type=str, default='待补充：检索评测报告 / benchmark 输出')
        parser.add_argument('--acceptance-record', type=str, default='待补充：业务验收记录 / 回归结论')
        parser.add_argument('--stability-report', type=str, default='', help='稳定性报告路径，默认取最新一份')
        parser.add_argument('--rollback-plan', type=str, default='docs/KNOWLEDGE_ROLLBACK_SOP.md')
        parser.add_argument('--output', type=str, default='', help='输出 Markdown 路径')

    def handle(self, *args, **options):
        workspace_root = _workspace_root()
        package_date = options['date'] or datetime.now().strftime('%Y-%m-%d')
        stability_report = options['stability_report'] or _latest_stability_report()
        output_path = options['output'] or f'docs/KNOWLEDGE_ACCEPTANCE_EVIDENCE_PACKAGE_{package_date}.md'

        body = f"""# Knowledge Acceptance Evidence Package ({package_date})

## 1. Package Scope

- Date: `{package_date}`
- Collection evidence: `{options['collection_evidence']}`
- Retrieval report: `{options['retrieval_report']}`
- Acceptance record: `{options['acceptance_record']}`
- Stability report: `{stability_report}`
- Rollback plan: `{options['rollback_plan']}`

## 2. Evidence Index

| Category | Asset | Status | Notes |
|----------|-------|--------|-------|
| Collection evidence | `{options['collection_evidence']}` | Pending/Ready | 飞书群聊、文档、会议、审批等真实采集证据 |
| Retrieval report | `{options['retrieval_report']}` | Pending/Ready | Recall@K / MRR / NDCG / 关键 query 对照 |
| Acceptance record | `{options['acceptance_record']}` | Pending/Ready | 业务验收、回归结论、失败项处置 |
| Stability report | `{stability_report}` | Ready if exists | 来自 `generate_knowledge_stability_report` |
| Rollback plan | `{options['rollback_plan']}` | Ready | 禁用采集、恢复快照、向量补偿、恢复验证 |

## 3. Required Evidence Checklist

- [ ] 采集证据：至少覆盖群聊、会议纪要、审批、飞书文档 4 类真实数据源
- [ ] 检索报告：包含多通道检索结果与关键 query 命中情况
- [ ] 验收记录：注明通过/失败项、责任人、复测时间
- [ ] 稳定性报告：覆盖连续 14 天窗口内任务成功率/失败率/重试率
- [ ] 回滚方案：可执行、可验证、包含恢复后校验步骤

## 4. Scenario Acceptance Matrix

| Scenario | Owner | Acceptance record | Evidence status | Notes |
|----------|-------|-------------------|-----------------|-------|
| A 群聊知识沉淀 | 研究台负责人 / 项目经理 | 待补充 | Pending | 参考 `docs/KNOWLEDGE_ACCEPTANCE_STANDARD.md` 场景 A |
| B 会议纪要提炼 | 质量台负责人 / 项目经理 | 待补充 | Pending | 参考 `docs/KNOWLEDGE_ACCEPTANCE_STANDARD.md` 场景 B |
| C 审批流知识提取 | 质量台负责人 | 待补充 | Pending | 参考 `docs/KNOWLEDGE_ACCEPTANCE_STANDARD.md` 场景 C |
| D 法规变更追踪 | 法规专员 / 质量经理 | 待补充 | Pending | 参考 `docs/KNOWLEDGE_ACCEPTANCE_STANDARD.md` 场景 D |
| E 竞品情报采集 | 销售总监 / CRO 管理层 | 待补充 | Pending | 参考 `docs/KNOWLEDGE_ACCEPTANCE_STANDARD.md` 场景 E |
| F 论文自动检索 | 研究主管 / 资深研究员 | 待补充 | Pending | 参考 `docs/KNOWLEDGE_ACCEPTANCE_STANDARD.md` 场景 F |
| G 仪器知识结构化 | 设备负责人 / 评估台负责人 | 待补充 | Pending | 参考 `docs/KNOWLEDGE_ACCEPTANCE_STANDARD.md` 场景 G |
| H 成分知识库 | 检测经理 / 法规专员 | 待补充 | Pending | 参考 `docs/KNOWLEDGE_ACCEPTANCE_STANDARD.md` 场景 H |

## 5. Recommended Asset Paths

- 采集截图目录：`docs/evidence/knowledge/{package_date}/collection/`
- 检索评测报告目录：`docs/evidence/knowledge/{package_date}/retrieval/`
- 业务签署记录目录：`docs/evidence/knowledge/{package_date}/acceptance/`
- 稳定性原始日志：`backend/logs/knowledge_stability/task_events.jsonl`
- 稳定性报告：`{stability_report}`
- 回滚方案：`{options['rollback_plan']}`

## 6. Notes

- 本文档为证据包索引，不替代原始截图、日志、benchmark 报告。
- 如任一资产仍为“待补充”，则 `KR-6-3` 只能视为基础设施完成，不能视为最终验收闭环。
"""

        absolute_output = workspace_root / output_path
        absolute_output.parent.mkdir(parents=True, exist_ok=True)
        absolute_output.write_text(body, encoding='utf-8')
        self.stdout.write(self.style.SUCCESS(f'Knowledge evidence package written to {output_path}'))
