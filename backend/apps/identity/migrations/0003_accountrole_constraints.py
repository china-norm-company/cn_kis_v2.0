# AccountRole: unique_together → 条件唯一约束（支持项目级角色）

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0002_role_level_category'),
    ]

    operations = [
        # 1. 移除旧的 unique_together
        migrations.AlterUniqueTogether(
            name='accountrole',
            unique_together=set(),
        ),
        # 2. project_id 加索引
        migrations.AlterField(
            model_name='accountrole',
            name='project_id',
            field=models.IntegerField(
                blank=True, db_index=True, null=True,
                verbose_name='项目ID（项目级角色）',
            ),
        ),
        # 3. 全局角色唯一约束（project_id IS NULL 时 account+role 唯一）
        migrations.AddConstraint(
            model_name='accountrole',
            constraint=models.UniqueConstraint(
                condition=models.Q(('project_id__isnull', True)),
                fields=('account', 'role'),
                name='unique_account_role_global',
            ),
        ),
        # 4. 项目级角色唯一约束（account+role+project_id 唯一）
        migrations.AddConstraint(
            model_name='accountrole',
            constraint=models.UniqueConstraint(
                condition=models.Q(('project_id__isnull', False)),
                fields=('account', 'role', 'project_id'),
                name='unique_account_role_project',
            ),
        ),
    ]
