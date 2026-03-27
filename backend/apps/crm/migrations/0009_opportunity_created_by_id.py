from django.db import migrations, models


DEFAULT_CREATOR_EMAIL = 'yaosiyu@china-norm.com'


def backfill_opportunity_created_by(apps, schema_editor):
    Opportunity = apps.get_model('crm', 'Opportunity')
    Account = apps.get_model('identity', 'Account')

    default_acc = Account.objects.filter(
        email__iexact=DEFAULT_CREATOR_EMAIL,
        is_deleted=False,
    ).first()
    default_id = default_acc.id if default_acc else None

    qs = Opportunity.objects.all()
    for opp in qs.iterator():
        if opp.created_by_id:
            continue
        opp.created_by_id = default_id
        opp.save(update_fields=['created_by_id'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0008_add_ekuaibao_staff_fields'),
        ('crm', '0008_opportunity_business_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='opportunity',
            name='created_by_id',
            field=models.IntegerField(blank=True, db_index=True, help_text='Account ID', null=True, verbose_name='创建人ID'),
        ),
        migrations.RunPython(backfill_opportunity_created_by, noop_reverse),
    ]

