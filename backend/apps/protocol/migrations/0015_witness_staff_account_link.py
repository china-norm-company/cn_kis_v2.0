# Generated manually for witness staff ↔ identity account linkage

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        # v2 identity 无 v1 的 0008_execution_pilot_add_consent_menu；仅需 Account 已存在
        ('identity', '0008_add_ekuaibao_staff_fields'),
        ('protocol', '0014_witness_staff_and_auth_token'),
    ]

    operations = [
        migrations.AddField(
            model_name='witnessstaff',
            name='account',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='witness_staff_profile',
                to='identity.account',
                verbose_name='治理台账号',
            ),
        ),
    ]
