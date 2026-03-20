"""
新增 AccountWorkstationConfig 模型

支持渐进上线场景：管理员可针对单个用户的单个工作台设置
blank（空白）/pilot（试点）/full（完整）三种模式，
前端根据模式过滤导航菜单。
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0005_remove_smsverifycode'),
    ]

    operations = [
        migrations.CreateModel(
            name='AccountWorkstationConfig',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('workstation', models.CharField(db_index=True, max_length=50, verbose_name='工作台标识')),
                ('mode', models.CharField(
                    choices=[('blank', '空白'), ('pilot', '试点'), ('full', '完整')],
                    default='full',
                    max_length=20,
                    verbose_name='模式',
                )),
                ('enabled_menus', models.JSONField(
                    blank=True,
                    default=list,
                    help_text='mode=pilot 时有效，存储允许显示的菜单标识列表',
                    verbose_name='已启用菜单',
                )),
                ('note', models.TextField(blank=True, default='', verbose_name='备注')),
                ('create_time', models.DateTimeField(auto_now_add=True)),
                ('update_time', models.DateTimeField(auto_now=True)),
                ('account', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='workstation_configs',
                    to='identity.account',
                    verbose_name='账号',
                )),
            ],
            options={
                'verbose_name': '用户工作台配置',
                'db_table': 't_account_workstation_config',
            },
        ),
        migrations.AddIndex(
            model_name='accountworkstationconfig',
            index=models.Index(fields=['account', 'workstation'], name='idx_acct_ws_config'),
        ),
        migrations.AlterUniqueTogether(
            name='accountworkstationconfig',
            unique_together={('account', 'workstation')},
        ),
    ]
