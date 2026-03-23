"""
CN KIS V2.0 Django Settings

架构改进（相比 V1）：
1. FEISHU_PRIMARY_APP_ID 作为唯一主授权应用（统一 scope，消除 V1 中多 App 分散授权问题）
2. 工作台列表从 backend/configs/workstations.yaml 动态加载，不再硬编码
3. CELERY_PRODUCTION_TASKS_DISABLED 保护测试环境（防止采集类任务污染生产资产）
4. KNOWLEDGE_WRITE_ENABLED 保护知识资产（V2 Wave 3 前只读）
5. 清除了 V1 中 settings.py 的 merge conflict 历史污染风险（统一单文件管理）
"""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# ============================================================================
# 环境变量加载
# ============================================================================
BASE_DIR = Path(__file__).resolve().parent
BACKEND_ENV = BASE_DIR / '.env'
DEPLOY_ENV = BASE_DIR.parent / 'deploy' / '.env.volcengine.plan-a'
if DEPLOY_ENV.exists():
    load_dotenv(DEPLOY_ENV)
load_dotenv()
if BACKEND_ENV.exists():
    load_dotenv(BACKEND_ENV, override=True)

# ============================================================================
# 基础配置
# ============================================================================
SECRET_KEY = os.getenv(
    'DJANGO_SECRET_KEY',
    'cn-kis-v2-default-key-please-override-in-production',
)
DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() == 'true'

_dev_bypass_raw = os.getenv('DEV_BYPASS_ACCOUNT_ID', '').strip()
DEV_BYPASS_ACCOUNT_ID = int(_dev_bypass_raw) if _dev_bypass_raw.isdigit() else None


def _build_allowed_hosts() -> list[str]:
    raw = os.getenv('DJANGO_ALLOWED_HOSTS', '*')
    hosts = [h.strip() for h in raw.split(',') if h.strip()]
    if not hosts:
        hosts = ['*']
    defaults = ['.sh.run.tcloudbase.com', '127.0.0.1', 'localhost']
    if '*' in hosts:
        return ['*']
    for item in defaults:
        if item not in hosts:
            hosts.append(item)
    return hosts


ALLOWED_HOSTS = _build_allowed_hosts()

SECURE_HSTS_SECONDS = int(os.getenv('DJANGO_SECURE_HSTS_SECONDS', '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv('DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS', 'True').lower() == 'true'
SECURE_HSTS_PRELOAD = os.getenv('DJANGO_SECURE_HSTS_PRELOAD', 'True').lower() == 'true'
SECURE_SSL_REDIRECT = os.getenv('DJANGO_SECURE_SSL_REDIRECT', 'False').lower() == 'true'
CSRF_COOKIE_SECURE = os.getenv('DJANGO_CSRF_COOKIE_SECURE', 'True').lower() == 'true'

# ============================================================================
# 应用配置
# ============================================================================
INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'corsheaders',
    # Wave 1: 认证与权限
    'apps.identity',
    'apps.audit',
    # Wave 2: 核心业务主干
    'apps.subject',
    'apps.protocol',
    'apps.visit',
    'apps.edc',
    'apps.workorder',
    'apps.signature',
    'apps.feishu_sync',
    'apps.agent_gateway',
    'apps.iot_data',
    # Wave 3: 知识与数据平面
    'apps.secretary',
    'apps.knowledge',
    'apps.ekuaibao_integration',
    'apps.lims_integration',
    # Wave 4: 企业扩展域
    'apps.quality',
    'apps.finance',
    'apps.hr',
    'apps.crm',
    'apps.resource',
    'apps.scheduling',
    'apps.safety',
    'apps.document',
    'apps.ethics',
    'apps.sample',
    'apps.report',
    'apps.notification',
    'apps.workflow',
    'apps.qrcode',
    'apps.lab_personnel',
    'apps.proposal',
    'apps.feasibility',
    'apps.closeout',
    # Wave 5: AI 与治理台
    'apps.control_plane',
    'apps.project_full_link',
    'apps.weekly_report',
    'apps.product_distribution',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'middleware.product_distribution_guard.ProductDistributionGuardMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'middleware.request_logging.RequestLoggingMiddleware',
]

ROOT_URLCONF = 'urls'
WSGI_APPLICATION = 'wsgi.application'
APPEND_SLASH = False

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {'context_processors': []},
    },
]

