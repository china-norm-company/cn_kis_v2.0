"""
硬编码整改验收测试
覆盖：本次整改的 14 个问题点（HC-01 ~ HC-14）的静态与运行时验证

测试分组：
  A. 安全验证（API Token 不泄露）
  B. Embedding 治理规范合规性
  C. settings 配置完整性
  D. 前端 SDK App ID 一致性
  E. 工作台常量模块完整性
  F. PersonalContextSourceType 枚举
  G. data-platform API 端点覆盖

运行方式（生产服务器）：
  cd /opt/cn-kis-v2/backend
  ./venv/bin/python manage.py shell < tests/test_hardcoding_remediation.py

运行方式（本地开发）：
  cd backend
  python manage.py shell < ../tests/test_hardcoding_remediation.py
"""
import os
import sys
import re
import traceback
from pathlib import Path

# ── 颜色输出 ──────────────────────────────────────────────────────────────────
GREEN = '\033[92m'
RED   = '\033[91m'
YELLOW= '\033[93m'
RESET = '\033[0m'

_results = {'pass': 0, 'fail': 0, 'warn': 0}

def tc(name: str, condition: bool, msg: str = '', warn: bool = False):
    if condition:
        print(f'  {GREEN}PASS{RESET}  {name}')
        _results['pass'] += 1
    elif warn:
        print(f'  {YELLOW}WARN{RESET}  {name}  ← {msg}')
        _results['warn'] += 1
    else:
        print(f'  {RED}FAIL{RESET}  {name}  ← {msg}')
        _results['fail'] += 1

def section(title: str):
    print(f'\n{"="*60}')
    print(f'  {title}')
    print('='*60)

def summary():
    total = sum(_results.values())
    print(f'\n{"─"*60}')
    print(f'  总计: {total}  |  '
          f'{GREEN}PASS {_results["pass"]}{RESET}  |  '
          f'{YELLOW}WARN {_results["warn"]}{RESET}  |  '
          f'{RED}FAIL {_results["fail"]}{RESET}')
    print('─'*60)
    if _results['fail'] > 0:
        print(f'\n{RED}⚠️  存在 {_results["fail"]} 项失败，请检查上方输出。{RESET}')
        sys.exit(1)
    else:
        print(f'\n{GREEN}✅ 所有硬编码整改验收通过。{RESET}')

# 项目根目录（当前文件位于 tests/，取父级）
PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_ROOT = PROJECT_ROOT / 'backend'
PACKAGES_ROOT = PROJECT_ROOT / 'packages'
WORKSTATIONS_ROOT = PROJECT_ROOT / 'workstations'

# =============================================================================
# A. 安全验证 — API Token 不泄露
# =============================================================================
section('A. 安全验证 — API Token 不泄露（HC-01, HC-02）')

LEAKED_TOKEN = '7ed12a89-fe21-4ed1-9616-1f6f27e64637'
OLD_QWEN_VAR = 'QWEN_API_TOKEN'
OLD_QWEN_URL_VAR = 'QWEN_EMBEDDING_URL'

def grep_in_py_files(root: Path, pattern: str) -> list:
    """在 .py 文件中搜索 pattern，返回 (文件, 行号, 行内容) 列表"""
    matches = []
    for f in root.rglob('*.py'):
        if '.venv' in str(f) or '__pycache__' in str(f) or 'migrations' in str(f):
            continue
        try:
            for i, line in enumerate(f.read_text(errors='ignore').splitlines(), 1):
                if pattern in line:
                    matches.append((f, i, line.strip()))
        except Exception:
            pass
    return matches

token_hits = grep_in_py_files(BACKEND_ROOT / 'apps', LEAKED_TOKEN)
tc('HC-01: API Token 不在 apps/ 源代码中',
   len(token_hits) == 0,
   f'发现 {len(token_hits)} 处: {[str(h[0]) + ":" + str(h[1]) for h in token_hits[:3]]}')

