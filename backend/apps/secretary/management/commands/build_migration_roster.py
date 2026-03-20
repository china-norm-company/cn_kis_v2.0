"""
build_migration_roster — 飞书全量迁移用户名册构建

使用方式：
    python manage.py build_migration_roster
    python manage.py build_migration_roster --dry-run
    python manage.py build_migration_roster --reset-failed
    python manage.py build_migration_roster --show-summary

逻辑：
1. 调用飞书通讯录 API 递归获取所有部门和用户（含离职/停用）
2. 与本地 Account + FeishuUserToken 交叉比对
3. 为每个用户 x 每个数据源创建 FeishuMigrationCheckpoint（幂等）
4. 检测 token 有效性，标记 auth_mode（user_token / degraded / skipped）
"""
import logging
import time
from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)

# 全部 12 个数据源
ALL_SOURCES = [
    'mail',         # 邮件收件箱（user token 优先，降级 tenant by email）
    'im',           # IM 群聊消息（user token 优先）
    'calendar',     # 日历事件（user token，无法 tenant 降级）
    'task',         # 个人任务（user token，无法 tenant 降级）
    'approval',     # 审批实例（tenant token 可全局查）
    'doc',          # 飞书云文档 docx（tenant token）
    'wiki',         # 飞书知识库（tenant token）
    'sheet',        # 电子表格（tenant/user token）
    'slide',        # PPT 幻灯片（tenant/user token）
    'drive_file',   # 其他云空间文件/图片/PDF（tenant/user token）
    'group_msg',    # 项目群消息（tenant token，需应用在群内）
    'contact',      # 通讯录快照（tenant token，__TENANT__ 维度，只需一条）
]

# 只能用 user_token，tenant 无法降级的数据源
USER_ONLY_SOURCES = {'calendar', 'task'}

# 租户维度（不依赖具体用户），用 __TENANT__ 作为占位
TENANT_SOURCES = {'approval', 'wiki', 'contact', 'group_msg'}


