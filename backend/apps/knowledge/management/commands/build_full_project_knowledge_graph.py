"""
build_full_project_knowledge_graph — 三源全量项目协作图谱构建

覆盖：
  1. 邮件 (655K KnowledgeEntry) → 提取项目编号+发件人+主题
  2. 立项审批 (278条) → 结构化提取项目名/负责人/预算/时间
  3. IM消息内容 (940K PersonalContext) → 扩展到消息体中的项目编号
  4. 审批/合同 → 供应商关系 + 商务里程碑

用法：
  python manage.py build_full_project_knowledge_graph
  python manage.py build_full_project_knowledge_graph --source email
  python manage.py build_full_project_knowledge_graph --source approval
  python manage.py build_full_project_knowledge_graph --source im_content
  python manage.py build_full_project_knowledge_graph --reset-source email
"""
import re
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction, connection

logger = logging.getLogger(__name__)

PROJECT_RE = re.compile(
    r'\b([MCWASRO][0-9]{5,}|SPF[0-9]{4,}|LS[0-9]{4,})\b'
)

STAGE_RULES = [
    (re.compile(r'招募|受试者招募|筛选|入组', re.I), 'lifecycle:受试者招募'),
    (re.compile(r'EDC|edc上线|配置|数据系统', re.I), 'lifecycle:数据采集配置'),
    (re.compile(r'执行|采样|实验|实施', re.I), 'lifecycle:临床执行'),
    (re.compile(r'监察|CRA|SDV|稽查', re.I), 'lifecycle:数据监察'),
    (re.compile(r'数据|统计|分析|清洗', re.I), 'lifecycle:数据处理'),
    (re.compile(r'报告|撰写|QC|质控', re.I), 'lifecycle:报告交付'),
    (re.compile(r'方案|protocol|立项|设计', re.I), 'lifecycle:方案立项'),
    (re.compile(r'合同|报价|商务', re.I), 'lifecycle:商务立项'),
    (re.compile(r'启动|SIV|培训|kickoff', re.I), 'lifecycle:项目启动'),
    (re.compile(r'关闭|结题|归档', re.I), 'lifecycle:项目关闭'),
]

ROLE_PATTERNS = [
    (re.compile(r'crf|CRF|数据采集表'), 'role:研究员'),
    (re.compile(r'edc|EDC|系统配置'), 'role:EDC专员'),
    (re.compile(r'受试者|招募|筛选'), 'role:临床执行'),
    (re.compile(r'报告|撰写|统计'), 'role:报告人员'),
    (re.compile(r'qc|QC|质控|审核'), 'role:质量人员'),
    (re.compile(r'监察|CRA|SDV'), 'role:监察员'),
    (re.compile(r'合同|报价|商务|客户'), 'role:商务人员'),
    (re.compile(r'皮肤|检测|仪器|测量'), 'role:实验室人员'),
    (re.compile(r'排程|schedule|安排'), 'role:项目协调'),
    (re.compile(r'负责人|PI|主要研究者'), 'role:项目负责人'),
]

EMAIL_RE = re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+')
SENDER_RE = re.compile(r'(?:发件人|From|sender)[：:]\s*([^\n<（(]+)', re.I)
NAME_RE = re.compile(r'^[\u4e00-\u9fa5a-zA-Z]{2,10}$')


def detect_stage_from_text(text):
    for p, stage in STAGE_RULES:
        if p.search(text):
            return stage
    return 'lifecycle:项目沟通'


def detect_roles_from_text(text):
    return [role for p, role in ROLE_PATTERNS if p.search(text)]


