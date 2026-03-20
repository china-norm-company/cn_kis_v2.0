from django.db import migrations, models
import django.db.models.deletion


def forwards_fill_account_fks(apps, schema_editor):
    WorkOrder = apps.get_model('workorder', 'WorkOrder')
    Account = apps.get_model('identity', 'Account')
    existing_ids = set(Account.objects.values_list('id', flat=True))

    for wo in WorkOrder.objects.all().iterator():
        update_fields = []
        if wo.assigned_to and wo.assigned_to in existing_ids:
            wo.assigned_to_account_id = wo.assigned_to
            update_fields.append('assigned_to_account')
        if wo.created_by_id and wo.created_by_id in existing_ids:
            wo.created_by_account_id = wo.created_by_id
            update_fields.append('created_by_account')
        if update_fields:
            wo.save(update_fields=update_fields)


def backwards_clear_account_fks(apps, schema_editor):
    WorkOrder = apps.get_model('workorder', 'WorkOrder')
    WorkOrder.objects.update(
        assigned_to_account_id=None,
        created_by_account_id=None,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0003_accountrole_constraints'),
        ('workorder', '0010_add_compliance_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='workorder',
            name='assigned_to_account',
            field=models.ForeignKey(
                blank=True,
                db_column='assigned_to_account_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assigned_work_orders',
                to='identity.account',
                verbose_name='分配给账号FK',
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='created_by_account',
            field=models.ForeignKey(
                blank=True,
                db_column='created_by_account_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='created_work_orders',
                to='identity.account',
                verbose_name='创建人账号FK',
            ),
        ),
        migrations.RunPython(forwards_fill_account_fks, backwards_clear_account_fks),
    ]