# ============================================================================
# 数据库
# ============================================================================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'cn_kis_v2'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}

if os.getenv('DB_REPLICA_HOST', '').strip():
    DATABASES['replica'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_REPLICA_NAME', os.getenv('DB_NAME', 'cn_kis_v2')),
        'USER': os.getenv('DB_REPLICA_USER', os.getenv('DB_USER', 'postgres')),
        'PASSWORD': os.getenv('DB_REPLICA_PASSWORD', os.getenv('DB_PASSWORD', '')),
        'HOST': os.getenv('DB_REPLICA_HOST', ''),
        'PORT': os.getenv('DB_REPLICA_PORT', os.getenv('DB_PORT', '5432')),
    }

if os.getenv('USE_SQLITE', 'false').lower() == 'true':
    _sqlite_path = BASE_DIR / 'db.sqlite3'
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': _sqlite_path,
        }
    }

_instrument_upload_host = os.getenv('INSTRUMENT_UPLOAD_DB_HOST', '').strip()
if _instrument_upload_host:
    DATABASES['instrument_upload'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('INSTRUMENT_UPLOAD_DB_NAME', 'cn_kis_v2'),
        'USER': os.getenv('INSTRUMENT_UPLOAD_DB_USER', 'postgres'),
        'PASSWORD': os.getenv('INSTRUMENT_UPLOAD_DB_PASSWORD', ''),
        'HOST': _instrument_upload_host,
        'PORT': os.getenv('INSTRUMENT_UPLOAD_DB_PORT', '5432'),
    }

INSTRUMENT_UPLOAD_API_KEY = os.getenv('INSTRUMENT_UPLOAD_API_KEY', '').strip() or None
DATABASE_ROUTERS = ['db_router.ReadWriteRouter']
WORKORDER_FREEZE_LEGACY_WRITE = os.getenv('WORKORDER_FREEZE_LEGACY_WRITE', 'false').lower() == 'true'
WORKORDER_FREEZE_OBSERVE_LOG_ENABLED = os.getenv('WORKORDER_FREEZE_OBSERVE_LOG_ENABLED', 'true').lower() == 'true'

# ============================================================================
# Redis / 缓存
# ============================================================================
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
USE_LOCAL_CACHE = os.getenv('USE_LOCAL_CACHE', '').lower() == 'true' or os.getenv('USE_SQLITE', 'false').lower() == 'true'
USE_DUMMY_CACHE = os.getenv('USE_DUMMY_CACHE', 'false').lower() == 'true'

if USE_LOCAL_CACHE or USE_DUMMY_CACHE:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'cn-kis-v2'}}
else:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': REDIS_URL}}

# ============================================================================
# CORS
# ============================================================================
_raw_origins = [
    origin.strip()
    for origin in os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')
    if origin.strip()
]
CORS_ALLOW_ALL_ORIGINS = DEBUG and ('*' in _raw_origins or not _raw_origins)
CORS_ALLOWED_ORIGINS = [o for o in _raw_origins if o != '*']
if not CORS_ALLOWED_ORIGINS and not CORS_ALLOW_ALL_ORIGINS:
    CORS_ALLOWED_ORIGINS = [
        'http://localhost:3000', 'http://localhost:5173',
        'http://127.0.0.1:5173', 'http://127.0.0.1:3000',
    ]

# ============================================================================
# 飞书配置 — 统一主授权架构（V2 核心改进）
# ============================================================================
# V2 架构：所有工作台 OAuth 统一走子衿主应用签发 token
# 每个工作台不再需要独立 App（无 scope 分裂问题）
# 工作台 App ID 仅用于归属校验，OAuth 换 token 统一走 FEISHU_PRIMARY_APP_ID
# strip() 去掉 Windows CRLF 行尾 \r 与首尾空格，避免飞书 20002 invalid_client
FEISHU_APP_ID = (os.getenv('FEISHU_APP_ID', '') or '').strip()
FEISHU_APP_SECRET = (os.getenv('FEISHU_APP_SECRET', '') or '').strip()

