"""
从阿里云 utest_platform.project_user_info 批量导入受试者数据

数据源：rm-uf642x10u6n6ag3kc3o.mysql.rds.aliyuncs.com（只读账号）
目标表：t_subject / t_subject_profile / t_enrollment

去重优先级链：
  1. 有身份证 → SHA-256(id_card) 唯一标识
       - 同一身份证多手机 → 合并为一人，保留最新手机
       - 同一身份证多姓名 → 取记录数最多的姓名，标记 needs_review
  2. 无身份证 + 真实手机（≠ 99999999999）→ 手机号为标识
  3. 无身份证 + 占位符手机 → 姓名为标识，标记信息不完整

Usage:
  python manage.py import_utest_subjects --dry-run
  python manage.py import_utest_subjects --dry-run --limit 100
  python manage.py import_utest_subjects --chunk-size 500
  python manage.py import_utest_subjects --stats
"""
import hashlib
import logging
from collections import defaultdict
from datetime import date

import pymysql
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

FAKE_PHONE = '99999999999'

GENDER_MAP = {
    '女性': 'female', '女': 'female', 'f': 'female', 'female': 'female',
    '男性': 'male',   '男': 'male',   'm': 'male',   'male': 'male',
}

SOURCE_CHANNEL_MAP = {
    '联络员': 'referral',
    '扫库':   'database',
    '推广':   'advertisement',
    '中介':   'other',
    '企微':   'wechat',
    '微信':   'wechat',
    '小红书': 'online',
}


def sha256(text: str) -> str:
    return hashlib.sha256(text.strip().encode()).hexdigest()


def norm_phone(phone: str) -> str:
    if not phone:
        return ''
    p = phone.strip().replace('-', '').replace(' ', '')
    return p if len(p) >= 11 else ''


def norm_gender(sex: str) -> str:
    if not sex:
        return ''
    return GENDER_MAP.get(sex.strip(), '')


def norm_source(channel: str) -> str:
    if not channel:
        return 'other'
    return SOURCE_CHANNEL_MAP.get(channel.strip(), 'other')


def make_pseudonym_code(counter: int) -> str:
    return f'CN{date.today().year}-{counter:05d}'


