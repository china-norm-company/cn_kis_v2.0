# Generated manually for CRM

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0007_opportunity_v1_alignment'),
    ]

    operations = [
        migrations.AddField(
            model_name='opportunity',
            name='business_type',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='业务类型'),
        ),
    ]