class Command(BaseCommand):
    help = '构建飞书全量迁移用户名册，初始化 FeishuMigrationCheckpoint'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='仅打印将要创建的条目，不写入数据库',
        )
        parser.add_argument(
            '--reset-failed', action='store_true',
            help='将状态为 failed 的 checkpoint 重置为 pending',
        )
        parser.add_argument(
            '--show-summary', action='store_true',
            help='仅显示当前 checkpoint 统计，不执行构建',
        )
        parser.add_argument(
            '--sources', type=str, default='',
            help='指定数据源，逗号分隔，默认全部。如 mail,im,doc',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        reset_failed = options['reset_failed']
        show_summary = options['show_summary']
        sources_filter = [s.strip() for s in options['sources'].split(',') if s.strip()]
        target_sources = sources_filter if sources_filter else ALL_SOURCES

        if show_summary:
            self._show_summary()
            return

        if reset_failed:
            self._reset_failed()

        self.stdout.write('=' * 60)
        self.stdout.write('飞书全量迁移用户名册构建')
        self.stdout.write(f'数据源: {target_sources}')
        self.stdout.write(f'Dry-run: {dry_run}')
        self.stdout.write('=' * 60)

        # Step 1: 从飞书通讯录获取所有用户
        feishu_users = self._fetch_all_feishu_users()
        self.stdout.write(f'\n飞书通讯录用户: {len(feishu_users)} 人')

        # Step 2: 从本地 Account 表补充
        local_accounts = self._load_local_accounts()
        self.stdout.write(f'本地 Account 记录: {len(local_accounts)} 条')

        # Step 3: 合并，建立完整用户集合
        merged_users = self._merge_users(feishu_users, local_accounts)
        self.stdout.write(f'合并后用户总数: {len(merged_users)} 人')

        # Step 4: 检测 token 有效性
        token_map = self._load_token_map()
        self.stdout.write(f'有效 Token 记录: {len(token_map)} 个')

        # Step 5: 创建 checkpoint
        if not dry_run:
            created, skipped = self._init_checkpoints(merged_users, token_map, target_sources)
            # Step 6: 为租户维度数据源创建 __TENANT__ checkpoint
            tenant_sources = [s for s in target_sources if s in TENANT_SOURCES]
            t_created, t_skipped = self._init_tenant_checkpoints(tenant_sources)
            self.stdout.write(
                f'\n已创建 checkpoint: {created + t_created} 条'
                f'（跳过已有: {skipped + t_skipped} 条）'
            )
        else:
            self.stdout.write('\n[DRY-RUN] 用户名册预览:')
            for u in merged_users[:20]:
                token_ok = u['open_id'] in token_map
                mode = 'user_token' if token_ok else ('degraded' if u.get('email') else 'skipped')
                self.stdout.write(
                    f"  {u.get('name', '?'):<15} {u['open_id'][:20]:<22} "
                    f"email={u.get('email', ''):<30} auth={mode}"
                )
            if len(merged_users) > 20:
                self.stdout.write(f'  ... 共 {len(merged_users)} 人')

        self._show_summary()

    # ================================================================
    # 飞书通讯录全量获取
    # ================================================================

    def _fetch_all_feishu_users(self):
        """递归获取所有部门的所有用户，包括已离职/停用。"""
        from libs.feishu_client import feishu_client

        users = {}

        def _fetch_dept_users(dept_id: str):
            # 飞书通讯录 API 要求 department_id 以 od- 开头（open_department_id 格式）
            # 根部门用 '0'，其他部门需以 'od-' 开头才是有效的 open_department_id
            if dept_id != '0' and not dept_id.startswith('od-'):
                return
            page_token = ''
            while True:
                try:
                    resp = feishu_client.list_users(
                        department_id=dept_id,
                        page_token=page_token,
                        page_size=50,
                    )
                    data = resp if isinstance(resp, dict) else {}
                    items = data.get('items') or data.get('user_list') or []
                    for u in items:
                        open_id = u.get('open_id', '')
                        if open_id and open_id not in users:
                            users[open_id] = {
                                'open_id': open_id,
                                'user_id': u.get('user_id', ''),
                                'union_id': u.get('union_id', ''),
                                'name': u.get('name', ''),
                                'email': (u.get('enterprise_email') or u.get('email') or ''),
                                'mobile': u.get('mobile', ''),
                                'status': u.get('status', {}),
                                'department_ids': u.get('department_ids', []),
                                'source': 'feishu_contact',
                            }
                    if not data.get('has_more', False):
                        break
                    page_token = data.get('page_token', '')
                    time.sleep(0.3)
                except Exception as e:
                    logger.warning('获取部门 %s 用户失败: %s', dept_id, e)
                    break

        def _fetch_sub_depts(parent_id: str):
            page_token = ''
            while True:
                try:
                    resp = feishu_client.list_departments(
                        parent_department_id=parent_id,
                        page_token=page_token,
                        page_size=50,
                    )
                    data = resp if isinstance(resp, dict) else {}
                    items = data.get('items') or []
                    for dept in items:
                        dept_id = dept.get('open_department_id') or dept.get('department_id', '')
                        if dept_id and dept_id.startswith('od-'):
                            _fetch_dept_users(dept_id)
                            _fetch_sub_depts(dept_id)
                    if not data.get('has_more', False):
                        break
                    page_token = data.get('page_token', '')
                    time.sleep(0.3)
                except Exception as e:
                    logger.warning('获取子部门失败 parent=%s: %s', parent_id, e)
                    break

        # 从根部门开始递归
        _fetch_dept_users('0')
        _fetch_sub_depts('0')

        return list(users.values())

    # ================================================================
    # 本地数据加载
    # ================================================================

    def _load_local_accounts(self):
        """从 Account 表加载所有有 feishu_open_id 的账号。"""
        from apps.identity.models import Account
        accounts = Account.objects.filter(
            is_deleted=False,
        ).exclude(feishu_open_id='').exclude(feishu_open_id__isnull=True).values(
            'id', 'feishu_open_id', 'feishu_user_id', 'display_name', 'email', 'status',
        )
        return {a['feishu_open_id']: a for a in accounts}

    def _load_token_map(self):
        """从 FeishuUserToken 表加载所有有效或可刷新的 token。"""
        from apps.secretary.models import FeishuUserToken
        from django.utils import timezone

        now = timezone.now()
        tokens = FeishuUserToken.objects.filter(
            requires_reauth=False,
        ).values('account_id', 'open_id', 'access_token', 'refresh_token',
                 'token_expires_at', 'refresh_expires_at')

        token_map = {}
        for t in tokens:
            open_id = t['open_id']
            # refresh_token 有效期内视为"可用"
            refresh_ok = t.get('refresh_expires_at') and t['refresh_expires_at'] > now
            access_ok = t['token_expires_at'] > now
            if access_ok or refresh_ok:
                token_map[open_id] = {
                    'account_id': t['account_id'],
                    'access_ok': access_ok,
                    'refresh_ok': refresh_ok,
                }
        return token_map

    # ================================================================
    # 用户合并
    # ================================================================

    def _merge_users(self, feishu_users, local_accounts):
        """合并飞书通讯录用户和本地 Account，以 open_id 为主键去重。"""
        merged = {}

        for u in feishu_users:
            open_id = u['open_id']
            merged[open_id] = u

        # 补充本地 Account 中不在飞书通讯录的用户（如外部账号）
        for open_id, acc in local_accounts.items():
            if open_id not in merged:
                merged[open_id] = {
                    'open_id': open_id,
                    'user_id': acc.get('feishu_user_id', ''),
                    'name': acc.get('display_name', ''),
                    'email': acc.get('email', ''),
                    'source': 'local_account',
                    'account_status': acc.get('status', ''),
                }
            else:
                # 用本地数据补充邮箱（通讯录有时没企业邮箱）
                if not merged[open_id].get('email') and acc.get('email'):
                    merged[open_id]['email'] = acc['email']

        return list(merged.values())

    # ================================================================
    # Checkpoint 初始化
    # ================================================================

    def _init_checkpoints(self, users, token_map, target_sources):
        """为每个用户 × 每个数据源创建/更新 checkpoint。"""
        from apps.secretary.models import FeishuMigrationCheckpoint, MigrationStatus

        created = skipped = 0

        for user in users:
            open_id = user['open_id']
            name = user.get('name', '')
            email = user.get('email', '')

            # 确定认证模式
            if open_id in token_map:
                auth_mode = 'user_token'
            elif email:
                auth_mode = 'degraded'
            else:
                auth_mode = 'skipped'

            for source in target_sources:
                if source in TENANT_SOURCES:
                    continue  # 租户维度单独处理

                # user_only 数据源且 token 过期 → skipped
                effective_auth = auth_mode
                if source in USER_ONLY_SOURCES and auth_mode != 'user_token':
                    effective_auth = 'skipped'

                obj, was_created = FeishuMigrationCheckpoint.objects.get_or_create(
                    user_open_id=open_id,
                    source_type=source,
                    defaults={
                        'user_name': name,
                        'user_email': email,
                        'status': MigrationStatus.PENDING,
                        'auth_mode': effective_auth,
                    },
                )
                if was_created:
                    created += 1
                else:
                    # 仅更新 auth_mode 和基本信息（不重置已完成的状态）
                    update_fields = []
                    if not obj.user_name and name:
                        obj.user_name = name
                        update_fields.append('user_name')
                    if not obj.user_email and email:
                        obj.user_email = email
                        update_fields.append('user_email')
                    if obj.auth_mode != effective_auth and obj.status == MigrationStatus.PENDING:
                        obj.auth_mode = effective_auth
                        update_fields.append('auth_mode')
                    if update_fields:
                        obj.save(update_fields=update_fields)
                    skipped += 1

        return created, skipped

    def _init_tenant_checkpoints(self, tenant_sources):
        """为租户维度数据源创建 __TENANT__ checkpoint。"""
        from apps.secretary.models import FeishuMigrationCheckpoint, MigrationStatus

        created = skipped = 0
        for source in tenant_sources:
            obj, was_created = FeishuMigrationCheckpoint.objects.get_or_create(
                user_open_id='__TENANT__',
                source_type=source,
                defaults={
                    'user_name': '租户维度',
                    'user_email': '',
                    'status': MigrationStatus.PENDING,
                    'auth_mode': 'tenant_token',
                },
            )
            if was_created:
                created += 1
            else:
                skipped += 1
        return created, skipped

    # ================================================================
    # 辅助
    # ================================================================

    def _reset_failed(self):
        from apps.secretary.models import FeishuMigrationCheckpoint, MigrationStatus
        count = FeishuMigrationCheckpoint.objects.filter(
            status=MigrationStatus.FAILED,
        ).update(status=MigrationStatus.PENDING, page_token='', error_log='')
        self.stdout.write(f'已重置 {count} 条 failed 状态为 pending')

    def _show_summary(self):
        from apps.secretary.models import FeishuMigrationCheckpoint
        from django.db.models import Count

        self.stdout.write('\n===== 当前 Checkpoint 统计 =====')
        stats = (
            FeishuMigrationCheckpoint.objects
            .values('source_type', 'status')
            .annotate(count=Count('id'))
            .order_by('source_type', 'status')
        )
        if not stats:
            self.stdout.write('  暂无记录')
            return

        last_source = None
        for row in stats:
            if row['source_type'] != last_source:
                last_source = row['source_type']
                self.stdout.write(f'\n  [{last_source}]')
            self.stdout.write(f"    {row['status']:<12} {row['count']} 条")

        total = FeishuMigrationCheckpoint.objects.count()
        completed = FeishuMigrationCheckpoint.objects.filter(status='completed').count()
        self.stdout.write(f'\n  总计: {total} 条，已完成: {completed} 条'
                          f'（{completed * 100 // total if total else 0}%）')
