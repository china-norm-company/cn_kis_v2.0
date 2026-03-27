"""
知情管理演示数据种子

根据现场筛选开始日期（protocol.create_time）设计合理的知情配置状态与签署进度；
部分协议含 **planned_screening_dates**（计划现场日，最多 4 天），便于列表展示多日进度与折叠交互。
便于本地环境开发、演示与 E2E 测试。

与执行台列表一致的四态（由 API 根据 ICF/规则计算，本种子仅构造数据场景）：
- 已发布：知情已上架（本演示数据未单独构造）
- 已配置：有 ICF + 可上架条件已满足（不要求双签，或双签人员已核验）
- 配置中：有 ICF 但未满足上架条件（如开启双签但见证人员未核验）
- 待配置：无 ICF 版本（演示中 not_configured 场景）

Usage:
    python manage.py seed_consent_demo              # 插入演示数据（不覆盖已有协议）
    python manage.py seed_consent_demo --force     # 强制更新已存在的演示协议（标题、配置、签署进度）
    python manage.py seed_consent_demo --clear     # 先清空本命令创建的数据再插入

注意：若本地库缺少 subject 迁移 0030（required_reading_duration_seconds、investigator_signed_at），
本命令会使用 raw SQL 兼容。建议先执行 migrate 以获取完整 schema。
"""
from datetime import datetime
from django.core.management.base import BaseCommand
from django.db import transaction, models
from django.utils import timezone

from apps.protocol.models import Protocol
from apps.subject.models import Subject, ICFVersion, SubjectConsent


# 演示协议置顶：使用负值 consent_display_order 确保排在最前
DEMO_ORDER_OFFSET = -1000

# 7 条演示项目：现场筛选开始日期、知情配置状态、签署进度
# planned_screening_dates：知情配置中的「计划现场日」，与列表多日进度/占位行对应（最多 4 天）
DEMO_PROTOCOLS = [
    {
        'code': 'C26001001',
        'title': '保湿精华功效评价',
        'screening_date': '2025-01-15',  # 现场筛选开始日期 → create_time
        'config_type': 'configured',  # 已配置
        'signed': 12,
        'total': 15,
        'require_dual_sign': False,
        'planned_screening_dates': ['2026-03-18', '2026-03-20', '2026-03-25'],
    },
    {
        'code': 'C26001002',
        'title': '防晒霜SPF测定',
        'screening_date': '2025-02-01',
        'config_type': 'configured',
        'signed': 8,
        'total': 8,
        'require_dual_sign': False,
        'planned_screening_dates': ['2026-04-10', '2026-04-12'],
    },
    {
        'code': 'C26001003',
        'title': '美白精华临床评价',
        'screening_date': '2025-02-10',
        'config_type': 'in_progress',  # 配置中（双签未就绪等，对应列表「配置中」）
        'signed': 0,
        'total': 5,
        'require_dual_sign': True,
        'dual_sign_staffs': [{'name': '王护士', 'identity_verified': False}],  # 配置中心有展示，待核验
    },
    {
        'code': 'C26001004',
        'title': '抗皱面霜人体试验',
        'screening_date': '2025-02-20',
        'config_type': 'not_configured',  # 未配置：无 ICF
        'signed': 0,
        'total': 0,
        'require_dual_sign': False,
    },
    {
        'code': 'C26001005',
        'title': '修护精华功效评价',
        'screening_date': '2025-03-01',
        'config_type': 'configured',
        'signed': 3,
        'total': 20,
        'require_dual_sign': True,
        'dual_sign_staffs': [{'name': '张医生', 'identity_verified': True}],
        'planned_screening_dates': ['2026-05-01', '2026-05-03', '2026-05-05', '2026-05-08'],
    },
    {
        'code': 'C26001006',
        'title': '控油乳液临床评价',
        'screening_date': '2025-03-10',
        'config_type': 'not_configured',
        'signed': 0,
        'total': 0,
        'require_dual_sign': False,
    },
    {
        'code': 'C26001007',
        'title': '婴童润肤霜温和性评价',
        'screening_date': '2025-03-15',
        'config_type': 'in_progress',
        'signed': 2,
        'total': 10,
        'require_dual_sign': True,
        'dual_sign_staffs': [{'name': '李护士', 'identity_verified': False}],
    },
]


def _parse_date(s: str) -> datetime:
    dt = datetime.strptime(s, '%Y-%m-%d')
    return timezone.make_aware(dt, timezone.get_current_timezone())


