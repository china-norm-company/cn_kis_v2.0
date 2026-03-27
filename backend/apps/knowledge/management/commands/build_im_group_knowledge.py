"""
build_im_group_knowledge：以群为单位全量解析所有飞书IM群聊知识

核心逻辑：
  - 不用群名判断价值，而是扫描所有消息内容提取项目关联
  - 从消息内容中提取项目编号、人员、主题、里程碑信号
  - 凡是有一定数量消息的群都处理（默认 >= 10 条消息）
  - 1542 个有效群全量处理

用法：
  python manage.py build_im_group_knowledge
  python manage.py build_im_group_knowledge --min-messages 10
  python manage.py build_im_group_knowledge --dry-run
  python manage.py build_im_group_knowledge --chat-id <id>
  python manage.py build_im_group_knowledge --resume
"""
import json
import re
from collections import Counter
from datetime import datetime

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from apps.secretary.models import PersonalContext
from apps.knowledge.models import KnowledgeEntry, KnowledgeEntity, KnowledgeRelation

# ── 项目编号正则（与 build_im_project_graph 保持一致） ──────────────────────
PROJECT_RE = re.compile(
    r'\b([MCWASROF][0-9]{4,8}(?:-[0-9]+)?|SPF[0-9]{4,}|LS[0-9]{4,}|C2[0-9]{5,})\b'
)

# ── 里程碑信号词 ─────────────────────────────────────────────────────────────
MILESTONE_SIGNALS = {
    '立项': 'proj_start',
    '开题': 'proj_start',
    '启动': 'proj_start',
    '开始招募': 'recruit',
    '招募完成': 'recruit_done',
    '入组': 'enroll',
    '开始执行': 'execute',
    '数据锁定': 'data_lock',
    '数据库锁定': 'data_lock',
    'DBL': 'data_lock',
    '出报告': 'report',
    '报告发出': 'report',
    '结题': 'close',
    '项目关闭': 'close',
    '合同签署': 'contract',
    '合同盖章': 'contract',
    '方案培训': 'training',
    '项目培训': 'training',
    '伦理批件': 'ethics',
    '伦理通过': 'ethics',
    '方案偏离': 'deviation',
    '严重不良事件': 'sae',
    'SAE': 'sae',
}

# ── 主题分类词 ───────────────────────────────────────────────────────────────
TOPIC_KEYWORDS = {
    '招募': 'recruitment',
    '受试者': 'recruitment',
    '样品': 'sample',
    '检测': 'testing',
    '报告': 'report',
    '数据': 'data',
    '合同': 'contract',
    '财务': 'finance',
    '报销': 'expense',
    '差旅': 'travel',
    '培训': 'training',
    '质量': 'quality',
    '方案': 'protocol',
    '伦理': 'ethics',
    '行政': 'admin',
    '人事': 'hr',
    '设备': 'equipment',
    '客户': 'client',
    '申办': 'sponsor',
    '排班': 'scheduling',
}


def extract_text(raw_content) -> str:
    """从各种格式的飞书消息中提取纯文本。"""
    if not raw_content:
        return ''
    text = str(raw_content)
    if text.strip().startswith('{'):
        try:
            data = json.loads(text)
            parts = []
            if isinstance(data, dict):
                for key in ('text', 'content', 'msg', 'body'):
                    if key in data and isinstance(data[key], str):
                        parts.append(data[key])
                for elem in (data.get('elements') or []):
                    if isinstance(elem, list):
                        for e in elem:
                            if isinstance(e, dict) and e.get('text'):
                                parts.append(e['text'])
                    elif isinstance(elem, dict) and elem.get('text'):
                        parts.append(elem['text'])
            return ' '.join(parts) or text
        except (json.JSONDecodeError, TypeError):
            pass
    return text


