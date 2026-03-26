# 未删除且手机号非空时，t_subject.phone 唯一（PostgreSQL 部分唯一索引）

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subject", "0032_rename_t_reception_br_chk_subj_date_idx_t_reception_subject_cd237d_idx_and_more"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="subject",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_deleted=False) & ~models.Q(phone=""),
                fields=("phone",),
                name="subject_phone_active_uniq",
            ),
        ),
    ]