class Command(BaseCommand):
    help = '三源（邮件/审批/IM内容）全量项目协作图谱构建'

    def add_arguments(self, parser):
        parser.add_argument('--source', choices=['email', 'approval', 'im_content', 'all'],
                            default='all', help='处理的数据源')
        parser.add_argument('--batch-size', type=int, default=5000)
        parser.add_argument('--reset-source', choices=['email', 'approval', 'im_content'],
                            help='清除指定来源的图谱关系后重建')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--limit', type=int, default=0, help='限制处理数量（调试用）')

    def handle(self, *args, **options):
        source = options['source']
        batch_size = options['batch_size']
        dry_run = options['dry_run']
        limit = options['limit']
        reset_source = options.get('reset_source')

        from apps.knowledge.models import KnowledgeEntry, KnowledgeEntity, KnowledgeRelation

        self.stdout.write(f'\n{"="*65}')
        self.stdout.write('  三源全量项目协作图谱构建')
        self.stdout.write(f'{"="*65}')
        self.stdout.write(f'  来源: {source}  batch={batch_size}'
                          f'{"  DRY-RUN" if dry_run else "  正式写入"}')
        self.stdout.write(f'{"="*65}\n')

        if reset_source:
            prefix = f'fpkg:{reset_source}:'
            deleted, _ = KnowledgeRelation.objects.filter(
                source__startswith=prefix
            ).delete()
            self.stdout.write(f'[reset] 删除 {reset_source} 旧关系: {deleted} 条\n')

        # 预加载 person 实体缓存
        self._person_cache = {}
        self._project_cache = {}
        self._role_cache = {}

        stats = defaultdict(int)

        if source in ('email', 'all'):
            self._process_emails(dry_run, batch_size, limit, stats)

        if source in ('approval', 'all'):
            self._process_approvals(dry_run, stats)

        if source in ('im_content', 'all'):
            self._process_im_content(dry_run, batch_size, limit, stats)

        # 最终汇总
        from apps.knowledge.models import KnowledgeRelation
        total_rels = KnowledgeRelation.objects.count()
        from apps.knowledge.models import KnowledgeEntity
        total_entities = KnowledgeEntity.objects.count()

        self.stdout.write(f'\n{"="*65}')
        self.stdout.write('  三源图谱构建完成')
        self.stdout.write(f'{"="*65}')
        for k, v in sorted(stats.items()):
            self.stdout.write(f'  {k:<35s}: {v:>8,}')
        self.stdout.write(f'  {"KnowledgeRelation 总计":<35s}: {total_rels:>8,}')
        self.stdout.write(f'  {"KnowledgeEntity 总计":<35s}: {total_entities:>8,}')
        self.stdout.write(f'{"="*65}\n')

    # ─────────────────────────────────────────────────────────────────────────
    # 工具方法
    # ─────────────────────────────────────────────────────────────────────────

    def _get_or_create_entity(self, uri, label, entity_type, dry_run=False, definition=''):
        from apps.knowledge.models import KnowledgeEntity
        if uri in self._project_cache:
            return self._project_cache[uri]
        if dry_run:
            return None
        ent, _ = KnowledgeEntity.objects.get_or_create(
            uri=uri,
            defaults={'label': label, 'entity_type': entity_type,
                      'namespace': 'cnkis', 'definition': definition,
                      'is_deleted': False},
        )
        self._project_cache[uri] = ent
        return ent

    def _upsert_relation(self, subj, pred, obj, source='', confidence=0.8, dry_run=False):
        from apps.knowledge.models import KnowledgeRelation
        if dry_run or not subj or not obj or subj.id == obj.id:
            return False
        if not KnowledgeRelation.objects.filter(
            subject=subj, relation_type=pred, object=obj
        ).exists():
            KnowledgeRelation.objects.create(
                subject=subj, relation_type=pred, object=obj,
                predicate_uri=f'cnkis:{pred}',
                source=source[:200], confidence=confidence,
            )
            return True
        return False

    def _get_person_entity(self, name, open_id='', dry_run=False):
        """按姓名或 open_id 获取或创建人员实体"""
        from apps.knowledge.models import KnowledgeEntity
        key = open_id or f'name:{name}'
        if key in self._person_cache:
            return self._person_cache[key]
        if not name and not open_id:
            return None
        uri = f'cnkis:person:{open_id}' if open_id else f'cnkis:person:name:{name}'
        if not dry_run:
            ent, _ = KnowledgeEntity.objects.get_or_create(
                uri=uri,
                defaults={'label': name or open_id, 'entity_type': 'person',
                          'namespace': 'cnkis', 'is_deleted': False},
            )
            if name and not ent.label:
                KnowledgeEntity.objects.filter(id=ent.id).update(label=name)
            self._person_cache[key] = ent
            return ent
        return None

    def _get_role_entity(self, role_key, dry_run=False):
        from apps.knowledge.models import KnowledgeEntity
        if role_key in self._role_cache:
            return self._role_cache[role_key]
        label = role_key.replace('role:', '').replace('lifecycle:', '')
        uri = f'cnkis:{role_key.replace(":", ":", 1)}'
        if not dry_run:
            ent, _ = KnowledgeEntity.objects.get_or_create(
                uri=uri,
                defaults={'label': label, 'entity_type': 'role',
                          'namespace': 'cnkis', 'is_deleted': False},
            )
            self._role_cache[role_key] = ent
            return ent
        return None

    # ─────────────────────────────────────────────────────────────────────────
    # Pipeline 1: 邮件
    # ─────────────────────────────────────────────────────────────────────────

    def _process_emails(self, dry_run, batch_size, limit, stats):
        from apps.knowledge.models import KnowledgeEntry
        self.stdout.write('\n[Pipeline 1] 邮件项目信号提取...')

        # 统计总量
        total = KnowledgeEntry.objects.filter(
            source_type='feishu_mail', is_deleted=False
        ).count()
        self.stdout.write(f'  邮件总量: {total:,}')

        # 用 Python 分批扫描（避免 extra SQL 兼容性问题）
        project_mail_index = defaultdict(list)   # proj_no → [(title, sender_name, email_addr, content_snip)]
        person_project_links = defaultdict(set)  # sender_name → {proj_no,...}
        project_stages = defaultdict(set)        # proj_no → {stage,...}
        project_clients = defaultdict(set)       # proj_no → {external_email_domain,...}

        processed = 0
        found_with_proj = 0
        offset = 0

        while True:
            qs = KnowledgeEntry.objects.filter(
                source_type='feishu_mail', is_deleted=False
            ).values('id', 'title', 'content').order_by('id')[offset:offset + batch_size]

            batch = list(qs)
            if not batch:
                break
            offset += batch_size
            processed += len(batch)

            for item in batch:
                title = item['title'] or ''
                content = (item['content'] or '')[:1000]
                combined = title + ' ' + content[:500]

                proj_nos = list(set(PROJECT_RE.findall(combined)))
                if not proj_nos:
                    continue

                found_with_proj += 1

                # 提取发件人
                sender_name = ''
                sender_email = ''
                sm = SENDER_RE.search(content)
                if sm:
                    raw = sm.group(1).strip()[:40]
                    em = EMAIL_RE.search(raw)
                    if em:
                        sender_email = em.group(0)
                    else:
                        # 取中文姓名
                        nm = NAME_RE.search(raw)
                        if nm:
                            sender_name = nm.group(0)
                        else:
                            sender_name = raw.strip()[:10]

                # 推断阶段
                stage = detect_stage_from_text(title + content[:200])

                for proj_no in proj_nos[:3]:  # 每封邮件最多关联3个项目编号
                    project_mail_index[proj_no].append(
                        (title[:60], sender_name, sender_email)
                    )
                    if sender_name:
                        person_project_links[sender_name].add(proj_no)
                    project_stages[proj_no].add(stage)
                    # 客户域（非 china-norm.com 的发件域）
                    if sender_email and 'china-norm' not in sender_email:
                        domain = sender_email.split('@')[-1] if '@' in sender_email else ''
                        if domain:
                            project_clients[proj_no].add(domain)

            if processed % 50000 == 0:
                self.stdout.write(f'  已处理: {processed:,} / {total:,}  '
                                  f'含项目: {found_with_proj:,}  '
                                  f'发现项目: {len(project_mail_index):,}')

            if limit and processed >= limit:
                break

        self.stdout.write(f'  扫描完成: {processed:,} 封邮件  '
                          f'含项目编号: {found_with_proj:,}  '
                          f'覆盖项目: {len(project_mail_index):,}')

        stats['email.scanned'] = processed
        stats['email.with_project'] = found_with_proj
        stats['email.projects_covered'] = len(project_mail_index)

        # 写入图谱
        if not dry_run:
            self.stdout.write('  写入项目-邮件图谱...')
            rel_created = 0
            entry_created = 0

            for proj_no, mail_list in project_mail_index.items():
                proj_ent = self._get_or_create_entity(
                    uri=f'cnkis:project:{proj_no}',
                    label=proj_no,
                    entity_type='project',
                    dry_run=dry_run,
                )
                # 生命周期阶段
                for stage_key in project_stages.get(proj_no, []):
                    stage_ent = self._get_or_create_entity(
                        uri=f'cnkis:{stage_key}',
                        label=stage_key.replace('lifecycle:', ''),
                        entity_type='lifecycle_stage',
                        dry_run=dry_run,
                    )
                    if self._upsert_relation(
                        proj_ent, 'has_lifecycle_stage', stage_ent,
                        source=f'fpkg:email:stage', confidence=0.85,
                    ):
                        rel_created += 1

                # 外部客户公司
                for domain in project_clients.get(proj_no, set()):
                    client_ent = self._get_or_create_entity(
                        uri=f'cnkis:company:domain:{domain}',
                        label=domain,
                        entity_type='client',
                        dry_run=dry_run,
                    )
                    if self._upsert_relation(
                        proj_ent, 'has_client_contact', client_ent,
                        source='fpkg:email:client', confidence=0.75,
                    ):
                        rel_created += 1

                # 创建项目邮件汇总 KnowledgeEntry
                from apps.knowledge.models import KnowledgeEntry
                entry_key = f'fpkg:email:summary:{proj_no}'
                if not KnowledgeEntry.objects.filter(source_key=entry_key).exists():
                    top_mails = mail_list[:20]
                    mail_text = '\n'.join(
                        f'- [{s}] {t}' for t, s, _ in top_mails if t or s
                    )
                    stages_str = '、'.join(
                        s.replace('lifecycle:', '')
                        for s in project_stages.get(proj_no, set())
                    )
                    KnowledgeEntry.objects.create(
                        title=f'[邮件汇总] 项目{proj_no} ({len(mail_list)}封)',
                        source_type='email_project_summary',
                        source_key=entry_key,
                        content=f'项目{proj_no}相关邮件摘要（共{len(mail_list)}封）:\n' + mail_text,
                        summary=(f'项目{proj_no} 邮件活跃度:{len(mail_list)}封，'
                                 f'涉及阶段:{stages_str}，'
                                 f'外部联系人:{len(project_clients.get(proj_no, set()))}个域'),
                        namespace=f'project:{proj_no}',
                        status='published',
                        is_published=True,
                        is_deleted=False,
                    )
                    entry_created += 1

            # 人员-项目关系
            for sender_name, proj_set in person_project_links.items():
                if not sender_name or len(sender_name) < 2:
                    continue
                person_ent = self._get_person_entity(sender_name, dry_run=dry_run)
                for proj_no in list(proj_set)[:20]:  # 每人最多关联20个项目
                    proj_ent = self._get_or_create_entity(
                        uri=f'cnkis:project:{proj_no}',
                        label=proj_no, entity_type='project',
                    )
                    if self._upsert_relation(
                        person_ent, 'communicated_about',
                        proj_ent,
                        source='fpkg:email:person', confidence=0.8,
                    ):
                        rel_created += 1

            stats['email.relations_created'] = rel_created
            stats['email.entries_created'] = entry_created
            self.stdout.write(f'  新建关系: {rel_created:,}  新建 Entry: {entry_created:,}')

    # ─────────────────────────────────────────────────────────────────────────
    # Pipeline 2: 审批
    # ─────────────────────────────────────────────────────────────────────────

    def _process_approvals(self, dry_run, stats):
        from apps.knowledge.models import KnowledgeEntry, KnowledgeEntity
        self.stdout.write('\n[Pipeline 2] 审批结构化解析...')

        def extract_field(content, field_name):
            m = re.search(
                r'(?:^|\n)' + re.escape(field_name) + r'[：:]\s*([^\n]+)',
                content, re.M
            )
            return m.group(1).strip() if m else ''

        # -- 立项申请 --
        lxsq = KnowledgeEntry.objects.filter(
            source_type='feishu_approval',
            title__startswith='[立项申请]',
            is_deleted=False,
        ).exclude(content='')

        lxsq_count = lxsq.count()
        self.stdout.write(f'  立项申请: {lxsq_count} 条')

        lxsq_processed = 0
        project_profiles_created = 0
        rel_created = 0

        for entry in lxsq:
            content = entry.content or ''
            proj_name = extract_field(content, '项目名称')
            proj_leader_raw = extract_field(content, '项目负责人')
            proj_desc = extract_field(content, '项目描述')
            status = extract_field(content, '状态')
            budget_raw = extract_field(content, '项目总预算')

            # 时间区间
            date_m = re.search(
                r"'start':\s*'([^']+)'.*?'end':\s*'([^']+)'",
                content, re.S
            )
            start_date = date_m.group(1)[:10] if date_m else ''
            end_date = date_m.group(2)[:10] if date_m else ''

            # 预算
            try:
                budget = int(float(budget_raw.replace(',', '').replace('，', '')))
            except Exception:
                budget = 0

            # 负责人 open_id（从方括号中提取，如 ['4fggba9c']）
            leader_ids = re.findall(r"'([0-9a-f]{6,})'", proj_leader_raw)

            if not proj_name:
                continue

            lxsq_processed += 1

            # 从内容中也尝试找项目编号
            proj_nos_in_content = PROJECT_RE.findall(
                content + (entry.title or '')
            )

            # 如果没有项目编号，用项目名称生成 URI slug
            if proj_nos_in_content:
                proj_uri_key = proj_nos_in_content[0]
            else:
                slug = re.sub(r'[^\w]', '_', proj_name[:30])
                proj_uri_key = f'named:{slug}'

            # 创建/更新项目实体
            proj_ent = self._get_or_create_entity(
                uri=f'cnkis:project:{proj_uri_key}',
                label=proj_name[:60],
                entity_type='project',
                definition=proj_desc[:200] if proj_desc else '',
                dry_run=dry_run,
            )

            # 更新实体属性（如果有更多信息）
            if not dry_run and proj_ent:
                meta_update = {}
                if budget:
                    meta_update['budget'] = budget
                if start_date:
                    meta_update['start_date'] = start_date
                if end_date:
                    meta_update['end_date'] = end_date
                if meta_update:
                    from apps.knowledge.models import KnowledgeEntity
                    existing_meta = proj_ent.metadata or {}
                    existing_meta.update(meta_update)
                    KnowledgeEntity.objects.filter(id=proj_ent.id).update(
                        metadata=existing_meta,
                        definition=(proj_desc[:200] if proj_desc else proj_ent.definition),
                    )

            # 立项审批 KnowledgeEntry
            if not dry_run:
                entry_key = f'fpkg:approval:lxsq:{entry.id}'
                existing = KnowledgeEntry.objects.filter(source_key=entry_key).first()
                if not existing:
                    KnowledgeEntry.objects.create(
                        title=f'[立项审批] {proj_name[:50]} ({status})',
                        source_type='approval_project_profile',
                        source_key=entry_key,
                        content=f'项目名称: {proj_name}\n状态: {status}\n'
                                f'项目描述: {proj_desc}\n'
                                f'时间: {start_date} → {end_date}\n'
                                f'总预算: {budget:,} 元\n',
                        summary=(f'{proj_name} ({status}) '
                                 f'{start_date}~{end_date} '
                                 f'预算{budget:,}元'),
                        namespace=f'project:{proj_uri_key}',
                        status='published',
                        is_published=True,
                        is_deleted=False,
                    )
                    project_profiles_created += 1

            # 负责人关系
            for leader_id in leader_ids[:1]:
                person_ent = self._get_person_entity('', open_id=leader_id, dry_run=dry_run)
                if proj_ent and person_ent:
                    if self._upsert_relation(
                        person_ent, 'leads_project', proj_ent,
                        source='fpkg:approval:lxsq', confidence=0.95,
                        dry_run=dry_run,
                    ):
                        rel_created += 1

            # 阶段关系
            stage_key = detect_stage_from_text(proj_name + proj_desc)
            stage_ent = self._get_or_create_entity(
                uri=f'cnkis:{stage_key}',
                label=stage_key.replace('lifecycle:', ''),
                entity_type='lifecycle_stage',
                dry_run=dry_run,
            )
            if proj_ent and stage_ent:
                if self._upsert_relation(
                    proj_ent, 'has_lifecycle_stage', stage_ent,
                    source='fpkg:approval:lxsq', confidence=0.9,
                    dry_run=dry_run,
                ):
                    rel_created += 1

        stats['approval.lxsq_processed'] = lxsq_processed
        stats['approval.profiles_created'] = project_profiles_created
        stats['approval.relations_created'] = rel_created
        self.stdout.write(f'  立项申请处理: {lxsq_processed}  '
                          f'新建Profile: {project_profiles_created}  '
                          f'新建关系: {rel_created}')

        # -- 供应商合同审批 --
        contract_approvals = KnowledgeEntry.objects.filter(
            source_type='feishu_approval',
            title__contains='合同',
            is_deleted=False,
        ).exclude(content='')
        self.stdout.write(f'  合同审批: {contract_approvals.count()} 条')
        contract_rels = 0
        for entry in contract_approvals:
            content = entry.content or ''
            contract_name = extract_field(content, '合同名称')
            status = extract_field(content, '状态')
            supplier = extract_field(content, '对方单位名称')
            amount_raw = extract_field(content, '合同金额(元)')
            proj_nos = PROJECT_RE.findall(content + (entry.title or ''))

            if not supplier or len(supplier) < 3:
                continue

            supplier_ent = self._get_or_create_entity(
                uri=f'cnkis:company:{supplier[:40]}',
                label=supplier[:40],
                entity_type='client',
                dry_run=dry_run,
            )
            for proj_no in proj_nos[:2]:
                proj_ent = self._get_or_create_entity(
                    uri=f'cnkis:project:{proj_no}',
                    label=proj_no, entity_type='project',
                    dry_run=dry_run,
                )
                if supplier_ent and proj_ent:
                    if self._upsert_relation(
                        proj_ent, 'has_supplier', supplier_ent,
                        source='fpkg:approval:contract', confidence=0.9,
                        dry_run=dry_run,
                    ):
                        contract_rels += 1

        stats['approval.contract_relations'] = contract_rels

    # ─────────────────────────────────────────────────────────────────────────
    # Pipeline 3: IM 消息内容扫描（不只看群名）
    # ─────────────────────────────────────────────────────────────────────────

    def _process_im_content(self, dry_run, batch_size, limit, stats):
        from apps.secretary.models import PersonalContext
        from apps.identity.models import Account
        self.stdout.write('\n[Pipeline 3] IM消息内容全量项目扫描...')

        # 账户映射
        open_id_map = {
            a.feishu_open_id: (a.display_name or a.username)
            for a in Account.objects.filter(is_deleted=False).exclude(feishu_open_id='')
        }
        self.stdout.write(f'  已知账户: {len(open_id_map)}')

        total = PersonalContext.objects.filter(
            source_type='im', metadata__msg_type='text'
        ).count()
        self.stdout.write(f'  IM text 消息总量: {total:,}')

        project_persons = defaultdict(set)   # proj_no → {sender_id,...}
        project_roles = defaultdict(lambda: defaultdict(set))  # proj_no → sender → {role,...}
        project_stages = defaultdict(set)    # proj_no → {stage,...}
        person_projects = defaultdict(set)   # sender_id → {proj_no,...}

        processed = 0
        found = 0
        offset = 0

        while True:
            qs = PersonalContext.objects.filter(
                source_type='im', metadata__msg_type='text'
            ).values(
                'metadata__sender_id', 'metadata__chat_name', 'raw_content'
            ).order_by('id')[offset:offset + batch_size]

            batch = list(qs)
            if not batch:
                break
            offset += batch_size
            processed += len(batch)

            for item in batch:
                sender_id = item['metadata__sender_id'] or ''
                chat_name = item['metadata__chat_name'] or ''
                content = item['raw_content'] or ''

                # 从消息内容 + 群名中找项目编号
                combined = content + ' ' + chat_name
                proj_nos = list(set(PROJECT_RE.findall(combined)))
                if not proj_nos:
                    continue

                found += 1
                stage = detect_stage_from_text(combined[:300])
                roles = detect_roles_from_text(content[:200])

                for proj_no in proj_nos[:3]:
                    if sender_id and sender_id.startswith('ou_'):
                        project_persons[proj_no].add(sender_id)
                        person_projects[sender_id].add(proj_no)
                        for role in roles:
                            project_roles[proj_no][sender_id].add(role)
                    project_stages[proj_no].add(stage)

            if processed % 100000 == 0:
                self.stdout.write(f'  已处理: {processed:,} / {total:,}'
                                  f'  含项目: {found:,}'
                                  f'  项目数: {len(project_persons):,}')

            if limit and processed >= limit:
                break

        self.stdout.write(f'  IM扫描完成: {processed:,} 条'
                          f'  含项目编号: {found:,}'
                          f'  项目覆盖: {len(project_persons):,}')
        stats['im_content.scanned'] = processed
        stats['im_content.with_project'] = found
        stats['im_content.projects_covered'] = len(project_persons)

        if not dry_run:
            rel_created = 0
            for proj_no, sender_set in project_persons.items():
                proj_ent = self._get_or_create_entity(
                    uri=f'cnkis:project:{proj_no}',
                    label=proj_no, entity_type='project',
                )
                for stage_key in project_stages.get(proj_no, set()):
                    stage_ent = self._get_or_create_entity(
                        uri=f'cnkis:{stage_key}',
                        label=stage_key.replace('lifecycle:', ''),
                        entity_type='lifecycle_stage',
                    )
                    self._upsert_relation(
                        proj_ent, 'has_lifecycle_stage', stage_ent,
                        source='fpkg:im_content:stage', confidence=0.8,
                    )

                for sender_id in sender_set:
                    name = open_id_map.get(sender_id, '')
                    person_ent = self._get_person_entity(name, sender_id)
                    if person_ent:
                        if self._upsert_relation(
                            person_ent, 'involved_in', proj_ent,
                            source='fpkg:im_content:person', confidence=0.85,
                        ):
                            rel_created += 1
                        for role_key in project_roles[proj_no].get(sender_id, set()):
                            role_ent = self._get_role_entity(role_key)
                            self._upsert_relation(
                                person_ent, 'performs_role', role_ent,
                                source='fpkg:im_content:role', confidence=0.7,
                            )

            stats['im_content.relations_created'] = rel_created
            self.stdout.write(f'  新建关系: {rel_created:,}')
