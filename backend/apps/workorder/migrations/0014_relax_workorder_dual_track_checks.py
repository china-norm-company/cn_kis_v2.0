from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workorder', '0013_workorder_fk_indexes_and_checks'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='workorder',
            name='chk_workorder_assignee_fk_match_id',
        ),
        migrations.RemoveConstraint(
            model_name='workorder',
            name='chk_workorder_creator_fk_match_id',
        ),
        migrations.AddConstraint(
            model_name='workorder',
            constraint=models.CheckConstraint(
                check=(
                    models.Q(assigned_to_account__isnull=True) |
                    models.Q(assigned_to__isnull=True) |
                    models.Q(assigned_to_account=models.F('assigned_to'))
                ),
                name='chk_workorder_assignee_fk_match_id',
            ),
        ),
        migrations.AddConstraint(
            model_name='workorder',
            constraint=models.CheckConstraint(
                check=(
                    models.Q(created_by_account__isnull=True) |
                    models.Q(created_by_id__isnull=True) |
                    models.Q(created_by_account=models.F('created_by_id'))
                ),
                name='chk_workorder_creator_fk_match_id',
            ),
        ),
    ]
