"""
enrich_core_users — 核心骨干用户三阶段信息补齐

Phase A: 为有账号但无KG实体的人员（排名21-59）建立实体 + 从IM/邮件扫描项目关联
Phase B: 识别"未关联"账号（排名60+）的真实身份（内部/外部）
Phase C: 对全部100人从消息内容推断并标注业务角色

用法:
  python manage.py enrich_core_users
  python manage.py enrich_core_users --phase A
  python manage.py enrich_core_users --phase B
  python manage.py enrich_core_users --phase C
  python manage.py enrich_core_users --dry-run
"""
import re
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from apps.secretary.models import PersonalContext
from apps.identity.models import Account
from apps.knowledge.models import KnowledgeEntity, KnowledgeRelation

PROJECT_RE = re.compile(
    r'\b([MCWASROF][0-9]{4,8}(?:-[0-9]+)?|SPF[0-9]{4,}|C2[0-9]{5,})\b'
)

# 角色关键词 → 角色实体标签（已存在于 KnowledgeEntity）
ROLE_SIGNALS = {
    '招募': '临床执行', '受试者': '临床执行', '入组': '临床执行',
    '筛选': '临床执行', '采样': '临床执行', '实施': '临床执行',
    'EDC': 'EDC专员', 'edc': 'EDC专员', '录入': 'EDC专员', '数据配置': 'EDC专员',
    '报告': '报告人员', '撰写': '报告人员', '统计': '报告人员', '分析': '报告人员',
    '监察': '监察员', 'CRA': '监察员', 'SDV': '监察员',
    '质控': '质量人员', 'QC': '质量人员', 'QA': '质量人员', '质量': '质量人员',
    '排班': '项目协调', '排程': '项目协调', '安排': '项目协调', '协调': '项目协调',
    '合同': '商务人员', '报价': '商务人员', '商务': '商务人员', '客户': '商务人员',
    '仪器': '实验室人员', '检测': '实验室人员', '皮肤': '实验室人员', '测量': '实验室人员',
    '方案': '研究员', 'protocol': '研究员', '研究': '研究员',
    '开票': '财务', '收款': '财务', '报销': '财务', '财务': '财务', '预算': '财务',
    '人事': 'HR', 'HR': 'HR', '招聘': 'HR', '离职': 'HR',
    '项目负责': '项目负责人', '项目经理': '项目负责人', 'PM': '项目负责人',
    '督导': '督导', '组长': '组长',
}

# 已知角色-人员预填（从已有知识和上下文推断）
KNOWN_ROLES = {
    '董彦吟': '财务',
    '张煜佼': '商务人员',
    '马蓓丽': '项目负责人',
    '茅晓珏': '报告人员',
    '周兰': '商务人员',
    '谷勤秀': '督导',
    '金刚': '项目负责人',
    '伍虹宇': '商务人员',
    '葛钰珏': '商务人员',
    '许叶玲': '商务人员',
    '吕玥': '商务人员',
    '曹燕宁': '商务人员',
    '顾晶': '项目负责人',
    '张红霞': '项目负责人',
    '孙燕萍': '临床执行',
}


def get_or_create_entity(uri, label, entity_type='person', namespace='cnkis',
                         definition='', properties=None):
    ent, created = KnowledgeEntity.objects.get_or_create(
        uri=uri[:500],
        defaults={
            'label': label[:500],
            'entity_type': entity_type[:20],
            'namespace': namespace[:30],
            'definition': definition,
            'properties': properties or {},
        },
    )
    return ent, created


def upsert_relation(subj, rel_type, obj, source, confidence=0.8, metadata=None):
    rel_type = rel_type[:30]
    qs = KnowledgeRelation.objects.filter(
        subject=subj, relation_type=rel_type, object=obj, is_deleted=False
    )
    if qs.exists():
        return qs.first(), False
    rel = KnowledgeRelation.objects.create(
        subject=subj,
        relation_type=rel_type,
        predicate_uri='cnkis:' + rel_type,
        object=obj,
        source=source[:100],
        confidence=confidence,
        metadata=metadata or {},
    )
    return rel, True


