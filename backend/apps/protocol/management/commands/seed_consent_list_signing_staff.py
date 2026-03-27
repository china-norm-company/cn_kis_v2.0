# -*- coding: utf-8 -*-
"""
为知情管理列表中的每条协议补充「项目级知情签署工作人员」演示数据（2～3 人，顿号分隔）。

姓名来自当前库中「双签工作人员名单」与 witness_staff 校验一致的数据源（witness_staff_allowed_name_set）。

Usage:
    cd backend && python manage.py seed_consent_list_signing_staff
    python manage.py seed_consent_list_signing_staff --force          # 覆盖已有项目级签署人员
    python manage.py seed_consent_list_signing_staff --dry-run

前置：治理台账号已同步至 t_witness_staff，且至少 2 条档案姓名；不足时会报错退出。
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.protocol.api import _get_consent_settings, _save_consent_settings
from apps.protocol.consent_signing_names import normalize_consent_signing_staff_storage
from apps.protocol.models import Protocol
from apps.protocol.services.witness_staff_service import witness_staff_allowed_name_set


class Command(BaseCommand):
    help = '为每条协议写入 2～3 名知情签署工作人员（来自双签档案姓名）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='覆盖已有 consent_signing_staff_name；默认仅补充空值',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='只打印计划，不写库',
        )

    def handle(self, *args, **options):
        dry = options['dry_run']
        force = options['force']

        names = sorted(witness_staff_allowed_name_set())
        if len(names) < 2:
            self.stderr.write(
                self.style.ERROR(
                    '双签工作人员档案中可用人名不足 2 个。请先在治理台维护账号并执行「从治理台同步」或 seed 脚本。'
                )
            )
            return

        qs = Protocol.objects.filter(is_deleted=False).order_by('id')
        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.WARNING('无未删除协议，跳过'))
            return

        planned = []
        for idx, p in enumerate(qs):
            cur = _get_consent_settings(p)
            existing = (cur.get('consent_signing_staff_name') or '').strip()
            if existing and not force:
                planned.append((p.id, p.code or '', 'skip-has-value', existing))
                continue
            n_pick = 2 if (idx % 2 == 0) else 3
            n_pick = min(n_pick, len(names))
            start = (idx * 2) % len(names)
            picked = [names[(start + j) % len(names)] for j in range(n_pick)]
            stored = normalize_consent_signing_staff_storage('、'.join(picked))
            planned.append((p.id, p.code or '', 'set', stored))

        to_write = [x for x in planned if x[2] == 'set']
        skip = [x for x in planned if x[2] == 'skip-has-value']

        self.stdout.write(f'协议总数 {total}；将写入 {len(to_write)} 条；跳过（已有值且未 --force）{len(skip)} 条')

        if dry:
            for pid, code, kind, val in planned:
                self.stdout.write(f'  id={pid} code={code!r} {kind} {val!r}')
            self.stdout.write(self.style.WARNING('DRY RUN — 未写入'))
            return

        with transaction.atomic():
            for pid, code, kind, val in planned:
                if kind != 'set':
                    continue
                protocol = Protocol.objects.select_for_update().filter(id=pid, is_deleted=False).first()
                if not protocol:
                    continue
                cur = _get_consent_settings(protocol)
                cur['consent_signing_staff_name'] = val
                _save_consent_settings(protocol, cur)

        for pid, code, kind, val in to_write[:15]:
            self.stdout.write(self.style.SUCCESS(f'  已写入 id={pid} {code!r} → {val}'))
        if len(to_write) > 15:
            self.stdout.write(f'  … 共 {len(to_write)} 条')
