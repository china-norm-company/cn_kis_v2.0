"""
build_im_project_graph — 从飞书 IM 群聊中提取项目全生命周期协作图谱

核心价值：
  IM 群聊是项目生命周期中协作、角色分工、问题暴露最真实的记录。
  群名 = 项目编号 + 阶段关键词；消息 = 谁参与了该阶段的哪类工作。

提取内容：
  1. 项目 → 生命周期阶段（群名中的业务关键词）
  2. 人员 → 参与项目（sender_id 映射到 Account.feishu_open_id）
  3. 人员 → 项目中的阶段角色（消息内容关键词推断）
  4. 项目群摘要 KnowledgeEntry（群内讨论的核心问题）

用法：
  python manage.py build_im_project_graph
  python manage.py build_im_project_graph --dry-run
  python manage.py build_im_project_graph --limit 100   # 只处理前100个群
  python manage.py build_im_project_graph --min-msgs 5  # 只处理消息>=5条的群
"""
import re
import logging
from collections import defaultdict
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)

# ── 生命周期阶段识别规则 ─────────────────────────────────────────────────────
STAGE_RULES = [
    (re.compile(r'招募|受试者招募|筛选|入组', re.I), 'lifecycle:受试者招募'),
    (re.compile(r'EDC|edc上线|配置|数据系统', re.I), 'lifecycle:数据采集配置'),
    (re.compile(r'执行|采样|实验|实施|操作', re.I), 'lifecycle:临床执行'),
    (re.compile(r'监察|CRA|SDV|稽查', re.I), 'lifecycle:数据监察'),
    (re.compile(r'数据|统计|分析|清洗', re.I), 'lifecycle:数据处理'),
    (re.compile(r'报告|撰写|QC|质控|报告QC', re.I), 'lifecycle:报告交付'),
    (re.compile(r'方案|protocol|立项|讨论|设计', re.I), 'lifecycle:方案立项'),
    (re.compile(r'合同|报价|报批|商务|询价|立项申请', re.I), 'lifecycle:商务立项'),
    (re.compile(r'启动|SIV|培训|kickoff|沟通会|项目启动', re.I), 'lifecycle:项目启动'),
    (re.compile(r'关闭|结题|归档|结束', re.I), 'lifecycle:项目关闭'),
    (re.compile(r'沟通|推进|跟进|进展', re.I), 'lifecycle:项目沟通'),
]

# ── 角色关键词映射 ───────────────────────────────────────────────────────────
ROLE_KEYWORDS = [
    (re.compile(r'crf|CRF|表格|数据采集表'), 'role:研究员'),
    (re.compile(r'edc|EDC|数据录入|系统配置'), 'role:EDC专员'),
    (re.compile(r'受试者|招募|筛选|入组'), 'role:临床执行'),
    (re.compile(r'报告|撰写|统计|分析'), 'role:报告人员'),
    (re.compile(r'qc|QC|质控|审核|质量'), 'role:质量人员'),
    (re.compile(r'排程|schedule|安排|预约'), 'role:项目协调'),
    (re.compile(r'合同|报价|商务|客户'), 'role:商务人员'),
    (re.compile(r'监察|CRA|SDV'), 'role:监察员'),
    (re.compile(r'皮肤|检测|仪器|测量'), 'role:实验室人员'),
]

# ── 项目编号识别 ─────────────────────────────────────────────────────────────
PROJECT_RE = re.compile(
    r'\b([MCWASRO][0-9]{5,}|SPF[0-9]{4,}|LS[0-9]{4,}|C2[0-9]{6,})\b'
)


def detect_stage(chat_name: str) -> str:
    for pattern, stage in STAGE_RULES:
        if pattern.search(chat_name):
            return stage
    return 'lifecycle:项目沟通'


def detect_roles_from_content(content: str) -> list:
    roles = set()
    for pattern, role in ROLE_KEYWORDS:
        if pattern.search(content):
            roles.add(role)
    return list(roles)


