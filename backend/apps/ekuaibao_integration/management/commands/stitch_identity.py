"""
stitch_identity — 批量姓名缝合命令

将易快报 677 个员工账号与飞书 OAuth 账号通过姓名匹配合并。

用法：
  # 预览（不实际写入）
  python manage.py stitch_identity --dry-run

  # 正式执行
  python manage.py stitch_identity

  # 连接生产库（通过 SSH 隧道）
  DB_HOST=127.0.0.1 DB_PORT=15432 python manage.py stitch_identity --dry-run

  # 导出未匹配报告
  python manage.py stitch_identity --output-unmatched unmatched_report.csv

逻辑：
  1. 遍历所有 feishu_open_id 非空的 Account（飞书账号）
  2. 检查 ekuaibao_staff_id 是否为空（还未缝合）
  3. 在 EkbRawRecord(module='staffs') 中按 display_name 匹配
  4. 匹配成功 → 更新 ekuaibao_staff_id 和 ekuaibao_username
  5. 反向：找出只有 ekuaibao_staff_id 的 Account，按姓名寻找飞书账号
  6. 匹配成功 → 将飞书 ID 写入 ekuaibao 账号（合并为一条）
"""
import csv
import logging
from typing import Optional

from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger('cn_kis.ekuaibao.stitch_identity')


