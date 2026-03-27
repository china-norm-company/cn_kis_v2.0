# Generated for consent management: protocol signing order
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0007_add_product_line_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='protocol',
            name='consent_display_order',
            field=models.IntegerField(default=0, verbose_name='知情管理展示顺序（越小越靠前）', db_index=True),
        ),
    ]
