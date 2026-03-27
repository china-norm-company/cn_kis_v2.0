"""
受试者 CRUD 服务

包含：列表查询、创建（含自动编号）、更新、软删除、状态变更。
"""
import logging
from datetime import date
from typing import Optional

from django.db.models import QuerySet
from django.utils import timezone

from ..models import Subject, SubjectStatus, SubjectRiskLevel

logger = logging.getLogger(__name__)


def normalize_subject_phone(phone: Optional[str]) -> str:
    """
    将中国大陆手机号规范为 11 位纯数字（用于查重与解析）。
    非 11 位或未识别为手机号的，返回空字符串（不参与「一机一号」强约束）。
    """
    if phone is None:
        return ''
    digits = ''.join(c for c in str(phone) if c.isdigit())
    if len(digits) >= 11:
        digits = digits[-11:]
    if len(digits) == 11 and digits.startswith('1'):
        return digits
    return ''


def find_subjects_by_mobile_normalized(mobile11: str) -> QuerySet:
    """按规范化后的 11 位手机号查找所有未删除受试者（含历史库中格式不一致但可归一的号码）。"""
    if not mobile11 or len(mobile11) != 11:
        return Subject.objects.none()
    exact = Subject.objects.filter(is_deleted=False, phone=mobile11)
    if exact.exists():
        return exact
    ids: list[int] = []
    for row in Subject.objects.filter(is_deleted=False).exclude(phone='').only('id', 'phone').iterator(
        chunk_size=500
    ):
        if normalize_subject_phone(row.phone) == mobile11:
            ids.append(row.id)
    return Subject.objects.filter(id__in=ids) if ids else Subject.objects.none()


def resolve_subject_for_mobile_session(
    phone: Optional[str],
    as_of_date: Optional[date] = None,
) -> Optional[Subject]:
    """
    小程序 / 扫码等场景：同一手机号若存在多条 Subject，选定一条「canonical」档案。

    优先级：指定日期有有效预约 > 任意有效预约 > 最小 id。
    """
    from ..models_execution import AppointmentStatus, SubjectAppointment

    n = normalize_subject_phone(phone)
    if not n:
        return None
    qs = find_subjects_by_mobile_normalized(n).order_by('id')
    subs = list(qs)
    if not subs:
        return None
    if len(subs) == 1:
        return subs[0]
    d = as_of_date or timezone.localdate()

    def _has_appt_on_day(s: Subject) -> bool:
        return SubjectAppointment.objects.filter(
            subject_id=s.id,
            appointment_date=d,
        ).exclude(status=AppointmentStatus.CANCELLED).exists()

    with_day = [s for s in subs if _has_appt_on_day(s)]
    if len(with_day) == 1:
        chosen = with_day[0]
        if len(subs) > 1:
            logger.warning(
                'subject duplicate phone=%s chose id=%s among %s',
                n,
                chosen.id,
                [x.id for x in subs],
            )
        return chosen
    if len(with_day) > 1:
        chosen = min(with_day, key=lambda x: x.id)
        logger.warning(
            'subject duplicate phone=%s multiple appts on %s chose id=%s among %s',
            n,
            d,
            chosen.id,
            [x.id for x in with_day],
        )
        return chosen

    with_any = [
        s
        for s in subs
        if SubjectAppointment.objects.filter(subject_id=s.id)
        .exclude(status=AppointmentStatus.CANCELLED)
        .exists()
    ]
    if with_any:
        chosen = min(with_any, key=lambda x: x.id)
        logger.warning(
            'subject duplicate phone=%s no appt on %s chose id=%s with_any_appt ids=%s',
            n,
            d,
            chosen.id,
            [x.id for x in subs],
        )
        return chosen
    chosen = min(subs, key=lambda x: x.id)
    logger.warning(
        'subject duplicate phone=%s fallback min id=%s all=%s',
        n,
        chosen.id,
        [x.id for x in subs],
    )
    return chosen


