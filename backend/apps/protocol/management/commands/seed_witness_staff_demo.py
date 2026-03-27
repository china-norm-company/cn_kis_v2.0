"""
创建演示用治理台账号（QA质量管理）并同步到双签工作人员名单。

前置：python manage.py seed_roles

Usage:
    python manage.py seed_witness_staff_demo
"""
from django.core.management.base import BaseCommand

from apps.identity.models import Account, AccountRole, Role
from apps.protocol.services import witness_staff_service as ws_svc


DEMO_USERS = (
    # username, display_name, email, phone, role_name（显示名不含「演示」前缀，便于列表与知情签署展示）
    ('demo_witness_qa_1', '林雪', 'demo.witness.qa1@example.com', '13800001001', 'qa'),
    ('demo_witness_qa_2', '刘敏', 'demo.witness.qa2@example.com', '13800001002', 'qa'),
    ('demo_witness_qa_3', '陈芳', 'demo.witness.qa3@example.com', '13800001003', 'qa'),
)


class Command(BaseCommand):
    help = '创建双签演示账号（治理台 QA 角色）并写入 t_witness_staff'

    def handle(self, *args, **options):
        for username, display_name, email, phone, role_name in DEMO_USERS:
            acc, created = Account.objects.get_or_create(
                username=username,
                defaults={
                    'display_name': display_name,
                    'email': email,
                    'phone': phone,
                },
            )
            if not created:
                acc.display_name = display_name
                acc.email = email
                acc.phone = phone
                acc.save(update_fields=['display_name', 'email', 'phone', 'update_time'])

            role = Role.objects.filter(name=role_name, is_active=True).first()
            if not role:
                self.stderr.write(self.style.ERROR(f'角色 {role_name} 不存在，请先 seed_roles'))
                return
            _, ar_created = AccountRole.objects.get_or_create(
                account=acc,
                role=role,
                project_id=None,
                defaults={},
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f'账号 {username} (id={acc.id}) 角色 {role.display_name} '
                    f'{"已新建" if ar_created else "已存在"}'
                )
            )

        sync = ws_svc.sync_witness_staff_from_accounts()
        self.stdout.write(self.style.SUCCESS(f'已同步双签档案：{sync}'))
