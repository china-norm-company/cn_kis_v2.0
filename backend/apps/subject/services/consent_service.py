"""
知情同意书管理服务

包含：ICF 版本管理、受试者签署。
"""
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from ..models import ICFVersion, SubjectConsent


def get_icf_versions(protocol_id: int) -> list:
    """获取协议的所有 ICF 版本"""
    return list(ICFVersion.objects.filter(protocol_id=protocol_id).order_by('-create_time'))


def create_icf_version(protocol_id: int, version: str, file_path: str = '', content: str = '') -> ICFVersion:
    """创建新的 ICF 版本"""
    return ICFVersion.objects.create(
        protocol_id=protocol_id,
        version=version,
        file_path=file_path,
        content=content,
    )


def _generate_receipt_no() -> str:
    from django.db.models import Max
    from datetime import datetime
    now = datetime.now().strftime('%Y%m%d')
    last = SubjectConsent.objects.filter(receipt_no__startswith=f'ICF-RCP-{now}-').aggregate(Max('receipt_no'))['receipt_no__max']
    if last:
        try:
            n = int(last.split('-')[-1]) + 1
        except (ValueError, IndexError):
            n = 1
    else:
        n = 1
    return f'ICF-RCP-{now}-{n:04d}'


@transaction.atomic
def sign_consent(subject_id: int, icf_version_id: int, signature_data: dict = None) -> SubjectConsent:
    """受试者签署知情同意书；支持人脸核身签署时传入 signature_data（含 face_verify_token 等）"""
    consent, created = SubjectConsent.objects.get_or_create(
        subject_id=subject_id,
        icf_version_id=icf_version_id,
        defaults={
            'is_signed': True,
            'signed_at': timezone.now(),
            'signature_data': signature_data or {},
            'receipt_no': _generate_receipt_no(),
        },
    )
    if not created and not consent.is_signed:
        consent.is_signed = True
        consent.signed_at = timezone.now()
        consent.signature_data = signature_data or consent.signature_data or {}
        if not consent.receipt_no:
            consent.receipt_no = _generate_receipt_no()
        _ensure_receipt_pdf(consent)
        consent.save(update_fields=['is_signed', 'signed_at', 'signature_data', 'receipt_no', 'update_time'])
    elif created:
        _ensure_receipt_pdf(consent)
        consent.save(update_fields=['signature_data', 'update_time'])
    return consent


def get_subject_consents(subject_id: int) -> list:
    """获取受试者的所有知情同意记录"""
    return list(
        SubjectConsent.objects.filter(subject_id=subject_id)
        .select_related('icf_version')
        .order_by('-create_time')
    )


def _ensure_receipt_pdf(consent: SubjectConsent) -> None:
    data = dict(consent.signature_data or {})
    if data.get('receipt_pdf_path'):
        return

    signed_at = consent.signed_at or timezone.now()
    rel_dir = Path('consent') / f'{signed_at:%Y}' / f'{signed_at:%m}'
    abs_dir = Path(settings.MEDIA_ROOT) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    file_name = f'icf_receipt_{consent.id}_{signed_at:%Y%m%d%H%M%S}.pdf'
    abs_path = abs_dir / file_name
    rel_path = str((rel_dir / file_name).as_posix())

    c = canvas.Canvas(str(abs_path), pagesize=A4)
    width, height = A4
    y = height - 72
    lines = [
        'CN_KIS ICF Receipt',
        f'Receipt No: {consent.receipt_no or ""}',
        f'Consent ID: {consent.id}',
        f'Subject ID: {consent.subject_id}',
        f'ICF Version ID: {consent.icf_version_id}',
        f'Signed At: {signed_at.isoformat()}',
    ]
    for line in lines:
        c.drawString(72, y, line)
        y -= 24
    c.showPage()
    c.save()

    data['receipt_pdf_path'] = rel_path
    consent.signature_data = data
