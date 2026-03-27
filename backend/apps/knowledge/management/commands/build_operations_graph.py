"""
build_operations_graph：从飞书邮件 PersonalContext 中提取运营知识图谱

构建要素：
- 实体：人员/项目/客户/仪器/方法/场地/角色/样品/时间点
- 关系：提交立项/受理分配/排程/执行/操作仪器/场地使用/汇报/审核/协同

用法：
  python manage.py build_operations_graph
  python manage.py build_operations_graph --reset  # 清空重建
  python manage.py build_operations_graph --dry-run  # 仅统计不写入
"""
import re
from collections import defaultdict
from django.core.management.base import BaseCommand


# ──────────────────────────────────────────────────────────────────────────────
# 已知实体词典（从邮件数据中预先整理）
# ──────────────────────────────────────────────────────────────────────────────

# 仪器 — 从邮件正文提取到的
INSTRUMENTS = {
    'Corneometer': 'Corneometer CM825（皮肤水分测试仪）',
    'CM825': 'Corneometer CM825',
    'Tewameter': 'Tewameter TM（经皮水分散失仪）',
    'Vapometer': 'Vapometer（蒸发测量仪）',
    'VISIA': 'VISIA（皮肤检测仪）',
    'VISIA-CR': 'VISIA-CR Gen5.0（皮肤影像仪）',
    'VisioFace': 'VisioFace（面部影像仪）',
    'Mexameter': 'Mexameter MX18（皮肤黑色素/红斑仪）',
    'Cutometer': 'Cutometer（皮肤弹性仪）',
    'Sebumeter': 'Sebumeter SM815（皮肤油脂仪）',
    'PRIMOS': 'PRIMOS-CR（皮肤三维成像仪）',
    'Chromameter': 'Chromameter（色度仪）',
    'Skin-pH-Meter': 'Skin-pH-Meter（皮肤pH仪）',
}

# 检测时间点
TIMEPOINTS = ['T0', 'T15min', 'T30min', 'T1H', 'T1h', 'T2H', 'T4H', 'T8H',
              'T1D', 'T1d', 'T1wk', 'T2wk', 'T4wk', 'T8wk', 'T12wk',
              'TIMM', 'baseline', 'Baseline']

# 检测方法/功效类型
METHODS = {
    '保湿': '保湿功效评估',
    '美白': '美白/提亮功效评估',
    '抗皱': '抗皱/紧致功效评估',
    '防晒': '防晒（SPF/PA）测试',
    'SPF': '防晒指数SPF测试',
    '控油': '控油功效评估',
    '修复': '皮肤修复功效评估',
    'in vivo': '人体在体测试',
    'in vitro': '体外测试',
    '头皮': '头皮相关测试',
    '眼部': '眼部评估',
    '问卷': '问卷调研',
    '医生评估': '临床医生评估',
    'pilot': 'Pilot 预试验',
    '微针': '微针治疗相关测试',
    '脑电': '脑电相关测试',
    '动态纹': '动态皱纹评估',
}

# 场地
FACILITIES = {
    '15楼': '15楼实验室',
    '实验室': '功效评估实验室',
    '评估室': '临床评估室',
    '环境室': '环境控制室',
    '产品间': '产品/样品储存间',
    'B02': 'B02样品库',
    '医美中心': 'U&TEST医美中心（长宁医美）',
    '医美联合实验室': '医美联合实验室',
    '5F': 'U&TEST 5F（延安西路1319号）',
}

# 角色
ROLES = {
    '研究员': '研究员（Protocol制定/客户沟通）',
    '排程专员': '排程专员（计划排程/工单发布）',
    '技术员': '技术员/评估员（检测执行）',
    '督导': 'CRA/督导（现场过程管理）',
    '运营中心': '运营中心（受理/分配/调度）',
    'CRA': 'CRA（临床研究助理/督导）',
    'PI': 'PI/主要研究者',
    'QA': 'QA质量专员',
    'HR': 'HR人事',
    '前台': '前台/接待',
    '管理层': '公司管理层',
    '数据管理': '数据管理',
    '产品发放员': '产品/样品发放员',
}

