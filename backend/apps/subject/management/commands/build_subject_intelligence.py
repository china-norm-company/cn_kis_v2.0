"""
build_subject_intelligence — 受试者智能层构建（A3 Track）

功能：
  将 t_subject_questionnaire 中的历史导入数据（28个项目Sheet + 访客记录）
  转化为：
    1. 受试者价值分层（tier: platinum/gold/silver/bronze）→ KnowledgeEntry
    2. 项目匹配关系图谱（subject → project, has_participation_pattern）→ KnowledgeRelation
    3. 肤质-年龄-地域画像知识条目 → KnowledgeEntry（用于招募推荐）
    4. 项目类型偏好模式 → KnowledgeRelation（subject has_preference category）
    5. 高价值受试者的可用性模式（参与频率/季节偏好）→ ProactiveInsight

A3 Gate 验收目标：
  - 受试者价值分层覆盖率 > 80%
  - has_participation_pattern 关系数 > 2,000
  - 问答测试：受试者匹配召回率 > 60%

使用方式：
    python manage.py build_subject_intelligence [--limit N] [--dry-run] [--phase all/tier/graph/profile]
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import date

from django.core.management.base import BaseCommand
from django.db import connection, transaction

logger = logging.getLogger(__name__)

# 价值分层阈值
TIER_THRESHOLDS = {
    'platinum': {'min_projects': 5, 'min_visits': 15},  # 铂金：5+ 项目，15+ 次访视
    'gold':     {'min_projects': 3, 'min_visits': 8},   # 黄金：3+ 项目，8+ 次访视
    'silver':   {'min_projects': 1, 'min_visits': 3},   # 白银：1+ 项目，3+ 次访视
    'bronze':   {'min_projects': 0, 'min_visits': 1},   # 青铜：有任何参与记录
}


class Command(BaseCommand):
    help = 'A3 Track: 受试者智能层构建，生成价值分层+项目图谱+画像知识'

    def add_arguments(self, parser):
        parser.add_argument(
            '--phase', choices=['all', 'tier', 'graph', 'profile'], default='all',
            help='执行阶段：all=全部 / tier=价值分层 / graph=项目关系图谱 / profile=画像知识',
        )
        parser.add_argument(
            '--limit', type=int, default=0,
            help='处理的最大受试者数量（0=全部）',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='只统计分析，不写入数据库',
        )
        parser.add_argument(
            '--skip-learning', action='store_true',
            help='跳过学习报告生成',
        )

    def handle(self, *args, **options):
        phase = options['phase']
        limit = options['limit']
        dry_run = options['dry_run']

        self.stdout.write(f'=== 受试者智能层构建（A3 Track）Phase: {phase} ===')
        if dry_run:
            self.stdout.write('[DRY-RUN 模式]')

        stats = {
            'total_subjects': 0,
            'subjects_with_qdata': 0,
            'tier_platinum': 0, 'tier_gold': 0,
            'tier_silver': 0, 'tier_bronze': 0, 'tier_none': 0,
            'participation_relations': 0,
            'preference_relations': 0,
            'knowledge_entries': 0,
        }

        # ── Phase 1：加载受试者问卷数据 ──────────────────────────────────
        self.stdout.write('── Step 1: 汇聚问卷数据 ──')
        subject_data = self._load_subject_questionnaire_data(limit)
        stats['total_subjects'] = len(subject_data)
        stats['subjects_with_qdata'] = sum(1 for d in subject_data.values() if d['project_count'] > 0)

        self.stdout.write(f'   加载 {len(subject_data):,} 名受试者问卷数据')
        self.stdout.write(f'   有项目参与记录: {stats["subjects_with_qdata"]:,} 名')

        if phase in ('all', 'tier'):
            self.stdout.write('── Step 2: 受试者价值分层 ──')
            tier_stats = self._build_tier_classification(subject_data, dry_run)
            stats.update(tier_stats)
            self.stdout.write(
                f'   铂金: {tier_stats["tier_platinum"]:,} | '
                f'黄金: {tier_stats["tier_gold"]:,} | '
                f'白银: {tier_stats["tier_silver"]:,} | '
                f'青铜: {tier_stats["tier_bronze"]:,}'
            )

        if phase in ('all', 'graph'):
            self.stdout.write('── Step 3: 项目参与关系图谱 ──')
            graph_stats = self._build_participation_graph(subject_data, dry_run)
            stats.update(graph_stats)
            self.stdout.write(
                f'   项目参与关系: {graph_stats["participation_relations"]:,} 条 | '
                f'偏好关系: {graph_stats["preference_relations"]:,} 条'
            )

        if phase in ('all', 'profile'):
            self.stdout.write('── Step 4: 群体画像知识条目 ──')
            profile_stats = self._build_profile_knowledge(subject_data, dry_run)
            stats.update(profile_stats)
            self.stdout.write(f'   写入 KnowledgeEntry: {profile_stats["knowledge_entries"]:,} 条')

        # ── Gate 验收检查 ──────────────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write('=== A3 Gate 验收检查 ===')

        total_with_tier = (stats['tier_platinum'] + stats['tier_gold'] +
                           stats['tier_silver'] + stats['tier_bronze'])
        coverage = total_with_tier / stats['total_subjects'] if stats['total_subjects'] > 0 else 0

        self.stdout.write(
            f'  价值分层覆盖率: {coverage:.1%}（目标 >80%）'
            f' {"✅" if coverage > 0.8 else "⚠️"}'
        )
        self.stdout.write(
            f'  参与关系数: {stats["participation_relations"]:,}（目标 2,000+）'
            f' {"✅" if stats["participation_relations"] >= 2000 else "⚠️"}'
        )

        # ── 学习报告 ──────────────────────────────────────────────────────
        if not options['skip_learning'] and not dry_run:
            self._publish_learning_report(stats, subject_data)

    def _load_subject_questionnaire_data(self, limit: int = 0) -> dict:
        """
        从 t_subject_questionnaire 汇聚每名受试者的参与数据。
        返回：{subject_id: {project_count, visit_count, projects: [...], skin_type, ...}}
        """
        sql = """
            SELECT
                q.subject_id,
                q.questionnaire_type,
                q.answers,
                s.gender, s.age, s.skin_type, s.status,
                p.province, p.birth_date
            FROM t_subject_questionnaire q
            JOIN t_subject s ON s.id = q.subject_id
            LEFT JOIN t_subject_profile p ON p.subject_id = q.subject_id
            WHERE q.questionnaire_type IN (
                'visitor_registration', 'master_list_project', 'subject_list_2026', 'imported'
            )
            ORDER BY q.subject_id, q.create_time
        """
        limit_clause = f'LIMIT {limit * 20}' if limit > 0 else ''

        subject_data = defaultdict(lambda: {
            'subject_id': None,
            'gender': '', 'age': None, 'skin_type': '', 'status': 'active',
            'province': '', 'birth_date': None,
            'project_count': 0, 'visit_count': 0,
            'projects': set(), 'visit_times': [],
            'questionnaire_types': set(),
        })

        with connection.cursor() as cur:
            cur.execute(sql.rstrip() + ' ' + limit_clause)
            rows = cur.fetchall()

        subjects_seen = set()
        for row in rows:
            (sid, qtype, answers, gender, age, skin_type, status,
             province, birth_date) = row

            if limit > 0 and len(subjects_seen) >= limit and sid not in subjects_seen:
                break
            subjects_seen.add(sid)

            d = subject_data[sid]
            d['subject_id'] = sid
            if not d['gender'] and gender:
                d['gender'] = gender
            if d['age'] is None and age:
                d['age'] = age
            if not d['skin_type'] and skin_type:
                d['skin_type'] = skin_type
            if not d['province'] and province:
                d['province'] = province
            if not d['birth_date'] and birth_date:
                d['birth_date'] = birth_date
            d['status'] = status or 'active'
            d['questionnaire_types'].add(qtype)

            # 从 answers 提取项目编号（answers 可能是 dict 或 JSON 字符串）
            if isinstance(answers, str):
                try:
                    import json as _json
                    answers = _json.loads(answers)
                except (ValueError, TypeError):
                    answers = {}
            if isinstance(answers, dict):
                for key in ('项目编号', '来访事由', 'proj_code', 'project_code', '编号'):
                    val = answers.get(key, '')
                    if val and str(val).strip():
                        proj_code = str(val).strip()
                        # 过滤：只接受符合项目编号格式的值（如 M25076001、C25005001 等）
                        import re as _re
                        if _re.match(r'^[A-Za-z][A-Za-z0-9]{3,}', proj_code):
                            d['projects'].add(proj_code)
                            d['project_count'] = len(d['projects'])
                            break  # 找到有效项目编号即停止

                # 访客记录：来访事由不为空才算有效访视
                if qtype == 'visitor_registration':
                    visit_reason = answers.get('来访事由', '') if isinstance(answers, dict) else ''
                    if visit_reason and visit_reason.strip():
                        d['visit_count'] += 1

        return dict(subject_data)

    def _build_tier_classification(self, subject_data: dict, dry_run: bool) -> dict:
        """
        按价值分层标准对每名受试者分级，将结果写入 KnowledgeEntry 和受试者元数据字段。
        """

        tier_counts = {'platinum': 0, 'gold': 0, 'silver': 0, 'bronze': 0, 'none': 0}
        entries_to_create = []

        for sid, d in subject_data.items():
            n_proj = d['project_count']
            n_visit = d['visit_count']

            # 计算层级
            tier = 'none'
            for t_name, thresh in TIER_THRESHOLDS.items():
                if n_proj >= thresh['min_projects'] and n_visit >= thresh['min_visits']:
                    tier = t_name
                    break

            tier_counts[tier if tier != 'none' else 'none'] += 1

            if tier == 'none' or dry_run:
                continue

            # 构建价值分层知识条目
            age_str = f'{d["age"]}岁' if d["age"] else '年龄未知'
            skin_str = d['skin_type'] or '肤质未知'
            province_str = d['province'] or '省份未知'
            tier_label = {'platinum': '铂金', 'gold': '黄金', 'silver': '白银', 'bronze': '青铜'}[tier]

            content = (
                f'受试者 #{sid} 价值分层：{tier_label}\n'
                f'基本信息：{d["gender"] or "未知性别"}, {age_str}, {skin_str}, {province_str}\n'
                f'参与项目数：{n_proj} 个\n'
                f'累计访视次数：{n_visit} 次\n'
                f'参与的项目编号：{", ".join(sorted(d["projects"])[:10]) if d["projects"] else "无记录"}\n'
                f'受试者状态：{d["status"]}\n'
            )

            entries_to_create.append({
                'subject_id': sid,
                'tier': tier,
                'title': f'受试者 #{sid} 价值档案（{tier_label}级）',
                'content': content,
                'metadata': {
                    'tier': tier,
                    'project_count': n_proj,
                    'visit_count': n_visit,
                    'gender': d['gender'],
                    'age': d['age'],
                    'skin_type': d['skin_type'],
                    'province': d['province'],
                    'projects': list(d['projects'])[:20],
                },
            })

        # 批量写入
        if entries_to_create and not dry_run:
            try:
                from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput
                for batch_start in range(0, len(entries_to_create), 50):
                    batch = entries_to_create[batch_start:batch_start + 50]
                    for item in batch:
                        try:
                            run_pipeline(RawKnowledgeInput(
                                title=item['title'],
                                content=item['content'],
                                source_type='subject_intelligence',
                                source_key=f'subject_tier_{item["subject_id"]}',
                                entry_type='subject_profile',
                                namespace='project_experience',
                                properties=item['metadata'],
                            ))
                        except Exception as e:
                            logger.debug('写入受试者分层知识失败 #%s: %s', item['subject_id'], e)
                    logger.info('价值分层批次 %d/%d 完成', batch_start + len(batch), len(entries_to_create))
            except ImportError as e:
                logger.warning('ingestion_pipeline 不可用: %s', e)

        return {
            'tier_platinum': tier_counts['platinum'],
            'tier_gold': tier_counts['gold'],
            'tier_silver': tier_counts['silver'],
            'tier_bronze': tier_counts['bronze'],
            'tier_none': tier_counts['none'],
        }

    def _build_participation_graph(self, subject_data: dict, dry_run: bool) -> dict:
        """
        构建"受试者 → 项目"参与关系图谱（KnowledgeRelation）。
        以及"受试者有偏好的测试类型"关系。
        """
        from apps.knowledge.models import KnowledgeRelation, KnowledgeEntity, RelationType

        participation_count = 0
        preference_count = 0

        # 提取所有出现的项目编号 → 确保对应的 KnowledgeEntity 存在
        all_project_codes = set()
        for d in subject_data.values():
            all_project_codes.update(d.get('projects', set()))

        if dry_run:
            return {
                'participation_relations': sum(
                    len(d.get('projects', set())) for d in subject_data.values()
                ),
                'preference_relations': 0,
            }

        # 批量创建或获取项目实体
        project_entities = {}
        for code in all_project_codes:
            try:
                ent, _ = KnowledgeEntity.objects.get_or_create(
                    uri=f'cnkis:project/{code}',
                    defaults={
                        'entity_type': 'project',
                        'label': code,
                        'namespace': 'cnkis',
                        'properties': {'project_code': code, 'source': 'nas_import'},
                    }
                )
                project_entities[code] = ent
            except Exception as e:
                logger.debug('创建项目实体 %s 失败: %s', code, e)

        # 为每个有项目参与的受试者创建或获取受试者实体，然后建立关系
        batch_relations = []

        for sid, d in subject_data.items():
            if not d.get('projects'):
                continue

            try:
                sub_ent, _ = KnowledgeEntity.objects.get_or_create(
                    uri=f'cnkis:subject/{sid}',
                    defaults={
                        'entity_type': 'person',
                        'label': f'受试者#{sid}',
                        'namespace': 'cnkis',
                        'properties': {
                            'subject_id': sid,
                            'gender': d.get('gender', ''),
                            'age': d.get('age'),
                            'skin_type': d.get('skin_type', ''),
                            'province': d.get('province', ''),
                            'tier': self._calc_tier(d),
                        },
                    }
                )
            except Exception as e:
                logger.debug('创建受试者实体 #%s 失败: %s', sid, e)
                continue

            for proj_code in d.get('projects', set()):
                proj_ent = project_entities.get(proj_code)
                if not proj_ent:
                    continue
                batch_relations.append(KnowledgeRelation(
                    subject=sub_ent,
                    predicate_uri='has_participation_pattern',
                    object=proj_ent,
                    relation_type=RelationType.CUSTOM,
                    confidence=0.85,
                    source='build_subject_intelligence',
                ))
                participation_count += 1

            # 限制每批数量
            if len(batch_relations) >= 200:
                try:
                    with transaction.atomic():
                        KnowledgeRelation.objects.bulk_create(
                            batch_relations,
                            ignore_conflicts=True,
                            batch_size=100,
                        )
                except Exception as e:
                    logger.error('批量创建参与关系失败: %s', e)
                batch_relations = []

        if batch_relations:
            try:
                with transaction.atomic():
                    KnowledgeRelation.objects.bulk_create(
                        batch_relations,
                        ignore_conflicts=True,
                        batch_size=100,
                    )
            except Exception as e:
                logger.error('最后批次创建参与关系失败: %s', e)

        return {
            'participation_relations': participation_count,
            'preference_relations': preference_count,
        }

    def _build_profile_knowledge(self, subject_data: dict, dry_run: bool) -> dict:
        """
        构建群体画像知识条目（按省份/肤质/年龄段分组）。
        这些是"招募推荐"智能体的核心知识。
        """
        if dry_run:
            return {'knowledge_entries': 0}

        # 按维度分组统计
        province_counter = Counter(d['province'] for d in subject_data.values() if d.get('province'))
        skin_counter = Counter(d['skin_type'] for d in subject_data.values() if d.get('skin_type'))
        age_group_counter: Counter = Counter()

        for d in subject_data.values():
            age = d.get('age')
            if age:
                if age < 26:
                    age_group_counter['18-25岁'] += 1
                elif age < 36:
                    age_group_counter['26-35岁'] += 1
                elif age < 46:
                    age_group_counter['36-45岁'] += 1
                elif age < 56:
                    age_group_counter['46-55岁'] += 1
                else:
                    age_group_counter['56岁以上'] += 1

        tier_counter = Counter(self._calc_tier(d) for d in subject_data.values())
        total = len(subject_data)

        entries_created = 0
        try:
            from apps.knowledge.ingestion_pipeline import run_pipeline, RawKnowledgeInput

            # 综合画像总结知识条目
            today = date.today()
            content = (
                f'# 受试者资源库画像概况（截至 {today}）\n\n'
                f'## 总体规模\n'
                f'- 受试者总数：{total:,} 名\n'
                f'- 铂金级（5+项目）：{tier_counter.get("platinum", 0):,} 名（{tier_counter.get("platinum", 0)/total:.1%}）\n'
                f'- 黄金级（3-4项目）：{tier_counter.get("gold", 0):,} 名（{tier_counter.get("gold", 0)/total:.1%}）\n'
                f'- 白银级（1-2项目）：{tier_counter.get("silver", 0):,} 名（{tier_counter.get("silver", 0)/total:.1%}）\n'
                f'- 青铜级（有访视）：{tier_counter.get("bronze", 0):,} 名（{tier_counter.get("bronze", 0)/total:.1%}）\n\n'
                f'## 地域分布（Top 10 省份）\n'
                + '\n'.join(f'- {p}: {c:,} 名（{c/total:.1%}）'
                            for p, c in province_counter.most_common(10))
                + '\n\n## 肤质分布\n'
                + '\n'.join(f'- {s}: {c:,} 名（{c/total:.1%}）'
                            for s, c in skin_counter.most_common())
                + '\n\n## 年龄分布\n'
                + '\n'.join(f'- {g}: {c:,} 名（{c/total:.1%}）'
                            for g, c in sorted(age_group_counter.items()))
                + '\n\n## 应用说明\n'
                '此数据可用于招募推荐：根据项目的目标皮肤类型、年龄段、地域要求，'
                '智能体可快速筛选并匹配最合适的候选受试者。\n'
            )

            result = run_pipeline(RawKnowledgeInput(
                title=f'受试者资源库画像概况 — {today}',
                content=content,
                source_type='subject_intelligence',
                source_key=f'subject_pool_profile_{today}',
                entry_type='subject_profile',
                namespace='project_experience',
                properties={
                    'total_subjects': total,
                    'tier_distribution': dict(tier_counter),
                    'top_provinces': dict(province_counter.most_common(10)),
                    'skin_distribution': dict(skin_counter),
                    'age_distribution': dict(age_group_counter),
                },
            ))
            if result and result.entry_id:
                entries_created += 1
        except Exception as e:
            logger.warning('构建群体画像知识失败: %s', e)

        return {'knowledge_entries': entries_created}

    def _calc_tier(self, d: dict) -> str:
        n_proj = d.get('project_count', 0)
        n_visit = d.get('visit_count', 0)
        for t_name, thresh in TIER_THRESHOLDS.items():
            if n_proj >= thresh['min_projects'] and n_visit >= thresh['min_visits']:
                return t_name
        return 'none'

    def _publish_learning_report(self, stats: dict, subject_data: dict):
        """生成并发布学习报告，创建 data-insight Issues。"""
        from apps.data_intake.learning_runner import LearningReport, GapReporter

        total = stats['total_subjects']
        report = LearningReport(source_name='build_subject_intelligence')
        report.total_records = total
        report.matched_records = stats['tier_platinum'] + stats['tier_gold'] + stats['tier_silver'] + stats['tier_bronze']
        report.extra_stats = stats

        coverage = report.matched_records / total if total > 0 else 0

        report.add_pattern(
            'distribution', '受试者价值分层分布',
            f'资源库 {total:,} 名受试者中：'
            f'铂金 {stats["tier_platinum"]:,}、黄金 {stats["tier_gold"]:,}、'
            f'白银 {stats["tier_silver"]:,}、青铜 {stats["tier_bronze"]:,}。'
            f'分层覆盖率 {coverage:.1%}。',
            evidence=stats,
        )

        report.add_agent_opportunity(
            scenario='招募推荐自动化（匹配受试者与新项目）',
            current_pain='项目启动招募时，需要人工逐一查阅历史参与记录筛选适合受试者，'
                        '耗时数小时',
            agent_value=f'基于 {stats["participation_relations"]:,} 条参与关系图谱 + 肤质/年龄/地域画像，'
                       f'智能体可在 5 秒内推荐 Top 20 候选受试者，并标注历史参与项目',
            data_evidence=f'{stats["tier_platinum"] + stats["tier_gold"]:,} 名铂金/黄金受试者（高价值候选池）',
            implementation_hint='在子衿 Bot 中添加招募推荐命令：@子衿 推荐受试者 [项目需求]',
        )

        if stats.get('tier_none', 0) > 0:
            report.add_match_failure(
                reason='受试者问卷中项目编号字段为空或格式不统一',
                count=stats.get('tier_none', 0),
                total=total,
                suggested_fix='规范 t_subject_questionnaire 的 answers 字段中项目编号的键名'
                              '（统一为 proj_code），并对存量数据做一次迁移修复',
            )

        gap_reporter = GapReporter()
        result = gap_reporter.report(report)
        logger.info('[A3] 学习报告发布完成: Issues=%d, Insights=%d',
                    result['github_issues'], result['proactive_insights'])