old_var_hits = grep_in_py_files(BACKEND_ROOT / 'apps', OLD_QWEN_VAR)
tc('HC-02a: 旧变量名 QWEN_API_TOKEN 不在 apps/ 中',
   len(old_var_hits) == 0,
   f'发现 {len(old_var_hits)} 处残留')

old_url_hits = grep_in_py_files(BACKEND_ROOT / 'apps', OLD_QWEN_URL_VAR)
tc('HC-02b: 旧变量名 QWEN_EMBEDDING_URL 不在 apps/ 中',
   len(old_url_hits) == 0,
   f'发现 {len(old_url_hits)} 处残留')

# =============================================================================
# B. Embedding 治理规范合规性
# =============================================================================
section('B. Embedding 治理规范合规性（HC-03, HC-04）')

strategy_hits = grep_in_py_files(BACKEND_ROOT / 'apps', 'KNOWLEDGE_EMBEDDING_STRATEGY')
tc('HC-03: KNOWLEDGE_EMBEDDING_STRATEGY 违规读取已删除',
   len(strategy_hits) == 0,
   f'发现 {len(strategy_hits)} 处读取')

# 检查 _get_embedding 函数不再返回 None
tasks_file = BACKEND_ROOT / 'apps' / 'knowledge' / 'tasks.py'
if tasks_file.exists():
    tasks_text = tasks_file.read_text()
    # 找到 _get_embedding 函数体
    fn_match = re.search(r'def _get_embedding\(.*?\):(.*?)^def ', tasks_text, re.DOTALL | re.MULTILINE)
    if fn_match:
        fn_body = fn_match.group(1)
        has_return_none = 'return None' in fn_body
        tc('HC-04: _get_embedding 不返回 None（改为 raise RuntimeError）',
           not has_return_none,
           '_get_embedding 中仍有 return None')
        has_raise_runtime = 'raise RuntimeError' in fn_body
        tc('HC-04b: _get_embedding 失败时 raise RuntimeError',
           has_raise_runtime,
           '_get_embedding 缺少 raise RuntimeError')
    else:
        tc('HC-04: _get_embedding 函数存在', False, '函数未找到，需手动检查')
else:
    tc('HC-04: tasks.py 文件存在', False, f'{tasks_file} 不存在')

# =============================================================================
# C. settings 配置完整性
# =============================================================================
section('C. settings 配置完整性（HC-07, HC-08）')

try:
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
    sys.path.insert(0, str(BACKEND_ROOT))
    django.setup()
    from django.conf import settings as django_settings

    tc('HC-07a: settings.SITE_URL 已定义',
       hasattr(django_settings, 'SITE_URL'),
       'settings 中缺少 SITE_URL 属性')

    tc('HC-07b: settings.SITE_URL 运行时有值（非空）',
       bool(getattr(django_settings, 'SITE_URL', '')),
       '生产环境 SITE_URL 未在 .env 中配置',
       warn=True)

    tc('HC-08a: settings.FEISHU_REDIRECT_BASE 已定义',
       hasattr(django_settings, 'FEISHU_REDIRECT_BASE'),
       'settings 中缺少 FEISHU_REDIRECT_BASE 属性')

    redirect_base = getattr(django_settings, 'FEISHU_REDIRECT_BASE', '')
    tc('HC-08b: FEISHU_REDIRECT_BASE 非 HTTP 裸 IP（建议 HTTPS 域名）',
       redirect_base and not redirect_base.startswith('http://118.'),
       f'当前值 {redirect_base!r}，建议配置为 HTTPS 域名',
       warn=True)

    tc('HC-02c: settings.QWEN3_EMBEDDING_URL 已定义',
       hasattr(django_settings, 'QWEN3_EMBEDDING_URL'),
       'settings 中缺少 QWEN3_EMBEDDING_URL')

    tc('HC-02d: settings.QWEN3_EMBEDDING_KEY 已定义',
       hasattr(django_settings, 'QWEN3_EMBEDDING_KEY'),
       'settings 中缺少 QWEN3_EMBEDDING_KEY')

    qwen_key = getattr(django_settings, 'QWEN3_EMBEDDING_KEY', '')
    tc('HC-01c: QWEN3_EMBEDDING_KEY 运行时有值（非空）',
       bool(qwen_key),
       'QWEN3_EMBEDDING_KEY 未在 .env 中配置，向量化任务将失败',
       warn=True)

    tc('HC-12: settings.DB_PREFIX 已定义（历史遗留，应有弃用注释）',
       hasattr(django_settings, 'DB_PREFIX'),
       'DB_PREFIX 不存在，注释可能意外删除了属性')