def analyze_group(messages: list) -> dict:
    """
    扫描群内所有消息，提取：
    - 项目编号及出现频次
    - 参与者 open_id
    - 里程碑事件
    - 主题分类
    - 时间范围
    """
    project_counter: Counter = Counter()
    persons: set = set()
    milestones: list = []
    topics: Counter = Counter()
    timestamps: list = []

    for msg in messages:
        raw = msg.get('raw_content') or ''
        user_id = msg.get('user_id') or ''
        metadata = msg.get('metadata') or {}
        ts = metadata.get('create_time', '') if isinstance(metadata, dict) else ''

        text = extract_text(raw)
        # 去除 @提及 和 URL
        clean = re.sub(r'@[^\s]+|https?://\S+', '', text).strip()
        if not clean:
            continue

        if user_id:
            persons.add(user_id)

        if ts:
            try:
                timestamps.append(int(ts))
            except (ValueError, TypeError):
                pass

        # 提取项目编号
        for m in PROJECT_RE.finditer(clean):
            project_counter[m.group(1)] += 1

        # 里程碑信号
        for keyword, signal in MILESTONE_SIGNALS.items():
            if keyword in clean:
                proj_refs = [m.group(1) for m in PROJECT_RE.finditer(clean)]
                milestones.append({
                    'signal': signal,
                    'keyword': keyword,
                    'snippet': clean[:80],
                    'projects': proj_refs,
                })

        # 主题
        for keyword, topic in TOPIC_KEYWORDS.items():
            if keyword in clean:
                topics[topic] += 1

    date_range = {}
    if timestamps:
        try:
            date_range = {
                'first': datetime.fromtimestamp(min(timestamps)).strftime('%Y-%m-%d'),
                'last': datetime.fromtimestamp(max(timestamps)).strftime('%Y-%m-%d'),
            }
        except (OSError, OverflowError, ValueError):
            pass

    return {
        'projects': dict(project_counter.most_common(20)),
        'persons': list(persons),
        'milestones': milestones[:30],
        'topics': dict(topics.most_common(10)),
        'date_range': date_range,
    }


def upsert_entity(uri: str, label: str, entity_type: str,
                  namespace: str = 'cnkis', definition: str = '',
                  properties: dict = None):
    """幂等创建/更新 KnowledgeEntity。"""
    defaults = {
        'label': label[:500],
        'entity_type': entity_type[:20],
        'namespace': namespace[:30],
        'definition': definition,
    }
    if properties:
        defaults['properties'] = properties
    ent, created = KnowledgeEntity.objects.get_or_create(
        uri=uri[:500],
        defaults=defaults,
    )
    if not created and ent.label != label[:500]:
        ent.label = label[:500]
        ent.save(update_fields=['label'])
    return ent, created


def upsert_relation(subj, relation_type: str, obj, source: str = '',
                    confidence: float = 0.8, metadata: dict = None):
    """幂等创建 KnowledgeRelation（按 subject+relation_type+object 去重）。"""
    rel_type = relation_type[:30]
    qs = KnowledgeRelation.objects.filter(
        subject=subj, relation_type=rel_type, object=obj, is_deleted=False
    )
    if qs.exists():
        return qs.first(), False
    rel = KnowledgeRelation.objects.create(
        subject=subj,
        relation_type=rel_type,
        predicate_uri=f'cnkis:{rel_type}',
        object=obj,
        source=source[:100],
        confidence=confidence,
        metadata=metadata or {},
    )
    return rel, True


