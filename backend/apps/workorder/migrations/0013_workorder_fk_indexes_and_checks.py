from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workorder', '0012_workorderassignment_account_fks'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='workorder',
            index=models.Index(fields=['assigned_to_account', 'status'], name='t_work_orde_assigne_58caea_idx'),
        ),
        migrations.AddConstraint(
            model_name='workorder',
            constraint=models.CheckConstraint(
                check=(
                    models.Q(assigned_to_account__isnull=True) |
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
                    models.Q(created_by_account=models.F('created_by_id'))
                ),
                name='chk_workorder_creator_fk_match_id',
            ),
        ),
        migrations.AddIndex(
            model_name='workorderassignment',
            index=models.Index(fields=['assigned_to_account'], name='t_work_orde_assigne_05e8aa_idx'),
        ),
        migrations.AddIndex(
            model_name='workorderassignment',
            index=models.Index(fields=['assigned_by_account'], name='t_work_orde_assigne_0af839_idx'),
        ),
        migrations.AddConstraint(
            model_name='workorderassignment',
            constraint=models.CheckConstraint(
                check=(
                    models.Q(assigned_to_account__isnull=True) |
                    models.Q(assigned_to_account=models.F('assigned_to_id'))
                ),
                name='chk_wo_assignment_to_fk_match_id',
            ),
        ),
        migrations.AddConstraint(
            model_name='workorderassignment',
            constraint=models.CheckConstraint(
                check=(
                    models.Q(assigned_by_account__isnull=True) |
                    models.Q(assigned_by_account=models.F('assigned_by_id'))
                ),
                name='chk_wo_assignment_by_fk_match_id',
            ),
        ),
    ]
