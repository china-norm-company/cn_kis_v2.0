"""
backfill_lims_relations — 对已注入的 LIMS 数据进行业务关系回填

对已存在的数据（旧批次注入的人员和设备）补充：
1. AccountRole（角色分配）—— 根据 Staff.department 匹配 GROUP_TO_ROLES
2. LabStaffProfile（实验室档案）—— 根据 Staff.department 创建
3. MethodQualification（基础方法资质）
4. ResourceItem.manager_id —— 根据"设备责任人"姓名查找 Account
5. EquipmentAuthorization —— 为责任人和借用人创建

用法：
  # 全量回填（推荐）
  python manage.py backfill_lims_relations

  # 只回填角色
  python manage.py backfill_lims_relations --only roles

  # 只回填设备责任人
  python manage.py backfill_lims_relations --only equipment_manager

  # 预览（不执行）
  python manage.py backfill_lims_relations --dry-run
"""
import logging
from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger('cn_kis.lims.backfill')

BACKFILL_ITEMS = ['roles', 'lab_profiles', 'qualifications', 'equipment_manager', 'equipment_auth']


class Command(BaseCommand):
    help = '对已注入的 LIMS 数据进行业务关系回填（角色/LabProfile/设备责任人/授权）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--only', nargs='*', choices=BACKFILL_ITEMS,
            help=f'指定回填项目: {", ".join(BACKFILL_ITEMS)}（不指定则全部）',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='预览模式，不实际写入',
        )
        parser.add_argument(
            '--batch', type=str, default='',
            help='指定批次号（不指定则使用最新批次的原始数据）',
        )

    def handle(self, *args, **options):
        items = options.get('only') or BACKFILL_ITEMS
        dry_run = options['dry_run']
        batch_no = options.get('batch', '')

        mode = '[DRY-RUN]' if dry_run else ''
        self.stdout.write(f'=== LIMS 业务关系回填 {mode} ===\n')

        if 'roles' in items:
            self._backfill_roles(dry_run)
        if 'lab_profiles' in items:
            self._backfill_lab_profiles(dry_run)
        if 'qualifications' in items:
            self._backfill_qualifications(dry_run)
        if 'equipment_manager' in items:
            self._backfill_equipment_manager(dry_run, batch_no)
        if 'equipment_auth' in items:
            self._backfill_equipment_auth(dry_run, batch_no)

        self.stdout.write(self.style.SUCCESS('\n回填完成'))

    # ──────────────────────────────────────────────────────────────────────
    # 1. 角色回填
    # ──────────────────────────────────────────────────────────────────────

    def _backfill_roles(self, dry_run: bool):
        from apps.hr.models import Staff
        from apps.identity.models import AccountRole, Role
        from apps.lims_integration.p0_mapping import get_roles_for_group

        self.stdout.write('[1/5] 回填角色分配...')
        count_assigned = 0
        count_skip = 0

        for staff in Staff.objects.filter(is_deleted=False).select_related('account_fk'):
            account = staff.account_fk
            if not account:
                continue

            group = staff.department or ''
            role_names = get_roles_for_group(group)
            existing_role_names = set(
                AccountRole.objects.filter(account=account)
                .values_list('role__name', flat=True)
            )

            for role_name in role_names:
                if role_name in existing_role_names:
                    count_skip += 1
                    continue
                role_obj = Role.objects.filter(name=role_name).first()
                if not role_obj:
                    logger.warning('角色不存在: %s', role_name)
                    continue
                if not dry_run:
                    AccountRole.objects.get_or_create(
                        account=account,
                        role=role_obj,
                        project_id=None,
                    )
                count_assigned += 1

        self.stdout.write(self.style.SUCCESS(
            f'  角色分配: 新增 {count_assigned}，已存在跳过 {count_skip}'
        ))

    # ──────────────────────────────────────────────────────────────────────
    # 2. LabStaffProfile 回填
    # ──────────────────────────────────────────────────────────────────────

    def _backfill_lab_profiles(self, dry_run: bool):
        from apps.hr.models import Staff
        from apps.lab_personnel.models import LabStaffProfile, CompetencyLevel
        from apps.lims_integration.p0_mapping import get_lab_role_for_group, LAB_GROUPS

        self.stdout.write('[2/5] 回填 LabStaffProfile...')
        count_created = 0
        count_skip = 0

        for staff in Staff.objects.filter(is_deleted=False):
            group = staff.department or ''
            if group not in LAB_GROUPS:
                count_skip += 1
                continue
            if hasattr(staff, 'lab_profile') and staff.lab_profile:
                count_skip += 1
                continue
            try:
                if LabStaffProfile.objects.filter(staff=staff).exists():
                    count_skip += 1
                    continue
            except Exception:
                pass

            lab_role = get_lab_role_for_group(group)
            if not lab_role:
                count_skip += 1
                continue

            # 根据培训状态决定能力等级
            if staff.training_status == '试用期':
                comp = CompetencyLevel.L2_PROBATION
            else:
                comp = CompetencyLevel.L3_INDEPENDENT

            if not dry_run:
                try:
                    with transaction.atomic():
                        LabStaffProfile.objects.create(
                            staff=staff,
                            lab_role=lab_role,
                            competency_level=comp,
                            employment_type='full_time',
                            available_weekdays=[1, 2, 3, 4, 5],
                        )
                    count_created += 1
                except Exception as ex:
                    logger.debug('LabStaffProfile 回填失败 %s: %s', staff.name, ex)
            else:
                count_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'  LabStaffProfile: 新增 {count_created}，跳过 {count_skip}'
        ))

    # ──────────────────────────────────────────────────────────────────────
    # 3. MethodQualification 回填
    # ──────────────────────────────────────────────────────────────────────

    def _backfill_qualifications(self, dry_run: bool):
        from apps.hr.models import Staff
        from apps.lab_personnel.models import MethodQualification
        from apps.resource.models import DetectionMethodTemplate
        from apps.lims_integration.p0_mapping import LAB_GROUPS

        self.stdout.write('[3/5] 回填方法资质...')
        count_created = 0
        count_skip = 0

        # 确保通用方法模板存在
        generic_method, _ = DetectionMethodTemplate.objects.get_or_create(
            code='GENERIC',
            defaults={
                'name': '通用检测操作',
                'category': 'general',
                'standard_procedure': '[]',
                'description': 'LIMS 历史导入 - 通用检测操作基础资质',
            },
        )

        for staff in Staff.objects.filter(is_deleted=False, department__in=list(LAB_GROUPS)):
            if MethodQualification.objects.filter(staff=staff).exists():
                count_skip += 1
                continue
            level = 'probation' if staff.training_status == '试用期' else 'independent'
            if not dry_run:
                try:
                    with transaction.atomic():
                        MethodQualification.objects.create(
                            staff=staff,
                            method=generic_method,
                            level=level,
                            notes='LIMS 历史导入 - 通用检测操作资质',
                        )
                    count_created += 1
                except Exception as ex:
                    logger.debug('MethodQualification 回填失败 %s: %s', staff.name, ex)
            else:
                count_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'  MethodQualification: 新增 {count_created}，跳过 {count_skip}'
        ))

    # ──────────────────────────────────────────────────────────────────────
    # 4. 设备责任人回填
    # ──────────────────────────────────────────────────────────────────────

    def _backfill_equipment_manager(self, dry_run: bool, batch_no: str):
        from apps.resource.models import ResourceItem
        from apps.identity.models import Account
        from apps.lims_integration.models import RawLimsRecord, LimsImportBatch

        self.stdout.write('[4/5] 回填设备责任人 (manager_id)...')
        count_updated = 0
        count_skip = 0
        count_notfound = 0

        # 从原始数据中获取设备-责任人关系
        if batch_no:
            batch = LimsImportBatch.objects.filter(batch_no=batch_no).first()
        else:
            batch = LimsImportBatch.objects.order_by('-create_time').first()

        if not batch:
            self.stdout.write(self.style.WARNING('  无批次数据，跳过'))
            return

        for raw_rec in RawLimsRecord.objects.filter(batch=batch, module='equipment'):
            raw = raw_rec.raw_data
            # 从原始数据提取设备编号和责任人
            code = (raw.get('SBMC') or raw.get('设备名称') or '').strip()
            manager_name = (raw.get('SBZRR') or raw.get('设备责任人') or '').strip()

            if not code or not manager_name:
                count_skip += 1
                continue

            # 查找设备
            equipment = ResourceItem.objects.filter(code=code, is_deleted=False).first()
            if not equipment:
                count_skip += 1
                continue

            # 如果已有 manager_id，跳过
            if equipment.manager_id:
                count_skip += 1
                continue

            # 查找责任人 Account
            manager = (
                Account.objects.filter(display_name=manager_name, is_deleted=False).first()
                or Account.objects.filter(username=manager_name, is_deleted=False).first()
            )
            if not manager:
                count_notfound += 1
                continue

            if not dry_run:
                equipment.manager_id = manager.id
                equipment.save(update_fields=['manager_id'])
            count_updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'  设备责任人: 更新 {count_updated}，'
            f'已有跳过 {count_skip}，未找到人员 {count_notfound}'
        ))

    # ──────────────────────────────────────────────────────────────────────
    # 5. 设备授权回填
    # ──────────────────────────────────────────────────────────────────────

    def _backfill_equipment_auth(self, dry_run: bool, batch_no: str):
        from apps.resource.models import ResourceItem, EquipmentAuthorization
        from apps.identity.models import Account
        from apps.lims_integration.models import RawLimsRecord, LimsImportBatch

        self.stdout.write('[5/5] 回填设备授权 (EquipmentAuthorization)...')
        count_created = 0
        count_skip = 0

        if batch_no:
            batch = LimsImportBatch.objects.filter(batch_no=batch_no).first()
        else:
            batch = LimsImportBatch.objects.order_by('-create_time').first()

        if not batch:
            self.stdout.write(self.style.WARNING('  无批次数据，跳过'))
            return

        for raw_rec in RawLimsRecord.objects.filter(batch=batch, module='equipment'):
            raw = raw_rec.raw_data
            # 支持新字段名（SBMC/SBZRR）和旧字段名（设备名称/设备责任人）
            code = (raw.get('SBMC') or raw.get('设备名称') or '').strip()
            manager_name = (raw.get('SBZRR') or raw.get('设备责任人') or '').strip()
            borrower_name = (raw.get('SBLYR') or raw.get('设备当前借用人') or '').strip()

            if not code:
                continue

            equipment = ResourceItem.objects.filter(code=code, is_deleted=False).first()
            if not equipment:
                continue

            # 为责任人和借用人各创建授权
            for person_name, note in [
                (manager_name, '设备责任人'),
                (borrower_name, '设备借用人'),
            ]:
                if not person_name:
                    continue
                if person_name == manager_name and note == '设备借用人':
                    continue  # 责任人=借用人时不重复

                person = (
                    Account.objects.filter(display_name=person_name, is_deleted=False).first()
                    or Account.objects.filter(username=person_name, is_deleted=False).first()
                )
                if not person:
                    continue

                if EquipmentAuthorization.objects.filter(
                    equipment=equipment, operator_id=person.id
                ).exists():
                    count_skip += 1
                    continue

                if not dry_run:
                    try:
                        with transaction.atomic():
                            from datetime import date as date_cls
                            EquipmentAuthorization.objects.create(
                                equipment=equipment,
                                operator_id=person.id,
                                operator_name=person_name,
                                authorized_at=date_cls.today(),
                                is_active=True,
                                training_record=f'LIMS历史导入 - {note}',
                                authorized_by_id=person.id,
                            )
                        count_created += 1
                    except Exception as ex:
                        logger.debug('EquipmentAuth 回填失败 %s-%s: %s', code, person_name, ex)
                else:
                    count_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'  设备授权: 新增 {count_created}，已有跳过 {count_skip}'
        ))