class Command(BaseCommand):
    help = '核心骨干用户三阶段信息补齐（KG实体、项目关联、角色标注）'

    def add_arguments(self, parser):
        parser.add_argument('--phase', type=str, default='ALL',
                            choices=['A', 'B', 'C', 'ALL'])
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--top-n', type=int, default=100)

    def handle(self, *args, **options):
        phase = options['phase']
        dry_run = options['dry_run']
        top_n = options['top_n']

        self.stdout.write('=' * 70)
        self.stdout.write(f'enrich_core_users — Phase {phase}  dry_run={dry_run}')
        self.stdout.write('=' * 70)

        # 构建前 top_n 活跃用户列表
        im_list = list(
            PersonalContext.objects.filter(source_type='im')
            .values('user_id').annotate(cnt=Count('id')).order_by('-cnt')[:150]
        )
        mail_list = list(
            PersonalContext.objects.filter(source_type='mail')
            .values('user_id').annotate(cnt=Count('id')).order_by('-cnt')[:150]
        )
        im_map   = {u['user_id']: u['cnt'] for u in im_list}
        mail_map = {u['user_id']: u['cnt'] for u in mail_list}
        all_uids = list(set(list(im_map.keys()) + list(mail_map.keys())))

        rows = []
        for uid in all_uids:
            acc = Account.objects.filter(feishu_open_id=uid, is_deleted=False).first()
            rows.append({
                'uid': uid, 'acc': acc,
                'name': acc.display_name if acc else '(未关联)',
                'email': (getattr(acc, 'email', '') or '') if acc else '',
                'im': im_map.get(uid, 0),
                'mail': mail_map.get(uid, 0),
            })
        rows.sort(key=lambda x: -(x['im'] + x['mail']))
        core_users = rows[:top_n]

        stats = defaultdict(int)

        if phase in ('A', 'ALL'):
            self._phase_a(core_users, dry_run, stats)
        if phase in ('B', 'ALL'):
            self._phase_b(core_users, dry_run, stats)
        if phase in ('C', 'ALL'):
            self._phase_c(core_users, dry_run, stats)

        self.stdout.write('\n' + '=' * 70)
        self.stdout.write('完成统计')
        for k, v in sorted(stats.items()):
            self.stdout.write(f'  {k}: {v}')

    # ──────────────────────────────────────────────────────────────────
    # Phase A: 建KG实体 + 从IM/邮件扫描项目关联
    # ──────────────────────────────────────────────────────────────────
    def _phase_a(self, users, dry_run, stats):
        self.stdout.write('\n[Phase A] 建立KG实体 + 扫描项目关联')
        for u in users:
            uid = u['uid']
            name = u['name']
            if name == '(未关联)':
                continue  # Phase B处理

            # 获取或建立 person 实体
            person_uri = 'person:' + uid
            if not dry_run:
                person_ent, created = get_or_create_entity(
                    uri=person_uri,
                    label=name,
                    entity_type='person',
                    definition=f'飞书用户，IM消息{u["im"]:,}条，邮件{u["mail"]:,}封',
                    properties={'open_id': uid, 'email': u['email']},
                )
                if created:
                    stats['entities_created'] += 1
            else:
                person_ent = KnowledgeEntity.objects.filter(
                    uri=person_uri, is_deleted=False
                ).first()

            if not person_ent and dry_run:
                self.stdout.write(f'  [dry] 将建 person 实体: {name}')
                stats['entities_would_create'] += 1
                continue

            if not person_ent:
                continue

            # 扫描 IM 消息中的项目编号
            im_msgs = PersonalContext.objects.filter(
                source_type='im', user_id=uid
            ).values_list('raw_content', flat=True)[:3000]
            proj_counter: Counter = Counter()
            for raw in im_msgs:
                text = str(raw or '')
                for m in PROJECT_RE.finditer(text):
                    proj_counter[m.group(1)] += 1

            # 扫描邮件消息中的项目编号
            mail_msgs = PersonalContext.objects.filter(
                source_type='mail', user_id=uid
            ).values_list('raw_content', flat=True)[:2000]
            for raw in mail_msgs:
                text = str(raw or '')
                for m in PROJECT_RE.finditer(text):
                    proj_counter[m.group(1)] += 1 * 2  # 邮件权重 x2

            self.stdout.write(
                f'  {name[:18]:18s}  IM_msgs={u["im"]:6,}  mail_msgs={u["mail"]:6,}'
                f'  识别项目={len(proj_counter)}'
            )

            if dry_run:
                if proj_counter:
                    top5 = proj_counter.most_common(5)
                    self.stdout.write(f'    top项目: {top5}')
                continue

            # 建立人员→项目关系
            with transaction.atomic():
                for proj_no, cnt in proj_counter.most_common(200):
                    proj_ent, _ = get_or_create_entity(
                        uri='project:' + proj_no,
                        label=proj_no,
                        entity_type='project',
                        properties={'code': proj_no},
                    )
                    _, new_rel = upsert_relation(
                        person_ent, 'in_project', proj_ent,
                        source='core_user_scan',
                        confidence=min(1.0, 0.5 + cnt * 0.05),
                        metadata={'mention_count': cnt, 'source_uid': uid},
                    )
                    if new_rel:
                        stats['project_relations_created'] += 1

        self.stdout.write(f'[Phase A] 完成: 实体新建={stats["entities_created"]}'
                          f' 项目关系={stats["project_relations_created"]}')

    # ──────────────────────────────────────────────────────────────────
    # Phase B: 识别"未关联"账号的真实身份
    # ──────────────────────────────────────────────────────────────────
    def _phase_b(self, users, dry_run, stats):
        self.stdout.write('\n[Phase B] 识别未关联账号')
        unlinked = [u for u in users if u['name'] == '(未关联)']
        self.stdout.write(f'  待识别账号数: {len(unlinked)}')

        for u in unlinked:
            uid = u['uid']
            # 从邮件的 metadata 里找 sender_name
            mail_sample = PersonalContext.objects.filter(
                source_type='mail', user_id=uid
            ).values('metadata', 'raw_content')[:20]

            names_found = set()
            emails_found = set()
            for m in mail_sample:
                meta = m.get('metadata') or {}
                if isinstance(meta, dict):
                    sender = meta.get('from', '') or meta.get('sender', '') or ''
                    if sender:
                        names_found.add(str(sender)[:50])
                    sender_email = meta.get('from_address', '') or meta.get('sender_email', '')
                    if sender_email:
                        emails_found.add(str(sender_email)[:50])

            name_hint = ' / '.join(list(names_found)[:3]) if names_found else '(无名称)'
            email_hint = ' / '.join(list(emails_found)[:2]) if emails_found else '(无邮箱)'

            self.stdout.write(
                f'  uid={uid[:22]}  mail={u["mail"]:4}  '
                f'名称:{name_hint[:40]}  邮箱:{email_hint[:40]}'
            )
            stats['unlinked_identified'] += 1

    # ──────────────────────────────────────────────────────────────────
    # Phase C: 角色推断 + 标注
    # ──────────────────────────────────────────────────────────────────
    def _phase_c(self, users, dry_run, stats):
        self.stdout.write('\n[Phase C] 角色推断与标注')

        for u in users:
            uid = u['uid']
            name = u['name']
            if name == '(未关联)':
                continue

            person_ent = KnowledgeEntity.objects.filter(
                uri='person:' + uid, is_deleted=False
            ).first()
            if not person_ent:
                continue

            # 已有角色关系？
            existing_roles = list(
                KnowledgeRelation.objects.filter(
                    subject=person_ent,
                    object__entity_type='role',
                    is_deleted=False,
                ).values_list('object__label', flat=True)
            )
            if existing_roles:
                self.stdout.write(f'  {name[:18]:18s}  已有角色: {existing_roles}  跳过')
                continue

            # 1. 从已知角色预填
            role_label = KNOWN_ROLES.get(name)

            # 2. 从IM内容关键词推断
            if not role_label:
                sample_msgs = list(
                    PersonalContext.objects.filter(
                        source_type='im', user_id=uid
                    ).values_list('raw_content', flat=True)[:500]
                ) + list(
                    PersonalContext.objects.filter(
                        source_type='mail', user_id=uid
                    ).values_list('raw_content', flat=True)[:300]
                )
                role_counter: Counter = Counter()
                for raw in sample_msgs:
                    text = str(raw or '')
                    for kw, role in ROLE_SIGNALS.items():
                        if kw in text:
                            role_counter[role] += 1

                if role_counter:
                    role_label = role_counter.most_common(1)[0][0]

            if not role_label:
                self.stdout.write(f'  {name[:18]:18s}  无法推断角色')
                stats['role_infer_failed'] += 1
                continue

            self.stdout.write(f'  {name[:18]:18s}  → 角色: {role_label}')

            if dry_run:
                stats['roles_would_assign'] += 1
                continue

            # 获取或创建角色实体
            role_ent, _ = get_or_create_entity(
                uri='cnkis:role:' + role_label,
                label=role_label,
                entity_type='role',
                definition='业务角色：' + role_label,
            )
            with transaction.atomic():
                _, new_rel = upsert_relation(
                    person_ent, 'performs_role', role_ent,
                    source='core_user_role_infer',
                    confidence=0.8,
                    metadata={'inferred_from': 'message_keywords'},
                )
                if new_rel:
                    stats['role_relations_created'] += 1

        self.stdout.write(
            f'[Phase C] 完成: 角色关系新建={stats["role_relations_created"]}'
            f'  推断失败={stats["role_infer_failed"]}'
        )
