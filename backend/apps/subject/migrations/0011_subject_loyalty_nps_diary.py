# Generated manually for missing loyalty models

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0010_alter_subject_status_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='SubjectNPS',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject_id', models.IntegerField(db_index=True, verbose_name='受试者ID')),
                ('plan_id', models.IntegerField(blank=True, null=True, verbose_name='关联计划ID')),
                ('score', models.IntegerField(verbose_name='NPS评分(0-10)')),
                ('comment', models.TextField(blank=True, default='', verbose_name='评论')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '受试者NPS评分',
                'db_table': 't_subject_nps',
            },
        ),
        migrations.CreateModel(
            name='SubjectDiary',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject_id', models.IntegerField(db_index=True, verbose_name='受试者ID')),
                ('entry_date', models.DateField(db_index=True, verbose_name='日期')),
                ('mood', models.CharField(blank=True, default='', max_length=20, verbose_name='心情')),
                ('symptoms', models.TextField(blank=True, default='', verbose_name='症状描述')),
                ('medication_taken', models.BooleanField(default=True, verbose_name='是否用药')),
                ('notes', models.TextField(blank=True, default='', verbose_name='备注')),
                ('is_deleted', models.BooleanField(default=False, verbose_name='是否删除')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '受试者日记',
                'db_table': 't_subject_diary',
                'unique_together': {('subject_id', 'entry_date')},
            },
        ),
    ]
