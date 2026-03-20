from django.db import migrations, models
import django.db.models.deletion


def forwards_fill_assignment_fks(apps, schema_editor):
    WorkOrderAssignment = apps.get_model('workorder', 'WorkOrderAssignment')
    Account = apps.get_model('identity', 'Account')
    existing_ids = set(Account.objects.values_list('id', flat=True))

    for row in WorkOrderAssignment.objects.all().iterator():
        update_fields = []
        if row.assigned_to_id and row.assigned_to_id in existing_ids:
            row.assigned_to_account_id = row.assigned_to_id
            update_fields.append('assigned_to_account')
        if row.assigned_by_id and row.assigned_by_id in existing_ids:
            row.assigned_by_account_id = row.assigned_by_id
            update_fields.append('assigned_by_account')
        if update_fields:
            row.save(update_fields=update_fields)


def backwards_clear_assignment_fks(apps, schema_editor):
    WorkOrderAssignment = apps.get_model('workorder', 'WorkOrderAssignment')
    WorkOrderAssignment.objects.update(
        assigned_to_account_id=None,
        assigned_by_account_id=None,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0003_accountrole_constraints'),
        ('workorder', '0011_workorder_account_fks'),
    ]

    operations = [
        migrations.AddField(
            model_name='workorderassignment',
            name='assigned_by_account',
            field=models.ForeignKey(
                blank=True,
                db_column='assigned_by_account_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='workorder_assignments_sent',
                to='identity.account',
                verbose_name='分配人账号FK',
            ),
        ),
        migrations.AddField(
            model_name='workorderassignment',
            name='assigned_to_account',
            field=models.ForeignKey(
                blank=True,
                db_column='assigned_to_account_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='workorder_assignments_received',
                to='identity.account',
                verbose_name='被分配人账号FK',
            ),
        ),
        migrations.RunPython(forwards_fill_assignment_fks, backwards_clear_assignment_fks),
    ]