def _ensure_subjects(count: int):
    """确保有足够受试者，返回 Subject 列表（可跨协议复用）"""
    existing = list(Subject.objects.filter(is_deleted=False).order_by('id')[:count])
    if len(existing) >= count:
        return existing[:count]
    created = []
    from django.db.models import Max
    last = Subject.objects.aggregate(m=Max('id'))['m'] or 0
    for i in range(count - len(existing)):
        n = last + i + 1
        s = Subject.objects.create(
            subject_no=f'SUB-2503-{n:04d}',
            name=f'受试者{n}',
            phone=f'138{n:08d}'[-11:],
            status='screening',
        )
        created.append(s)
    return existing + created


class Command(BaseCommand):
    help = '为知情管理页面生成演示数据（协议、ICF、签署记录）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='先删除本命令创建的演示协议及关联数据，再插入',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='强制更新已存在的演示协议（标题、日期、配置、签署数据）',
        )

    def handle(self, *args, **options):
        if options.get('clear'):
            with transaction.atomic():
                self._clear_demo_data()
        with transaction.atomic():
            self._seed_demo_data(options.get('force', False))

    def _table_has_column(self, table: str, column: str) -> bool:
        from django.db import connection
        try:
            with connection.cursor() as c:
                desc = connection.introspection.get_table_description(c, table)
            return any(getattr(col, 'name', None) == column for col in desc)
        except Exception:
            return False

    def _create_icf_version(self, protocol_id: int) -> ICFVersion:
        """创建 ICF 版本，兼容缺少 required_reading_duration_seconds 列的旧库"""
        from django.db import connection
        from django.utils import timezone
        now = timezone.now().isoformat()
        content = '<p>本知情同意书用于化妆品临床功效评价试验，受试者需充分了解试验目的、流程、可能风险及权益后自愿签署。</p>'
        if self._table_has_column('t_icf_version', 'required_reading_duration_seconds'):
            from apps.subject.services.consent_service import create_icf_version
            return create_icf_version(
                protocol_id=protocol_id,
                version='v1.0',
                content=content,
                is_active=True,
                node_title='主知情同意书',
            )
        cols = ['protocol_id', 'version', 'file_path', 'content', 'is_active', 'create_time', 'update_time']
        content_esc = content.replace("'", "''")
        vals = [f"{protocol_id}", "'v1.0'", "''", f"'{content_esc}'", '1', f"'{now}'", f"'{now}'"]
        if self._table_has_column('t_icf_version', 'node_title'):
            cols.append('node_title')
            vals.append("'主知情同意书'")
        if self._table_has_column('t_icf_version', 'display_order'):
            cols.append('display_order')
            vals.append('0')
        with connection.cursor() as c:
            sql = f"INSERT INTO t_icf_version ({', '.join(cols)}) VALUES ({', '.join(vals)})"
            c.execute(sql)
            icf_id = c.lastrowid
        return ICFVersion.objects.defer('required_reading_duration_seconds').get(id=icf_id)

    def _create_subject_consent(self, subject_id: int, icf_version_id: int, is_signed: bool, protocol_id: int, j: int):
        """创建签署记录，兼容缺少 investigator_signed_at 列的旧库"""
        from django.db import connection
        now = timezone.now().isoformat()
        signed_at = now if is_signed else None
        receipt_no = f'ICF-RCP-SEED-{protocol_id}-{j:03d}' if is_signed else None
        if self._table_has_column('t_subject_consent', 'investigator_signed_at'):
            SubjectConsent.objects.create(
                subject_id=subject_id,
                icf_version_id=icf_version_id,
                is_signed=is_signed,
                signed_at=timezone.now() if is_signed else None,
                receipt_no=receipt_no,
            )
        else:
            with connection.cursor() as c:
                sql = f"""INSERT INTO t_subject_consent (subject_id, icf_version_id, is_signed, signed_at, receipt_no, create_time, update_time)
VALUES ({subject_id}, {icf_version_id}, {1 if is_signed else 0}, {f"'{signed_at}'" if signed_at else 'NULL'}, {f"'{receipt_no}'" if receipt_no else 'NULL'}, '{now}', '{now}')"""
                c.execute(sql)

    def _sync_icf_and_consents(self, protocol: Protocol, spec: dict):
        """为已有协议同步 ICF 与签署记录（force 时调用）"""
        from django.db import connection
        total = spec['total']
        signed = spec['signed']
        icf_ids = list(ICFVersion.objects.filter(protocol_id=protocol.id).values_list('id', flat=True))
        if icf_ids:
            ph = ','.join(str(x) for x in icf_ids)
            with connection.cursor() as c:
                c.execute(f'DELETE FROM t_subject_consent WHERE icf_version_id IN ({ph})')
                c.execute(f'DELETE FROM t_icf_version WHERE id IN ({ph})')
        icf = self._create_icf_version(protocol.id)
        if total > 0:
            subjects = _ensure_subjects(total)
            for j, subj in enumerate(subjects[:total]):
                is_signed = j < signed
                self._create_subject_consent(subj.id, icf.id, is_signed, protocol.id, j)

    def _clear_demo_data(self):
        from django.db import connection
        codes = [p['code'] for p in DEMO_PROTOCOLS]
        ids = list(Protocol.objects.filter(code__in=codes, is_deleted=False).values_list('id', flat=True))
        if not ids:
            self.stdout.write('无演示数据需清理')
            return
        ph = ','.join(str(x) for x in ids)
        with connection.cursor() as c:
            c.execute(f'DELETE FROM t_subject_consent WHERE icf_version_id IN (SELECT id FROM t_icf_version WHERE protocol_id IN ({ph}))')
            c.execute(f'DELETE FROM t_icf_version WHERE protocol_id IN ({ph})')
            c.execute(f'DELETE FROM t_protocol WHERE id IN ({ph})')
        self.stdout.write(self.style.SUCCESS(f'已清理 {len(ids)} 条演示协议及关联数据'))

    def _seed_demo_data(self, force: bool = False):
        for i, spec in enumerate(DEMO_PROTOCOLS):
            protocol = Protocol.objects.filter(code=spec['code'], is_deleted=False).first()
            if protocol:
                if not force:
                    self.stdout.write(f'跳过已存在: {spec["code"]} {spec["title"]}')
                    continue
                create_time = _parse_date(spec['screening_date'])
                protocol.title = spec['title']
                protocol.create_time = create_time
                protocol.update_time = create_time
                protocol.status = 'uploaded'
                settings = {
                    'require_face_verify': True,
                    'require_dual_sign': spec.get('require_dual_sign', False),
                    'require_comprehension_quiz': False,
                    'min_reading_duration_seconds': 30,
                    'dual_sign_staffs': spec.get('dual_sign_staffs', []),
                    'planned_screening_dates': spec.get('planned_screening_dates', []),
                }
                protocol.parsed_data = {'consent_settings': settings}
                protocol.consent_display_order = DEMO_ORDER_OFFSET + i
                protocol.save(update_fields=['title', 'create_time', 'update_time', 'status', 'parsed_data', 'consent_display_order'])
                self._sync_icf_and_consents(protocol, spec)
                self.stdout.write(self.style.SUCCESS(f'更新: {spec["code"]} {spec["title"]}'))
                continue

            create_time = _parse_date(spec['screening_date'])
            protocol = Protocol.objects.create(
                title=spec['title'],
                code=spec['code'],
                status='uploaded',
                consent_display_order=DEMO_ORDER_OFFSET + i,
                create_time=create_time,
                update_time=create_time,
            )

            # parsed_data.consent_settings
            settings = {
                'require_face_verify': True,
                'require_dual_sign': spec.get('require_dual_sign', False),
                'require_comprehension_quiz': False,
                'min_reading_duration_seconds': 30,
                'dual_sign_staffs': spec.get('dual_sign_staffs', []),
                'planned_screening_dates': spec.get('planned_screening_dates', []),
            }
            protocol.parsed_data = {'consent_settings': settings}
            protocol.save(update_fields=['parsed_data', 'update_time'])

            total = spec['total']
            signed = spec['signed']

            # 所有协议都创建 ICF，进入时均有版本可看；有 total 的再创建签署记录
            icf = self._create_icf_version(protocol.id)
            if total > 0:
                subjects = _ensure_subjects(total)
                for j, subj in enumerate(subjects[:total]):
                    is_signed = j < signed
                    self._create_subject_consent(subj.id, icf.id, is_signed, protocol.id, j)

            self.stdout.write(
                self.style.SUCCESS(
                    f'创建: {spec["code"]} {spec["title"]} | '
                    f'现场筛选 {spec["screening_date"]} | '
                    f'{spec["config_type"]} | {signed}/{total}'
                )
            )

        self.stdout.write(self.style.SUCCESS('知情管理演示数据种子完成'))
