# Generated manually: 档案核验邮件（不绑定协议）+ 令牌上手写签名完成时间

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0018_witness_dual_sign_auth_token_signature_auth'),
    ]

    operations = [
        migrations.AlterField(
            model_name='witnessdualsignauthtoken',
            name='protocol_id',
            field=models.IntegerField(blank=True, db_index=True, null=True, verbose_name='协议ID'),
        ),
        migrations.AlterField(
            model_name='witnessdualsignauthtoken',
            name='icf_version_id',
            field=models.IntegerField(blank=True, null=True, verbose_name='签署节点 ICF 版本 ID'),
        ),
        migrations.AddField(
            model_name='witnessdualsignauthtoken',
            name='staff_signature_registered_at',
            field=models.DateTimeField(
                blank=True,
                help_text='档案核验邮件流：人脸通过后提交手写签名成功时回写',
                null=True,
                verbose_name='档案手写签名登记完成时间',
            ),
        ),
    ]
