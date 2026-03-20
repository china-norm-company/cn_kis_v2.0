"""
证书管理服务

封装证书 CRUD、到期状态计算、续期、预警逻辑。
"""
import logging
from typing import Optional
from datetime import date, timedelta

from apps.lab_personnel.models import StaffCertificate, CertificateStatus

logger = logging.getLogger(__name__)


def _compute_cert_status(expiry_date: date) -> tuple:
    """根据到期日期计算证书状态和锁定状态"""
    if expiry_date is None:
        return CertificateStatus.VALID, False

    today = date.today()
    days_left = (expiry_date - today).days

    if days_left < 0:
        return CertificateStatus.EXPIRED, True
    elif days_left <= 7:
        return CertificateStatus.EXPIRING_7, False
    elif days_left <= 30:
        return CertificateStatus.EXPIRING_30, False
    elif days_left <= 90:
        return CertificateStatus.EXPIRING_90, False
    else:
        return CertificateStatus.VALID, False


def refresh_certificate_status(cert: StaffCertificate) -> StaffCertificate:
    """刷新证书状态（查询时实时计算）"""
    new_status, is_locked = _compute_cert_status(cert.expiry_date)
    if cert.status != new_status or cert.is_locked != is_locked:
        cert.status = new_status
        cert.is_locked = is_locked
        cert.save(update_fields=['status', 'is_locked', 'update_time'])
    return cert


def list_certificates(
    staff_id: int = None,
    cert_type: str = None,
    status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """证书列表（带实时状态刷新）"""
    qs = StaffCertificate.objects.select_related('staff').all()

    if staff_id:
        qs = qs.filter(staff_id=staff_id)
    if cert_type:
        qs = qs.filter(cert_type=cert_type)

    # 先刷新所有证书状态
    for cert in qs:
        refresh_certificate_status(cert)

    # 刷新后再过滤 status
    if status:
        qs = qs.filter(status=status)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def create_certificate(
    staff_id: int,
    cert_type: str,
    cert_name: str,
    cert_number: str = '',
    issuing_authority: str = '',
    issue_date: date = None,
    expiry_date: date = None,
    file_url: str = '',
) -> StaffCertificate:
    """创建证书"""
    status, is_locked = _compute_cert_status(expiry_date)
    cert = StaffCertificate.objects.create(
        staff_id=staff_id,
        cert_type=cert_type,
        cert_name=cert_name,
        cert_number=cert_number,
        issuing_authority=issuing_authority,
        issue_date=issue_date,
        expiry_date=expiry_date,
        status=status,
        is_locked=is_locked,
        file_url=file_url,
    )
    cert = StaffCertificate.objects.select_related('staff').get(pk=cert.pk)
    return cert


def update_certificate(cert_id: int, **kwargs) -> Optional[StaffCertificate]:
    """更新证书"""
    cert = StaffCertificate.objects.select_related('staff').filter(id=cert_id).first()
    if not cert:
        return None

    for k, v in kwargs.items():
        if v is not None and hasattr(cert, k):
            setattr(cert, k, v)

    # 重新计算状态
    if 'expiry_date' in kwargs:
        cert.status, cert.is_locked = _compute_cert_status(cert.expiry_date)

    cert.save()
    return cert


def renew_certificate(
    cert_id: int,
    new_expiry_date: date,
    new_cert_number: str = None,
) -> Optional[StaffCertificate]:
    """证书续期"""
    cert = StaffCertificate.objects.select_related('staff').filter(id=cert_id).first()
    if not cert:
        return None

    cert.expiry_date = new_expiry_date
    if new_cert_number:
        cert.cert_number = new_cert_number
    cert.status, cert.is_locked = _compute_cert_status(new_expiry_date)
    cert.save()
    return cert


def get_expiry_alerts() -> dict:
    """获取到期预警汇总"""
    today = date.today()
    all_certs = StaffCertificate.objects.select_related('staff').all()

    # 实时刷新
    for cert in all_certs:
        refresh_certificate_status(cert)

    expired = StaffCertificate.objects.filter(status=CertificateStatus.EXPIRED)
    expiring_7 = StaffCertificate.objects.filter(status=CertificateStatus.EXPIRING_7)
    expiring_30 = StaffCertificate.objects.filter(status=CertificateStatus.EXPIRING_30)
    expiring_90 = StaffCertificate.objects.filter(status=CertificateStatus.EXPIRING_90)

    def _cert_alert(cert):
        return {
            'id': cert.id,
            'staff_id': cert.staff_id,
            'staff_name': cert.staff.name,
            'cert_name': cert.cert_name,
            'cert_type': cert.cert_type,
            'expiry_date': cert.expiry_date.isoformat() if cert.expiry_date else None,
            'status': cert.status,
            'days_left': (cert.expiry_date - today).days if cert.expiry_date else None,
        }

    return {
        'expired': [_cert_alert(c) for c in expired.select_related('staff')],
        'expiring_7d': [_cert_alert(c) for c in expiring_7.select_related('staff')],
        'expiring_30d': [_cert_alert(c) for c in expiring_30.select_related('staff')],
        'expiring_90d': [_cert_alert(c) for c in expiring_90.select_related('staff')],
        'summary': {
            'expired': expired.count(),
            'expiring_7d': expiring_7.count(),
            'expiring_30d': expiring_30.count(),
            'expiring_90d': expiring_90.count(),
        },
    }