# 各工作台独立 App（可选，仅用于工作台归属校验）
FEISHU_APP_ID_FINANCE = os.getenv('FEISHU_APP_ID_FINANCE', '')
FEISHU_APP_SECRET_FINANCE = os.getenv('FEISHU_APP_SECRET_FINANCE', '')
FEISHU_APP_ID_RESEARCH = os.getenv('FEISHU_APP_ID_RESEARCH', '')
FEISHU_APP_SECRET_RESEARCH = os.getenv('FEISHU_APP_SECRET_RESEARCH', '')
FEISHU_APP_ID_EXECUTION = os.getenv('FEISHU_APP_ID_EXECUTION', '')
FEISHU_APP_SECRET_EXECUTION = os.getenv('FEISHU_APP_SECRET_EXECUTION', '')
FEISHU_APP_ID_QUALITY = os.getenv('FEISHU_APP_ID_QUALITY', '')
FEISHU_APP_SECRET_QUALITY = os.getenv('FEISHU_APP_SECRET_QUALITY', '')
FEISHU_APP_ID_HR = os.getenv('FEISHU_APP_ID_HR', '')
FEISHU_APP_SECRET_HR = os.getenv('FEISHU_APP_SECRET_HR', '')
FEISHU_APP_ID_CRM = os.getenv('FEISHU_APP_ID_CRM', '')
FEISHU_APP_SECRET_CRM = os.getenv('FEISHU_APP_SECRET_CRM', '')
FEISHU_APP_ID_RECRUITMENT = os.getenv('FEISHU_APP_ID_RECRUITMENT', '')
FEISHU_APP_SECRET_RECRUITMENT = os.getenv('FEISHU_APP_SECRET_RECRUITMENT', '')
FEISHU_APP_ID_EQUIPMENT = os.getenv('FEISHU_APP_ID_EQUIPMENT', '')
FEISHU_APP_SECRET_EQUIPMENT = os.getenv('FEISHU_APP_SECRET_EQUIPMENT', '')
FEISHU_APP_ID_MATERIAL = os.getenv('FEISHU_APP_ID_MATERIAL', '')
FEISHU_APP_SECRET_MATERIAL = os.getenv('FEISHU_APP_SECRET_MATERIAL', '')
FEISHU_APP_ID_FACILITY = os.getenv('FEISHU_APP_ID_FACILITY', '')
FEISHU_APP_SECRET_FACILITY = os.getenv('FEISHU_APP_SECRET_FACILITY', '')
FEISHU_APP_ID_EVALUATOR = os.getenv('FEISHU_APP_ID_EVALUATOR', '')
FEISHU_APP_SECRET_EVALUATOR = os.getenv('FEISHU_APP_SECRET_EVALUATOR', '')
FEISHU_APP_ID_LAB_PERSONNEL = os.getenv('FEISHU_APP_ID_LAB_PERSONNEL', '')
FEISHU_APP_SECRET_LAB_PERSONNEL = os.getenv('FEISHU_APP_SECRET_LAB_PERSONNEL', '')
FEISHU_APP_ID_ETHICS = os.getenv('FEISHU_APP_ID_ETHICS', '')
FEISHU_APP_SECRET_ETHICS = os.getenv('FEISHU_APP_SECRET_ETHICS', '')
FEISHU_APP_ID_RECEPTION = os.getenv('FEISHU_APP_ID_RECEPTION', '')
FEISHU_APP_SECRET_RECEPTION = os.getenv('FEISHU_APP_SECRET_RECEPTION', '')
FEISHU_APP_ID_CONTROL_PLANE = os.getenv('FEISHU_APP_ID_CONTROL_PLANE', '')
FEISHU_APP_SECRET_CONTROL_PLANE = os.getenv('FEISHU_APP_SECRET_CONTROL_PLANE', '')
# 17. 智能开发助手 / 子衿主授权应用（构建凭证表用；最终 ID 见下方 FEISHU_PRIMARY 段再次解析）
FEISHU_APP_ID_DEV_ASSISTANT = (os.getenv('FEISHU_APP_ID_DEV_ASSISTANT', 'cli_a98b0babd020500e') or '').strip()
FEISHU_APP_SECRET_DEV_ASSISTANT = (os.getenv('FEISHU_APP_SECRET_DEV_ASSISTANT', '') or '').strip()

