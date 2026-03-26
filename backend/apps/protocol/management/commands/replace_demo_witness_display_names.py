# -*- coding: utf-8 -*-
"""
将双签演示账号/档案中的「演示-xxx」显示名替换为正式风格姓名，并同步协议、ICF 内 JSON 中的同名串。

映射（可改本文件常量）：
  演示-系统管理员 -> 林雪
  演示-CRC协调员 -> 刘敏
  演示-CRC主管   -> 陈芳

Usage:
    cd backend && python manage.py replace_demo_witness_display_names
    python manage.py replace_demo_witness_display_names --dry-run
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.identity.models import Account
from apps.protocol.models import Protocol
from apps.protocol.services import witness_staff_service as ws_svc
from apps.subject.models import ICFVersion

# username -> 新显示名（与 seed_witness_staff_demo 中账号一一对应）
ACCOUNT_RENAME = (
    ('demo_witness_admin', '林雪'),
    ('demo_witness_crc', '刘敏'),
    ('demo_witness_crc_sup', '陈芳'),
)

# 任意 JSON / 文本中的子串替换（键为旧名）
TEXT_REPLACE = {
    '演示-系统管理员': '林雪',
    '演示-CRC协调员': '刘敏',
    '演示-CRC主管': '陈芳',
}


def _replace_in_json(obj, mapping: dict):
    if isinstance(obj, str):
        s = obj
        for old, new in mapping.items():
            s = s.replace(old, new)
        return s
    if isinstance(obj, list):
        return [_replace_in_json(x, mapping) for x in obj]
    if isinstance(obj, dict):
        return {k: _replace_in_json(v, mapping) for k, v in obj.items()}
    return obj


class Command(BaseCommand):
    help = '将演示双签人员显示名替换为林雪/刘敏/陈芳，并刷新协议与 ICF JSON'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='只打印，不写库')

    def handle(self, *args, **options):
        dry = options['dry_run']

        usernames = [x[0] for x in ACCOUNT_RENAME]
        accounts = list(Account.objects.filter(username__in=usernames, is_deleted=False))
        if len(accounts) != len(usernames):
            found = {a.username for a in accounts}
            missing = set(usernames) - found
            self.stderr.write(self.style.WARNING(f'未找到演示账号: {missing}，将跳过账号重命名'))

        for username, new_name in ACCOUNT_RENAME:
            acc = next((a for a in accounts if a.username == username), None)
            if not acc:
                continue
            old = (acc.display_name or '').strip()
            if old == new_name:
                self.stdout.write(f'  账号 {username} 已是 {new_name}，跳过')
                continue
            self.stdout.write(f'  账号 {username}: {old!r} -> {new_name!r}')
            if not dry:
                acc.display_name = new_name
                acc.save(update_fields=['display_name', 'update_time'])

        if dry:
            self.stdout.write(self.style.WARNING('DRY RUN — 未写入协议/ICF/双签档案'))
            return

        with transaction.atomic():
            for p in Protocol.objects.filter(is_deleted=False):
                pd = p.parsed_data if isinstance(p.parsed_data, dict) else {}
                pd_new = _replace_in_json(dict(pd), TEXT_REPLACE)
                if pd_new != pd:
                    p.parsed_data = pd_new
                    p.save(update_fields=['parsed_data', 'update_time'])
                    self.stdout.write(self.style.SUCCESS(f'  协议 id={p.id} {p.code!r} parsed_data 已替换'))

            for icf in ICFVersion.objects.select_related('protocol').all():
                rules = icf.mini_sign_rules if isinstance(icf.mini_sign_rules, dict) else {}
                rules_new = _replace_in_json(dict(rules), TEXT_REPLACE)
                if rules_new != rules:
                    icf.mini_sign_rules = rules_new
                    icf.save(update_fields=['mini_sign_rules', 'update_time'])
                    self.stdout.write(self.style.SUCCESS(f'  ICF id={icf.id} protocol={icf.protocol_id} mini_sign_rules 已替换'))

        sync = ws_svc.sync_witness_staff_from_accounts()
        self.stdout.write(self.style.SUCCESS(f'已从治理台账号同步双签档案：{sync}'))