class Command(BaseCommand):
    help = '以群为单位全量解析飞书IM群聊：不依赖群名，从内容提取项目/人员/里程碑知识'

    def add_arguments(self, parser):
        parser.add_argument('--min-messages', type=int, default=10,
                            help='最少消息数（默认 10）')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--chat-id', type=str, default='')
        parser.add_argument('--resume', action='store_true',
                            help='跳过已有 KnowledgeEntry 的群')
        parser.add_argument('--max-msgs-per-group', type=int, default=2000,
                            help='每群最多采样消息数（0=全量）')

    def handle(self, *args, **options):
        min_msgs = options['min_messages']
        dry_run = options['dry_run']
        target_chat = options['chat_id']
        resume = options['resume']
        max_msgs = options['max_msgs_per_group']

        self.stdout.write('=' * 70)
        self.stdout.write('build_im_group_knowledge：飞书IM群聊全量知识解析')
        self.stdout.write(f'  最少消息数阈值: {min_msgs}')
        self.stdout.write(f'  每群最大采样: {"全量" if max_msgs == 0 else max_msgs}')
        self.stdout.write(f'  Dry-run: {dry_run}')
        self.stdout.write('=' * 70)

        # 已处理群（resume 模式）
        done_keys: set = set()
        if resume and not dry_run:
            done_keys = set(
                KnowledgeEntry.objects.filter(
                    source_type='im_group_summary'
                ).values_list('source_key', flat=True)
            )
            self.stdout.write(f'已处理群（跳过）: {len(done_keys)}')

        # 获取全部有效群
        qs = PersonalContext.objects.filter(source_type='im')
        if target_chat:
            qs = qs.filter(metadata__chat_id=target_chat)

        groups = list(
            qs.values('metadata__chat_id', 'metadata__chat_name')
            .annotate(msg_count=Count('id'))
            .filter(msg_count__gte=min_msgs)
            .order_by('-msg_count')
        )
        total = len(groups)
        self.stdout.write(f'\n待处理群总数: {total}（消息 >= {min_msgs} 条）')

        if dry_run:
            self.stdout.write('\n[Dry-run 预览—前30个群]:')
            for i, g in enumerate(groups[:30]):
                name = (g['metadata__chat_name'] or '(无名)')[:50]
                done = ' [已处理]' if f"im_group:{g['metadata__chat_id']}" in done_keys else ''
                self.stdout.write(f"  {i+1:4d}. [{g['msg_count']:6,}条] {name}{done}")
            return

        stats = dict(
            processed=0, skipped=0,
            entries_new=0, entries_updated=0,
            relations_new=0,
            groups_with_projects=0, groups_no_projects=0,
        )

        # 预构建 open_id → Account 映射
        from apps.identity.models import Account
        acc_map = {
            a.feishu_open_id: a
            for a in Account.objects.filter(is_deleted=False).exclude(feishu_open_id='')
        }

        for idx, group in enumerate(groups):
            chat_id = group['metadata__chat_id'] or ''
            chat_name = (group['metadata__chat_name'] or f'(群:{chat_id[:8]})').strip()
            msg_count = group['msg_count']
            source_key = ('im_group:' + chat_id)[:120]

            if resume and source_key in done_keys:
                stats['skipped'] += 1
                continue

            if idx % 100 == 0:
                self.stdout.write(
                    f'进度 {idx}/{total} | Entry新建:{stats["entries_new"]} '
                    f'关系:{stats["relations_new"]} 项目群:{stats["groups_with_projects"]}'
                )

            # 获取消息
            msg_qs = PersonalContext.objects.filter(
                source_type='im', metadata__chat_id=chat_id,
            ).values('raw_content', 'user_id', 'metadata')
            if max_msgs > 0:
                msg_qs = msg_qs[:max_msgs]
            messages = list(msg_qs)

            # 分析群内容
            analysis = analyze_group(messages)
            projects = analysis['projects']
            persons = analysis['persons']
            milestones = analysis['milestones']
            topics = analysis['topics']
            date_range = analysis['date_range']

            if projects:
                stats['groups_with_projects'] += 1
            else:
                stats['groups_no_projects'] += 1

            # 构造摘要文本
            proj_str = ', '.join(
                f'{p}({c}次)' for p, c in
                sorted(projects.items(), key=lambda x: -x[1])[:10]
            ) if projects else '（未识别项目编号）'
            topic_str = ', '.join(f'{k}({v})' for k, v in list(topics.items())[:6])
            ms_str = '; '.join(set(m['keyword'] for m in milestones[:10])) if milestones else ''
            date_str = (
                f"{date_range.get('first', '')} ~ {date_range.get('last', '')}"
                if date_range else ''
            )

            content_lines = [
                f'【群聊】{chat_name}',
                f'消息量: {msg_count} 条',
            ]
            if date_str:
                content_lines.append(f'活跃时间: {date_str}')
            content_lines.append(f'涉及项目: {proj_str}')
            if topic_str:
                content_lines.append(f'主要话题: {topic_str}')
            if ms_str:
                content_lines.append(f'里程碑事件: {ms_str}')
            content_lines.append(f'参与账号数: {len(persons)}')
            content = '\n'.join(content_lines)

            namespace = ('im:' + chat_id)[:30]
            title = f'[IM群] {chat_name}'[:500]
            summary = (
                f'群聊「{chat_name}」，消息{msg_count}条'
                + (f'，涉及项目：{", ".join(list(projects.keys())[:5])}' if projects else '')
            )

            with transaction.atomic():
                existing = KnowledgeEntry.objects.filter(source_key=source_key).first()
                if existing:
                    existing.content = content
                    existing.summary = summary
                    existing.title = title
                    existing.quality_score = min(
                        1.0, 0.3 + len(projects) * 0.15 + len(milestones) * 0.05
                    )
                    existing.save(update_fields=[
                        'content', 'summary', 'title', 'quality_score'
                    ])
                    stats['entries_updated'] += 1
                else:
                    KnowledgeEntry.objects.create(
                        title=title,
                        source_type='im_group_summary',
                        source_key=source_key,
                        content=content,
                        summary=summary,
                        namespace=namespace,
                        status='published',
                        is_published=True,
                        is_deleted=False,
                        quality_score=min(
                            1.0, 0.3 + len(projects) * 0.15 + len(milestones) * 0.05
                        ),
                        tags={
                            'chat_id': chat_id,
                            'chat_name': chat_name,
                            'msg_count': msg_count,
                            'projects': list(projects.keys())[:10],
                            'topics': list(topics.keys())[:8],
                            'date_range': date_range,
                            'milestone_count': len(milestones),
                        },
                    )
                    stats['entries_new'] += 1

                # 建群实体
                group_ent, _ = upsert_entity(
                    uri=f'im_group:{chat_id}',
                    label=chat_name[:500],
                    entity_type='im_group',
                    namespace='cnkis',
                    definition=f'飞书IM群聊：{chat_name}，共{msg_count}条消息',
                    properties={
                        'chat_id': chat_id,
                        'msg_count': msg_count,
                        'topics': list(topics.keys())[:5],
                    },
                )

                # 对每个项目编号建 群→项目 关联
                for proj_no, mention_count in projects.items():
                    proj_ent, _ = upsert_entity(
                        uri=f'project:{proj_no}',
                        label=proj_no,
                        entity_type='project',
                        namespace='cnkis',
                        properties={'code': proj_no},
                    )
                    _, rel_new = upsert_relation(
                        group_ent, 'discusses_project', proj_ent,
                        source='im_group_scan',
                        confidence=min(1.0, 0.3 + mention_count * 0.07),
                        metadata={
                            'mention_count': mention_count,
                            'chat_name': chat_name[:50],
                        },
                    )
                    if rel_new:
                        stats['relations_new'] += 1

                    # 对每个参与者建 人员→项目 关联
                    for open_id in persons[:40]:
                        if not open_id:
                            continue
                        acc = acc_map.get(open_id)
                        person_label = (acc.display_name or open_id[:12]) if acc else open_id[:12]
                        person_ent, _ = upsert_entity(
                            uri=f'person:{open_id}',
                            label=person_label[:500],
                            entity_type='person',
                            namespace='cnkis',
                            properties={'open_id': open_id},
                        )
                        _, rel_new2 = upsert_relation(
                            person_ent, 'in_project', proj_ent,
                            source='im_group_member',
                            confidence=0.7,
                            metadata={
                                'via_group': chat_name[:50],
                                'chat_id': chat_id,
                                'proj_mentions': mention_count,
                            },
                        )
                        if rel_new2:
                            stats['relations_new'] += 1

                # 里程碑事件关联
                seen_ms = set()
                for ms in milestones[:10]:
                    for proj_no in ms.get('projects', []):
                        if not proj_no:
                            continue
                        ms_uri = f'ms:{proj_no}:{ms["signal"]}:{chat_id[:8]}'
                        if ms_uri in seen_ms:
                            continue
                        seen_ms.add(ms_uri)
                        proj_ent, _ = upsert_entity(
                            uri=f'project:{proj_no}',
                            label=proj_no,
                            entity_type='project',
                            namespace='cnkis',
                        )
                        ms_ent, _ = upsert_entity(
                            uri=ms_uri,
                            label=f'{proj_no}·{ms["keyword"]}',
                            entity_type='milestone',
                            namespace='cnkis',
                            definition=ms['snippet'][:200],
                            properties={
                                'signal': ms['signal'],
                                'keyword': ms['keyword'],
                                'chat_id': chat_id,
                                'chat_name': chat_name[:30],
                            },
                        )
                        _, rel_new3 = upsert_relation(
                            ms_ent, 'milestone_of', proj_ent,
                            source='im_milestone',
                            confidence=0.85,
                        )
                        if rel_new3:
                            stats['relations_new'] += 1

            stats['processed'] += 1

        self.stdout.write('\n' + '=' * 70)
        self.stdout.write('完成！')
        self.stdout.write(f'  处理群数:           {stats["processed"]}')
        self.stdout.write(f'  跳过群数:           {stats["skipped"]}')
        self.stdout.write(f'  含项目编号的群:      {stats["groups_with_projects"]}')
        self.stdout.write(f'  无项目编号的群:      {stats["groups_no_projects"]}')
        self.stdout.write(f'  KnowledgeEntry 新建: {stats["entries_new"]}')
        self.stdout.write(f'  KnowledgeEntry 更新: {stats["entries_updated"]}')
        self.stdout.write(f'  知识图谱关系 新建:   {stats["relations_new"]}')