# 凭证映射（OAuth 回调查找）
def _build_feishu_credentials():
    creds = {}
    pairs = [
        (FEISHU_APP_ID, FEISHU_APP_SECRET),
        (FEISHU_APP_ID_FINANCE, FEISHU_APP_SECRET_FINANCE),
        (FEISHU_APP_ID_RESEARCH, FEISHU_APP_SECRET_RESEARCH),
        (FEISHU_APP_ID_EXECUTION, FEISHU_APP_SECRET_EXECUTION),
        (FEISHU_APP_ID_QUALITY, FEISHU_APP_SECRET_QUALITY),
        (FEISHU_APP_ID_HR, FEISHU_APP_SECRET_HR),
        (FEISHU_APP_ID_CRM, FEISHU_APP_SECRET_CRM),
        (FEISHU_APP_ID_RECRUITMENT, FEISHU_APP_SECRET_RECRUITMENT),
        (FEISHU_APP_ID_EQUIPMENT, FEISHU_APP_SECRET_EQUIPMENT),
        (FEISHU_APP_ID_MATERIAL, FEISHU_APP_SECRET_MATERIAL),
        (FEISHU_APP_ID_FACILITY, FEISHU_APP_SECRET_FACILITY),
        (FEISHU_APP_ID_EVALUATOR, FEISHU_APP_SECRET_EVALUATOR),
        (FEISHU_APP_ID_LAB_PERSONNEL, FEISHU_APP_SECRET_LAB_PERSONNEL),
        (FEISHU_APP_ID_ETHICS, FEISHU_APP_SECRET_ETHICS),
        (FEISHU_APP_ID_RECEPTION, FEISHU_APP_SECRET_RECEPTION),
        (FEISHU_APP_ID_CONTROL_PLANE, FEISHU_APP_SECRET_CONTROL_PLANE),
        (FEISHU_APP_ID_DEV_ASSISTANT, FEISHU_APP_SECRET_DEV_ASSISTANT),
    ]
    for app_id, app_secret in pairs:
        if app_id and app_secret:
            creds[app_id] = app_secret
    # 子衿主授权兜底：未单独配 FEISHU_APP_ID 时，用 FEISHU_APP_SECRET 作为子衿凭证，避免 OAuth 20002
    _primary_id = 'cli_a98b0babd020500e'
    if _primary_id not in creds and FEISHU_APP_SECRET and (not FEISHU_APP_ID or FEISHU_APP_ID == _primary_id):
        creds[_primary_id] = FEISHU_APP_SECRET
    return creds

FEISHU_APP_CREDENTIALS = _build_feishu_credentials()

# ★ 主授权配置（V2 迁移章程红线）
_primary_from_env = os.getenv('FEISHU_PRIMARY_APP_ID', '')
FEISHU_PRIMARY_APP_ID = _primary_from_env or FEISHU_APP_ID or 'cli_a98b0babd020500e'
if not _primary_from_env:
    import logging as _logging
    _logging.getLogger(__name__).warning(
        'FEISHU_PRIMARY_APP_ID 未设置，自动使用 %s。建议在 .env 中显式设置。',
        FEISHU_PRIMARY_APP_ID,
    )
