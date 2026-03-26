"""
reconcile_mail_signals — 批量重分类 UNKNOWN MailSignalEvent

功能：
  将 mail_signal_type='unknown' 的 MailSignalEvent 批量送入 LLM 重新分类。
  目标：unknown% 从 85% → <30%（A2 Gate 验收目标）

原理：
  1. 从 t_mail_signal_event 中拉取 unknown 记录（分批处理）
  2. 构造 LLM 分类 Prompt（subject + body_text 摘要）
  3. 解析 LLM 输出 → 更新 mail_signal_type + confidence_score
  4. 生成重分类报告 → KnowledgeEntry + ProactiveInsight
  5. 汇报 KPI 变化（UNKNOWN% 前后对比）

使用方式：
    python manage.py reconcile_mail_signals [--limit N] [--batch-size N] [--dry-run]
    python manage.py reconcile_mail_signals --limit 5000 --batch-size 100
    python manage.py reconcile_mail_signals --dry-run  # 只统计，不写入
"""
from __future__ import annotations

import logging
import os
from typing import Dict, Optional

from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger(__name__)


# ── 分类 Prompt ─────────────────────────────────────────────────────────────

CLASSIFY_PROMPT_TEMPLATE = """你是一位公司邮件业务分类专家。请将以下邮件归入**一个**最合适的业务类型。

### 邮件信息
- 发件人：{sender}
- 主题：{subject}
- 正文摘要（前400字）：
{body_snippet}

### 可选类型（只选一个，输出英文代码）
- `inquiry`：询价、合作意向、新项目洽谈、服务咨询
- `project_followup`：项目执行沟通、进度确认、结果反馈、报告交付
- `competitor_pressure`：竞品信息、市场动态、招标失利、价格竞争
- `complaint`：投诉、强负反馈、服务不满、要求退款
- `relationship_signal`：关系变化（建立/加深/疏远/终止）、人员变动通知
- `internal_admin`：内部行政、HR通知、IT工单、财务报销、合同审批等内部事务
- `unknown`：确实无法判断（仅在上述6类均不适合时使用）

### 要求
1. 只输出 JSON，格式：{{"type": "<英文代码>", "confidence": <0.1-1.0的数字>, "reason": "<10字内理由>"}}
2. 优先选择有业务含义的类型，`unknown` 是最后选项
3. confidence 表示你的确信程度（0.9+ 表示非常确信）

JSON输出："""

# 分类类型到 MailSignalType 的映射
_TYPE_MAP = {
    'inquiry': 'inquiry',
    'project_followup': 'project_followup',
    'competitor_pressure': 'competitor_pressure',
    'complaint': 'complaint',
    'relationship_signal': 'relationship_signal',
    'internal_admin': 'internal_admin',
    'unknown': 'unknown',
}


