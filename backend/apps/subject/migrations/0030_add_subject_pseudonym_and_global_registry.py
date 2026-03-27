"""
受试者假名化模型 Migration

新增：
  - t_subject_pseudonym：受试者假名化记录（AES加密姓名/手机、SHA256身份证哈希、假名码）
  - t_subject_global_registry：受试者全局编号注册表（防重复入组）
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0029_merge_20260320_1824'),
    ]

    operations = [
        migrations.CreateModel(
            name='SubjectPseudonym',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject', models.OneToOneField(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='pseudonym',
                    to='subject.subject',
                    verbose_name='受试者',
                    db_index=True,
                )),
                ('pseudonym_code', models.CharField(
                    max_length=32,
                    unique=True,
                    verbose_name='假名码',
                    help_text='研究用随机码，如 CN2026-0042，可对外公开',
                )),
                ('name_encrypted', models.TextField(
                    blank=True,
                    default='',
                    verbose_name='加密姓名',
                    help_text='AES-256-GCM 加密的姓名，Base64 编码存储',
                )),
                ('phone_encrypted', models.TextField(
                    blank=True,
                    default='',
                    verbose_name='加密手机号',
                    help_text='AES-256-GCM 加密的手机号，Base64 编码存储',
                )),
                ('id_card_hash', models.CharField(
                    blank=True,
                    db_index=True,
                    default='',
                    max_length=64,
                    verbose_name='身份证哈希',
                    help_text='SHA-256(身份证号)，不可逆，仅用于去重核查',
                )),
                ('encryption_key_ref', models.CharField(
                    blank=True,
                    default='',
                    max_length=128,
                    verbose_name='加密密钥引用',
                    help_text='指向密钥管理服务的 key_id，不存明文密钥',
                )),
                ('pseudonymized_at', models.DateTimeField(
                    auto_now_add=True,
                    verbose_name='假名化时间',
                )),
                ('pseudonymized_by_id', models.IntegerField(
                    blank=True,
                    null=True,
                    verbose_name='操作人账号ID',
                    help_text='执行假名化操作的账号ID（审计用）',
                )),
                ('is_active', models.BooleanField(
                    default=False,
                    verbose_name='假名化激活',
                    help_text='True=受试者撤回同意后激活，原始姓名/手机号已从 t_subject 清除',
                )),
            ],
            options={
                'verbose_name': '受试者假名化记录',
                'db_table': 't_subject_pseudonym',
            },
        ),
        migrations.AddIndex(
            model_name='subjectpseudonym',
            index=models.Index(fields=['pseudonym_code'], name='t_subject_pseudo_code_idx'),
        ),
        migrations.AddIndex(
            model_name='subjectpseudonym',
            index=models.Index(fields=['id_card_hash'], name='t_subject_pseudo_hash_idx'),
        ),
        migrations.CreateModel(
            name='SubjectGlobalRegistry',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('id_card_hash', models.CharField(
                    max_length=64,
                    unique=True,
                    verbose_name='身份证哈希',
                    help_text='SHA-256(身份证号)，主键匹配字段',
                )),
                ('global_no', models.CharField(
                    max_length=32,
                    unique=True,
                    verbose_name='全局受试者编号',
                    help_text='如 CN-SUB-2026-00001，跨项目唯一',
                )),
                ('first_enrolled_at', models.DateField(
                    blank=True,
                    null=True,
                    verbose_name='首次入组日期',
                )),
                ('enrolled_protocol_ids', models.JSONField(
                    default=list,
                    verbose_name='已参与方案ID列表',
                    help_text='[protocol_id, ...]，用于防重复入组检查',
                )),
                ('is_disqualified', models.BooleanField(
                    default=False,
                    verbose_name='永久排除',
                    help_text='True=该受试者因安全事件或违规被永久排除',
                )),
                ('disqualify_reason', models.TextField(
                    blank=True,
                    default='',
                    verbose_name='排除原因',
                )),
                ('create_time', models.DateTimeField(auto_now_add=True)),
                ('update_time', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': '受试者全局注册表',
                'db_table': 't_subject_global_registry',
            },
        ),
        migrations.AddIndex(
            model_name='subjectglobalregistry',
            index=models.Index(fields=['global_no'], name='t_subject_global_no_idx'),
        ),
        migrations.AddIndex(
            model_name='subjectglobalregistry',
            index=models.Index(fields=['id_card_hash'], name='t_subject_global_hash_idx'),
        ),
    ]
