"""
受试者档案服务

包含：主档案 CRUD、医学子表 CRUD、领域档案 CRUD、身份证加密/解密。
"""
import hashlib
import logging
from typing import Optional
from django.conf import settings

from ..models import Subject
from ..models_profile import (
    SubjectProfile,
    MedicalHistory,
    ConcomitantMedication,
    AllergyRecord,
    FamilyHistory,
    LifestyleRecord,
)
from ..models_domain import SkinProfile, OralProfile, NutritionProfile, ExposureProfile

logger = logging.getLogger(__name__)

# 领域档案模型映射
DOMAIN_PROFILE_MAP = {
    'skin': SkinProfile,
    'oral': OralProfile,
    'nutrition': NutritionProfile,
    'exposure': ExposureProfile,
}


# ============================================================================
# 身份证加密/解密
# ============================================================================
def _get_encryption_key() -> bytes:
    """获取 AES-256 加密密钥（从 settings 中读取，不足 32 字节自动补齐）"""
    secret = getattr(settings, 'SUBJECT_ENCRYPTION_KEY', '')
    if not secret:
        secret = getattr(settings, 'SECRET_KEY', 'fallback-key')
    return hashlib.sha256(secret.encode()).digest()


def hash_id_card(id_card: str) -> str:
    """SHA-256 哈希身份证号（不可逆，用于查重）"""
    return hashlib.sha256(id_card.strip().encode()).hexdigest()


def encrypt_id_card(id_card: str) -> str:
    """AES-256 加密身份证号（可逆，需审计权限才能解密）"""
    try:
        from cryptography.fernet import Fernet
        import base64
        key = base64.urlsafe_b64encode(_get_encryption_key())
        f = Fernet(key)
        return f.encrypt(id_card.strip().encode()).decode()
    except ImportError:
        logger.warning("cryptography 未安装，身份证号以 base64 编码存储（非安全）")
        import base64
        return base64.b64encode(id_card.strip().encode()).decode()


def decrypt_id_card(encrypted: str) -> str:
    """解密身份证号"""
    if not encrypted:
        return ''
    try:
        from cryptography.fernet import Fernet
        import base64
        key = base64.urlsafe_b64encode(_get_encryption_key())
        f = Fernet(key)
        return f.decrypt(encrypted.encode()).decode()
    except ImportError:
        import base64
        return base64.b64decode(encrypted.encode()).decode()


# ============================================================================
# 主档案 CRUD
# ============================================================================
def get_or_create_profile(subject_id: int) -> SubjectProfile:
    """获取或创建受试者主档案"""
    profile, _ = SubjectProfile.objects.get_or_create(subject_id=subject_id)
    return profile


def update_profile(subject_id: int, **kwargs) -> Optional[SubjectProfile]:
    """更新受试者主档案"""
    profile = get_or_create_profile(subject_id)

    # 特殊处理身份证号字段
    id_card = kwargs.pop('id_card', None)
    if id_card:
        profile.id_card_hash = hash_id_card(id_card)
        profile.id_card_encrypted = encrypt_id_card(id_card)
        profile.id_card_last4 = id_card.strip()[-4:]

    allowed_fields = {
        'birth_date', 'age', 'ethnicity', 'education', 'occupation',
        'marital_status', 'name_pinyin', 'phone_backup', 'email',
        'province', 'city', 'district', 'address', 'postal_code',
        'emergency_contact_name', 'emergency_contact_phone',
        'emergency_contact_relation', 'privacy_level',
        'consent_data_sharing', 'consent_rwe_usage',
        'consent_biobank', 'consent_follow_up', 'data_retention_years',
    }
    for key, val in kwargs.items():
        if val is not None and key in allowed_fields:
            setattr(profile, key, val)
    profile.save()
    return profile


def get_profile_dict(subject_id: int, include_sensitive: bool = False) -> dict:
    """获取档案字典（L1 敏感字段默认不返回）"""
    profile = SubjectProfile.objects.filter(subject_id=subject_id).first()
    if not profile:
        return {}
    data = {
        'birth_date': profile.birth_date.isoformat() if profile.birth_date else None,
        'age': profile.age,
        'ethnicity': profile.ethnicity,
        'education': profile.education,
        'occupation': profile.occupation,
        'marital_status': profile.marital_status,
        'name_pinyin': profile.name_pinyin,
        'id_card_last4': profile.id_card_last4,
        'phone_backup': profile.phone_backup,
        'email': profile.email,
        'province': profile.province,
        'city': profile.city,
        'district': profile.district,
        'address': profile.address if include_sensitive else '',
        'postal_code': profile.postal_code,
        'emergency_contact_name': profile.emergency_contact_name,
        'emergency_contact_phone': profile.emergency_contact_phone,
        'emergency_contact_relation': profile.emergency_contact_relation,
        'first_screening_date': profile.first_screening_date.isoformat() if profile.first_screening_date else None,
        'first_enrollment_date': profile.first_enrollment_date.isoformat() if profile.first_enrollment_date else None,
        'total_enrollments': profile.total_enrollments,
        'total_completed': profile.total_completed,
        'privacy_level': profile.privacy_level,
        'consent_data_sharing': profile.consent_data_sharing,
        'consent_rwe_usage': profile.consent_rwe_usage,
        'consent_biobank': profile.consent_biobank,
        'consent_follow_up': profile.consent_follow_up,
        'data_retention_years': profile.data_retention_years,
    }
    if include_sensitive:
        data['id_card'] = decrypt_id_card(profile.id_card_encrypted)
    return data