def generate_subject_no() -> str:
    """
    生成全局唯一受试者编号

    格式：SUB-YYYYMM-NNNN（如 SUB-202602-0001）
    每月序号独立递增。
    """
    now = timezone.now()
    prefix = f'SUB-{now.strftime("%Y%m")}-'
    last = (
        Subject.objects.filter(subject_no__startswith=prefix)
        .order_by('-subject_no')
        .values_list('subject_no', flat=True)
        .first()
    )
    if last:
        try:
            seq = int(last.split('-')[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f'{prefix}{seq:04d}'


def list_subjects(
    status: str = None,
    phone: str = None,
    risk_level: str = None,
    search: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
) -> dict:
    """分页查询受试者列表（支持按数据权限过滤）"""
    from apps.identity.filters import filter_queryset_by_scope

    qs = Subject.objects.filter(is_deleted=False)
    if status:
        qs = qs.filter(status=status)
    if phone:
        qs = qs.filter(phone__icontains=phone)
    if risk_level:
        qs = qs.filter(risk_level=risk_level)
    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(name__icontains=search) |
            Q(phone__icontains=search) |
            Q(subject_no__icontains=search)
        )
    if account:
        # Subject 无直接 protocol_id 字段，通过 enrollments__protocol_id 关联到项目。
        # 传入 field_mapping 确保项目级角色（CRC）正确过滤到所属项目的受试者，
        # 而非退化为个人级过滤（仅看 created_by 的记录）。
        qs = filter_queryset_by_scope(
            qs,
            account,
            field_mapping={'project': 'enrollments__protocol_id'},
        )

    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_subject(subject_id: int) -> Optional[Subject]:
    """获取受试者详情"""
    return Subject.objects.filter(id=subject_id, is_deleted=False).first()


def create_subject(
    name: str,
    gender: str = '',
    age: int = None,
    phone: str = '',
    skin_type: str = '',
    risk_level: str = SubjectRiskLevel.LOW,
    source_channel: str = '',
    account=None,
    explicit_subject_no: Optional[str] = None,
) -> Subject:
    """创建受试者（自动生成 subject_no）。11 位手机号会规范化存储并禁止与同号未删档案重复。"""
    raw_phone = (phone or '').strip()
    mobile = normalize_subject_phone(raw_phone)
    storage_phone = mobile if mobile else raw_phone
    if mobile and find_subjects_by_mobile_normalized(mobile).exists():
        raise ValueError(
            '该手机号已有受试者档案，请从列表搜索后选择已有受试者再建预约；若存在重复建档请联系管理员合并。'
        )
    if explicit_subject_no is not None and str(explicit_subject_no).strip():
        sn = str(explicit_subject_no).strip()[:20]
        if Subject.objects.filter(subject_no=sn, is_deleted=False).exists():
            raise ValueError('该受试者编号已存在，请更换后再试')
        subject_no = sn
    else:
        subject_no = generate_subject_no()
    kw = dict(
        subject_no=subject_no,
        name=name,
        gender=gender,
        age=age,
        phone=storage_phone,
        skin_type=skin_type,
        risk_level=risk_level or SubjectRiskLevel.LOW,
        source_channel=source_channel,
    )
    if account:
        kw['created_by_id'] = account.id
    return Subject.objects.create(**kw)


def update_subject(subject_id: int, **kwargs) -> Optional[Subject]:
    """更新受试者信息"""
    subject = get_subject(subject_id)
    if not subject:
        return None
    allowed_fields = {
        'name', 'gender', 'age', 'phone', 'skin_type',
        'risk_level', 'source_channel',
    }
    if 'phone' in kwargs and kwargs['phone'] is not None:
        raw = (kwargs['phone'] or '').strip()
        mobile = normalize_subject_phone(raw)
        store = mobile if mobile else raw
        if mobile:
            conflict = find_subjects_by_mobile_normalized(mobile).exclude(id=subject_id)
            if conflict.exists():
                raise ValueError(
                    '该手机号已被其他受试者使用，请核对或合并重复档案后再修改。'
                )
        kwargs['phone'] = store
    for key, value in kwargs.items():
        if value is not None and key in allowed_fields:
            setattr(subject, key, value)
    subject.save()
    return subject


def delete_subject(subject_id: int) -> bool:
    """软删除受试者"""
    subject = get_subject(subject_id)
    if not subject:
        return False
    subject.is_deleted = True
    subject.save(update_fields=['is_deleted', 'update_time'])
    return True


def change_subject_status(subject_id: int, new_status: str) -> Optional[Subject]:
    """变更受试者状态"""
    subject = get_subject(subject_id)
    if not subject:
        return None
    subject.status = new_status
    subject.save(update_fields=['status', 'update_time'])
    return subject