class Command(BaseCommand):
    help = 'A2 Track: 批量重分类 UNKNOWN MailSignalEvent，目标 unknown% < 30%'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit', type=int, default=5000,
            help='本次处理的最大数量（默认 5000）',
        )
        parser.add_argument(
            '--batch-size', type=int, default=50,
            help='每批 LLM 请求数（默认 50）',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='只统计现状，不实际分类写入',
        )
        parser.add_argument(
            '--confidence-threshold', type=float, default=0.6,
            help='LLM 置信度阈值，低于此值保留 unknown（默认 0.6）',
        )
        parser.add_argument(
            '--min-confidence-for-publish', type=float, default=0.75,
            help='此置信度以上才更新 status=parsed（默认 0.75）',
        )

    def handle(self, *args, **options):
        limit = options['limit']
        batch_size = options['batch_size']
        dry_run = options['dry_run']
        confidence_threshold = options['confidence_threshold']
        min_confidence_for_publish = options['min_confidence_for_publish']

        from apps.secretary.models import MailSignalEvent, MailSignalType

        # ── 前置统计 ──────────────────────────────────────────────────────
        total_all = MailSignalEvent.objects.count()
        total_unknown = MailSignalEvent.objects.filter(
            mail_signal_type=MailSignalType.UNKNOWN
        ).count()
        unknown_pct_before = (total_unknown / total_all * 100) if total_all > 0 else 0

        self.stdout.write('=== MailSignalEvent 重分类（A2 Track）===')
        self.stdout.write(f'总记录数：{total_all:,} 条')
        self.stdout.write(f'UNKNOWN 数：{total_unknown:,} 条（{unknown_pct_before:.1f}%）')
        self.stdout.write(f'本次处理上限：{limit:,} 条')
        self.stdout.write(f'DRY-RUN：{"是" if dry_run else "否"}')
        self.stdout.write('')

        if total_unknown == 0:
            self.stdout.write(self.style.SUCCESS('没有需要重分类的记录！'))
            return

        # ── 获取 LLM 客户端 ───────────────────────────────────────────────
        llm_client = self._get_llm_client()
        if llm_client is None:
            self.stderr.write('错误：无法获取 LLM 客户端（检查 OPENAI_API_KEY 或内网 LLM 配置）')
            return

        # ── 批量处理 ──────────────────────────────────────────────────────
        qs = MailSignalEvent.objects.filter(
            mail_signal_type=MailSignalType.UNKNOWN
        ).order_by('id')[:limit]

        processed = 0
        reclassified = 0
        kept_unknown = 0
        low_confidence = 0
        errors = 0
        type_distribution: Dict[str, int] = {}

        items = list(qs)
        self.stdout.write(f'开始处理 {len(items):,} 条记录，批大小 {batch_size}...')

        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            batch_results = []

            for event in batch:
                try:
                    result = self._classify_event(event, llm_client)
                    batch_results.append((event, result))
                    processed += 1
                except Exception as e:
                    logger.error('分类 MailSignalEvent #%s 失败: %s', event.id, e)
                    errors += 1
                    batch_results.append((event, None))

            # 批量写入
            if not dry_run:
                self._save_batch(
                    batch_results,
                    confidence_threshold=confidence_threshold,
                    min_confidence_for_publish=min_confidence_for_publish,
                )

            # 统计
            for event, result in batch_results:
                if result is None:
                    kept_unknown += 1
                    continue
                new_type = result.get('type', 'unknown')
                conf = result.get('confidence', 0)
                if new_type != 'unknown' and conf >= confidence_threshold:
                    reclassified += 1
                    type_distribution[new_type] = type_distribution.get(new_type, 0) + 1
                else:
                    kept_unknown += 1
                    if conf < confidence_threshold:
                        low_confidence += 1

            # 进度
            if (i + batch_size) % (batch_size * 10) == 0 or i + batch_size >= len(items):
                self.stdout.write(
                    f'  进度 {min(i+batch_size, len(items)):,}/{len(items):,}'
                    f' | 已重分类: {reclassified:,} | 保持unknown: {kept_unknown:,}'
                )

        # ── 后置统计 ──────────────────────────────────────────────────────
        new_unknown = MailSignalEvent.objects.filter(
            mail_signal_type=MailSignalType.UNKNOWN
        ).count() if not dry_run else (total_unknown - reclassified)
        unknown_pct_after = (new_unknown / total_all * 100) if total_all > 0 else 0

        self.stdout.write('')
        self.stdout.write('=== 重分类结果 ===')
        self.stdout.write(f'处理总数：{processed:,}')
        self.stdout.write(f'成功重分类：{reclassified:,}（置信度 >= {confidence_threshold}）')
        self.stdout.write(f'保持 unknown：{kept_unknown:,}（低置信度 {low_confidence:,} | 错误 {errors:,}）')
        self.stdout.write(f'UNKNOWN%：{unknown_pct_before:.1f}% → {unknown_pct_after:.1f}%（目标 <30%）')
        if type_distribution:
            self.stdout.write('重分类结果分布：')
            for t, cnt in sorted(type_distribution.items(), key=lambda x: -x[1]):
                self.stdout.write(f'  {t}: {cnt:,}')

        gate_passed = unknown_pct_after < 30
        if gate_passed:
            self.stdout.write(self.style.SUCCESS('✅ A2 Gate 验收通过：UNKNOWN% < 30%！'))
        else:
            self.stdout.write(self.style.WARNING(
                f'⚠️  A2 Gate 未达标：UNKNOWN% = {unknown_pct_after:.1f}%（需 < 30%）。'
                f'可以提高 limit 或降低 confidence_threshold 再次运行。'
            ))

        # ── 生成学习报告并发布 ────────────────────────────────────────────
        if not dry_run:
            self._publish_learning_report(
                total_all=total_all,
                total_unknown=total_unknown,
                reclassified=reclassified,
                new_unknown=new_unknown,
                type_distribution=type_distribution,
                unknown_pct_before=unknown_pct_before,
                unknown_pct_after=unknown_pct_after,
            )

    def _get_llm_client(self):
        """获取可用的 LLM 客户端。优先使用 ARK（火山引擎），其次 DeepSeek，其次 OpenAI。"""
        # 优先：ARK 客户端
        try:
            from apps.agent_gateway.services import get_ark_client
            client = get_ark_client()
            if client:
                return client
        except Exception:
            pass

        # 次选：DeepSeek
        try:
            from apps.agent_gateway.services import get_deepseek_client
            client = get_deepseek_client()
            if client:
                return client
        except Exception:
            pass

        # 降级：openai 格式
        try:
            import openai
            api_key = os.environ.get('OPENAI_API_KEY', '')
            if api_key:
                return openai.OpenAI(api_key=api_key)
        except ImportError:
            pass

        return None

    def _classify_event(self, event, llm_client) -> Optional[dict]:
        """调用 LLM 对单个 MailSignalEvent 分类，返回 {'type': ..., 'confidence': ..., 'reason': ...}。"""
        import json

        body_text = event.body_text or event.raw_content or ''
        body_snippet = body_text[:400].replace('\n', ' ')

        prompt = CLASSIFY_PROMPT_TEMPLATE.format(
            sender=event.sender_email or '未知',
            subject=event.subject or '（无主题）',
            body_snippet=body_snippet or '（无正文）',
        )

        # 调用 LLM
        response_text = self._call_llm(llm_client, prompt)
        if not response_text:
            return None

        # 解析 JSON 响应
        try:
            # 提取 JSON 部分（LLM 可能有额外文字）
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start < 0 or end <= start:
                return None
            result = json.loads(response_text[start:end])
            # 验证类型合法
            if result.get('type') not in _TYPE_MAP:
                result['type'] = 'unknown'
            return result
        except (json.JSONDecodeError, KeyError):
            logger.warning('LLM 响应 JSON 解析失败: %s', response_text[:100])
            return None

    def _call_llm(self, llm_client, prompt: str) -> Optional[str]:
        """统一 LLM 调用接口（兼容 ARK/OpenAI SDK 格式）。"""
        from django.conf import settings
        try:
            # ARK / OpenAI SDK 格式：有 chat.completions
            if hasattr(llm_client, 'chat') and hasattr(getattr(llm_client, 'chat', None), 'completions'):
                model = getattr(settings, 'ARK_DEFAULT_MODEL', '') or 'deepseek-chat'
                resp = llm_client.chat.completions.create(
                    model=model,
                    messages=[{'role': 'user', 'content': prompt}],
                    max_tokens=200,
                    temperature=0.1,
                )
                return resp.choices[0].message.content

            # 通用 callable
            if callable(llm_client):
                return llm_client(prompt)
        except Exception as e:
            logger.error('LLM 调用失败: %s', e)
        return None

    def _save_batch(self, batch_results: list, confidence_threshold: float,
                    min_confidence_for_publish: float):
        """批量保存重分类结果。"""
        from apps.secretary.models import MailSignalEvent, MailSignalStatus

        with transaction.atomic():
            for event, result in batch_results:
                if result is None:
                    continue
                new_type = result.get('type', 'unknown')
                confidence = float(result.get('confidence', 0))

                if new_type not in _TYPE_MAP or new_type == 'unknown':
                    continue
                if confidence < confidence_threshold:
                    continue

                update_fields = {
                    'mail_signal_type': new_type,
                    'confidence_score': confidence,
                }
                if confidence >= min_confidence_for_publish:
                    update_fields['status'] = MailSignalStatus.PARSED

                MailSignalEvent.objects.filter(id=event.id).update(**update_fields)

    def _publish_learning_report(self, total_all: int, total_unknown: int,
                                  reclassified: int, new_unknown: int,
                                  type_distribution: dict,
                                  unknown_pct_before: float,
                                  unknown_pct_after: float):
        """将重分类结果写入 KnowledgeEntry + ProactiveInsight。"""
        from apps.data_intake.learning_runner import LearningReport, GapReporter
        import datetime

        report = LearningReport(source_name='mail_signal_reconcile')
        report.total_records = total_unknown
        report.matched_records = reclassified
        report.created_records = 0
        report.updated_records = reclassified
        report.extra_stats = {
            'total_all': total_all,
            'unknown_before': total_unknown,
            'unknown_pct_before': round(unknown_pct_before, 1),
            'unknown_after': new_unknown,
            'unknown_pct_after': round(unknown_pct_after, 1),
            'type_distribution': type_distribution,
        }

        # 规律发现
        report.add_pattern(
            'distribution', '邮件业务类型分布',
            '重分类后邮件类型分布：' + '、'.join(
                f'{t}({cnt:,}条)' for t, cnt in sorted(
                    type_distribution.items(), key=lambda x: -x[1]
                )
            ),
            evidence=type_distribution,
        )
        report.add_pattern(
            'trend', 'UNKNOWN 邮件重分类效果',
            f'本次重分类将 UNKNOWN 比例从 {unknown_pct_before:.1f}% 降至 {unknown_pct_after:.1f}%，'
            f'成功识别 {reclassified:,} 条邮件的业务类型。',
            evidence={'before': unknown_pct_before, 'after': unknown_pct_after,
                      'reclassified': reclassified},
        )

        # 分析仍然 UNKNOWN 的原因（智能体机会）
        if new_unknown > 0:
            remaining_pct = unknown_pct_after
            report.add_agent_opportunity(
                scenario='顽固 UNKNOWN 邮件规律学习',
                current_pain=f'仍有 {new_unknown:,} 条（{remaining_pct:.1f}%）邮件无法被LLM分类，'
                            f'可能是语言/格式特殊的垃圾邮件、内部暗语、或缺少新业务类型',
                agent_value='通过人工抽检 100 条顽固 UNKNOWN 样本，识别是否需要新增邮件类型（如"合规/法务"、"招聘"等）',
                data_evidence=f'{new_unknown:,} 条顽固 UNKNOWN',
                implementation_hint='python manage.py reconcile_mail_signals --limit 200 --confidence-threshold 0.4 分析低置信度样本',
            )

        # 写入知识库
        try:
            from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput
            today = datetime.date.today()
            content = (
                f'# 邮件信号重分类报告（{today}）\n\n'
                f'## 效果摘要\n'
                f'- UNKNOWN 比例：{unknown_pct_before:.1f}% → {unknown_pct_after:.1f}%\n'
                f'- 成功重分类：{reclassified:,} 条\n\n'
                f'## 重分类后类型分布\n' +
                '\n'.join(f'- {t}: {cnt:,}条' for t, cnt in sorted(
                    type_distribution.items(), key=lambda x: -x[1]
                ))
            )
            run_pipeline(RawKnowledgeInput(
                title=f'[邮件信号] 重分类报告 — {today}',
                content=content,
                source_type='import_learning',
                source_key=f'mail_signal_reconcile_{today}',
                entry_type='lesson_learned',
                namespace='secretary_knowledge',
            ))
        except Exception as e:
            logger.warning('写入 KnowledgeEntry 失败: %s', e)

        # 创建 data-insight Issues（如有未解决的问题）
        gap_reporter = GapReporter()
        gap_reporter.report(report)
