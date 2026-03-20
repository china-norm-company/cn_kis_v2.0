"""
Allow WorkflowInstance.definition to be nullable for simple change records.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('workflow', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workflowinstance',
            name='definition',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='instances',
                to='workflow.workflowdefinition',
                verbose_name='流程定义',
            ),
        ),
    ]
