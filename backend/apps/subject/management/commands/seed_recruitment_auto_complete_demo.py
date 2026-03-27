"""
演示数据：计划汇总中验证「入组率 100% → 状态已完成」。

用法：
  python manage.py seed_recruitment_auto_complete_demo

将创建 3 条招募计划（不同状态/入组进度）及对应的 SubjectProjectSC（正式入组）：
  1) 已批准 + 目标 1 + 已正式入组 1 → 调用自动完结后应为「已完成」
  2) 已批准 + 目标 3 + 已正式入组 2 → 保持「已批准」（入组未达 100%）
  3) 草稿 + 目标 1 + 不入组 SC → 保持「草稿」

项目编号形如 DEMO-AC-<时间戳>-a/b/c，可重复执行（每次时间戳不同）。
"""
from __future__ import annotations

import time
import uuid
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.protocol.models import Protocol, ProtocolStatus
from apps.subject.models import Subject
from apps.subject.models_execution import SubjectProjectSC, EnrollmentStatusSC
from apps.subject.models_recruitment import RecruitmentPlan, RecruitmentPlanStatus
from apps.subject.services import recruitment_service as rs


def _phone(i: int) -> str:
    """生成 11 位唯一手机号（演示用）。"""
    t = int(time.time() * 1000) % 1_0000_0000
    return f'138{(t + i) % 100000000:08d}'


class Command(BaseCommand):
    help = '插入招募计划演示数据，用于验证入组满员自动「已完成」'

    def handle(self, *args, **options):
        ts = int(time.time())
        base_pc = f'DEMO-AC-{ts}'
        today = date.today()
        end = today + timedelta(days=120)

        out = None
        auto_complete_ok = False
        with transaction.atomic():
            # --- 协议（与计划 project_code 对齐，便于列表展示） ---
            def _protocol(code: str, title: str) -> Protocol:
                return Protocol.objects.create(
                    title=title,
                    code=code,
                    status=ProtocolStatus.DRAFT,
                    is_deleted=False,
                )

            p1 = _protocol(f'{base_pc}-a', '演示协议-自动完结')
            p2 = _protocol(f'{base_pc}-b', '演示协议-未满员')
            p3 = _protocol(f'{base_pc}-c', '演示协议-草稿')

            def _plan(
                protocol: Protocol,
                project_code: str,
                title: str,
                status: str,
                target: int,
            ) -> RecruitmentPlan:
                return RecruitmentPlan.objects.create(
                    plan_no=rs._generate_plan_no(),
                    protocol=protocol,
                    project_code=project_code,
                    title=title,
                    description='seed_recruitment_auto_complete_demo 演示数据，可安全删除',
                    target_count=target,
                    enrolled_count=0,
                    screened_count=0,
                    registered_count=0,
                    start_date=today,
                    end_date=end,
                    status=status,
                )

            plan_done = _plan(
                p1,
                f'{base_pc}-a',
                f'[演示] 满员应自动已完成 {base_pc}',
                RecruitmentPlanStatus.APPROVED.value,
                1,
            )
            plan_partial = _plan(
                p2,
                f'{base_pc}-b',
                f'[演示] 已批准未满员 {base_pc}',
                RecruitmentPlanStatus.APPROVED.value,
                3,
            )
            plan_draft = _plan(
                p3,
                f'{base_pc}-c',
                f'[演示] 草稿对照 {base_pc}',
                RecruitmentPlanStatus.DRAFT.value,
                1,
            )

            def _sc(subject: Subject, project_code: str, rd: str) -> SubjectProjectSC:
                return SubjectProjectSC.objects.create(
                    subject=subject,
                    project_code=project_code,
                    sc_number='001',
                    rd_number=rd,
                    enrollment_status=EnrollmentStatusSC.ENROLLED,
                    is_deleted=False,
                )

            def _subject(name: str, phone: str) -> Subject:
                # subject_no 全局唯一、≤20；空串在部分库上违反唯一约束
                return Subject.objects.create(
                    subject_no=f'D{uuid.uuid4().hex[:12]}',
                    name=name,
                    phone=phone,
                )

            # 计划1：1 人正式入组 → 满员
            s1 = _subject(f'DemoA-{ts}', _phone(1))
            _sc(s1, plan_done.project_code, 'RD001')

            # 计划2：2 人正式入组 / 目标 3
            s2 = _subject(f'DemoB-{ts}', _phone(2))
            s3 = _subject(f'DemoC-{ts}', _phone(3))
            _sc(s2, plan_partial.project_code, 'RD001')
            _sc(s3, plan_partial.project_code, 'RD002')

            # 计划3：草稿，不建 SC（或建了也不会自动完结草稿）

            # 触发自动完结（与业务中 update_project_sc / confirm_enrollment 后一致）
            out = rs.try_auto_complete_plan_by_enrollment(plan_done.id)
            auto_complete_ok = bool(out and out.status == RecruitmentPlanStatus.COMPLETED.value)

        if auto_complete_ok:
            self.stdout.write(
                self.style.SUCCESS(
                    f'[OK] 计划 {plan_done.id} ({plan_done.project_code}) 已自动变为已完成'
                )
            )
        else:
            self.stderr.write(
                self.style.ERROR(
                    f'预期计划 {plan_done.id} 应变为已完成，当前: {getattr(out, "status", None)}'
                )
            )

        plan_done.refresh_from_db()
        plan_partial.refresh_from_db()
        plan_draft.refresh_from_db()

        self.stdout.write('')
        self.stdout.write(self.style.NOTICE('请在招募台-计划汇总中查看：'))
        self.stdout.write(
            f'  [{plan_done.status}] id={plan_done.id} 项目编号={plan_done.project_code} '
            f'目标={plan_done.target_count} 标题={plan_done.title}'
        )
        self.stdout.write(
            f'  [{plan_partial.status}] id={plan_partial.id} 项目编号={plan_partial.project_code} '
            f'目标={plan_partial.target_count} 入组展示应约 66.7%'
        )
        self.stdout.write(
            f'  [{plan_draft.status}] id={plan_draft.id} 项目编号={plan_draft.project_code} '
            f'目标={plan_draft.target_count} 草稿不入组'
        )
        self.stdout.write('')
        self.stdout.write(f'删除演示数据：按项目编号前缀 `{base_pc}` 在后台筛选后删除计划及相关受试者/SC（慎用）。')