FEISHU_APP_ID_DEV_ASSISTANT = os.getenv('FEISHU_APP_ID_DEV_ASSISTANT', '').strip() or FEISHU_PRIMARY_APP_ID
_env_fallback = [x.strip() for x in os.getenv('FEISHU_REFRESH_FALLBACK_APP_IDS', '').split(',') if x.strip()]
_auto_fallback = [FEISHU_PRIMARY_APP_ID, FEISHU_APP_ID_DEV_ASSISTANT, FEISHU_APP_ID] + list(FEISHU_APP_CREDENTIALS.keys())
FEISHU_REFRESH_FALLBACK_APP_IDS = list(dict.fromkeys(filter(None, _env_fallback + _auto_fallback)))
FEISHU_PRIMARY_AUTH_FORCE = os.getenv('FEISHU_PRIMARY_AUTH_FORCE', '1').strip().lower() in ('1', 'true', 'yes')
FEISHU_PREFLIGHT_BLOCK_SCAN = os.getenv('FEISHU_PREFLIGHT_BLOCK_SCAN', '1').strip().lower() in ('1', 'true', 'yes')

# 工作台 → app_id 映射
FEISHU_WORKSTATION_APP_IDS = {
    'secretary': FEISHU_APP_ID,
    'finance': FEISHU_APP_ID_FINANCE or FEISHU_APP_ID,
    'research': FEISHU_APP_ID_RESEARCH or FEISHU_APP_ID,
    'execution': FEISHU_APP_ID_EXECUTION or FEISHU_APP_ID,
    'quality': FEISHU_APP_ID_QUALITY or FEISHU_APP_ID,
    'hr': FEISHU_APP_ID_HR or FEISHU_APP_ID,
    'crm': FEISHU_APP_ID_CRM or FEISHU_APP_ID,
    'recruitment': FEISHU_APP_ID_RECRUITMENT or FEISHU_APP_ID,
    'equipment': FEISHU_APP_ID_EQUIPMENT or FEISHU_APP_ID,
    'material': FEISHU_APP_ID_MATERIAL or FEISHU_APP_ID,
    'facility': FEISHU_APP_ID_FACILITY or FEISHU_APP_ID,
    'evaluator': FEISHU_APP_ID_EVALUATOR or FEISHU_APP_ID,
    'lab-personnel': FEISHU_APP_ID_LAB_PERSONNEL or FEISHU_APP_ID,
    'ethics': FEISHU_APP_ID_ETHICS or FEISHU_APP_ID,
    'reception': FEISHU_APP_ID_RECEPTION or FEISHU_APP_ID,
    'control-plane': FEISHU_APP_ID_CONTROL_PLANE or FEISHU_APP_ID,
    'admin': FEISHU_APP_ID,
    'digital-workforce': FEISHU_APP_ID,
}

# 飞书其他配置
FEISHU_CALENDAR_VISIT_ID = os.getenv('FEISHU_CALENDAR_VISIT_ID', '')
FEISHU_CALENDAR_TRAINING_ID = os.getenv('FEISHU_CALENDAR_TRAINING_ID', '')
FEISHU_NOTIFICATION_CHAT_ID = os.getenv('FEISHU_NOTIFICATION_CHAT_ID', '')
FEISHU_APPROVAL_CODE_ETHICS = os.getenv('FEISHU_APPROVAL_CODE_ETHICS', '')
FEISHU_APPROVAL_CODE_AE_REPORT = os.getenv('FEISHU_APPROVAL_CODE_AE_REPORT', '')
FEISHU_APPROVAL_CODE_DEVIATION = os.getenv('FEISHU_APPROVAL_CODE_DEVIATION', '')
FEISHU_APPROVAL_CODE_CONTRACT = os.getenv('FEISHU_APPROVAL_CODE_CONTRACT', '')
FEISHU_APPROVAL_CODE_WORKORDER = os.getenv('FEISHU_APPROVAL_CODE_WORKORDER', '')
FEISHU_APPROVAL_CODE_RESOURCE_DEMAND = os.getenv('FEISHU_APPROVAL_CODE_RESOURCE_DEMAND', '')

# ============================================================================
# 微信小程序（受试者端）
# ============================================================================
WECHAT_APPID = os.getenv('WECHAT_APPID', '')
WECHAT_SECRET = os.getenv('WECHAT_SECRET', '')
WECHAT_API_SYMMETRIC_KEY = os.getenv('WECHAT_API_SYMMETRIC_KEY', '')
WECHAT_API_PUBLIC_KEY = os.getenv('WECHAT_API_PUBLIC_KEY', '')