# 项目编号正则
PROJECT_PATTERN = re.compile(r'\b([CMR]\d{8,}|LS\d{6,}|SPF\d{5,}|M\d{8,}|O\d{8,})\b')
INQUIRY_PATTERN = re.compile(r'\b(BL|SH|JYW|WW|WR)\d{6,}[-_]?\d*\b')

# 外部客户域名识别
KNOWN_CLIENTS = {
    'loreal.com': "欧莱雅（L'Oréal）",
    'chanel.com': 'CHANEL香奈儿',
    'kose.co.jp': 'KOSÉ高丝',
    'shiseido.com': '资生堂（Shiseido）',
    'cn.shiseido.com': '资生堂中国',
    'beiersdorf.com': '拜尔斯道夫',
    'lorealfin.com': "欧莱雅（L'Oréal）",
    'pierrefabre.com': '皮尔法伯',
    'sephora.com': '丝芙兰（Sephora）',
    'lvmh.com': 'LVMH',
    'estee.com': '雅诗兰黛',
    'esteelauder.com': '雅诗兰黛',
    'pg.com': 'P&G宝洁',
    'unilever.com': '联合利华',
    'cyqlopconsulting.com': 'CyQ-Lop（审计咨询）',
}

EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')


class Command(BaseCommand):
    help = '从飞书邮件 PersonalContext 构建运营知识图谱'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='清空 operations 命名空间重建')
        parser.add_argument('--dry-run', action='store_true', help='仅统计不写入')

    def handle(self, *args, **options):
        from apps.knowledge.models import (
            KnowledgeEntity, KnowledgeRelation, EntityType, RelationType
        )
        from apps.secretary.models import PersonalContext
        from apps.identity.models import Account

        # 兼容枚举：生产环境可能缺少部分枚举值，用字符串兜底
        def _rt(name):
            return getattr(RelationType, name, name.lower())

        NS = 'operations_graph_2026Q1'
        dry_run = options['dry_run']

        if options['reset'] and not dry_run:
            deleted = KnowledgeEntity.objects.filter(namespace=NS).count()
            KnowledgeEntity.objects.filter(namespace=NS).delete()
            self.stdout.write(f'已清空 {deleted} 个实体（namespace={NS}）')

        # 统计容器
        entities_created = defaultdict(int)
        relations_created = defaultdict(int)
        entity_cache = {}  # uri -> KnowledgeEntity

        # ─── 工具函数 ──────────────────────────────────────────────────
        def upsert_entity(uri, label, entity_type, props=None, label_en=''):
            if uri in entity_cache:
                return entity_cache[uri]
            if dry_run:
                entity_cache[uri] = {'uri': uri, 'label': label}
                entities_created[entity_type] += 1
                return entity_cache[uri]
            obj, created = KnowledgeEntity.objects.update_or_create(
                namespace=NS, uri=uri,
                defaults={
                    'label': label,
                    'label_en': label_en,
                    'entity_type': entity_type,
                    'properties': props or {},
                    'is_deleted': False,
                }
            )
            entity_cache[uri] = obj
            if created:
                entities_created[entity_type] += 1
            return obj

        def upsert_relation(subj, pred, obj, evidence='', weight=1.0):
            if dry_run:
                key = f'{getattr(subj,"uri",subj)}--{pred}-->{getattr(obj,"uri",obj)}'
                relations_created[pred] += 1
                return
            if not subj or not obj:
                return
            KnowledgeRelation.objects.get_or_create(
                subject=subj, relation_type=pred, object=obj,
                defaults={
                    'predicate_uri': f'cnkis:{pred}',
                    'source': evidence[:99] if evidence else '',
                    'confidence': weight,
                }
            )
            relations_created[pred] += 1

        # ─── 1. 人员实体 + 角色 ────────────────────────────────────────
        self.stdout.write('\n[1] 构建人员实体...')
        accounts = Account.objects.filter(
            is_deleted=False,
            email__endswith='@china-norm.com'
        ).values('id', 'display_name', 'email', 'feishu_open_id')

        # 兼容生产环境枚举（直接用字符串兜底）
        _ROLE = getattr(EntityType, 'ROLE', 'role')
        _PERSON = getattr(EntityType, 'PERSON', 'person')
        _INSTRUMENT = getattr(EntityType, 'INSTRUMENT', 'instrument')
        _METHOD = getattr(EntityType, 'METHOD', 'method')
        _FACILITY = getattr(EntityType, 'FACILITY', 'facility')
        _TIMEPOINT = getattr(EntityType, 'TIMEPOINT', 'timepoint')
        _CLIENT = getattr(EntityType, 'CLIENT', 'client')
        _PROJECT = getattr(EntityType, 'PROJECT', 'project')

        role_entities = {}
        for role_label, role_desc in ROLES.items():
            uri = f'cnkis:role/{role_label}'
            e = upsert_entity(uri, role_desc, _ROLE)
            role_entities[role_label] = e

        person_entities = {}
        for acc in accounts:
            if not acc['email']:
                continue
            email_prefix = acc['email'].split('@')[0]
            uri = f'cnkis:person/{email_prefix}'
            props = {
                'email': acc['email'],
                'feishu_open_id': acc['feishu_open_id'] or '',
                'account_id': acc['id'],
            }
            e = upsert_entity(uri, acc['display_name'] or email_prefix,
                              _PERSON, props=props)
            person_entities[acc['email'].lower()] = e

        self.stdout.write(f'  人员实体: {len(person_entities)}')

        # ─── 2. 已知人员角色关系（来自邮件行为推断）─────────────────────
        PERSON_ROLE_MAP = {
            'fengxiaogang@china-norm.com': ['排程专员'],
            'geyujue@china-norm.com': ['运营中心', '排程专员'],
            'zhaoxiaoqian@china-norm.com': ['运营中心', '管理层'],
            'duanchen@china-norm.com': ['督导', 'CRA'],
            'yangguansheng@china-norm.com': ['研究员', '数据管理'],
            'yaozhicheng@china-norm.com': ['研究员'],
            'mabeili@china-norm.com': ['管理层'],
            'jiangyanwen@china-norm.com': ['运营中心', '管理层'],
            'fuyiqin@china-norm.com': ['研究员'],
            'sunxin@china-norm.com': ['研究员'],
            'wangyijing@china-norm.com': ['研究员'],
            'wangjinpu@china-norm.com': ['研究员'],
            'zhujiajing@china-norm.com': ['研究员'],
            'maoxiaojue@china-norm.com': ['研究员'],
            'gujing@china-norm.com': ['研究员'],
            'yuanjing@china-norm.com': ['研究员'],
            'liuchang@china-norm.com': ['研究员'],
            'lishuhan@china-norm.com': ['研究员'],
            'lishao@china-norm.com': ['研究员'],
            'yangyuying@china-norm.com': ['研究员'],
            'qiuyuchen@china-norm.com': ['研究员'],
            'liumeiyin@china-norm.com': ['HR'],
            'zhaoxiaoqian@china-norm.com': ['运营中心', 'QA'],
        }
        for email, roles in PERSON_ROLE_MAP.items():
            person_e = person_entities.get(email)
            if not person_e:
                continue
            for role in roles:
                role_e = role_entities.get(role)
                if role_e:
                    upsert_relation(person_e, _rt('IS_A'), role_e,
                                    evidence=f'{email} 邮件行为推断')

        # ─── 3. 从邮件提取项目、仪器、方法、场地、客户实体 ────────────────
        self.stdout.write('\n[2] 从邮件提取项目/仪器/方法/场地/客户实体...')

        mails = PersonalContext.objects.filter(source_type='mail')
        self.stdout.write(f'  邮件总量: {mails.count()}')

        # 预建仪器/方法/场地/时间点实体
        instr_entities = {}
        for kw, label in INSTRUMENTS.items():
            uri = f'cnkis:instrument/{kw.lower().replace(" ", "_")}'
            e = upsert_entity(uri, label, _INSTRUMENT)
            instr_entities[kw] = e

        method_entities = {}
        for kw, label in METHODS.items():
            uri = f'cnkis:method/{kw.lower().replace(" ", "_")}'
            e = upsert_entity(uri, label, _METHOD)
            method_entities[kw] = e

        facility_entities = {}
        for kw, label in FACILITIES.items():
            uri = f'cnkis:facility/{kw.lower().replace(" ", "_").replace("/", "_")}'
            e = upsert_entity(uri, label, _FACILITY)
            facility_entities[kw] = e

        timepoint_entities = {}
        for tp in TIMEPOINTS:
            uri = f'cnkis:timepoint/{tp.lower()}'
            e = upsert_entity(uri, tp, _TIMEPOINT)
            timepoint_entities[tp] = e

        project_entities = {}   # project_no -> entity
        client_entities = {}    # domain -> entity
        discovered_contacts = set()

        for mail in mails.iterator(chunk_size=200):
            text = f'{mail.summary or ""} {mail.raw_content or ""}'
            meta = mail.metadata or {}
            sender_email = (meta.get('sender_email') or '').lower()
            user_id = mail.user_id

            # 发件人 person entity（已有或外部）
            sender_e = person_entities.get(sender_email)
            if not sender_e and sender_email and '@' in sender_email:
                discovered_contacts.add(sender_email)
                domain = sender_email.split('@')[-1]
                if domain in KNOWN_CLIENTS:
                    client_label = KNOWN_CLIENTS[domain]
                    client_uri = f'cnkis:client/{domain.replace(".","_")}'
                    client_e = upsert_entity(client_uri, client_label, _CLIENT,
                                             props={'domain': domain})
                    client_entities[domain] = client_e

            # 接收者 person entity（从 user_id 反查）
            receiver_e = None
            for acc in accounts:
                if acc['feishu_open_id'] == user_id:
                    receiver_e = person_entities.get((acc['email'] or '').lower())
                    break

            # 提取项目编号
            proj_matches = PROJECT_PATTERN.findall(text)
            for proj_no in set(proj_matches):
                proj_uri = f'cnkis:project/{proj_no}'
                if proj_no not in project_entities:
                    proj_e = upsert_entity(proj_uri, proj_no, _PROJECT,
                                           props={'project_no': proj_no})
                    project_entities[proj_no] = proj_e
                else:
                    proj_e = project_entities[proj_no]

                # 关系：发件人 → 项目
                if sender_e and proj_e:
                    if '测试执行立项' in mail.summary or '立项' in text:
                        upsert_relation(sender_e, _rt('REQUESTS'), proj_e,
                                        evidence=mail.summary[:200])
                    elif '已受理并安排人员' in text or '受理' in text:
                        upsert_relation(sender_e, _rt('MANAGES'), proj_e,
                                        evidence=mail.summary[:200])
                    elif '新增' in text and '排期' in text:
                        upsert_relation(sender_e, _rt('SCHEDULES'), proj_e,
                                        evidence=mail.summary[:200])
                    elif '排期协调' in text or '排程' in text:
                        upsert_relation(sender_e, _rt('SCHEDULES'), proj_e,
                                        evidence=mail.summary[:200])
                    elif '技术员' in text and '安排' in text:
                        upsert_relation(sender_e, _rt('MANAGES'), proj_e,
                                        evidence=mail.summary[:200])
                    elif 'Protocol' in text or 'V2.0' in text or '方案' in text:
                        upsert_relation(sender_e, _rt('MANAGES'), proj_e,
                                        evidence='Protocol沟通')
                    elif 'report' in text.lower() or '报告' in text:
                        upsert_relation(sender_e, _rt('PRODUCES'), proj_e,
                                        evidence='报告交付')
                    else:
                        upsert_relation(sender_e, _rt('RELATED_TO'), proj_e,
                                        evidence=mail.summary[:100])

                # 仪器 → 项目
                for kw, instr_e in instr_entities.items():
                    if kw.lower() in text.lower():
                        upsert_relation(proj_e, _rt('REQUIRES'), instr_e,
                                        evidence=f'{proj_no}使用{kw}')

                # 时间点 → 项目
                for tp, tp_e in timepoint_entities.items():
                    if tp in text:
                        upsert_relation(proj_e, _rt('REQUIRES'), tp_e,
                                        evidence=f'{proj_no}包含时间点{tp}')

                # 方法 → 项目
                for kw, method_e in method_entities.items():
                    if kw in text:
                        upsert_relation(proj_e, _rt('TESTED_BY'), method_e,
                                        evidence=f'{proj_no}使用方法{kw}')

                # 客户 → 项目
                for domain, client_e in client_entities.items():
                    if domain.split('.')[0] in text.lower() or KNOWN_CLIENTS.get(domain, '') in text:
                        upsert_relation(client_e, _rt('SPONSORS'), proj_e,
                                        evidence=f'{domain}相关项目')

            # 场地
            for kw, fac_e in facility_entities.items():
                if kw in text:
                    for proj_no in proj_matches:
                        proj_e = project_entities.get(proj_no)
                        if proj_e:
                            upsert_relation(proj_e, _rt('LOCATES_IN'), fac_e,
                                            evidence=f'{proj_no}使用场地{kw}')

            # 人员-人员 关系（汇报、协同）
            if '调休' in text or '汇报' in text:
                if sender_e and receiver_e and sender_e != receiver_e:
                    upsert_relation(sender_e, _rt('REPORTS_TO'), receiver_e,
                                    evidence='HR沟通链路')

            # 从正文提取更多内部联系人
            for addr in EMAIL_PATTERN.findall(text):
                addr = addr.lower()
                if addr.endswith('@china-norm.com'):
                    discovered_contacts.add(addr)

        # ─── 4. 人员-协同关系（来自邮件往来频率）──────────────────────────
        self.stdout.write('\n[3] 构建人员协同关系...')

        # 统计邮件往来频次（发件人→接收者）
        pair_counts = defaultdict(int)
        for mail in mails.filter(metadata__has_key='sender_email').iterator(chunk_size=200):
            sender = (mail.metadata.get('sender_email') or '').lower()
            # 找接收者账号
            for acc in accounts:
                if acc['feishu_open_id'] == mail.user_id:
                    receiver = (acc['email'] or '').lower()
                    if sender and receiver and sender != receiver:
                        pair_counts[(sender, receiver)] += 1
                    break

        # 往来 ≥ 3 次建立协同关系
        for (sender, receiver), count in pair_counts.items():
            if count >= 3:
                s_e = person_entities.get(sender)
                r_e = person_entities.get(receiver)
                if s_e and r_e:
                    upsert_relation(s_e, _rt('COLLABORATES_WITH'), r_e,
                                    evidence=f'邮件往来{count}次', weight=min(count/20, 1.0))

        # ─── 5. 将发现的所有人员输出供后续补采 ────────────────────────────
        new_contacts = discovered_contacts - set(person_entities.keys())
        internal_new = {e for e in new_contacts if e.endswith('@china-norm.com')}
        external_new = {e for e in new_contacts if not e.endswith('@china-norm.com')}

        # ─── 6. 统计输出 ───────────────────────────────────────────────
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write('运营知识图谱构建完成')
        self.stdout.write('=' * 60)
        self.stdout.write('\n[实体统计]')
        for etype, cnt in sorted(entities_created.items()):
            self.stdout.write(f'  {etype:25s}: {cnt}')
        self.stdout.write('\n[关系统计]')
        for rtype, cnt in sorted(relations_created.items()):
            self.stdout.write(f'  {rtype:25s}: {cnt}')

        if not dry_run:
            from apps.knowledge.models import KnowledgeEntity as KE, KnowledgeRelation as KR
            total_e = KE.objects.filter(namespace=NS).count()
            total_r = KR.objects.filter(subject__namespace=NS).count()
            self.stdout.write(f'\n数据库实体总量: {total_e}')
            self.stdout.write(f'数据库关系总量: {total_r}')

        self.stdout.write('\n[动态发现]')
        self.stdout.write(f'  内部新联系人: {len(internal_new)}')
        for e in sorted(internal_new):
            self.stdout.write(f'    + {e}')
        self.stdout.write(f'  外部联系人（客户）: {len(external_new)}')
        for e in sorted(list(external_new)[:20]):
            self.stdout.write(f'    ~ {e}')

        self.stdout.write('\n[项目汇总]')
        self.stdout.write(f'  识别项目数: {len(project_entities)}')
        for pno in sorted(project_entities.keys()):
            self.stdout.write(f'  {pno}')