except Exception as e:
    print(f'  {RED}ERROR{RESET}  Django settings 加载失败: {e}')
    _results['fail'] += 1

# =============================================================================
# D. 前端 SDK App ID 一致性
# =============================================================================
section('D. 前端 SDK App ID 一致性（HC-05, HC-06）')

OLD_APP_ID = 'cli_a907f21f0723dbce'
ZIJIN_APP_ID = 'cli_a98b0babd020500e'

sdk_config = PACKAGES_ROOT / 'feishu-sdk' / 'src' / 'config.ts'
if sdk_config.exists():
    sdk_text = sdk_config.read_text()
    tc('HC-05a: feishu-sdk config.ts 不含 V1 旧 App ID',
       OLD_APP_ID not in sdk_text,
       f'仍含旧 App ID {OLD_APP_ID}')
    tc('HC-05b: feishu-sdk PRIMARY_APP_ID_FALLBACK 为子衿 ID',
       ZIJIN_APP_ID in sdk_text,
       f'未找到子衿 App ID {ZIJIN_APP_ID}')
else:
    tc('HC-05: feishu-sdk config.ts 存在', False, str(sdk_config))

for ws_key in ['digital-workforce', 'control-plane']:
    env_example = WORKSTATIONS_ROOT / ws_key / '.env.example'
    if env_example.exists():
        env_text = env_example.read_text()
        old_present = OLD_APP_ID in env_text
        new_present = ZIJIN_APP_ID in env_text
        tc(f'HC-06: {ws_key}/.env.example App ID 已更正',
           not old_present and new_present,
           f'旧 ID 存在={old_present}, 新 ID 存在={new_present}')
    else:
        tc(f'HC-06: {ws_key}/.env.example 存在', False, str(env_example), warn=True)

# =============================================================================
# E. 工作台常量模块完整性
# =============================================================================
section('E. 工作台常量模块完整性（HC-13）')

try:
    from apps.core.workstation_keys import (
        ALL_WORKSTATIONS, BUSINESS_WORKSTATIONS, PLATFORM_WORKSTATIONS,
        WS_FINANCE, WS_RESEARCH, WS_EXECUTION, WS_QUALITY,
        WS_ADMIN, WS_DATA_PLATFORM, INDEPENDENT_AUTH_WORKSTATIONS,
        LEGACY_WS_GOVERNANCE,
    )
    tc('HC-13a: apps.core.workstation_keys 可导入', True)
    tc('HC-13b: ALL_WORKSTATIONS 包含 19 个工作台',
       len(ALL_WORKSTATIONS) == 19,
       f'数量为 {len(ALL_WORKSTATIONS)}，期望 19')
    tc('HC-13c: BUSINESS_WORKSTATIONS 包含 15 个',
       len(BUSINESS_WORKSTATIONS) == 15,
       f'数量为 {len(BUSINESS_WORKSTATIONS)}，期望 15')
    tc('HC-13d: INDEPENDENT_AUTH_WORKSTATIONS 包含 admin + data-platform',
       WS_ADMIN in INDEPENDENT_AUTH_WORKSTATIONS and WS_DATA_PLATFORM in INDEPENDENT_AUTH_WORKSTATIONS,
       f'独立授权台: {INDEPENDENT_AUTH_WORKSTATIONS}')
    tc('HC-13e: WS_FINANCE == "finance"', WS_FINANCE == 'finance', '')
    tc('HC-13f: WS_ADMIN == "admin"', WS_ADMIN == 'admin', '')
    tc('HC-13g: LEGACY_WS_GOVERNANCE 仅作历史兼容常量', LEGACY_WS_GOVERNANCE == 'governance', '')
