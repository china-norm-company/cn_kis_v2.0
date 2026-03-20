"""
受试者管理服务

re-export 所有服务函数，保持 `from . import services` / `from .services import xxx` 兼容。
"""
from .subject_service import (
    list_subjects,
    get_subject,
    create_subject,
    update_subject,
    delete_subject,
    change_subject_status,
    generate_subject_no,
)

from .enrollment_service import (
    list_enrollments,
    enroll_subject,
    update_enrollment_status,
)

from .consent_service import (
    get_icf_versions,
    create_icf_version,
    sign_consent,
    get_subject_consents,
)

from .profile_service import (
    get_or_create_profile,
    update_profile,
    get_profile_dict,
    get_domain_profile,
    update_domain_profile,
    list_medical_histories,
    create_medical_history,
    list_medications,
    create_medication,
    list_allergies,
    create_allergy,
    list_family_histories,
    create_family_history,
    list_lifestyle_records,
    create_lifestyle_record,
    hash_id_card,
    encrypt_id_card,
    decrypt_id_card,
)

__all__ = [
    # 受试者 CRUD
    'list_subjects',
    'get_subject',
    'create_subject',
    'update_subject',
    'delete_subject',
    'change_subject_status',
    'generate_subject_no',
    # 入组管理
    'list_enrollments',
    'enroll_subject',
    'update_enrollment_status',
    # 知情同意
    'get_icf_versions',
    'create_icf_version',
    'sign_consent',
    'get_subject_consents',
    # 档案
    'get_or_create_profile',
    'update_profile',
    'get_profile_dict',
    'get_domain_profile',
    'update_domain_profile',
    'list_medical_histories',
    'create_medical_history',
    'list_medications',
    'create_medication',
    'list_allergies',
    'create_allergy',
    'list_family_histories',
    'create_family_history',
    'list_lifestyle_records',
    'create_lifestyle_record',
    'hash_id_card',
    'encrypt_id_card',
    'decrypt_id_card',
]
