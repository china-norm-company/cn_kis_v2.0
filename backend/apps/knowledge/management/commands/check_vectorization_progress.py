"""
check_vectorization_progress — 飞书数据加工全链路进度追踪

追踪四个阶段的处理状态：
  Step 1: PersonalContext（飞书原始采集数据）
  Step 2: KnowledgeEntry（ingestion pipeline 入库结果）
  Step 3: 向量化（embedding 生成与 Qdrant/pgvector 写入）
  Step 4: 知识图谱（KnowledgeEntity + KnowledgeRelation）

每次运行自动与上次快照对比，输出增量，确保后续任务不重复。
快照存储于：logs/vectorization_progress.json

用法：
  python manage.py check_vectorization_progress
  python manage.py check_vectorization_progress --json       # JSON 格式输出
  python manage.py check_vectorization_progress --save       # 保存当前快照
  python manage.py check_vectorization_progress --reset      # 清除历史快照
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)

import os as _os

# 快照文件路径：优先使用环境变量 VECTORIZATION_SNAPSHOT_DIR，
# 否则自动推断到项目根目录 logs/（兼容本地开发和生产服务器）
_default_logs = Path(__file__).resolve().parents[5] / 'logs'
SNAPSHOT_DIR = Path(_os.getenv('VECTORIZATION_SNAPSHOT_DIR', str(_default_logs)))
SNAPSHOT_FILE = SNAPSHOT_DIR / 'vectorization_progress.json'


class Command(BaseCommand):
    help = '展示飞书数据加工全链路进度（PersonalContext → KnowledgeEntry → 向量化 → 图谱）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--json', dest='output_json', action='store_true',
            help='以 JSON 格式输出',
        )
        parser.add_argument(
            '--save', action='store_true',
            help='将本次统计保存为快照（默认每次运行均保存）',
        )
        parser.add_argument(
            '--reset', action='store_true',
            help='清除历史快照记录',
        )

    def handle(self, *args, **options):
        output_json = options['output_json']
        do_save = options.get('save', True)  # 默认保存
        do_reset = options['reset']

        if do_reset:
            if SNAPSHOT_FILE.exists():
                SNAPSHOT_FILE.unlink()
                self.stdout.write(self.style.WARNING('历史快照已清除'))
            else:
                self.stdout.write('无历史快照')
            return

        prev_snapshot = self._load_prev_snapshot()
        current = self._collect_stats()
        current['snapshot_at'] = datetime.now(timezone.utc).isoformat()

        if output_json:
            self.stdout.write(json.dumps(current, ensure_ascii=False, indent=2))
        else:
            self._print_report(current, prev_snapshot)

        # 保存快照（始终保存，方便下次对比）
        self._save_snapshot(current)

    def _collect_stats(self) -> dict:
        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntry, KnowledgeEntity, KnowledgeRelation
        from django.db.models import Count

        # ── Step 1: PersonalContext ──────────────────────────────────────
        pc_total = PersonalContext.objects.count()
        pc_by_type = dict(
            PersonalContext.objects.values('source_type')
            .annotate(n=Count('id'))
            .values_list('source_type', 'n')
        )

        # ── Step 2: KnowledgeEntry ───────────────────────────────────────
        ke_feishu_total = KnowledgeEntry.objects.filter(
            source_type__startswith='feishu_',
            is_deleted=False,
        ).count()
        ke_feishu_by_type = dict(
            KnowledgeEntry.objects.filter(
                source_type__startswith='feishu_',
                is_deleted=False,
            ).values('entry_type').annotate(n=Count('id')).values_list('entry_type', 'n')
        )
        ke_all_total = KnowledgeEntry.objects.filter(is_deleted=False).count()

        # ── Step 3: 向量化 ───────────────────────────────────────────────
        index_counts = dict(
            KnowledgeEntry.objects.filter(is_deleted=False)
            .values('index_status').annotate(n=Count('id'))
            .values_list('index_status', 'n')
        )
        indexed = index_counts.get('indexed', 0)
        pending = index_counts.get('pending', 0)
        failed = index_counts.get('failed', 0)

        # 飞书来源的向量化状态
        ke_feishu_index = dict(
            KnowledgeEntry.objects.filter(
                source_type__startswith='feishu_',
                is_deleted=False,
            ).values('index_status').annotate(n=Count('id'))
            .values_list('index_status', 'n')
        )

        # Qdrant collection 状态（可选）
        qdrant_count = self._get_qdrant_count()

        # ── Step 4: 知识图谱 ──────────────────────────────────────────────
        entity_total = KnowledgeEntity.objects.filter(is_deleted=False).count()
        entity_by_type = dict(
            KnowledgeEntity.objects.filter(is_deleted=False)
            .values('entity_type').annotate(n=Count('id'))
            .values_list('entity_type', 'n')
        )
        relation_total = KnowledgeRelation.objects.filter(is_deleted=False).count()
        relation_by_type = dict(
            KnowledgeRelation.objects.filter(is_deleted=False)
            .values('relation_type').annotate(n=Count('id'))
            .values_list('relation_type', 'n')
        )

        return {
            'step1_personal_context': {
                'total': pc_total,
                'by_type': pc_by_type,
            },
            'step2_knowledge_entry': {
                'feishu_total': ke_feishu_total,
                'all_total': ke_all_total,
                'by_type': ke_feishu_by_type,
            },
            'step3_vectorization': {
                'all_indexed': indexed,
                'all_pending': pending,
                'all_failed': failed,
                'all_total': ke_all_total,
                'feishu_indexed': ke_feishu_index.get('indexed', 0),
                'feishu_pending': ke_feishu_index.get('pending', 0),
                'feishu_failed': ke_feishu_index.get('failed', 0),
                'qdrant_count': qdrant_count,
            },
            'step4_knowledge_graph': {
                'entity_total': entity_total,
                'relation_total': relation_total,
                'entity_by_type': entity_by_type,
                'relation_by_type': relation_by_type,
            },
        }

    def _get_qdrant_count(self) -> int:
        try:
            import urllib.request
            qdrant_url = os.getenv('QDRANT_URL', 'http://localhost:6333')
            url = f'{qdrant_url}/collections/cn_kis_knowledge'
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read())
                return data.get('result', {}).get('points_count', 0)
        except Exception:
            return -1  # -1 表示无法连接

    def _print_report(self, curr: dict, prev: dict):
        def _delta(curr_val, prev_val, label=''):
            if prev_val is None or prev_val < 0:
                return ''
            d = curr_val - prev_val
            if d == 0:
                return ''
            sign = '+' if d > 0 else ''
            return f'  [{sign}{d} 自上次]'

        prev_step1 = prev.get('step1_personal_context', {}) if prev else {}
        prev_step2 = prev.get('step2_knowledge_entry', {}) if prev else {}
        prev_step3 = prev.get('step3_vectorization', {}) if prev else {}
        prev_step4 = prev.get('step4_knowledge_graph', {}) if prev else {}

        snap_time = prev.get('snapshot_at', '') if prev else ''
        if snap_time:
            try:
                dt = datetime.fromisoformat(snap_time)
                snap_time = dt.strftime('%Y-%m-%d %H:%M')
            except Exception:
                pass

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('  飞书数据加工全链路进度'))
        self.stdout.write(self.style.SUCCESS('=' * 60))
        if snap_time:
            self.stdout.write(f'  （对比上次快照：{snap_time}）')
        self.stdout.write('')

        # Step 1
        s1 = curr['step1_personal_context']
        pc_total = s1['total']
        prev_pc = prev_step1.get('total', None)
        self.stdout.write(
            self.style.HTTP_INFO('Step 1 — PersonalContext（飞书原始采集）')
        )
        self.stdout.write(
            f'  总量: {pc_total:,} 条{_delta(pc_total, prev_pc)}'
        )
        for src_type, cnt in sorted(s1['by_type'].items(), key=lambda x: -x[1]):
            self.stdout.write(f'    {src_type:<20}: {cnt:,}')

        # Step 2
        s2 = curr['step2_knowledge_entry']
        ke_feishu = s2['feishu_total']
        ke_all = s2['all_total']
        prev_ke_feishu = prev_step2.get('feishu_total', None)
        pct2 = round(ke_feishu / max(pc_total, 1) * 100, 1)
        self.stdout.write('')
        self.stdout.write(
            self.style.HTTP_INFO('Step 2 — KnowledgeEntry（ingestion pipeline 入库）')
        )
        self.stdout.write(
            f'  飞书来源: {ke_feishu:,} / {pc_total:,} ({pct2}%){_delta(ke_feishu, prev_ke_feishu)}'
        )
        self.stdout.write(f'  全库总量: {ke_all:,}')
        for etype, cnt in sorted(s2['by_type'].items(), key=lambda x: -x[1]):
            self.stdout.write(f'    {etype:<25}: {cnt:,}')

        # Step 3
        s3 = curr['step3_vectorization']
        all_indexed = s3['all_indexed']
        all_pending = s3['all_pending']
        all_failed = s3['all_failed']
        all_total = s3['all_total']
        qdrant_ct = s3['qdrant_count']
        prev_indexed = prev_step3.get('all_indexed', None)
        pct3 = round(all_indexed / max(all_total, 1) * 100, 1)
        self.stdout.write('')
        self.stdout.write(
            self.style.HTTP_INFO('Step 3 — 向量化（jina-embeddings-v3 1024维 → pgvector/Qdrant）')
        )
        self.stdout.write(
            f'  已索引(indexed): {all_indexed:,} / {all_total:,} ({pct3}%){_delta(all_indexed, prev_indexed)}'
        )
        self.stdout.write(
            f'  待处理(pending): {all_pending:,}'
        )
        self.stdout.write(
            f'  失败(failed):    {all_failed:,}' if all_failed else '  失败(failed):    0'
        )
        if qdrant_ct >= 0:
            self.stdout.write(
                f'  Qdrant 向量点:   {qdrant_ct:,}'
            )
        else:
            self.stdout.write(
                self.style.WARNING('  Qdrant:          无法连接（localhost:6333）')
            )
        # 飞书来源向量化
        f_idx = s3['feishu_indexed']
        f_pen = s3['feishu_pending']
        f_fai = s3['feishu_failed']
        f_total = f_idx + f_pen + f_fai
        if f_total > 0:
            f_pct = round(f_idx / f_total * 100, 1)
            self.stdout.write(
                f'  （飞书来源向量化率: {f_idx:,}/{f_total:,} = {f_pct}%）'
            )

        # Step 4
        s4 = curr['step4_knowledge_graph']
        ent_total = s4['entity_total']
        rel_total = s4['relation_total']
        prev_ent = prev_step4.get('entity_total', None)
        prev_rel = prev_step4.get('relation_total', None)
        self.stdout.write('')
        self.stdout.write(
            self.style.HTTP_INFO('Step 4 — 知识图谱（KnowledgeEntity + KnowledgeRelation）')
        )
        self.stdout.write(
            f'  实体总量: {ent_total:,}{_delta(ent_total, prev_ent)}'
        )
        self.stdout.write(
            f'  关系总量: {rel_total:,}{_delta(rel_total, prev_rel)}'
        )
        if s4['entity_by_type']:
            for etype, cnt in sorted(s4['entity_by_type'].items(), key=lambda x: -x[1])[:8]:
                self.stdout.write(f'    {etype:<25}: {cnt:,}')
        if s4['relation_by_type']:
            for rtype, cnt in sorted(s4['relation_by_type'].items(), key=lambda x: -x[1])[:6]:
                self.stdout.write(f'    {rtype:<25}: {cnt:,}')

        # 总览
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        all_done = (all_pending == 0 and all_failed == 0 and ke_feishu > 0 and ent_total > 0)
        if all_done:
            self.stdout.write(self.style.SUCCESS('  全链路处理完成！'))
        else:
            remaining = []
            if ke_feishu < pc_total:
                remaining.append(f'待入库: {pc_total - ke_feishu:,} 条 PersonalContext')
            if all_pending > 0:
                remaining.append(f'待向量化: {all_pending:,} 条 KnowledgeEntry')
            if all_failed > 0:
                remaining.append(f'向量化失败: {all_failed:,} 条（可用 --retry-failed 重试）')
            if ent_total == 0:
                remaining.append('知识图谱尚未构建')
            for r in remaining:
                self.stdout.write(self.style.WARNING(f'  待完成: {r}'))
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(f'  快照已保存至: {SNAPSHOT_FILE}')
        self.stdout.write('')

    def _load_prev_snapshot(self) -> dict:
        if not SNAPSHOT_FILE.exists():
            return {}
        try:
            with open(SNAPSHOT_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            # 支持新旧两种格式：旧格式直接是快照，新格式是 list
            if isinstance(data, list):
                return data[-1] if data else {}
            return data
        except Exception:
            return {}

    def _save_snapshot(self, current: dict):
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        # 追加模式：保存最近 30 次快照
        history = []
        if SNAPSHOT_FILE.exists():
            try:
                with open(SNAPSHOT_FILE, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
                if isinstance(existing, list):
                    history = existing[-29:]
                elif isinstance(existing, dict):
                    history = [existing]
            except Exception:
                history = []
        history.append(current)
        with open(SNAPSHOT_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