except ImportError as e:
    tc('HC-13: apps.core.workstation_keys 可导入', False, str(e))

# =============================================================================
# F. PersonalContextSourceType 枚举
# =============================================================================
section('F. PersonalContextSourceType 枚举（HC-14）')

try:
    from apps.secretary.models import PersonalContext, PersonalContextSourceType
    tc('HC-14a: PersonalContextSourceType 可导入', True)
    tc('HC-14b: MAIL == "mail"', PersonalContextSourceType.MAIL == 'mail', '')
    tc('HC-14c: IM == "im"', PersonalContextSourceType.IM == 'im', '')
    tc('HC-14d: source_type 字段有 choices',
       bool(PersonalContext._meta.get_field('source_type').choices),
       'source_type choices 为空，未绑定 TextChoices')
    tc('HC-14e: PersonalContextSourceType 枚举项 ≥ 10',
       len(PersonalContextSourceType.choices) >= 10,
       f'枚举项数量: {len(PersonalContextSourceType.choices)}')
except Exception as e:
    tc('HC-14: PersonalContextSourceType 加载', False, str(e))

# =============================================================================
# G. data-platform API 端点覆盖（静态检查）
# =============================================================================
section('G. data-platform API 端点覆盖（HC-09）')

dp_api_file = PACKAGES_ROOT / 'api-client' / 'src' / 'modules' / 'data-platform.ts'
if dp_api_file.exists():
    dp_text = dp_api_file.read_text()
    for method_name, desc in [
        ('intakeOverview', 'ExternalIntakePage 用'),
        ('dataQualityRules', 'QualityPage 用'),
        ('dataQualityAlerts', 'QualityPage 用'),
        ('protocolList', 'LineagePage 用'),
        ('protocolLineage', 'LineagePage 用'),
    ]:
        tc(f'HC-09: data-platform.ts 含 {method_name}（{desc}）',
           method_name in dp_text,
           f'方法 {method_name} 未找到')

    # 验证三个页面已删除硬编码 API_BASE
    for page, const_name in [
        ('ExternalIntakePage.tsx', "API_BASE = '"),
        ('QualityPage.tsx', "qualityApiBase = '"),
        ('LineagePage.tsx', "'/v2/api/v1/protocol/"),
    ]:
        page_file = WORKSTATIONS_ROOT / 'data-platform' / 'src' / 'pages' / page
        if page_file.exists():
            page_text = page_file.read_text()
            tc(f'HC-09: {page} 已删除硬编码 API base（{const_name[:20]}...）',
               const_name not in page_text,
               f'仍含 {const_name!r}')
        else:
            tc(f'HC-09: {page} 文件存在', False, str(page_file), warn=True)
else:
    tc('HC-09: data-platform.ts 文件存在', False, str(dp_api_file))

# =============================================================================
# H. 向量维度常量引用验证（HC-10）
# =============================================================================
section('H. 向量维度常量引用验证（HC-10）')

rebuild_file = BACKEND_ROOT / 'apps' / 'knowledge' / 'management' / 'commands' / 'rebuild_embeddings.py'
if rebuild_file.exists():
    rb_text = rebuild_file.read_text()
    tc('HC-10a: rebuild_embeddings.py 导入 EMBEDDING_DIMENSION',
       'EMBEDDING_DIMENSION' in rb_text,
       '未引用 EMBEDDING_DIMENSION 常量')
    tc('HC-10b: rebuild_embeddings.py 不含魔法数字 != 1024（在维度校验中）',
       '!= 1024' not in rb_text,
       '仍有 != 1024 魔法数字比较')
else:
    tc('HC-10: rebuild_embeddings.py 存在', False, str(rebuild_file), warn=True)

# =============================================================================
# 汇总
# =============================================================================
summary()
