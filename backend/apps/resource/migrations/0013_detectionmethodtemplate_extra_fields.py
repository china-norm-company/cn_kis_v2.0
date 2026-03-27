# Generated manually for detection method 设备名称分类 / 质控要求 / SOP附件

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('resource', '0012_rename_t_equipment__equipme_idx_t_equipment_equipme_b9c9c4_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='detectionmethodtemplate',
            name='equipment_name_classification',
            field=models.CharField(
                blank=True, default='',
                help_text='与设备台账「名称分类」一致：同规格统一类型（如 电子天平、glossymeter）',
                max_length=200, verbose_name='设备名称分类',
            ),
        ),
        migrations.AddField(
            model_name='detectionmethodtemplate',
            name='qc_requirements',
            field=models.TextField(blank=True, default='', verbose_name='质控要求'),
        ),
        migrations.AddField(
            model_name='detectionmethodtemplate',
            name='sop_attachment_url',
            field=models.CharField(
                blank=True, default='',
                help_text='上传后的访问路径，如 /media/detection_methods/sop/xxx.pdf',
                max_length=500, verbose_name='SOP 附件',
            ),
        ),
    ]
