from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import F


class Command(BaseCommand):
    help = '审计 FK 双轨字段与 legacy *_id 字段的一致性'

    def handle(self, *args, **options):
        self._audit_workorder()
        self._audit_workorder_assignment()
        self._audit_hr_staff()

    def _audit_workorder(self):
        from apps.workorder.models import WorkOrder

        total = WorkOrder.objects.count()
        required_columns = ['assigned_to_account_id', 'created_by_account_id']
        if not self._has_db_columns(WorkOrder, required_columns):
            self.stdout.write('\n[WorkOrder]')
            self.stdout.write(f'  total: {total}')
            self.stdout.write('  skipped: missing dual-track columns in current DB (run migrations first)')
            return

        assignee_mismatch_qs = WorkOrder.objects.filter(
            assigned_to_account__isnull=False,
        ).exclude(assigned_to_account=F('assigned_to'))
        creator_mismatch_qs = WorkOrder.objects.filter(
            created_by_account__isnull=False,
        ).exclude(created_by_account=F('created_by_id'))

        self.stdout.write('\n[WorkOrder]')
        self.stdout.write(f'  total: {total}')
        self.stdout.write(f'  assignee_fk_mismatch: {assignee_mismatch_qs.count()}')
        self.stdout.write(f'  creator_fk_mismatch: {creator_mismatch_qs.count()}')

        sample = list(
            assignee_mismatch_qs.values('id', 'assigned_to', 'assigned_to_account_id')[:10]
        )
        if sample:
            self.stdout.write('  assignee mismatch samples:')
            for row in sample:
                self.stdout.write(
                    f"    - id={row['id']} legacy={row['assigned_to']} fk={row['assigned_to_account_id']}"
                )

    def _audit_workorder_assignment(self):
        from apps.workorder.models import WorkOrderAssignment

        total = WorkOrderAssignment.objects.count()
        required_columns = ['assigned_to_account_id', 'assigned_by_account_id']
        if not self._has_db_columns(WorkOrderAssignment, required_columns):
            self.stdout.write('\n[WorkOrderAssignment]')
            self.stdout.write(f'  total: {total}')
            self.stdout.write('  skipped: missing dual-track columns in current DB (run migrations first)')
            return

        assignee_mismatch_qs = WorkOrderAssignment.objects.filter(
            assigned_to_account__isnull=False,
        ).exclude(assigned_to_account=F('assigned_to_id'))
        assigner_mismatch_qs = WorkOrderAssignment.objects.filter(
            assigned_by_account__isnull=False,
        ).exclude(assigned_by_account=F('assigned_by_id'))

        self.stdout.write('\n[WorkOrderAssignment]')
        self.stdout.write(f'  total: {total}')
        self.stdout.write(f'  assigned_to_fk_mismatch: {assignee_mismatch_qs.count()}')
        self.stdout.write(f'  assigned_by_fk_mismatch: {assigner_mismatch_qs.count()}')

        sample = list(
            assignee_mismatch_qs.values('id', 'assigned_to_id', 'assigned_to_account_id')[:10]
        )
        if sample:
            self.stdout.write('  assigned_to mismatch samples:')
            for row in sample:
                self.stdout.write(
                    f"    - id={row['id']} legacy={row['assigned_to_id']} fk={row['assigned_to_account_id']}"
                )

    def _audit_hr_staff(self):
        from apps.hr.models import Staff

        total = Staff.objects.count()
        required_columns = ['account_fk_id']
        if not self._has_db_columns(Staff, required_columns):
            self.stdout.write('\n[HR Staff]')
            self.stdout.write(f'  total: {total}')
            self.stdout.write('  skipped: missing dual-track columns in current DB (run migrations first)')
            return

        mismatch_qs = Staff.objects.filter(account_fk__isnull=False).exclude(account_fk=F('account_id'))
        only_legacy_qs = Staff.objects.filter(account_fk__isnull=True).filter(account_id__isnull=False)
        only_fk_qs = Staff.objects.filter(account_fk__isnull=False, account_id__isnull=True)

        self.stdout.write('\n[HR Staff]')
        self.stdout.write(f'  total: {total}')
        self.stdout.write(f'  fk_mismatch: {mismatch_qs.count()}')
        self.stdout.write(f'  only_legacy: {only_legacy_qs.count()}')
        self.stdout.write(f'  only_fk: {only_fk_qs.count()}')

        sample = list(mismatch_qs.values('id', 'account_id', 'account_fk_id')[:10])
        if sample:
            self.stdout.write('  mismatch samples:')
            for row in sample:
                self.stdout.write(
                    f"    - id={row['id']} legacy={row['account_id']} fk={row['account_fk_id']}"
                )

    def _has_db_columns(self, model, required_columns):
        table_name = model._meta.db_table
        with connection.cursor() as cursor:
            descriptions = connection.introspection.get_table_description(cursor, table_name)
        existing_columns = {d.name for d in descriptions}
        return all(col in existing_columns for col in required_columns)