class Command(BaseCommand):
    help = '从飞书 IM 群聊提取项目生命周期协作图谱'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='只统计，不写入')
        parser.add_argument('--limit', type=int, default=0, help='处理群的数量上限（0=全部）')
        parser.add_argument('--min-msgs', type=int, default=3, help='最少消息数才处理的群')
        parser.add_argument('--reset', action='store_true', help='删除已有 IM 图谱关系后重建')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        limit = options['limit']
        min_msgs = options['min_msgs']
        reset = options['reset']

        from apps.secretary.models import PersonalContext
        from apps.knowledge.models import KnowledgeEntry, KnowledgeEntity, KnowledgeRelation
        from apps.identity.models import Account
        from django.db.models import Count

        self.stdout.write(f'\n{"="*65}')
        self.stdout.write('  IM 项目生命周期图谱构建')
        self.stdout.write(f'{"="*65}')
        self.stdout.write(f'  模式: {"DRY-RUN" if dry_run else "正式写入"}'
                          f'  min_msgs={min_msgs}'
                          f'{"  limit=" + str(limit) if limit else ""}')
        self.stdout.write(f'{"="*65}\n')

        # ── Step 0: 可选 reset ───────────────────────────────────────────────
        if reset and not dry_run:
            deleted, _ = KnowledgeRelation.objects.filter(
                source__startswith='im_graph:'
            ).delete()
            KnowledgeEntry.objects.filter(source_type='im_project_group').delete()
            self.stdout.write(f'[reset] 已删除旧 IM 图谱关系 {deleted} 条')

        # ── Step 1: 构建 Account feishu_open_id 映射 ─────────────────────────
        self.stdout.write('\n[Step 1] 构建人员身份映射...')
        open_id_to_account = {}
        for acc in Account.objects.filter(is_deleted=False).exclude(feishu_open_id=''):
            open_id_to_account[acc.feishu_open_id] = acc
        self.stdout.write(f'  已知飞书账户: {len(open_id_to_account)} 人')

        # ── Step 2: 获取所有含项目编号的群 ────────────────────────────────────
        self.stdout.write('\n[Step 2] 扫描项目相关群聊...')
        all_groups = PersonalContext.objects.filter(
            source_type='im'
        ).exclude(
            metadata__chat_name=None
        ).values('metadata__chat_id', 'metadata__chat_name').annotate(
            msg_count=Count('id')
        ).filter(msg_count__gte=min_msgs).order_by('-msg_count')

        project_groups = []
        for g in all_groups:
            name = g['metadata__chat_name'] or ''
            if PROJECT_RE.search(name):
                project_groups.append(g)

        if limit:
            project_groups = project_groups[:limit]

        self.stdout.write(f'  项目相关群: {len(project_groups)} 个（共 {all_groups.count()} 群中筛选）')

        # ── Step 3: 构建/获取 KnowledgeEntity ──────────────────────────────
        self.stdout.write('\n[Step 3] 准备知识实体...')

        def upsert_entity(uri, label, entity_type, namespace='cnkis', definition=''):
            if dry_run:
                return None
            ent, _ = KnowledgeEntity.objects.get_or_create(
                uri=uri,
                defaults={
                    'label': label,
                    'entity_type': entity_type,
                    'namespace': namespace,
                    'definition': definition,
                    'is_deleted': False,
                }
            )
            return ent

        def upsert_relation(subj, pred, obj, source='', confidence=0.8):
            if dry_run or not subj or not obj:
                return
            qs = KnowledgeRelation.objects.filter(
                subject=subj, relation_type=pred, object=obj
            )
            if not qs.exists():
                KnowledgeRelation.objects.create(
                    subject=subj,
                    relation_type=pred,
                    object=obj,
                    predicate_uri=f'cnkis:{pred}',
                    source=source[:200],
                    confidence=confidence,
                )

        # ── Step 4: 预生成生命周期阶段实体 ────────────────────────────────────
        stage_entity_map = {}
        all_stages = set(stage for _, stage in STAGE_RULES)
        for stage_key in all_stages:
            stage_label = stage_key.replace('lifecycle:', '')
            ent = upsert_entity(
                uri=f'cnkis:lifecycle:{stage_label}',
                label=stage_label,
                entity_type='lifecycle_stage',
                definition=f'项目生命周期阶段：{stage_label}',
            )
            stage_entity_map[stage_key] = ent

        # ── Step 5: 逐群处理 ────────────────────────────────────────────────
        self.stdout.write(f'\n[Step 4] 处理 {len(project_groups)} 个项目群...\n')

        stats = {
            'groups_processed': 0,
            'relations_created': 0,
            'entries_created': 0,
            'persons_linked': 0,
            'stage_assignments': defaultdict(int),
            'role_assignments': defaultdict(int),
        }
        dry_stats = {
            'relations': 0,
            'entries': 0,
            'persons': 0,
        }

        for i, group in enumerate(project_groups):
            chat_id = group['metadata__chat_id']
            chat_name = group['metadata__chat_name'] or ''
            msg_count = group['msg_count']

            # 提取项目编号
            proj_matches = PROJECT_RE.findall(chat_name)
            if not proj_matches:
                continue
            proj_no = proj_matches[0]

            # 识别生命周期阶段
            stage_key = detect_stage(chat_name)
            stage_label = stage_key.replace('lifecycle:', '')
            stats['stage_assignments'][stage_label] += 1

            # 获取项目实体
            proj_entity = upsert_entity(
                uri=f'cnkis:project:{proj_no}',
                label=proj_no,
                entity_type='project',
            )

            # 关联项目 → 生命周期阶段
            stage_entity = stage_entity_map.get(stage_key)
            upsert_relation(
                proj_entity, 'has_lifecycle_stage', stage_entity,
                source=f'im_graph:{chat_id}',
                confidence=0.9,
            )
            if dry_run:
                dry_stats['relations'] += 1

            # ── Step 5a: 获取该群所有消息（无上限，chat_id 即项目作用域）──────
            messages = PersonalContext.objects.filter(
                source_type='im',
                metadata__chat_id=chat_id,
                metadata__msg_type='text',
            ).values('user_id', 'metadata__sender_id', 'raw_content')

            # 收集参与者
            participants = set()
            content_pool = []
            role_signals = defaultdict(set)  # sender_id → detected roles

            for msg in messages:
                sender_id = (msg['metadata__sender_id'] or msg['user_id'] or '').strip()
                content = (msg['raw_content'] or '')

                if sender_id and sender_id.startswith('ou_'):
                    participants.add(sender_id)

                if isinstance(content, str) and len(content) > 3:
                    content_pool.append(content[:200])
                    if sender_id:
                        for role in detect_roles_from_content(content):
                            role_signals[sender_id].add(role)

            # ── Step 5b: 建立人员 → 项目阶段 关系 ─────────────────────────
            for sender_id in participants:
                account = open_id_to_account.get(sender_id)
                if not account:
                    continue

                person_entity = upsert_entity(
                    uri=f'cnkis:person:{account.feishu_open_id}',
                    label=account.display_name or account.username,
                    entity_type='person',
                )

                # 人员参与了项目的某个阶段
                upsert_relation(
                    person_entity, 'participated_in_stage',
                    stage_entity or proj_entity,
                    source=f'im_graph:{chat_id}',
                    confidence=0.85,
                )
                upsert_relation(
                    person_entity, 'involved_in',
                    proj_entity,
                    source=f'im_graph:{chat_id}',
                    confidence=0.85,
                )

                # 角色推断关系
                for role_key in role_signals.get(sender_id, []):
                    role_label = role_key.replace('role:', '')
                    role_entity = upsert_entity(
                        uri=f'cnkis:role:{role_label}',
                        label=role_label,
                        entity_type='role',
                    )
                    upsert_relation(
                        person_entity, 'performs_role',
                        role_entity,
                        source=f'im_graph:{chat_id}',
                        confidence=0.7,
                    )
                    stats['role_assignments'][role_label] += 1

                stats['persons_linked'] += 1
                if dry_run:
                    dry_stats['persons'] += 1

            # ── Step 5c: 生成项目群 KnowledgeEntry 摘要 ────────────────────
            if not dry_run and content_pool:
                combined_content = '\n'.join(content_pool[:80])
                entry_title = f'[IM群] {chat_name[:60]}'
                entry_source = f'feishu_im_group:{chat_id}'

                existing = KnowledgeEntry.objects.filter(source_key=entry_source).first()
                if not existing:
                    KnowledgeEntry.objects.create(
                        title=entry_title,
                        source_type='im_project_group',
                        source_key=entry_source,
                        content=combined_content,
                        summary=f'项目{proj_no} {stage_label}阶段IM协作记录，'
                                f'参与{len(participants)}人，共{msg_count}条消息',
                        namespace=f'project:{proj_no}',
                        status='published',
                        is_published=True,
                        is_deleted=False,
                    )
                    stats['entries_created'] += 1
                    if dry_run:
                        dry_stats['entries'] += 1

            stats['groups_processed'] += 1

            if (i + 1) % 50 == 0:
                self.stdout.write(
                    f'  进度: {i+1}/{len(project_groups)} 群  '
                    f'关系: {stats["relations_created"]}  '
                    f'人员: {stats["persons_linked"]}'
                )

        # ── 统计输出 ─────────────────────────────────────────────────────────
        self.stdout.write(f'\n{"="*65}')
        self.stdout.write('  处理完成')
        self.stdout.write(f'{"="*65}')
        self.stdout.write(f'  处理群数:    {stats["groups_processed"]}')
        self.stdout.write(f'  人员关联:    {stats["persons_linked"]}')
        self.stdout.write(f'  KnowledgeEntry 新建: {stats["entries_created"]}')
        if dry_run:
            from apps.knowledge.models import KnowledgeRelation
            self.stdout.write(f'  [dry-run] 预估新建关系: {dry_stats["relations"]}')

        self.stdout.write('\n  [生命周期阶段分布]')
        for stage, cnt in sorted(stats['stage_assignments'].items(), key=lambda x: -x[1]):
            self.stdout.write(f'    {stage:<20s}: {cnt} 群')

        self.stdout.write('\n  [角色推断分布]')
        for role, cnt in sorted(stats['role_assignments'].items(), key=lambda x: -x[1]):
            self.stdout.write(f'    {role:<20s}: {cnt} 次')

        self.stdout.write(f'{"="*65}\n')