# ============================================================================
# 医学子表 CRUD（通用模式）
# ============================================================================
def _list_sub_records(model_class, subject_id: int) -> list:
    """通用子表列表查询"""
    return list(model_class.objects.filter(subject_id=subject_id).order_by('-create_time'))


def _create_sub_record(model_class, subject_id: int, **kwargs):
    """通用子表创建"""
    return model_class.objects.create(subject_id=subject_id, **kwargs)


def _update_sub_record(model_class, record_id: int, **kwargs):
    """通用子表更新"""
    record = model_class.objects.filter(id=record_id).first()
    if not record:
        return None
    for key, val in kwargs.items():
        if val is not None and hasattr(record, key):
            setattr(record, key, val)
    record.save()
    return record


def _delete_sub_record(model_class, record_id: int) -> bool:
    """通用子表删除"""
    deleted, _ = model_class.objects.filter(id=record_id).delete()
    return deleted > 0


# 医学史
def list_medical_histories(subject_id: int) -> list:
    return _list_sub_records(MedicalHistory, subject_id)


def create_medical_history(subject_id: int, **kwargs) -> MedicalHistory:
    return _create_sub_record(MedicalHistory, subject_id, **kwargs)


def update_medical_history(record_id: int, **kwargs):
    return _update_sub_record(MedicalHistory, record_id, **kwargs)


def delete_medical_history(record_id: int) -> bool:
    return _delete_sub_record(MedicalHistory, record_id)


# 合并用药
def list_medications(subject_id: int) -> list:
    return _list_sub_records(ConcomitantMedication, subject_id)


def create_medication(subject_id: int, **kwargs) -> ConcomitantMedication:
    return _create_sub_record(ConcomitantMedication, subject_id, **kwargs)


# 过敏记录
def list_allergies(subject_id: int) -> list:
    return _list_sub_records(AllergyRecord, subject_id)


def create_allergy(subject_id: int, **kwargs) -> AllergyRecord:
    return _create_sub_record(AllergyRecord, subject_id, **kwargs)


# 家族病史
def list_family_histories(subject_id: int) -> list:
    return _list_sub_records(FamilyHistory, subject_id)


def create_family_history(subject_id: int, **kwargs) -> FamilyHistory:
    return _create_sub_record(FamilyHistory, subject_id, **kwargs)


# 生活方式
def list_lifestyle_records(subject_id: int) -> list:
    return _list_sub_records(LifestyleRecord, subject_id)


def create_lifestyle_record(subject_id: int, **kwargs) -> LifestyleRecord:
    return _create_sub_record(LifestyleRecord, subject_id, **kwargs)


# ============================================================================
# 领域档案 CRUD
# ============================================================================
def get_domain_profile(subject_id: int, domain: str) -> dict:
    """获取领域档案（skin/oral/nutrition/exposure）"""
    model_class = DOMAIN_PROFILE_MAP.get(domain)
    if not model_class:
        return {}
    obj = model_class.objects.filter(subject_id=subject_id).first()
    if not obj:
        return {}
    data = {}
    for field in obj._meta.get_fields():
        if field.name in ('id', 'subject', 'subject_id'):
            continue
        if hasattr(field, 'attname'):
            val = getattr(obj, field.attname, None)
            if hasattr(val, 'isoformat'):
                val = val.isoformat()
            data[field.name] = val
    return data


def update_domain_profile(subject_id: int, domain: str, **kwargs) -> dict:
    """更新或创建领域档案"""
    model_class = DOMAIN_PROFILE_MAP.get(domain)
    if not model_class:
        return {}
    obj, _ = model_class.objects.get_or_create(subject_id=subject_id)
    for key, val in kwargs.items():
        if val is not None and hasattr(obj, key) and key not in ('id', 'subject', 'subject_id'):
            setattr(obj, key, val)
    obj.save()
    return get_domain_profile(subject_id, domain)