# ============================================================================
# 实名核验（火山引擎）
# ============================================================================
VOLC_ACCESSKEY = os.getenv('VOLC_ACCESSKEY', '')
VOLC_SECRETKEY = os.getenv('VOLC_SECRETKEY', '')
VOLC_ACCOUNT_ID = os.getenv('VOLC_ACCOUNT_ID', '')
VOLC_SUB_ACCESSKEY = os.getenv('VOLC_SUB_ACCESSKEY', '')
VOLC_SUB_SECRETKEY = os.getenv('VOLC_SUB_SECRETKEY', '')
VOLC_CERT_ROLE_TRN = os.getenv('VOLC_CERT_ROLE_TRN', '')
IDENTITY_VERIFY_H5_CONFIG_ID = os.getenv('IDENTITY_VERIFY_H5_CONFIG_ID', '')
IDENTITY_VERIFY_CALLBACK_TOKEN = os.getenv('IDENTITY_VERIFY_CALLBACK_TOKEN', '')
IDENTITY_VERIFY_ALLOW_MANUAL_COMPLETE = os.getenv('IDENTITY_VERIFY_ALLOW_MANUAL_COMPLETE', 'false').lower() == 'true'

ANYCROSS_WEBHOOK_URL = os.getenv('ANYCROSS_WEBHOOK_URL', '')
ANYCROSS_WEBHOOK_SECRET = os.getenv('ANYCROSS_WEBHOOK_SECRET', '')

# ============================================================================
# AI 智能体配置（双通道：火山引擎 ARK + Kimi）
# ============================================================================
ARK_API_KEY = os.getenv('ARK_API_KEY', '')
ARK_API_BASE = os.getenv('ARK_API_BASE', 'https://ark.cn-beijing.volces.com/api/v3')
ARK_DEFAULT_MODEL = os.getenv('ARK_DEFAULT_MODEL', os.getenv('VOLCENGINE_SMART_ROUTER_ENDPOINT', ''))
ARK_EMBEDDING_ENDPOINT = os.getenv('ARK_EMBEDDING_ENDPOINT', 'ep-20260207183913-qgk6j')

KIMI_API_KEY = os.getenv('KIMI_API_KEY', '')
KIMI_API_BASE = os.getenv('KIMI_API_BASE', 'https://api.moonshot.cn/v1')
KIMI_DEFAULT_MODEL = os.getenv('KIMI_DEFAULT_MODEL', 'moonshot-v1-32k')

PROTOCOL_EXTRACT_V2_BASE_URL = (os.getenv('PROTOCOL_EXTRACT_V2_BASE_URL', '') or os.getenv('AI_API_BASE_URL', '')).rstrip('/')
PROTOCOL_EXTRACT_V2_TOKEN = (os.getenv('PROTOCOL_EXTRACT_V2_TOKEN', '') or os.getenv('AI_API_KEY', '')).strip()

DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY', '')
DEEPSEEK_API_KEY_BACKUP = os.getenv('DEEPSEEK_API_KEY_BACKUP', '')
DEEPSEEK_API_BASE = os.getenv('DEEPSEEK_API_BASE', 'https://api.deepseek.com/v1')
DEEPSEEK_DEFAULT_MODEL = os.getenv('DEEPSEEK_DEFAULT_MODEL', 'deepseek-chat')
DEEPSEEK_REASONING_MODEL = os.getenv('DEEPSEEK_REASONING_MODEL', 'deepseek-reasoner')
DEEPSEEK_ALLOWED_MODELS = os.getenv('DEEPSEEK_ALLOWED_MODELS', 'deepseek-chat,deepseek-reasoner')

# ============================================================================
# 向量化与知识库
# ============================================================================
TAVILY_API_KEY = os.getenv('TAVILY_API_KEY', '')
FIRECRAWL_API_KEY = os.getenv('FIRECRAWL_API_KEY', '')
QDRANT_URL = os.getenv('QDRANT_URL', 'http://localhost:6333')
CDISC_LIBRARY_API_KEY = os.getenv('CDISC_LIBRARY_API_KEY', '')

