from django.db import migrations, models
import django.db.models.deletion


def forwards_fill_account_fk(apps, schema_editor):
    Staff = apps.get_model('hr', 'Staff')
    Account = apps.get_model('identity', 'Account')
    existing_ids = set(Account.objects.values_list('id', flat=True))

    for staff in Staff.objects.exclude(account_id__isnull=True).iterator():
        if staff.account_id in existing_ids:
            staff.account_fk_id = staff.account_id
            staff.save(update_fields=['account_fk'])


def backwards_clear_account_fk(apps, schema_editor):
    Staff = apps.get_model('hr', 'Staff')
    Staff.objects.update(account_fk_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0003_accountrole_constraints'),
        ('hr', '0003_cultureactivity_engagementpulse_performancecycle_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='staff',
            name='account_fk',
            field=models.ForeignKey(
                blank=True,
                db_column='account_fk_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='hr_staff_records',
                to='identity.account',
                verbose_name='关联账户FK',
            ),
        ),
        migrations.RunPython(forwards_fill_account_fk, backwards_clear_account_fk),
    ]
