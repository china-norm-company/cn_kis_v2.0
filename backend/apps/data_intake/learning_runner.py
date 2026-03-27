"""
学习型导入框架（Learning Import Runner）

将"机械数据导入"升级为"学习进化循环"的基类框架。

所有历史数据导入脚本应继承 LearningImportRunner，使每次导入不仅完成数据写入，
还自动完成：
  1. 统计规律提炼 → KnowledgeEntry（source_type='import_learning'）
  2. 模型差距发现 → GitHub Issue（标签 data-insight）
  3. 智能体机会识别 → ProactiveInsight（状态 draft）
  4. 匹配失败分析 → 写入学习报告
  5. 运营模式洞察 → KnowledgeRelation（custom 关系）

架构思路：
  每次导入 = ETL（数据入库）+ 分析（发现规律）+ 反馈（改进系统）

使用方式：
    class SubjectImportRunner(LearningImportRunner):
        source_name = 'nas_subject'

        def extract(self) -> list:
            return [...]  # 读取原始数据

        def load(self, raw_data: list) -> dict:
            return {...}  # 写入数据库，返回统计

    runner = SubjectImportRunner(dry_run=False)
    report = runner.run()
    print(report.summary())
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ============================================================================
# 学习报告数据结构
# ============================================================================

@dataclass
class PatternItem:
    """一条发现的统计规律或业务洞察。"""
    pattern_type: str          # 规律类型：distribution / trend / anomaly / correlation
    title: str                 # 简短标题
    description: str           # 详细描述
    evidence: Dict[str, Any] = field(default_factory=dict)  # 支撑数据
    confidence: float = 1.0    # 置信度 0-1


@dataclass
class SchemaGap:
    """数据模型字段缺失：原始数据中有此字段，但现有数据库模型无处存储。"""
    field_name: str            # 原始字段名
    field_example: str         # 示例值
    occurrence_count: int      # 出现次数（在多少条记录中出现）
    affected_percentage: float # 占总记录比例
    suggested_model: str = ''  # 建议存储在哪个模型/表
    suggested_field: str = ''  # 建议的字段名和类型


@dataclass
class MatchFailure:
    """实体匹配失败分析。"""
    failure_reason: str        # 失败原因类型：no_phone / no_id / ambiguous_name / ...
    count: int                 # 失败条数
    percentage: float          # 占总记录百分比
    examples: List[str] = field(default_factory=list)  # 脱敏示例
    suggested_fix: str = ''    # 改进建议


@dataclass
class AgentOpportunity:
    """智能体可以介入自动化的场景。"""
    scenario: str              # 场景描述
    current_pain: str          # 当前痛点（数据中发现）
    agent_value: str           # 智能体介入后的价值
    data_evidence: str = ''    # 支撑证据（数量化）
    implementation_hint: str = ''  # 实现方向


@dataclass
class LearningReport:
    """
    学习报告：每次导入后自动生成。

    包含：统计规律、模型差距、匹配失败分析、智能体机会。
    会被写入 KnowledgeEntry、GitHub Issues、ProactiveInsight。
    """
    source_name: str                    # 导入来源名称
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # 基础统计
    total_records: int = 0
    matched_records: int = 0
    created_records: int = 0
    updated_records: int = 0
    skipped_records: int = 0
    failed_records: int = 0

    # 学习内容
    patterns_discovered: List[PatternItem] = field(default_factory=list)
    schema_gaps: List[SchemaGap] = field(default_factory=list)
    match_failures: List[MatchFailure] = field(default_factory=list)
    agent_opportunities: List[AgentOpportunity] = field(default_factory=list)

    # 原始附加数据（子类可填充任意键值）
    extra_stats: Dict[str, Any] = field(default_factory=dict)

    @property
    def match_rate(self) -> float:
        if self.total_records == 0:
            return 0.0
        return self.matched_records / self.total_records

    @property
    def create_rate(self) -> float:
        if self.total_records == 0:
            return 0.0
        return self.created_records / self.total_records

    @property
    def failure_rate(self) -> float:
        if self.total_records == 0:
            return 0.0
        return self.failed_records / self.total_records

    def add_pattern(self, pattern_type: str, title: str, description: str,
                    evidence: dict = None, confidence: float = 1.0) -> 'LearningReport':
        self.patterns_discovered.append(PatternItem(
            pattern_type=pattern_type, title=title, description=description,
            evidence=evidence or {}, confidence=confidence,
        ))
        return self

    def add_schema_gap(self, field_name: str, field_example: str,
                       occurrence_count: int, total_records: int,
                       suggested_model: str = '', suggested_field: str = '') -> 'LearningReport':
        if occurrence_count == 0:
            return self
        pct = round(occurrence_count / max(total_records, 1) * 100, 1)
        self.schema_gaps.append(SchemaGap(
            field_name=field_name, field_example=field_example,
            occurrence_count=occurrence_count, affected_percentage=pct,
            suggested_model=suggested_model, suggested_field=suggested_field,
        ))
        return self

    def add_match_failure(self, reason: str, count: int, total: int,
                          examples: list = None, suggested_fix: str = '') -> 'LearningReport':
        if count == 0:
            return self
        pct = round(count / max(total, 1) * 100, 1)
        self.match_failures.append(MatchFailure(
            failure_reason=reason, count=count, percentage=pct,
            examples=(examples or [])[:5], suggested_fix=suggested_fix,
        ))
        return self

    def add_agent_opportunity(self, scenario: str, current_pain: str,
                              agent_value: str, data_evidence: str = '',
                              implementation_hint: str = '') -> 'LearningReport':
        self.agent_opportunities.append(AgentOpportunity(
            scenario=scenario, current_pain=current_pain, agent_value=agent_value,
            data_evidence=data_evidence, implementation_hint=implementation_hint,
        ))
        return self

    def summary(self) -> str:
        lines = [
            f'[学习报告] {self.source_name} — {self.generated_at.strftime("%Y-%m-%d %H:%M")}',
            f'  记录统计: 总={self.total_records:,} 匹配={self.matched_records:,}'
            f' 新建={self.created_records:,} 失败={self.failed_records:,}',
            f'  匹配率={self.match_rate:.1%} 失败率={self.failure_rate:.1%}',
        ]
        if self.patterns_discovered:
            lines.append(f'  发现规律: {len(self.patterns_discovered)} 条')
        if self.schema_gaps:
            lines.append(f'  模型缺口: {len(self.schema_gaps)} 项')
        if self.match_failures:
            lines.append(f'  匹配失败类型: {len(self.match_failures)} 种')
        if self.agent_opportunities:
            lines.append(f'  智能体机会: {len(self.agent_opportunities)} 个')
        return '\n'.join(lines)

    def to_dict(self) -> dict:
        def _asdict(obj):
            if hasattr(obj, '__dataclass_fields__'):
                return {k: _asdict(getattr(obj, k)) for k in obj.__dataclass_fields__}
            if isinstance(obj, list):
                return [_asdict(i) for i in obj]
            if isinstance(obj, datetime):
                return obj.isoformat()
            return obj
        return _asdict(self)


# ============================================================================
# GapReporter：将学习报告转化为 GitHub Issues + ProactiveInsight
# ============================================================================

class GapReporter:
    """
    将 LearningReport 中的发现转化为可追踪的改进任务。

    输出：
      - GitHub Issues（标签 data-insight）— 来自 schema_gaps 和 match_failures
      - ProactiveInsight（status=draft）— 来自 agent_opportunities 和 patterns
    """

    # 最低阈值：只有达到此影响度才创建 Issue
    MIN_SCHEMA_GAP_PCT = 5.0       # schema_gap 影响 >= 5% 记录
    MIN_MATCH_FAILURE_PCT = 3.0    # match_failure >= 3% 记录

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self._token = (
            os.environ.get('GH_TOKEN_ISSUES') or
            os.environ.get('GITHUB_TOKEN', '')
        )
        self._owner = os.environ.get('GITHUB_REPO_OWNER', 'china-norm-company')
        self._repo = os.environ.get('GITHUB_REPO_NAME', 'cn_kis_v2.0')

    def report(self, learning_report: LearningReport) -> Dict[str, int]:
        """
        处理学习报告，返回创建的 Issue/Insight 数量。

        Returns:
            {'github_issues': N, 'proactive_insights': M, 'skipped': K}
        """
        created_issues = 0
        created_insights = 0
        skipped = 0

        # 1. schema_gaps → GitHub Issues（P1/P2）
        for gap in learning_report.schema_gaps:
            if gap.affected_percentage < self.MIN_SCHEMA_GAP_PCT:
                skipped += 1
                continue
            priority = 'P1' if gap.affected_percentage >= 20 else 'P2'
            issue = self._create_github_issue(
                title=f'[schema_gap] {learning_report.source_name}: 字段 `{gap.field_name}` 无法存储',
                insight_type='schema_gap（数据模型字段缺失，现有表无法记录此类信息）',
                evidence=(
                    f'导入来源：`{learning_report.source_name}`\n'
                    f'字段名：`{gap.field_name}`\n'
                    f'示例值：`{gap.field_example}`\n'
                    f'影响记录数：{gap.occurrence_count:,} / {learning_report.total_records:,}'
                    f'（{gap.affected_percentage}%）'
                ),
                suggestion=(
                    f'{gap.suggested_model or "待确认模型"} 增加字段：\n'
                    f'`{gap.suggested_field or gap.field_name}` — 存储 {gap.field_name} 信息\n\n'
                    '建议先评估业务价值，再决定是否修改模型+迁移。'
                ),
                kpi_impact='修复后 schema_gap 覆盖率提升，更完整的数据进入知识图谱',
                priority=priority,
                generated_by=f'GapReporter / {learning_report.source_name}',
            )
            if issue:
                created_issues += 1

        # 2. match_failures → GitHub Issues（P0/P1）
        for mf in learning_report.match_failures:
            if mf.percentage < self.MIN_MATCH_FAILURE_PCT:
                skipped += 1
                continue
            priority = 'P0' if mf.percentage >= 10 else 'P1'
            examples_str = '\n'.join(f'- `{e}`' for e in mf.examples) if mf.examples else '（无示例）'
            issue = self._create_github_issue(
                title=f'[match_failure] {learning_report.source_name}: {mf.failure_reason} 导致 {mf.percentage}% 记录无法关联',
                insight_type='match_failure（实体匹配失败规律，导入时无法关联已有记录）',
                evidence=(
                    f'导入来源：`{learning_report.source_name}`\n'
                    f'失败原因：{mf.failure_reason}\n'
                    f'失败数量：{mf.count:,} / {learning_report.total_records:,}（{mf.percentage}%）\n\n'
                    f'**脱敏示例**：\n{examples_str}'
                ),
                suggestion=mf.suggested_fix or '待分析具体改进策略',
                kpi_impact=f'修复后匹配率从 {100-mf.percentage:.0f}% 提升，更多历史记录与现有实体关联',
                priority=priority,
                generated_by=f'GapReporter / {learning_report.source_name}',
            )
            if issue:
                created_issues += 1

        # 3. agent_opportunities → ProactiveInsight
        for opp in learning_report.agent_opportunities:
            insight = self._create_proactive_insight(learning_report, opp)
            if insight:
                created_insights += 1

        logger.info(
            '[GapReporter] %s: 创建 %d GitHub Issues, %d ProactiveInsights, 跳过 %d 项（低于阈值）',
            learning_report.source_name, created_issues, created_insights, skipped,
        )
        return {
            'github_issues': created_issues,
            'proactive_insights': created_insights,
            'skipped': skipped,
        }

    def _create_github_issue(self, title: str, insight_type: str, evidence: str,
                              suggestion: str, kpi_impact: str, priority: str,
                              generated_by: str) -> Optional[dict]:
        """调用 GitHub API 创建 data-insight Issue。"""
        if not self._token:
            logger.warning('[GapReporter] GITHUB_TOKEN/GH_TOKEN_ISSUES 未配置，跳过 Issue 创建')
            return None

        body = (
            f'### 洞察类型\n{insight_type}\n\n'
            f'### 数据证据\n{evidence}\n\n'
            f'### 系统改进建议\n{suggestion}\n\n'
            f'### 预期 KPI 影响\n{kpi_impact}\n\n'
            f'### 建议优先级\n{priority} — {"阻塞当前 Gate 验收" if priority == "P0" else "影响 KPI 达标，建议本周处理" if priority == "P1" else "优化改进，下个迭代处理"}\n\n'
            f'### 发现来源\n`{generated_by}`\n\n'
            f'---\n*此 Issue 由 `GapReporter` 自动生成，请在每周复盘时决策处理方式。*'
        )

        payload = json.dumps({
            'title': title,
            'body': body,
            'labels': ['data-insight', 'auto-generated'],
        }).encode()

        if self.dry_run:
            logger.info('[GapReporter][DRY-RUN] 将创建 Issue: %s', title)
            return {'number': 0, 'url': 'dry-run', 'title': title}

        req = urllib.request.Request(
            f'https://api.github.com/repos/{self._owner}/{self._repo}/issues',
            data=payload,
            headers={
                'Authorization': f'Bearer {self._token}',
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
                logger.info('[GapReporter] Issue 创建成功: #%s %s', data['number'], data['html_url'])
                return {'number': data['number'], 'url': data['html_url'], 'title': data['title']}
        except Exception as e:
            logger.error('[GapReporter] 创建 GitHub Issue 失败: %s', e)
            return None

    def _create_proactive_insight(self, report: LearningReport,
                                   opp: AgentOpportunity) -> Optional[Any]:
        """将智能体机会写入 ProactiveInsight（status=draft）。"""
        try:
            from apps.secretary.models import ProactiveInsight, InsightType

            # 检查是否已存在相同标题的草稿（幂等）
            title = f'[数据洞察] {opp.scenario}'
            existing = ProactiveInsight.objects.filter(
                title=title, status='draft'
            ).first()
            if existing:
                logger.debug('[GapReporter] ProactiveInsight 已存在，跳过: %s', title)
                return existing

            if self.dry_run:
                logger.info('[GapReporter][DRY-RUN] 将创建 ProactiveInsight: %s', title)
                return object()  # 非 None 表示"已处理"

            insight = ProactiveInsight.objects.create(
                insight_type=InsightType.PROJECT_RECOMMENDATION,
                title=title,
                summary=f'{opp.current_pain}\n\n智能体价值：{opp.agent_value}',
                detail={
                    'scenario': opp.scenario,
                    'current_pain': opp.current_pain,
                    'agent_value': opp.agent_value,
                    'data_evidence': opp.data_evidence,
                    'implementation_hint': opp.implementation_hint,
                    'source_import': report.source_name,
                    'generated_at': report.generated_at.isoformat(),
                },
                trigger_source=f'GapReporter:{report.source_name}',
                priority='medium',
                status='draft',
                governance_level='internal_draft',
            )
            logger.info('[GapReporter] ProactiveInsight 创建成功: #%s %s', insight.id, title)
            return insight
        except Exception as e:
            logger.error('[GapReporter] 创建 ProactiveInsight 失败: %s', e)
            return None


# ============================================================================
# LearningImportRunner：所有导入脚本的基类框架
# ============================================================================

class LearningImportRunner:
    """
    学习型导入运行器基类。

    将"机械数据导入"升级为"学习进化循环"：
      extract() → analyze() → load() → generate_report() → publish_to_knowledge()
                                                          → create_gap_issues()
                                                          → update_insights()

    子类必须实现：
      - source_name: str — 导入来源标识（用于日志和报告）
      - extract() → list — 读取原始数据
      - load(raw_data) → dict — 写入数据库，返回统计结果

    子类可选覆盖：
      - analyze(raw_data, load_result) → LearningReport — 定制分析逻辑
      - before_run() — 运行前钩子
      - after_run(report) — 运行后钩子
    """

    source_name: str = 'unknown_source'

    def __init__(self, dry_run: bool = False, skip_github: bool = False,
                 skip_insights: bool = False, verbose: bool = True):
        self.dry_run = dry_run
        self.skip_github = skip_github
        self.skip_insights = skip_insights
        self.verbose = verbose
        self._gap_reporter = GapReporter(dry_run=dry_run)
        self._started_at: Optional[datetime] = None

    # ── 子类必须实现 ──────────────────────────────────────────────────────────

    def extract(self) -> list:
        """读取原始数据，返回记录列表。子类必须实现。"""
        raise NotImplementedError(f'{self.__class__.__name__} 必须实现 extract()')

    def load(self, raw_data: list) -> dict:
        """
        将原始数据写入数据库。子类必须实现。

        Returns:
            统计字典，至少包含：
            {'total': N, 'matched': M, 'created': C, 'updated': U, 'failed': F}
        """
        raise NotImplementedError(f'{self.__class__.__name__} 必须实现 load()')

    # ── 子类可选覆盖 ──────────────────────────────────────────────────────────

    def analyze(self, raw_data: list, load_result: dict) -> LearningReport:
        """
        分析原始数据，生成学习报告。

        默认实现提供基础统计分析；子类可覆盖以添加领域特定分析。
        覆盖时建议先调用 super().analyze() 获取基础报告，再追加。
        """
        report = LearningReport(source_name=self.source_name)

        # 填充基础统计
        report.total_records = load_result.get('total', len(raw_data))
        report.matched_records = load_result.get('matched', 0)
        report.created_records = load_result.get('created', 0)
        report.updated_records = load_result.get('updated', 0)
        report.skipped_records = load_result.get('skipped', 0)
        report.failed_records = load_result.get('failed', 0)
        report.extra_stats = {k: v for k, v in load_result.items()
                              if k not in ('total', 'matched', 'created', 'updated', 'skipped', 'failed')}

        # 基础规律：匹配率分析
        if report.total_records > 0:
            match_pct = report.match_rate * 100
            create_pct = report.create_rate * 100

            if match_pct >= 80:
                report.add_pattern(
                    'distribution', '高匹配率导入',
                    f'{self.source_name} 导入匹配率为 {match_pct:.1f}%，数据质量良好',
                    {'match_rate': match_pct, 'total': report.total_records},
                )
            elif match_pct < 40:
                report.add_pattern(
                    'anomaly', '低匹配率预警',
                    f'{self.source_name} 导入匹配率仅 {match_pct:.1f}%，大量历史记录是新数据',
                    {'match_rate': match_pct, 'create_count': report.created_records},
                    confidence=0.8,
                )

            if create_pct > 50:
                report.add_agent_opportunity(
                    scenario=f'{self.source_name} 新增记录自动分类',
                    current_pain=f'{report.created_records:,} 条新记录需要人工逐一确认分类',
                    agent_value='智能体可基于历史分类规律，对新记录自动打标签，减少 60-80% 人工操作',
                    data_evidence=f'本次导入新增 {report.created_records:,} 条（占 {create_pct:.1f}%）',
                    implementation_hint='基于 KnowledgeEntry 的分类知识 + LLM 分类器',
                )

        return report

    def before_run(self):
        """运行前钩子。子类可覆盖做前置准备。"""
        pass

    def after_run(self, report: LearningReport):
        """运行后钩子。子类可覆盖做后置清理。"""
        pass

    # ── 核心运行流程（通常不需要覆盖）──────────────────────────────────────────

    def run(self) -> LearningReport:
        """
        完整学习循环入口：
          extract → load → analyze → publish_to_knowledge → create_gap_issues → update_insights
        """
        self._started_at = datetime.now(timezone.utc)
        self._log(f'▶  开始学习型导入: {self.source_name}')
        if self.dry_run:
            self._log('   [DRY-RUN 模式，不写入任何数据]')

        self.before_run()

        # 1. 提取
        self._log('── Step 1: 提取原始数据 ──')
        raw_data = self.extract()
        self._log(f'   提取完成: {len(raw_data):,} 条记录')

        # 2. 写入
        self._log('── Step 2: 写入数据库 ──')
        if self.dry_run:
            load_result = {'total': len(raw_data), 'matched': 0, 'created': 0, 'updated': 0,
                           'skipped': 0, 'failed': 0}
        else:
            load_result = self.load(raw_data)
        self._log(
            f'   写入完成: 匹配={load_result.get("matched", 0):,}'
            f' 新建={load_result.get("created", 0):,}'
            f' 更新={load_result.get("updated", 0):,}'
            f' 失败={load_result.get("failed", 0):,}'
        )

        # 3. 分析
        self._log('── Step 3: 生成学习报告 ──')
        report = self.analyze(raw_data, load_result)
        report.generated_at = datetime.now(timezone.utc)
        self._log(f'   {len(report.patterns_discovered)} 个规律 | '
                  f'{len(report.schema_gaps)} 个模型缺口 | '
                  f'{len(report.match_failures)} 类匹配失败 | '
                  f'{len(report.agent_opportunities)} 个智能体机会')

        # 4. 写入知识库
        self._log('── Step 4: 发布到知识库 ──')
        knowledge_count = self._publish_to_knowledge(report)
        self._log(f'   写入 KnowledgeEntry: {knowledge_count} 条')

        # 5. 创建 GitHub Issues
        if not self.skip_github:
            self._log('── Step 5: 创建数据洞察 Issues ──')
            gap_result = self._gap_reporter.report(report)
            self._log(
                f'   GitHub Issues: {gap_result["github_issues"]} 创建'
                f' | ProactiveInsights: {gap_result["proactive_insights"]} 创建'
                f' | 跳过: {gap_result["skipped"]} 项'
            )
        else:
            self._log('── Step 5: 跳过 GitHub Issues（skip_github=True）──')

        self.after_run(report)

        elapsed = (datetime.now(timezone.utc) - self._started_at).total_seconds()
        self._log(f'✓  学习型导入完成 ({elapsed:.1f}s)')
        self._log(report.summary())

        return report

    def _publish_to_knowledge(self, report: LearningReport) -> int:
        """
        将学习报告写入 KnowledgeEntry（source_type='import_learning'）。
        每类洞察写一条：规律汇总 + 模型缺口汇总 + 智能体机会汇总。
        幂等：同一 source_name + 同一天不重复创建。
        """
        if self.dry_run:
            self._log('   [DRY-RUN] 跳过知识库写入')
            return 0

        try:
            from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput
        except ImportError:
            logger.warning('[LearningImportRunner] 无法导入 ingestion_pipeline，跳过知识库写入')
            return 0

        created = 0
        today_str = report.generated_at.strftime('%Y-%m-%d')

        # 合并所有洞察生成一条学习报告条目
        if not (report.patterns_discovered or report.schema_gaps or
                report.match_failures or report.agent_opportunities):
            return 0

        content_parts = [f'# 导入学习报告：{self.source_name} ({today_str})\n']
        content_parts.append(
            f'## 基础统计\n'
            f'- 总记录数：{report.total_records:,}\n'
            f'- 匹配率：{report.match_rate:.1%}（匹配 {report.matched_records:,} / 新建 {report.created_records:,}）\n'
            f'- 失败率：{report.failure_rate:.1%}（{report.failed_records:,} 条）\n'
        )

        if report.patterns_discovered:
            content_parts.append('\n## 发现的规律\n')
            for p in report.patterns_discovered:
                content_parts.append(f'### {p.title}\n{p.description}\n')

        if report.schema_gaps:
            content_parts.append('\n## 数据模型缺口\n')
            for g in report.schema_gaps:
                content_parts.append(
                    f'- **{g.field_name}**：{g.occurrence_count:,} 条记录（{g.affected_percentage}%）有此字段，'
                    f'现有模型无法存储。示例：`{g.field_example}`\n'
                )

        if report.match_failures:
            content_parts.append('\n## 匹配失败分析\n')
            for mf in report.match_failures:
                content_parts.append(
                    f'- **{mf.failure_reason}**：{mf.count:,} 条（{mf.percentage}%）。'
                    f'{mf.suggested_fix}\n'
                )

        if report.agent_opportunities:
            content_parts.append('\n## 智能体介入机会\n')
            for opp in report.agent_opportunities:
                content_parts.append(
                    f'### {opp.scenario}\n'
                    f'**当前痛点**：{opp.current_pain}\n'
                    f'**智能体价值**：{opp.agent_value}\n'
                    f'**数据证据**：{opp.data_evidence}\n'
                )

        content = ''.join(content_parts)
        title = f'[导入学习报告] {self.source_name} — {today_str}'

        try:
            result = run_pipeline(RawKnowledgeInput(
                title=title,
                content=content,
                source_type='import_learning',
                source_key=f'{self.source_name}_{today_str}',
                entry_type='lesson_learned',
                namespace='project_experience',
            ))
            if result and result.entry_id:
                created += 1
                logger.info('[LearningImportRunner] 学习报告写入 KnowledgeEntry: #%s', result.entry_id)
        except Exception as e:
            logger.error('[LearningImportRunner] 写入 KnowledgeEntry 失败: %s', e)

        return created

    def _log(self, msg: str):
        if self.verbose:
            ts = datetime.now().strftime('%H:%M:%S')
            print(f'[{ts}] {msg}')
        logger.info(msg)
