"""
按规范化手机号合并重复的 Subject（软删副档，子表外键迁到主档）。

用于修复「同一手机号多条 t_subject」导致小程序签到与接待看板预约行不一致等问题。

主档（KEEP）选取规则（与同手机号多条时的业务期望一致）：
  1) 非 cancelled 的预约条数最多
  2) 入组 Enrollment 条数最多
  3) 最小 id（先创建的记录优先）

用法（务必先在预发/备份库验证）::

    # 仅列出将要合并的组与主副档（不写库）
    python manage.py merge_duplicate_subjects_by_phone

    # 只检查某一个手机号
    python manage.py merge_duplicate_subjects_by_phone --phone 17301670531

    # 真正执行（每组合并在一个事务内）
    python manage.py merge_duplicate_subjects_by_phone --execute

    # 限制处理组数（分批跑）
    python manage.py merge_duplicate_subjects_by_phone --execute --limit 10

若某组两条档案均绑定了不同的 account_id，该组会跳过并在输出中标记，需人工处理。
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Iterable

from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger(__name__)


def _normalize_phone_for_bucket(phone: str) -> str:
    from apps.subject.services.subject_service import normalize_subject_phone

    return normalize_subject_phone(phone or '')


def _duplicate_group_by_mobile() -> dict[str, list[int]]:
    from apps.subject.models import Subject

    buckets: dict[str, list[int]] = defaultdict(list)
    qs = Subject.objects.filter(is_deleted=False).exclude(phone='').values_list('id', 'phone')
    for sid, ph in qs:
        n = _normalize_phone_for_bucket(str(ph))
        if n:
            buckets[n].append(int(sid))
    return {k: sorted(set(v)) for k, v in buckets.items() if len(set(v)) > 1}


def _pick_keep_id(subject_ids: list[int]) -> int:
    from apps.subject.models import Enrollment
    from apps.subject.models_execution import AppointmentStatus, SubjectAppointment

    def appt_count(sid: int) -> int:
        return SubjectAppointment.objects.filter(subject_id=sid).exclude(
            status=AppointmentStatus.CANCELLED
        ).count()

    def enr_count(sid: int) -> int:
        return Enrollment.objects.filter(subject_id=sid).count()

    return sorted(subject_ids, key=lambda sid: (-appt_count(sid), -enr_count(sid), sid))[0]


class Command(BaseCommand):
    help = '按手机号合并重复 Subject（详见模块文档）；默认 dry-run，需 --execute 才写入。'

    def add_arguments(self, parser):
        parser.add_argument(
            '--execute',
            action='store_true',
            help='执行合并与软删（默认仅预览）',
        )
        parser.add_argument(
            '--phone',
            type=str,
            default='',
            help='仅处理规范化后等于该 11 位手机号的组（可选）',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='最多处理多少组（0 表示不限制）',
        )

    def handle(self, *args, **options):
        dry_run = not options['execute']
        phone_filter = _normalize_phone_for_bucket((options['phone'] or '').strip())
        limit = int(options['limit'] or 0)

        groups = _duplicate_group_by_mobile()
        if phone_filter:
            if phone_filter not in groups:
                self.stdout.write(self.style.WARNING(f'未发现重复组: {phone_filter}'))
                return
            groups = {phone_filter: groups[phone_filter]}

        keys = sorted(groups.keys())
        if limit > 0:
            keys = keys[:limit]

        self.stdout.write(
            f"模式: {'DRY-RUN（预览）' if dry_run else 'EXECUTE（写入）'}；"
            f'待处理组数: {len(keys)}'
        )

        merged_groups = 0
        skipped = 0
        for mobile in keys:
            ids = groups[mobile]
            keep_id = _pick_keep_id(ids)
            drops = [i for i in ids if i != keep_id]
            self.stdout.write(
                f'\n手机 {mobile}: KEEP={keep_id}, DROP={drops}（预约/入组较少或 id 较大者为副档）'
            )
            if dry_run:
                continue
            try:
                with transaction.atomic():
                    for drop_id in sorted(drops):
                        self._merge_pair(keep_id, drop_id)
                merged_groups += 1
            except Exception as e:
                skipped += 1
                logger.exception('merge_failed mobile=%s keep=%s', mobile, keep_id)
                self.stdout.write(self.style.ERROR(f'  失败已回滚: {e}'))

        if dry_run:
            self.stdout.write(self.style.WARNING('\n以上为预览。确认后追加参数: --execute'))
        else:
            self.stdout.write(
                self.style.SUCCESS(f'\n完成: 成功合并 {merged_groups} 组, 失败/跳过 {skipped} 组')
            )

    def _merge_pair(self, keep_id: int, drop_id: int) -> None:
        from apps.subject.models import Enrollment, Subject, SubjectConsent
        from apps.subject.models_domain import (
            ExposureProfile,
            NutritionProfile,
            OralProfile,
            SkinProfile,
        )
        from apps.subject.models_execution import (
            ComplianceRecord,
            ReceptionBoardCheckin,
            ReceptionBoardProjectSc,
            SubjectAppointment,
            SubjectCheckin,
            SubjectPayment,
            SubjectProjectSC,
            SubjectQuestionnaire,
            SubjectSupportTicket,
        )
        from apps.subject.models_identity import IdentityVerifySession
        from apps.subject.models_loyalty import SubjectDiary, SubjectLoyaltyScore, SubjectNPS, SubjectReferral
        from apps.subject.models_profile import (
            AllergyRecord,
            ConcomitantMedication,
            FamilyHistory,
            LifestyleRecord,
            MedicalHistory,
            SubjectProfile,
        )
        from apps.subject.models_questionnaire import QuestionnaireAssignment
        from apps.subject.models_timeseries import (
            BodyMetricRecord,
            LabResultRecord,
            SkinMeasurementRecord,
            VitalSignRecord,
        )

        keep = Subject.objects.select_for_update().filter(pk=keep_id, is_deleted=False).first()
        drop = Subject.objects.select_for_update().filter(pk=drop_id, is_deleted=False).first()
        if not keep or not drop:
            raise ValueError(f'KEEP 或 DROP 不存在或已删除: {keep_id}, {drop_id}')

        # --- 账号：仅 KEEP 无账号且 DROP 有时迁移 ---
        if keep.account_id and drop.account_id and keep.account_id != drop.account_id:
            raise ValueError(
                f'两条档案均绑定不同账号 KEEP.account={keep.account_id} DROP.account={drop.account_id}，请人工处理'
            )
        if keep.account_id is None and drop.account_id:
            keep.account_id = drop.account_id
            keep.save(update_fields=['account_id', 'update_time'])
            drop.account_id = None
            drop.save(update_fields=['account_id', 'update_time'])
            self.stdout.write(f'  已将账号从 DROP#{drop_id} 迁到 KEEP#{keep_id}')

        # 预约尽早迁到主档，避免与其它表在事务中间态不一致
        SubjectAppointment.objects.filter(subject_id=drop_id).update(subject_id=keep_id)

        # --- Enrollment：protocol 唯一 ---
        for enr in Enrollment.objects.filter(subject_id=drop_id):
            clash = Enrollment.objects.filter(subject_id=keep_id, protocol_id=enr.protocol_id).exists()
            if clash:
                self.stdout.write(
                    self.style.WARNING(
                        f'  跳过入组冲突 protocol_id={enr.protocol_id}（DROP 上的一条），请人工合并'
                    )
                )
                continue
            enr.subject_id = keep_id
            enr.save(update_fields=['subject_id', 'update_time'])

        # --- SubjectConsent：subject + icf_version 唯一 ---
        for c in SubjectConsent.objects.filter(subject_id=drop_id):
            if SubjectConsent.objects.filter(subject_id=keep_id, icf_version_id=c.icf_version_id).exists():
                c.delete()
                self.stdout.write(f'  删除 DROP 重复知情同意 icf_version_id={c.icf_version_id}')
            else:
                c.subject_id = keep_id
                c.save(update_fields=['subject_id', 'update_time'])

        # --- SubjectProjectSC ---
        for row in SubjectProjectSC.objects.filter(subject_id=drop_id, is_deleted=False):
            if SubjectProjectSC.objects.filter(
                subject_id=keep_id, project_code=row.project_code, is_deleted=False
            ).exists():
                row.is_deleted = True
                row.save(update_fields=['is_deleted', 'update_time'])
                self.stdout.write(
                    f'  软删 DROP 工单 SC 行 project={row.project_code}（KEEP 已存在）'
                )
            else:
                row.subject_id = keep_id
                row.save(update_fields=['subject_id', 'update_time'])

        # --- ReceptionBoard ---
        for row in ReceptionBoardProjectSc.objects.filter(subject_id=drop_id):
            if ReceptionBoardProjectSc.objects.filter(
                subject_id=keep_id, project_code=row.project_code
            ).exists():
                row.delete()
                self.stdout.write(
                    f'  删除 DROP 看板 SC 行 project={row.project_code}（KEEP 已存在）'
                )
            else:
                row.subject_id = keep_id
                row.save(update_fields=['subject_id', 'update_time'])

        for row in ReceptionBoardCheckin.objects.filter(subject_id=drop_id):
            oth = ReceptionBoardCheckin.objects.filter(
                subject_id=keep_id, checkin_date=row.checkin_date
            ).first()
            if oth:
                if row.checkin_time and not oth.checkin_time:
                    oth.checkin_time = row.checkin_time
                if row.checkout_time and not oth.checkout_time:
                    oth.checkout_time = row.checkout_time
                if row.appointment_id and not oth.appointment_id:
                    oth.appointment_id = row.appointment_id
                oth.save(
                    update_fields=[
                        'checkin_time',
                        'checkout_time',
                        'appointment_id',
                        'update_time',
                    ]
                )
                row.delete()
                self.stdout.write(
                    f'  合并看板签到日期 {row.checkin_date} 到 KEEP，已删 DROP 重复行'
                )
            else:
                row.subject_id = keep_id
                row.save(update_fields=['subject_id', 'update_time'])

        # --- 1:1 档案 ---
        self._repoint_one_to_one(SubjectProfile, keep_id, drop_id, 't_subject_profile')
        for model, label in (
            (SkinProfile, 'skin'),
            (OralProfile, 'oral'),
            (NutritionProfile, 'nutrition'),
            (ExposureProfile, 'exposure'),
        ):
            self._repoint_one_to_one(model, keep_id, drop_id, label)

        # --- Loyalty：subject_id 唯一 ---
        k_loy = SubjectLoyaltyScore.objects.filter(subject_id=keep_id).first()
        d_loy = SubjectLoyaltyScore.objects.filter(subject_id=drop_id).first()
        if d_loy:
            if k_loy:
                d_loy.delete()
                self.stdout.write('  删除 DROP 忠诚度行（KEEP 已存在）')
            else:
                d_loy.subject_id = keep_id
                if d_loy.subject_ref_id == drop_id:
                    d_loy.subject_ref_id = keep_id
                d_loy.save(update_fields=['subject_id', 'subject_ref_id', 'update_time'])

        # --- Diary：unique subject_id + entry_date ---
        for d in SubjectDiary.objects.filter(subject_id=drop_id, is_deleted=False):
            if SubjectDiary.objects.filter(subject_id=keep_id, entry_date=d.entry_date, is_deleted=False).exists():
                d.delete()
            else:
                d.subject_id = keep_id
                d.save(update_fields=['subject_id', 'update_time'])

        # --- 直迁 subject_id 的表（无额外唯一约束或冲突概率低）---
        plain_updates: Iterable[tuple[type, str]] = (
            (SubjectCheckin, '工单签到'),
            (ComplianceRecord, '依从性'),
            (SubjectPayment, '礼金'),
            (SubjectQuestionnaire, '问卷主表'),
            (SubjectSupportTicket, '客服工单'),
            (MedicalHistory, '病史'),
            (ConcomitantMedication, '用药'),
            (AllergyRecord, '过敏'),
            (FamilyHistory, '家族史'),
            (LifestyleRecord, '生活方式'),
            (IdentityVerifySession, '实名会话'),
            (VitalSignRecord, '生命体征'),
            (BodyMetricRecord, '体格'),
            (LabResultRecord, '实验室'),
            (SkinMeasurementRecord, '皮肤测量'),
            (SubjectNPS, 'NPS'),
        )
        for model, _label in plain_updates:
            model.objects.filter(subject_id=drop_id).update(subject_id=keep_id)

        QuestionnaireAssignment.objects.filter(subject_id=drop_id).update(subject_id=keep_id)

        # --- 推荐关系整型 ID ---
        SubjectReferral.objects.filter(referrer_id=drop_id).update(referrer_id=keep_id)
        SubjectReferral.objects.filter(referred_id=drop_id).update(referred_id=keep_id)

        drop.refresh_from_db()
        drop.is_deleted = True
        drop.account_id = None
        drop.save(update_fields=['is_deleted', 'account_id', 'update_time'])
        self.stdout.write(self.style.SUCCESS(f'  已软删 DROP subject_id={drop_id}'))

    def _repoint_one_to_one(self, model, keep_id: int, drop_id: int, label: str) -> None:
        drop_row = model.objects.filter(subject_id=drop_id).first()
        if not drop_row:
            return
        keep_row = model.objects.filter(subject_id=keep_id).first()
        if keep_row:
            drop_row.delete()
            self.stdout.write(f'  删除 DROP {label} 1:1 行（KEEP 已存在）')
        else:
            drop_row.subject_id = keep_id
            drop_row.save(update_fields=['subject_id', 'update_time'])
            self.stdout.write(f'  {label} 1:1 已从 DROP 迁到 KEEP')
