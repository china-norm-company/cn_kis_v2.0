# Generated for eConsent receipt_no

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0016_identity_verify_session'),
    ]

    operations = [
        migrations.AddField(
            model_name='subjectconsent',
            name='receipt_no',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True, unique=True, verbose_name='签署回执号'),
        ),
    ]