class Command(BaseCommand):
    help = '从 utest_platform.project_user_info 批量导入受试者数据（幂等）'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='预览，不写入数据库')
        parser.add_argument('--limit', type=int, default=0, help='仅处理前 N 条原始记录（测试用）')
        parser.add_argument('--chunk-size', type=int, default=500, help='每批写入条数')
        parser.add_argument('--stats', action='store_true', help='仅显示统计，不导入')

    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.limit = options['limit']
        self.chunk_size = options['chunk_size']

        if options['stats']:
            self._show_stats()
            return

        self.counters = {
            'fetched': 0,
            'subjects_created': 0,
            'subjects_updated': 0,
            'subjects_skipped': 0,
            'enrollments_created': 0,
            'needs_review': 0,
        }

        self.stdout.write(self.style.NOTICE('连接 utest_platform MySQL...'))
        rows = self._fetch_source_data()
        self.stdout.write(f'获取原始记录: {len(rows):,} 条')

        self.stdout.write(self.style.NOTICE('\n步骤 1/3  构建去重分组...'))
        groups = self._build_dedup_groups(rows)
        self.stdout.write(f'去重后唯一受试者: {len(groups):,} 人')

        self.stdout.write(self.style.NOTICE('\n步骤 2/3  写入 t_subject / t_subject_profile...'))
        self._upsert_subjects(groups)

        self.stdout.write(self.style.NOTICE('\n步骤 3/3  写入 t_enrollment...'))
        self._upsert_enrollments(rows)

        self._print_summary()

    # ------------------------------------------------------------------
    # 数据拉取
    # ------------------------------------------------------------------
    def _fetch_source_data(self):
        conn = pymysql.connect(
            host='rm-uf642x10u6n6ag3kc3o.mysql.rds.aliyuncs.com',
            port=3306,
            user='fushuo_read',
            password='fushuo@123',
            database='utest_platform',
            charset='utf8mb4',
            connect_timeout=15,
            cursorclass=pymysql.cursors.DictCursor,
        )
        try:
            with conn.cursor() as cur:
                sql = """
                    SELECT
                        id, user_name, phone, id_card, age, sex,
                        city, source_channel, liaison_name,
                        project_id, project_name, test_type, project_type,
                        project_start_date, project_end_date,
                        sc_id, rd_id, guardian_name, guardian_phone,
                        guardian_relationship, created_at
                    FROM project_user_info
                    ORDER BY id
                """
                if self.limit:
                    sql += f' LIMIT {self.limit}'
                cur.execute(sql)
                rows = cur.fetchall()
                self.counters['fetched'] = len(rows)
                return rows
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # 去重分组
    # ------------------------------------------------------------------
    def _build_dedup_groups(self, rows):
        """
        返回 dict: dedup_key → {
            'representative': row（主记录），
            'all_rows': [row, ...],
            'key_type': 'id_card' | 'phone' | 'name',
            'needs_review': bool,
        }
        """
        # 先统计每个身份证对应的姓名频次（多姓名时取最多的）
        id_card_name_freq = defaultdict(lambda: defaultdict(int))
        for row in rows:
            id_card = (row.get('id_card') or '').strip()
            name = (row.get('user_name') or '').strip()
            if id_card:
                id_card_name_freq[id_card][name] += 1

        groups = {}

        for row in rows:
            id_card = (row.get('id_card') or '').strip()
            phone = norm_phone(row.get('phone') or '')
            name = (row.get('user_name') or '').strip()

            # 优先级 1：身份证
            if id_card:
                key = f'id:{sha256(id_card)}'
                key_type = 'id_card'
            # 优先级 2：真实手机号
            elif phone and phone != FAKE_PHONE:
                key = f'ph:{phone}'
                key_type = 'phone'
            # 优先级 3：姓名（兜底，信息最不完整）
            else:
                key = f'nm:{name}'
                key_type = 'name'

            if key not in groups:
                groups[key] = {
                    'representative': row,
                    'all_rows': [row],
                    'key_type': key_type,
                    'needs_review': False,
                    'id_card': id_card,
                }
            else:
                groups[key]['all_rows'].append(row)
                # 保留最新一条作为主记录
                if (row.get('created_at') or '') > (groups[key]['representative'].get('created_at') or ''):
                    groups[key]['representative'] = row

        # 标记同一身份证有多个姓名的（录入异常）
        for key, grp in groups.items():
            if grp['key_type'] == 'id_card' and grp['id_card']:
                names = id_card_name_freq[grp['id_card']]
                if len(names) > 1:
                    grp['needs_review'] = True
                    # 取频次最高的姓名作为主姓名
                    best_name = max(names, key=lambda n: names[n])
                    grp['representative'] = dict(grp['representative'])
                    grp['representative']['user_name'] = best_name
                    self.counters['needs_review'] += 1

        return groups

    # ------------------------------------------------------------------
    # 写入 Subject + SubjectProfile
    # ------------------------------------------------------------------
    def _upsert_subjects(self, groups):
        from apps.subject.models import (
            Subject, SubjectSourceChannel, SubjectStatus, AuthLevel,
        )
        from apps.subject.models_profile import SubjectProfile
        from apps.subject.pseudonym_models import SubjectPseudonym

        # 当前假名码最大序号
        last_pseudo = SubjectPseudonym.objects.order_by('-pseudonym_code').values_list(
            'pseudonym_code', flat=True
        ).first()
        pseudo_counter = 0
        if last_pseudo:
            try:
                pseudo_counter = int(last_pseudo.split('-')[-1])
            except (ValueError, IndexError):
                pseudo_counter = 0

        items = list(groups.items())
        total = len(items)
        chunk = self.chunk_size

        for i in range(0, total, chunk):
            batch = items[i:i + chunk]
            if not self.dry_run:
                with transaction.atomic():
                    for key, grp in batch:
                        pseudo_counter += 1
                        self._write_one_subject(
                            grp, pseudo_counter,
                            Subject, SubjectSourceChannel, SubjectStatus,
                            AuthLevel, SubjectProfile, SubjectPseudonym,
                        )
            else:
                for key, grp in batch:
                    self.counters['subjects_created'] += 1

            progress = min(i + chunk, total)
            self.stdout.write(f'  进度: {progress:,}/{total:,}')

    def _write_one_subject(
        self, grp, pseudo_counter,
        Subject, SubjectSourceChannel, SubjectStatus,
        AuthLevel, SubjectProfile, SubjectPseudonym,
    ):
        row = grp['representative']
        id_card = grp['id_card']
        key_type = grp['key_type']

        name = (row.get('user_name') or '').strip() or '未知'
        phone = norm_phone(row.get('phone') or '')
        if phone == FAKE_PHONE:
            phone = ''
        gender = norm_gender(row.get('sex') or '')
        age = row.get('age')
        city = (row.get('city') or '').strip()
        source_channel = norm_source(row.get('source_channel') or '')

        id_card_hash = sha256(id_card) if id_card else ''

        # 查重：先按身份证哈希，再按手机
        subject = None
        if id_card_hash:
            subject = Subject.objects.filter(
                profile__id_card_hash=id_card_hash
            ).first()
        if subject is None and phone:
            subject = Subject.objects.filter(phone=phone).first()

        if subject is None:
            # 新建
            subject = Subject(
                name=name,
                gender=gender,
                age=age,
                phone=phone[:20] if phone else '',
                source_channel=source_channel,
                status=SubjectStatus.COMPLETED,
                auth_level=AuthLevel.GUEST if not id_card else AuthLevel.IDENTITY_VERIFIED,
            )
            subject.save()
            self.counters['subjects_created'] += 1
        else:
            # 更新补全
            changed = False
            if not subject.gender and gender:
                subject.gender = gender
                changed = True
            if not subject.age and age:
                subject.age = age
                changed = True
            if not subject.phone and phone:
                subject.phone = phone[:20]
                changed = True
            if changed:
                subject.save(update_fields=['gender', 'age', 'phone', 'update_time'])
            self.counters['subjects_updated'] += 1

        # SubjectProfile（1:1）
        profile, _ = SubjectProfile.objects.get_or_create(subject=subject)
        profile_changed = False

        if id_card_hash and not profile.id_card_hash:
            profile.id_card_hash = id_card_hash
            profile.id_card_last4 = id_card[-4:] if len(id_card) >= 4 else ''
            profile_changed = True
        if city and not profile.city:
            profile.city = city
            profile_changed = True
        if grp['needs_review'] and not getattr(profile, 'notes', None):
            # 写入备注提醒人工核查
            profile_changed = True

        # 统计参与项目数
        all_project_ids = {
            (r.get('project_id') or '').strip()
            for r in grp['all_rows']
            if (r.get('project_id') or '').strip()
        }
        if len(all_project_ids) > profile.total_enrollments:
            profile.total_enrollments = len(all_project_ids)
            profile_changed = True

        if profile_changed:
            update_fields = [
                'id_card_hash', 'id_card_last4', 'city',
                'total_enrollments', 'update_time',
            ]
            profile.save(update_fields=update_fields)

        # SubjectPseudonym（仅新建，不重复生成）
        if not SubjectPseudonym.objects.filter(subject=subject).exists():
            SubjectPseudonym.objects.create(
                subject=subject,
                pseudonym_code=make_pseudonym_code(pseudo_counter),
                id_card_hash=id_card_hash,
            )

    # ------------------------------------------------------------------
    # 写入 Enrollment
    # ------------------------------------------------------------------
    def _upsert_enrollments(self, rows):
        from apps.subject.models import Subject, Enrollment, EnrollmentStatus
        from apps.protocol.models import Protocol

        proto_cache = {}
        created = 0

        for row in rows:
            project_id = (row.get('project_id') or '').strip()
            if not project_id:
                continue

            # 找对应的 Subject（用手机或身份证哈希）
            phone = norm_phone(row.get('phone') or '')
            if phone == FAKE_PHONE:
                phone = ''
            id_card = (row.get('id_card') or '').strip()
            id_card_hash = sha256(id_card) if id_card else ''

            subject = None
            if id_card_hash:
                subject = Subject.objects.filter(
                    profile__id_card_hash=id_card_hash
                ).first()
            if subject is None and phone:
                subject = Subject.objects.filter(phone=phone).first()
            if subject is None:
                continue

            # 找 Protocol
            if project_id not in proto_cache:
                proto_cache[project_id] = Protocol.objects.filter(
                    code__iexact=project_id
                ).first()
            protocol = proto_cache.get(project_id)
            if not protocol:
                continue

            if not self.dry_run:
                _, is_new = Enrollment.objects.get_or_create(
                    subject=subject,
                    protocol=protocol,
                    defaults={
                        'status': EnrollmentStatus.COMPLETED,
                        'enrolled_at': timezone.now(),
                    }
                )
                if is_new:
                    created += 1
            else:
                created += 1

        self.counters['enrollments_created'] = created
        self.stdout.write(f'  Enrollment 写入: {created:,} 条')

    # ------------------------------------------------------------------
    # 统计
    # ------------------------------------------------------------------
    def _show_stats(self):
        from django.db import connection as dj_conn
        cur = dj_conn.cursor()
        print('\n=== 受试者导入后统计 ===')
        for table, label in [
            ('t_subject', '受试者总数'),
            ('t_subject_profile', '受试者档案'),
            ('t_subject_pseudonym', '假名化记录'),
            ('t_enrollment', '入组记录'),
        ]:
            try:
                cur.execute(f'SELECT COUNT(*) FROM {table}')
                print(f'  {label:16s}: {cur.fetchone()[0]:>10,}')
            except Exception:
                pass

        try:
            cur.execute(
                "SELECT COUNT(*) FROM t_subject_profile WHERE id_card_hash != '' AND id_card_hash IS NOT NULL"
            )
            print(f'  {"有身份证记录":16s}: {cur.fetchone()[0]:>10,}')
        except Exception:
            pass

    def _print_summary(self):
        mode = '[DRY-RUN]' if self.dry_run else '[实际写入]'
        self.stdout.write(self.style.SUCCESS(
            f'\n{"=" * 50}\n'
            f'  {mode} 导入完成\n'
            f'{"=" * 50}\n'
            f'  原始记录数:     {self.counters["fetched"]:>8,}\n'
            f'  新建受试者:     {self.counters["subjects_created"]:>8,}\n'
            f'  更新受试者:     {self.counters["subjects_updated"]:>8,}\n'
            f'  关联入组记录:   {self.counters["enrollments_created"]:>8,}\n'
            f'  需人工核查:     {self.counters["needs_review"]:>8,}  (同一身份证多姓名)\n'
        ))
