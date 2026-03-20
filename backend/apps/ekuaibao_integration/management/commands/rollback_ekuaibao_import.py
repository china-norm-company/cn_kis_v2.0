"""
rollback_ekuaibao_import — 易快报数据注入三级回滚命令

用法：
  # 全量回滚某批次（所有模块）
  python manage.py rollback_ekuaibao_import --batch 20260318_143000

  # 模块级回滚（只回滚该批次的 flows 模块）
  python manage.py rollback_ekuaibao_import --batch 20260318_143000 --module flows

  # 工作台级回滚（只回滚 finance 工作台的注入数据）
  python manage.py rollback_ekuaibao_import --batch 20260318_143000 --workstation finance

  # 单条回滚（精确回滚某条注入日志）
  python manage.py rollback_ekuaibao_import --log-id 12345

  # 预览模式（不实际回滚，只显示影响范围）
  python manage.py rollback_ekuaibao_import --batch 20260318_143000 --dry-run

  # 列出所有批次
  python manage.py rollback_ekuaibao_import --list
"""
import logging

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('cn_kis.ekuaibao.rollback')


class Command(BaseCommand):
    help = '易快报数据注入三级回滚：全量/模块/单条，防止数据污染'

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group()
        group.add_argument('--batch', type=str,
                           help='按批次号回滚（全量或配合 --module/--workstation 使用）')
        group.add_argument('--log-id', type=int, dest='log_id',
                           help='按注入日志 ID 回滚单条记录')
        group.add_argument('--list', action='store_true',
                           help='列出所有批次及状态')

        parser.add_argument('--module', type=str,
                            help='配合 --batch，限定回滚某个模块（如 flows/budgets）')
        parser.add_argument('--workstation', type=str,
                            help='配合 --batch，限定回滚某个工作台（如 finance/research）')
        parser.add_argument('--dry-run', action='store_true', dest='dry_run',
                            help='预览模式：只显示影响范围，不实际执行')
        parser.add_argument('--force', action='store_true',
                            help='跳过确认提示直接执行')

    def handle(self, *args, **options):
        if options['list']:
            self._list_batches()
            return
        if options['log_id']:
            self._rollback_single_log(options['log_id'], options['dry_run'])
            return
        if options['batch']:
            self._rollback_batch(
                options['batch'],
                module=options.get('module'),
                workstation=options.get('workstation'),
                dry_run=options['dry_run'],
                force=options['force'],
            )
            return
        raise CommandError('请指定 --batch、--log-id 或 --list')

    # ------------------------------------------------------------------
    # 列出批次
    # ------------------------------------------------------------------

    def _list_batches(self):
        from apps.ekuaibao_integration.models import EkbImportBatch
        batches = EkbImportBatch.objects.all().order_by('-create_time')
        if not batches:
            self.stdout.write('暂无导入批次记录')
            return

        self.stdout.write(self.style.SUCCESS('=== 易快报导入批次列表 ==='))
        self.stdout.write(
            f'{"批次号":<22} {"阶段":<10} {"状态":<14} {"记录数":>8} '
            f'{"已注入":>8} {"冲突":>6} {"创建时间":<20}'
        )
        self.stdout.write('-' * 100)
        for b in batches:
            status_style = (
                self.style.SUCCESS if b.status == 'injected'
                else self.style.WARNING if b.status in ('collected', 'partial')
                else self.style.ERROR if b.status == 'failed'
                else self.style.HTTP_INFO
            )
            self.stdout.write(
                f'{b.batch_no:<22} {b.phase:<10} '
                f'{status_style(b.status):<14} '
                f'{b.total_records:>8} {b.injected_records:>8} '
                f'{b.conflict_count:>6} '
                f'{b.create_time.strftime("%Y-%m-%d %H:%M"):<20}'
            )

    # ------------------------------------------------------------------
    # 批次回滚
    # ------------------------------------------------------------------

    def _rollback_batch(
        self,
        batch_no: str,
        module: str = None,
        workstation: str = None,
        dry_run: bool = False,
        force: bool = False,
    ):
        from apps.ekuaibao_integration.models import (
            EkbImportBatch, EkbInjectionLog, EkbBatchStatus
        )

        batch = EkbImportBatch.objects.filter(batch_no=batch_no).first()
        if not batch:
            raise CommandError(f'批次不存在: {batch_no}')
        if batch.status == EkbBatchStatus.ROLLED_BACK:
            raise CommandError(f'批次 {batch_no} 已经回滚过，无法重复回滚')

        qs = EkbInjectionLog.objects.filter(batch=batch, rolled_back=False)
        if module:
            qs = qs.filter(module=module)
        if workstation:
            qs = qs.filter(target_workstation=workstation)

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.WARNING(f'批次 {batch_no} 无有效注入记录'))
            return

        # 统计影响
        created_count = qs.filter(action='created').count()
        updated_count = qs.filter(action='updated').count()
        by_workstation = {}
        for item in qs.values('target_workstation').distinct():
            ws = item['target_workstation'] or 'unknown'
            by_workstation[ws] = qs.filter(target_workstation=ws).count()

        self.stdout.write(f'\n=== 回滚预览：批次 {batch_no} ===')
        if module:
            self.stdout.write(f'限定模块: {module}')
        if workstation:
            self.stdout.write(f'限定工作台: {workstation}')
        self.stdout.write(f'影响记录数: {total} 条')
        self.stdout.write(f'  - 新建记录（将被删除）: {created_count} 条')
        self.stdout.write(f'  - 更新记录（将恢复原值）: {updated_count} 条')
        self.stdout.write('\n按工作台明细:')
        for ws, count in by_workstation.items():
            self.stdout.write(f'  {ws:<20} {count:>6} 条')

        if dry_run:
            self.stdout.write(self.style.WARNING('\n[DRY-RUN] 预览完成，未执行实际回滚'))
            return

        if not force:
            confirm = input(f'\n确认回滚批次 {batch_no}? 此操作不可撤销 [yes/no]: ')
            if confirm.lower() != 'yes':
                self.stdout.write(self.style.WARNING('已取消'))
                return

        success, failed = self._execute_rollback(qs)

        # 更新批次状态
        if not module and not workstation:
            batch.status = EkbBatchStatus.ROLLED_BACK
            batch.rolled_back_at = timezone.now()
            batch.save(update_fields=['status', 'rolled_back_at'])

        self.stdout.write(self.style.SUCCESS(
            f'\n回滚完成: {success} 条成功，{failed} 条失败'
        ))

    # ------------------------------------------------------------------
    # 单条回滚
    # ------------------------------------------------------------------

    def _rollback_single_log(self, log_id: int, dry_run: bool = False):
        from apps.ekuaibao_integration.models import EkbInjectionLog

        log = EkbInjectionLog.objects.filter(id=log_id).first()
        if not log:
            raise CommandError(f'注入日志不存在: id={log_id}')
        if log.rolled_back:
            raise CommandError(f'该注入日志已回滚（id={log_id}）')

        self.stdout.write(
            f'回滚注入日志: id={log.id} module={log.module} '
            f'ekb_id={log.ekb_id} action={log.action} '
            f'target={log.target_table}#{log.target_id} '
            f'workstation={log.target_workstation}'
        )

        if dry_run:
            self.stdout.write(self.style.WARNING('[DRY-RUN] 预览完成，未执行'))
            return

        # 包装为可迭代
        class SingleItemQS:
            def __iter__(self):
                return iter([log])

        success, _ = self._execute_rollback(SingleItemQS())
        if success:
            self.stdout.write(self.style.SUCCESS(f'单条回滚成功: id={log_id}'))
        else:
            self.stdout.write(self.style.ERROR(f'单条回滚失败: id={log_id}'))

    # ------------------------------------------------------------------
    # 回滚执行引擎
    # ------------------------------------------------------------------

    def _execute_rollback(self, queryset) -> tuple:
        """
        执行回滚操作：
          - action=created: 删除目标记录（标记 is_deleted=True 或物理删除）
          - action=updated: 恢复 before_data 中的字段值
          - action=linked:  删除关联关系

        返回 (success_count, failed_count)
        """
        from django.apps import apps as django_apps

        success = 0
        failed = 0

        for log in queryset:
            try:
                with transaction.atomic():
                    self._rollback_one(log, django_apps)
                    log.rolled_back = True
                    log.rolled_back_at = timezone.now()
                    log.rollback_by = 'management_command'
                    log.save(update_fields=['rolled_back', 'rolled_back_at', 'rollback_by'])

                    # 恢复原始记录状态为 pending（可重新注入）
                    if log.raw_record:
                        log.raw_record.injection_status = 'pending'
                        log.raw_record.save(update_fields=['injection_status'])

                success += 1
                self.stdout.write(
                    f'  ✓ {log.module}:{log.ekb_id} '
                    f'({log.action} {log.target_table}#{log.target_id})'
                )
            except Exception as ex:
                failed += 1
                logger.error('回滚失败 log_id=%d: %s', log.id, ex)
                self.stdout.write(
                    self.style.ERROR(f'  ✗ {log.module}:{log.ekb_id} 失败: {ex}')
                )

        return success, failed

    def _rollback_one(self, log, django_apps):
        """回滚单条注入记录"""
        target_model = None
        for app_config in django_apps.get_app_configs():
            for model in app_config.get_models():
                if model._meta.db_table == log.target_table:
                    target_model = model
                    break
            if target_model:
                break

        if not target_model:
            raise ValueError(f'找不到表对应的 model: {log.target_table}')

        if log.action == 'created':
            # 优先使用软删除（逻辑删除），没有则物理删除
            obj = target_model.objects.filter(id=log.target_id).first()
            if obj:
                if hasattr(obj, 'is_deleted'):
                    obj.is_deleted = True
                    obj.save(update_fields=['is_deleted'])
                    logger.info('软删除: %s#%d', log.target_table, log.target_id)
                else:
                    obj.delete()
                    logger.info('物理删除: %s#%d', log.target_table, log.target_id)

        elif log.action == 'updated':
            obj = target_model.objects.filter(id=log.target_id).first()
            if not obj:
                raise ValueError(f'目标记录不存在: {log.target_table}#{log.target_id}')
            before_data = log.before_data or {}
            update_fields = []
            for field_name, old_val in before_data.items():
                if hasattr(obj, field_name):
                    setattr(obj, field_name, old_val)
                    update_fields.append(field_name)
            if update_fields:
                obj.save(update_fields=update_fields)

        elif log.action == 'linked':
            obj = target_model.objects.filter(id=log.target_id).first()
            if obj and log.before_data:
                for field_name, old_val in log.before_data.items():
                    if hasattr(obj, field_name):
                        setattr(obj, field_name, old_val)
                obj.save()