_hf_endpoint = os.getenv('HF_ENDPOINT', '')
if _hf_endpoint:
    os.environ['HF_ENDPOINT'] = _hf_endpoint

QWEN3_EMBEDDING_URL = os.getenv('QWEN3_EMBEDDING_URL', 'http://11nzxz3591157.vicp.fun:49846/Embedding/v1/embeddings')
QWEN3_EMBEDDING_KEY = os.getenv('QWEN3_EMBEDDING_KEY', '7ed12a89-fe21-4ed1-9616-1f6f27e64637')
JINA_API_KEY = os.getenv('JINA_API_KEY', '')
JINA_EMBEDDING_MODEL = os.getenv('JINA_EMBEDDING_MODEL', 'jina-embeddings-v3')
JINA_EMBEDDING_DIM = int(os.getenv('JINA_EMBEDDING_DIM', '1024'))
KNOWLEDGE_EMBEDDING_STRATEGY = os.getenv('KNOWLEDGE_EMBEDDING_STRATEGY', 'qwen3')
VOLCENGINE_KB_COLLECTION = os.getenv('VOLCENGINE_KB_COLLECTION', '')
VOLCENGINE_KB_API_KEY = os.getenv('VOLCENGINE_KB_API_KEY', '')

# ============================================================================
# V2 安全开关（迁移章程红线）
# ============================================================================
# 测试环境必须设为 true，防止生产采集任务污染测试数据
CELERY_PRODUCTION_TASKS_DISABLED = os.getenv('CELERY_PRODUCTION_TASKS_DISABLED', 'false').lower() == 'true'
# V2 初期知识资产只读，Wave 3 完成后显式解锁
KNOWLEDGE_WRITE_ENABLED = os.getenv('KNOWLEDGE_WRITE_ENABLED', 'false').lower() == 'true'

# ============================================================================
# SADC 评估工作台配置
# ============================================================================
_sadc_default = os.path.join(os.environ.get('ProgramData', 'C:\\ProgramData'), 'CHINA_NORM', 'SADC_V1.0') if os.name == 'nt' else None
SADC_WORKBENCH_DIR = os.getenv('SADC_WORKBENCH_DIR', _sadc_default or '').strip() or None
SADC_START_CMD = os.getenv('SADC_START_CMD', 'python app.py').strip() or 'python app.py'
SADC_TERMINAL_ID = os.getenv('SADC_TERMINAL_ID', '').strip() or None

# ============================================================================
# JWT 认证
# ============================================================================
JWT_SECRET = os.getenv('JWT_SECRET', SECRET_KEY)
JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))
ACCEPT_EXTERNAL_JWT_FOR_DEV = os.getenv('ACCEPT_EXTERNAL_JWT_FOR_DEV', 'false').lower() == 'true'

# ============================================================================
# 文件存储路径
# ============================================================================
try:
    from libs.storage_paths import ensure_directory, resolve_log_dir, resolve_media_root
    MEDIA_ROOT = resolve_media_root(BASE_DIR)
    ensure_directory(MEDIA_ROOT)
    LOG_DIR = resolve_log_dir(BASE_DIR)
    ensure_directory(LOG_DIR)
except ImportError:
    MEDIA_ROOT = BASE_DIR / 'media'
    LOG_DIR = BASE_DIR / 'logs'
    os.makedirs(MEDIA_ROOT, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)

MEDIA_URL = '/media/'
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ============================================================================
# 表名前缀
# ============================================================================
DB_PREFIX = os.getenv('DB_PREFIX', 't')

# ============================================================================
# 日志
# ============================================================================
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            '()': 'pythonjsonlogger.jsonlogger.JsonFormatter',
            'format': '%(asctime)s %(name)s %(levelname)s %(message)s',
        },
        'verbose': {
            'format': '[%(asctime)s] %(levelname)s %(name)s: %(message)s',
        },
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'verbose'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        'cn_kis': {'handlers': ['console'], 'level': 'DEBUG' if DEBUG else 'INFO', 'propagate': False},
        'cn_kis.auth': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}