class Command(BaseCommand):
    help = '批量姓名缝合：将飞书 Account 与易快报 Account 合并（通过 display_name 匹配）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true', dest='dry_run',
            help='预览模式：只显示匹配结果，不实际写入数据库',
        )
        parser.add_argument(
            '--output-unmatched', type=str, dest='output_unmatched',
            metavar='FILE.csv',
            help='将未匹配的记录输出到 CSV 文件',
        )
        parser.add_argument(
            '--phase1-batch', type=str, default='20260318_133425',
            help='易快报 Phase 1 批次号（用于读取 staffs 数据）',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        output_file = options.get('output_unmatched')
        batch_no = options['phase1_batch']

        self.stdout.write(f'模式: {"DRY-RUN（预览）" if dry_run else "正式执行"}')

        # 构建易快报 staffs 姓名→ID 映射
        from apps.ekuaibao_integration.models import EkbRawRecord
        ekb_name_map = {}  # display_name → {ekb_id, code}
        for rec in EkbRawRecord.objects.filter(batch__batch_no=batch_no, module='staffs'):
            name = rec.raw_data.get('name', '').strip()
            ekb_id = rec.raw_data.get('id', '')
            code = rec.raw_data.get('code', '') or rec.raw_data.get('staffCode', '')
            if name and ekb_id:
                ekb_name_map[name] = {'ekb_id': ekb_id, 'code': code}

        self.stdout.write(f'易快报员工（staffs）: {len(ekb_name_map)} 人')

        from apps.identity.models import Account

        # ── Phase 1: 飞书账号 → 查找对应易快报 ID ──
        feishu_accounts = Account.objects.filter(
            is_deleted=False,
            feishu_open_id__gt='',
            ekuaibao_staff_id='',
        )
        self.stdout.write(f'需要缝合的飞书账号（无易快报 ID）: {feishu_accounts.count()} 个')

        phase1_matched = []
        phase1_unmatched = []
        for acc in feishu_accounts:
            name = acc.display_name.strip()
            ekb_info = ekb_name_map.get(name)
            if ekb_info:
                phase1_matched.append((acc, ekb_info))
            else:
                phase1_unmatched.append(acc)

        self.stdout.write(self.style.SUCCESS(
            f'Phase 1 姓名匹配: {len(phase1_matched)} 个成功, {len(phase1_unmatched)} 个未匹配'
        ))
        for acc, ekb_info in phase1_matched[:10]:
            self.stdout.write(
                f'  ✓ {acc.display_name} (Account#{acc.id}) → ekuaibao_id={ekb_info["ekb_id"][:30]}'
            )

        # ── Phase 2: 只有易快报 ID 的账号 → 查找同名飞书账号并合并 ──
        ekb_only_accounts = Account.objects.filter(
            is_deleted=False,
            ekuaibao_staff_id__gt='',
            feishu_open_id='',
        )
        self.stdout.write(f'\n需要缝合的易快报账号（无飞书 ID）: {ekb_only_accounts.count()} 个')

        # 飞书账号 display_name → Account 映射
        feishu_name_to_acc = {
            acc.display_name.strip(): acc
            for acc in Account.objects.filter(
                is_deleted=False, feishu_open_id__gt=''
            )
        }

        phase2_merged = []
        phase2_unmatched = []
        for ekb_acc in ekb_only_accounts:
            name = ekb_acc.display_name.strip()
            feishu_acc = feishu_name_to_acc.get(name)
            if feishu_acc:
                phase2_merged.append((ekb_acc, feishu_acc))
            else:
                phase2_unmatched.append(ekb_acc)

        self.stdout.write(self.style.SUCCESS(
            f'Phase 2 双账号合并: {len(phase2_merged)} 对需要合并, '
            f'{len(phase2_unmatched)} 个仅在易快报'
        ))

        if dry_run:
            self.stdout.write(self.style.WARNING('\n[DRY-RUN] 未写入任何数据'))
            self._output_unmatched(
                output_file,
                [(acc.id, acc.display_name, 'feishu_no_ekb') for acc in phase1_unmatched] +
                [(acc.id, acc.display_name, 'ekb_only') for acc in phase2_unmatched],
            )
            return

        # ── 正式写入 ──
        p1_success = 0
        with transaction.atomic():
            for acc, ekb_info in phase1_matched:
                acc.ekuaibao_staff_id = ekb_info['ekb_id']
                acc.ekuaibao_username = ekb_info['code']
                acc.save(update_fields=['ekuaibao_staff_id', 'ekuaibao_username'])
                p1_success += 1

        self.stdout.write(self.style.SUCCESS(f'Phase 1 写入完成: {p1_success} 个飞书账号已关联易快报 ID'))

        # Phase 2：合并双账号（将飞书信息写入易快报账号，并将飞书账号标记删除）
        p2_success = 0
        with transaction.atomic():
            for ekb_acc, feishu_acc in phase2_merged:
                # 将飞书信息写入易快报账号
                ekb_acc.feishu_open_id = feishu_acc.feishu_open_id
                ekb_acc.feishu_user_id = feishu_acc.feishu_user_id
                ekb_acc.email = feishu_acc.email or ekb_acc.email
                ekb_acc.avatar = feishu_acc.avatar or ekb_acc.avatar
                ekb_acc.save(update_fields=[
                    'feishu_open_id', 'feishu_user_id', 'email', 'avatar'
                ])
                # 将飞书账号上的角色迁移到易快报账号
                from apps.identity.models import AccountRole
                for ar in AccountRole.objects.filter(account=feishu_acc):
                    AccountRole.objects.get_or_create(
                        account=ekb_acc,
                        role=ar.role,
                        project_id=ar.project_id,
                    )
                # 软删除重复的飞书账号
                feishu_acc.is_deleted = True
                feishu_acc.save(update_fields=['is_deleted'])
                p2_success += 1

        self.stdout.write(self.style.SUCCESS(f'Phase 2 合并完成: {p2_success} 对双账号已合并'))

        # 输出未匹配报告
        self._output_unmatched(
            output_file,
            [(acc.id, acc.display_name, 'feishu_no_ekb') for acc in phase1_unmatched] +
            [(acc.id, acc.display_name, 'ekb_only') for acc in phase2_unmatched],
        )

        # 最终统计
        total_with_both = Account.objects.filter(
            is_deleted=False,
            feishu_open_id__gt='',
            ekuaibao_staff_id__gt='',
        ).count()
        self.stdout.write(self.style.SUCCESS(
            f'\n缝合完成！同时拥有飞书 ID 和易快报 ID 的账号: {total_with_both} 个'
        ))

    def _output_unmatched(self, output_file: Optional[str], rows: list):
        if not rows:
            return
        self.stdout.write(f'\n未匹配记录: {len(rows)} 个')
        if output_file:
            with open(output_file, 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['account_id', 'display_name', 'type'])
                writer.writerows(rows)
            self.stdout.write(f'未匹配报告已保存: {output_file}')
        else:
            for acc_id, name, typ in rows[:20]:
                self.stdout.write(f'  未匹配 [{typ}]: Account#{acc_id} {name}')
            if len(rows) > 20:
                self.stdout.write(f'  ...还有 {len(rows) - 20} 个，用 --output-unmatched 导出完整报告')
