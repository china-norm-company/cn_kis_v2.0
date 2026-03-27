"""
协议管理服务

封装协议 CRUD、文件上传、AI 解析触发等业务逻辑。

飞书集成：
- 协议创建/状态变更时同步到飞书多维表格看板（替代原飞书项目工作项）
- 通过 feishu_sync 模块的 SyncConfig 配置决定同步目标
"""
import html as html_module
import logging
import os
import platform
import re
import shutil
import subprocess
import tempfile
import uuid
from urllib.parse import quote
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from django.conf import settings
from django.utils import timezone

from apps.protocol.models import Protocol, ProtocolStatus, ProtocolParseLog

logger = logging.getLogger(__name__)

# 知情配置负责人：治理台全局角色（与 witness_staff_service 中双签可选角色区分）
CONSENT_CONFIG_ROLE_NAMES = ('qa',)


def consent_config_assignee_account_ids() -> set:
    """具备「知情配置人员」候选资格的治理台账号 ID（全局角色 qa）。"""
    from apps.identity.models import AccountRole, Role

    rids = Role.objects.filter(name__in=CONSENT_CONFIG_ROLE_NAMES, is_active=True).values_list('id', flat=True)
    return set(
        AccountRole.objects.filter(project_id__isnull=True, role_id__in=rids).values_list('account_id', flat=True).distinct()
    )


def assert_consent_config_account_allowed(account_id: int) -> None:
    if not account_id:
        raise ValueError('知情配置人员账号无效')
    if account_id not in consent_config_assignee_account_ids():
        raise ValueError('知情配置人员须为治理台中具备全局角色「QA质量管理」的账号')


def list_consent_config_assignee_accounts():
    """供执行台下拉：姓名、账号、邮箱（仅 qa 全局角色）。"""
    from apps.identity.models import Account

    ids = sorted(consent_config_assignee_account_ids())
    if not ids:
        return []
    rows = Account.objects.filter(id__in=ids, is_deleted=False).order_by('id')
    return [
        {
            'id': a.id,
            'display_name': ((a.display_name or '').strip() or a.username),
            'username': a.username,
            'email': (a.email or '').strip(),
        }
        for a in rows
    ]


# ============================================================================
# 协议 CRUD
# ============================================================================
def _apply_data_scope(qs, account=None):
    """应用数据权限过滤（若提供 account）；DEBUG 模式下跳过，与项目全链路权限一致"""
    if account is None:
        return qs
    from django.conf import settings
    if getattr(settings, 'DEBUG', False):
        return qs
    from apps.identity.filters import filter_queryset_by_scope
    return filter_queryset_by_scope(qs, account)


def list_protocols(
    status: str = None,
    title: str = None,
    keyword: str = None,
    date_start: str = None,
    date_end: str = None,
    page: int = 1,
    page_size: int = 20,
    account=None,
    without_icf: bool = False,
) -> dict:
    """分页查询协议列表。keyword 同时搜索 title 和 code。date_start/date_end 按 create_time 日期筛选。"""
    from django.db.models import Exists, OuterRef, Q
    from django.db.utils import ProgrammingError
    from django.utils.dateparse import parse_date
    from apps.subject.models import ICFVersion
    qs = Protocol.objects.filter(is_deleted=False)
    qs = _apply_data_scope(qs, account)
    if status:
        qs = qs.filter(status=status)
    if title:
        qs = qs.filter(title__icontains=title)
    if keyword and keyword.strip():
        kw = keyword.strip()
        qs = qs.filter(Q(title__icontains=kw) | Q(code__icontains=kw))
    if date_start:
        d = parse_date(date_start)
        if d:
            qs = qs.filter(create_time__date__gte=d)
    if date_end:
        d = parse_date(date_end)
        if d:
            qs = qs.filter(create_time__date__lte=d)
    if without_icf:
        icf_exists = ICFVersion.objects.filter(protocol_id=OuterRef('pk'))
        qs = qs.annotate(_has_icf=Exists(icf_exists)).filter(_has_icf=False)

    try:
        qs = qs.order_by('consent_display_order', 'id')
    except ProgrammingError:
        qs = qs.order_by('id')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_protocol(protocol_id: int) -> Optional[Protocol]:
    """获取协议详情"""
    return Protocol.objects.filter(id=protocol_id, is_deleted=False).first()


def normalize_protocol_code(code: Optional[str]) -> str:
    """项目编号：前后去空格；空字符串表示未填写。"""
    return (code or '').strip()


def is_protocol_code_taken(code: str, exclude_protocol_id: Optional[int] = None) -> bool:
    """非空编号是否在未删除的协议中已存在（可排除某条协议，用于编辑）。"""
    c = normalize_protocol_code(code)
    if not c:
        return False
    qs = Protocol.objects.filter(is_deleted=False, code=c)
    if exclude_protocol_id is not None:
        qs = qs.exclude(id=exclude_protocol_id)
    return qs.exists()


def suggest_next_available_protocol_code(
    start_code: str,
    exclude_protocol_id: Optional[int] = None,
    max_attempts: int = 500,
) -> Optional[str]:
    """
    在编号末尾连续数字段上递增，查找下一个未被占用的项目编号。
    例如 C26001001 已占用时依次尝试 C26001002、C26001003…
    若无末尾数字或尝试超限则返回 None。
    """
    c = normalize_protocol_code(start_code)
    if not c:
        return None
    m = re.search(r'(\d+)$', c)
    if not m:
        return None
    prefix = c[: m.start()]
    digit_str = m.group(1)
    width = len(digit_str)
    n = int(digit_str)
    for _ in range(max_attempts):
        n += 1
        if len(str(n)) > width:
            candidate = f'{prefix}{n}'
        else:
            candidate = f'{prefix}{n:0{width}d}'
        if not is_protocol_code_taken(candidate, exclude_protocol_id=exclude_protocol_id):
            return candidate
    return None


def ensure_protocol_code_available(code: str, exclude_protocol_id: Optional[int] = None) -> None:
    """非空项目编号必须全局唯一，否则抛出 ValueError（中文提示）。"""
    c = normalize_protocol_code(code)
    if not c:
        return
    if is_protocol_code_taken(c, exclude_protocol_id=exclude_protocol_id):
        sug = suggest_next_available_protocol_code(
            c, exclude_protocol_id=exclude_protocol_id
        )
        if sug:
            raise ValueError(
                f'项目编号「{c}」已存在，请改用未占用编号，例如：{sug}'
            )
        raise ValueError('项目编号已存在，请重新输入未占用的编号')


def _sync_protocol_to_bitable(protocol: Protocol) -> None:
    """
    同步协议状态到飞书多维表格看板

    替代原飞书项目工作项同步。通过 feishu_sync 的 SyncConfig 查找
    t_protocol 表对应的多维表格配置，将单条协议记录同步过去。
    如未配置则静默跳过。
    """
    try:
        from apps.feishu_sync.models import SyncConfig
        config = SyncConfig.objects.filter(
            table_name='t_protocol', enabled=True
        ).first()
        if not config:
            return

        from libs.feishu_client import feishu_client

        fields = {}
        for db_field, feishu_field_id in config.field_mapping.items():
            value = getattr(protocol, db_field, None)
            if value is not None:
                fields[feishu_field_id] = str(value)

        if not fields:
            return

        feishu_client.upsert_bitable_record(
            app_token=config.bitable_app_token,
            table_id=config.bitable_table_id,
            fields=fields,
        )
        logger.info(f"协议#{protocol.id} 已同步到飞书多维表格")
    except Exception as e:
        logger.error(f"协议#{protocol.id} 多维表格同步失败: {e}")


def _generate_cosmetic_project_code() -> str:
    """生成化妆品临床功效检测项目编号，格式 C26001001（C26+001递增三位数+001后缀）"""
    from django.db.models import Max
    from django.utils import timezone
    year_suffix = timezone.now().strftime('%y')
    prefix = f'C{year_suffix}'
    qs = Protocol.objects.filter(code__startswith=prefix, is_deleted=False)
    max_code = qs.aggregate(m=Max('code'))['m']
    if max_code:
        try:
            # 格式 C26001001：取中间3位序号
            mid = max_code[len(prefix):len(prefix) + 3]
            seq = int(mid) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f'{prefix}{seq:03d}001'


def create_protocol(
    title: str,
    code: str = '',
    efficacy_type: str = '',
    sample_size: int = None,
    file_path: str = '',
    created_by_id: int = None,
    screening_schedule: Optional[List[Dict[str, Any]]] = None,
    consent_config_account_id: Optional[int] = None,
    consent_signing_staff_name: Optional[str] = None,
) -> Protocol:
    """创建协议并同步到飞书多维表格。code 为空时自动生成化妆品项目编号（C26001001 格式）"""
    from django.db.models import Min
    code = normalize_protocol_code(code)
    if not code:
        for _ in range(50):
            candidate = _generate_cosmetic_project_code()
            if not is_protocol_code_taken(candidate):
                code = candidate
                break
        else:
            raise ValueError('无法生成唯一项目编号，请手动填写项目编号')
    else:
        ensure_protocol_code_available(code)
    if consent_config_account_id is not None and int(consent_config_account_id) <= 0:
        consent_config_account_id = None
    if consent_config_account_id is not None:
        assert_consent_config_account_allowed(int(consent_config_account_id))
    # 知情管理列表按 consent_display_order 升序：新建协议取当前最小序 -1，保证出现在第一行
    min_order = Protocol.objects.filter(is_deleted=False).aggregate(
        m=Min('consent_display_order')
    )['m']
    next_display_order = (min_order - 1) if min_order is not None else 0
    protocol = Protocol.objects.create(
        title=title,
        code=code,
        efficacy_type=efficacy_type,
        sample_size=sample_size,
        file_path=file_path or '',
        status=ProtocolStatus.UPLOADED if file_path else ProtocolStatus.DRAFT,
        consent_display_order=next_display_order,
        created_by_id=created_by_id,
        consent_config_account_id=consent_config_account_id,
    )
    if screening_schedule:
        parsed = dict(protocol.parsed_data) if isinstance(protocol.parsed_data, dict) else {}
        cs = parsed.get('consent_settings') if isinstance(parsed.get('consent_settings'), dict) else {}
        cs = {
            **cs,
            'screening_schedule': screening_schedule,
            'planned_screening_dates': [x['date'] for x in screening_schedule],
        }
        parsed['consent_settings'] = cs
        protocol.parsed_data = parsed
        protocol.save(update_fields=['parsed_data'])
    _sync_protocol_to_bitable(protocol)

    # S3-5：自动创建项目群
    _create_project_chat(protocol)
    try:
        from apps.protocol.services.dual_sign_project_sync import seed_dual_sign_for_new_protocol

        seed_dual_sign_for_new_protocol(protocol)
    except Exception:
        logger.exception('新建协议后复用双签配置失败 protocol_id=%s', protocol.id)
    if consent_signing_staff_name and str(consent_signing_staff_name).strip():
        from apps.protocol.api import _get_consent_settings, _save_consent_settings
        from apps.protocol.consent_signing_names import normalize_consent_signing_staff_storage, split_consent_signing_staff_names
        from apps.protocol.services.witness_staff_service import witness_staff_allowed_name_set

        sn = normalize_consent_signing_staff_storage(str(consent_signing_staff_name))
        cur = _get_consent_settings(protocol)
        allowed = witness_staff_allowed_name_set()
        if not allowed:
            raise ValueError('请先在治理台维护双签工作人员并同步至「双签工作人员名单」后，再指定知情签署工作人员')
        for name in split_consent_signing_staff_names(sn):
            if name not in allowed:
                raise ValueError('知情签署工作人员须从双签工作人员名单中选择')
        cur['consent_signing_staff_name'] = sn
        _save_consent_settings(protocol, cur)
    return protocol


def save_protocol_upload_file(uploaded_file) -> str:
    """保存上传的协议文件，返回相对 MEDIA_ROOT 的路径"""
    base_dir = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    dest_dir = os.path.join(base_dir, 'protocols')
    os.makedirs(dest_dir, exist_ok=True)
    raw_name = getattr(uploaded_file, 'name', None) or 'upload.pdf'
    stem, ext = os.path.splitext(raw_name)
    if not ext:
        ext = '.pdf'
    safe_stem = re.sub(r'[^0-9A-Za-z_\-\u4e00-\u9fa5]+', '_', stem).strip('_') or 'upload'
    unique_name = f'{safe_stem}_{uuid.uuid4().hex[:8]}{ext.lower()}'
    path = os.path.join(dest_dir, unique_name)
    with open(path, 'wb') as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)
    return os.path.join('protocols', unique_name)


def save_icf_upload_file(uploaded_file, protocol_id: int = None) -> str:
    """保存上传的 ICF 文件，返回相对 MEDIA_ROOT 的路径。用于签署节点创建。"""
    base_dir = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    dest_dir = os.path.join(base_dir, 'icf_versions')
    os.makedirs(dest_dir, exist_ok=True)
    raw_name = getattr(uploaded_file, 'name', None) or 'upload.pdf'
    stem, ext = os.path.splitext(raw_name)
    if not ext:
        ext = '.pdf'
    safe_stem = re.sub(r'[^0-9A-Za-z_\-\u4e00-\u9fa5]+', '_', stem).strip('_') or 'upload'
    prefix = f'p{protocol_id}_' if protocol_id else ''
    unique_name = f'{prefix}{safe_stem}_{uuid.uuid4().hex[:8]}{ext.lower()}'
    path = os.path.join(dest_dir, unique_name)
    with open(path, 'wb') as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)
    return os.path.join('icf_versions', unique_name)


def icf_preview_pdf_relative_path(rel_file_path: str) -> str:
    """
    与上传的 Word 同目录，生成用于内嵌预览的 PDF 相对路径：
    icf_versions/foo.docx -> icf_versions/foo_preview.pdf
    """
    if not rel_file_path or '..' in rel_file_path:
        return ''
    rel = rel_file_path.replace('\\', '/').strip()
    d, f = os.path.split(rel)
    stem, _ext = os.path.splitext(f)
    name = f'{stem}_preview.pdf'
    return f'{d}/{name}'.replace('//', '/') if d else name


def icf_preview_html_relative_path(rel_file_path: str) -> str:
    """icf_versions/foo.docx -> icf_versions/foo_preview.html（LibreOffice 不可用时用 python-docx 生成）"""
    if not rel_file_path or '..' in rel_file_path:
        return ''
    rel = rel_file_path.replace('\\', '/').strip()
    d, f = os.path.split(rel)
    stem, _ext = os.path.splitext(f)
    name = f'{stem}_preview.html'
    return f'{d}/{name}'.replace('//', '/') if d else name


def icf_autoconv_docx_relative_path(rel_doc: str) -> str:
    """旧版 .doc 经 LibreOffice 转存为同目录下的 * __icf_autoconv.docx，供预览与 python-docx 管道复用。"""
    if not rel_doc or '..' in rel_doc:
        return ''
    low = rel_doc.lower()
    if not low.endswith('.doc'):
        return ''
    rel = rel_doc.replace('\\', '/').strip()
    d, f = os.path.split(rel)
    stem, _ext = os.path.splitext(f)
    name = f'{stem}__icf_autoconv.docx'
    return f'{d}/{name}'.replace('//', '/') if d else name


def convert_doc_to_autoconv_docx(media_rel_doc: str) -> bool:
    """
    将 .doc 转为同目录 __icf_autoconv.docx（优先 macOS textutil，其次 LibreOffice）。
    若已存在且不比源 .doc 旧，则跳过转换。
    """
    if not media_rel_doc:
        return False
    low = media_rel_doc.lower()
    if not low.endswith('.doc'):
        return False
    autoconv_rel = icf_autoconv_docx_relative_path(media_rel_doc)
    if not autoconv_rel:
        return False
    base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    media_root = os.path.abspath(os.path.normpath(base))
    abs_doc = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel_doc)))
    abs_autoconv = os.path.abspath(os.path.normpath(os.path.join(media_root, autoconv_rel)))
    if not abs_doc.startswith(media_root + os.sep) or not os.path.isfile(abs_doc):
        return False
    if not abs_autoconv.startswith(media_root + os.sep):
        return False
    if os.path.isfile(abs_autoconv):
        try:
            if os.path.getmtime(abs_autoconv) >= os.path.getmtime(abs_doc):
                return True
        except OSError:
            pass

    return convert_binary_doc_to_docx(abs_doc, abs_autoconv)


def find_libreoffice_executable() -> Optional[str]:
    """本机 LibreOffice / soffice 可执行文件路径（用于 Word→PDF / .doc→.docx）。"""
    env_path = (getattr(settings, 'LIBREOFFICE_PATH', None) or os.environ.get('LIBREOFFICE_PATH', '') or '').strip()
    if env_path and os.path.isfile(env_path):
        return env_path
    for cmd in ('soffice', 'libreoffice'):
        p = shutil.which(cmd)
        if p:
            return p
    mac = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    if os.path.isfile(mac):
        return mac
    return None


def _try_macos_textutil_doc_to_docx(abs_doc: str, abs_docx_out: str) -> bool:
    """macOS 自带 textutil，可将多数 .doc 转为 .docx，无需单独安装 LibreOffice。"""
    if platform.system() != 'Darwin':
        return False
    tu = shutil.which('textutil')
    if not tu:
        return False
    try:
        os.makedirs(os.path.dirname(abs_docx_out) or '.', exist_ok=True)
        if os.path.isfile(abs_docx_out):
            try:
                os.remove(abs_docx_out)
            except OSError:
                pass
        r = subprocess.run(
            [tu, '-convert', 'docx', abs_doc, '-output', abs_docx_out],
            capture_output=True,
            timeout=120,
            text=True,
        )
        if r.returncode != 0:
            logger.info(
                'textutil .doc→.docx 未成功 rc=%s（将尝试 LibreOffice）',
                r.returncode,
            )
            return False
        ok = os.path.isfile(abs_docx_out) and os.path.getsize(abs_docx_out) > 0
        if ok:
            logger.info('textutil 已将 .doc 转为 .docx: %s', abs_docx_out)
        return ok
    except Exception as e:
        logger.info('textutil 异常（将尝试 LibreOffice）: %s', e)
        return False


def _convert_doc_to_docx_via_libreoffice(abs_doc: str, abs_docx_out: str) -> bool:
    soffice = find_libreoffice_executable()
    if not soffice:
        logger.warning('未找到 LibreOffice（soffice），无法将 .doc 转为 .docx')
        return False
    try:
        with tempfile.TemporaryDirectory() as tmp:
            lo_profile = tempfile.mkdtemp(prefix='lo_icf_docx_')
            profile_url = Path(lo_profile).resolve().as_uri()
            cmd = [
                soffice,
                f'-env:UserInstallation={profile_url}',
                '--headless',
                '--convert-to',
                'docx',
                '--outdir',
                tmp,
                abs_doc,
            ]
            try:
                r = subprocess.run(cmd, capture_output=True, timeout=120, text=True)
            finally:
                shutil.rmtree(lo_profile, ignore_errors=True)
            if r.returncode != 0:
                logger.warning('LibreOffice .doc→.docx 失败 rc=%s err=%s out=%s', r.returncode, r.stderr, r.stdout)
                return False
            expected_name = os.path.splitext(os.path.basename(abs_doc))[0] + '.docx'
            expected_docx = os.path.join(tmp, expected_name)
            if not os.path.isfile(expected_docx):
                logger.warning('LibreOffice 未生成预期 docx: %s', expected_docx)
                return False
            os.makedirs(os.path.dirname(abs_docx_out) or '.', exist_ok=True)
            shutil.move(expected_docx, abs_docx_out)
            return True
    except Exception as e:
        logger.warning('ICF LibreOffice .doc→.docx 异常: %s', e)
        return False


def convert_binary_doc_to_docx(abs_doc: str, abs_docx_out: str) -> bool:
    """
    将磁盘上的单个 .doc 转为指定路径的 .docx。
    顺序：macOS textutil → LibreOffice。
    （通用路径；知情上传另见 convert_binary_doc_to_docx_icf_prefer_lo。）
    """
    if not abs_doc or not os.path.isfile(abs_doc):
        return False
    if not abs_doc.lower().endswith('.doc'):
        return False
    if _try_macos_textutil_doc_to_docx(abs_doc, abs_docx_out):
        return True
    return _convert_doc_to_docx_via_libreoffice(abs_doc, abs_docx_out)


def convert_binary_doc_to_docx_icf_prefer_lo(abs_doc: str, abs_docx_out: str) -> bool:
    """
    知情签署节点上传：.doc→同主文件名 .docx。
    优先 LibreOffice（表格与 Word 另存 docx 的观感更接近），失败再 macOS textutil，最后再尝试 LO。
    """
    if not abs_doc or not os.path.isfile(abs_doc):
        return False
    if not abs_doc.lower().endswith('.doc'):
        return False
    if find_libreoffice_executable():
        if _convert_doc_to_docx_via_libreoffice(abs_doc, abs_docx_out):
            logger.info('ICF 上传：LibreOffice 已将 .doc 转为 .docx: %s', abs_docx_out)
            return True
    if _try_macos_textutil_doc_to_docx(abs_doc, abs_docx_out):
        return True
    return _convert_doc_to_docx_via_libreoffice(abs_doc, abs_docx_out)


def icf_docx_inline_relative_path(rel_doc: str) -> str:
    """icf_versions/p1_foo_ABC.doc -> icf_versions/p1_foo_ABC.docx（同 stem，仅改扩展名）。"""
    if not rel_doc or '..' in rel_doc:
        return ''
    low = rel_doc.lower()
    if not low.endswith('.doc'):
        return ''
    rel = rel_doc.replace('\\', '/').strip()
    d, f = os.path.split(rel)
    stem, _ext = os.path.splitext(f)
    name = f'{stem}.docx'
    return f'{d}/{name}'.replace('//', '/') if d else name


def try_convert_icf_doc_file_to_docx_inplace(media_rel_doc: str) -> Optional[str]:
    """
    上传后尝试将 .doc 转为同主文件名的 .docx，删除原 .doc，返回新相对路径。
    失败则保留 .doc，返回 None（预览仍可走 __icf_autoconv 管道）。
    """
    if not media_rel_doc or '..' in media_rel_doc:
        return None
    if not media_rel_doc.lower().endswith('.doc'):
        return None
    new_rel = icf_docx_inline_relative_path(media_rel_doc)
    if not new_rel:
        return None
    base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    media_root = os.path.abspath(os.path.normpath(base))
    abs_doc = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel_doc)))
    abs_new = os.path.abspath(os.path.normpath(os.path.join(media_root, new_rel)))
    if not abs_doc.startswith(media_root + os.sep) or not os.path.isfile(abs_doc):
        return None
    if not abs_new.startswith(media_root + os.sep):
        return None
    if os.path.isfile(abs_new):
        try:
            os.remove(abs_new)
        except OSError:
            pass
    if not convert_binary_doc_to_docx_icf_prefer_lo(abs_doc, abs_new):
        return None
    try:
        os.remove(abs_doc)
    except OSError as e:
        logger.warning('已生成 .docx 但删除原 .doc 失败: %s', e)
    return new_rel.replace('\\', '/')


def convert_icf_office_to_preview_pdf(media_rel_office: str) -> bool:
    """
    将 .doc/.docx 转为 MEDIA 下对应的 _preview.pdf。
    依赖本机安装 LibreOffice；失败时返回 False 并记日志，不抛异常。
    """
    if not media_rel_office:
        return False
    low = media_rel_office.lower()
    if low.endswith('.pdf'):
        return True
    ext = os.path.splitext(media_rel_office)[1].lower().lstrip('.')
    if ext not in ('doc', 'docx'):
        return False

    base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    media_root = os.path.abspath(os.path.normpath(base))
    abs_office = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel_office)))
    if not abs_office.startswith(media_root + os.sep) or not os.path.isfile(abs_office):
        return False

    soffice = find_libreoffice_executable()
    if not soffice:
        logger.warning('未找到 LibreOffice（soffice），无法将 Word 转为 PDF 预览')
        return False

    preview_rel = icf_preview_pdf_relative_path(media_rel_office)
    if not preview_rel:
        return False
    abs_preview = os.path.abspath(os.path.normpath(os.path.join(media_root, preview_rel)))
    if not abs_preview.startswith(media_root + os.sep):
        return False

    try:
        with tempfile.TemporaryDirectory() as tmp:
            lo_profile = tempfile.mkdtemp(prefix='lo_icf_')
            profile_url = Path(lo_profile).resolve().as_uri()
            cmd = [
                soffice,
                f'-env:UserInstallation={profile_url}',
                '--headless',
                '--convert-to',
                'pdf',
                '--outdir',
                tmp,
                abs_office,
            ]
            try:
                r = subprocess.run(cmd, capture_output=True, timeout=120, text=True)
            finally:
                shutil.rmtree(lo_profile, ignore_errors=True)
            if r.returncode != 0:
                logger.warning('LibreOffice 转换失败 rc=%s err=%s out=%s', r.returncode, r.stderr, r.stdout)
                return False
            expected_name = os.path.splitext(os.path.basename(abs_office))[0] + '.pdf'
            expected_pdf = os.path.join(tmp, expected_name)
            if not os.path.isfile(expected_pdf):
                logger.warning('LibreOffice 未生成预期 PDF: %s', expected_pdf)
                return False
            os.makedirs(os.path.dirname(abs_preview) or '.', exist_ok=True)
            shutil.move(expected_pdf, abs_preview)
            return True
    except Exception as e:
        logger.warning('ICF Word→PDF 转换异常: %s', e)
        return False


def _iter_docx_body_block_elements(container) -> Iterator[Any]:
    """
    按文档顺序产出正文内块级 w:p / w:tbl，并递归 w:sdt/w:sdtContent。

    仅遍历 body 的直接子级时，会漏掉被包在「结构化文档/内容控件」里的表格；
    LibreOffice、macOS textutil 将 .doc→.docx 时常用此类包装，导致预览退化成纯段落。
    """
    from docx.oxml.ns import qn

    if container is None:
        return
    TAG_P = qn('w:p')
    TAG_TBL = qn('w:tbl')
    TAG_SDT = qn('w:sdt')
    for child in list(container):
        t = child.tag
        if t == TAG_P:
            yield child
        elif t == TAG_TBL:
            yield child
        elif t == TAG_SDT:
            sdt_content = child.find(qn('w:sdtContent'))
            if sdt_content is not None:
                yield from _iter_docx_body_block_elements(sdt_content)


def _docx_to_preview_html_string(abs_docx: str) -> Optional[str]:
    """用 python-docx 将 docx 转为可内嵌的 HTML（段落 + 表格顺序与文档一致）。"""
    try:
        from docx import Document
        from docx.oxml.ns import qn
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except Exception as e:
        logger.warning('python-docx 不可用: %s', e)
        return None

    try:
        doc = Document(abs_docx)
    except Exception as e:
        logger.warning('无法打开 docx: %s', e)
        return None

    parts: List[str] = []

    def append_from_blocks() -> None:
        for el in _iter_docx_body_block_elements(doc.element.body):
            if el.tag == qn('w:p'):
                try:
                    para = Paragraph(el, doc)
                    text = (para.text or '').strip()
                    if text:
                        parts.append(f'<p>{html_module.escape(text)}</p>')
                except Exception as e:
                    logger.warning('docx 段落转 HTML 跳过: %s', e)
            elif el.tag == qn('w:tbl'):
                try:
                    tbl = Table(el, doc)
                    parts.append('<table>')
                    for row in tbl.rows:
                        parts.append('<tr>')
                        for cell in row.cells:
                            ct = (cell.text or '').replace('\n', ' ').strip()
                            parts.append(f'<td>{html_module.escape(ct)}</td>')
                        parts.append('</tr>')
                    parts.append('</table>')
                except Exception as e:
                    logger.warning('docx 单表转 HTML 跳过: %s', e)

    try:
        append_from_blocks()
    except Exception as e:
        logger.warning('docx 块级遍历异常，回退为仅段落: %s', e)
        parts.clear()

    if not parts:
        try:
            for p in doc.paragraphs:
                t = (p.text or '').strip()
                if t:
                    parts.append(f'<p>{html_module.escape(t)}</p>')
        except Exception as e2:
            logger.warning('docx 段落回退也失败: %s', e2)
            return None

    inner = '\n'.join(parts) if parts else '<p class="muted">（文档无正文或无法解析）</p>'
    css = (
        ':root{--fg:#0f172a;--bd:#e2e8f0;}'
        'body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
        'font-size:15px;line-height:1.65;color:var(--fg);overflow-x:auto;-webkit-overflow-scrolling:touch;}'
        'article{padding:16px 18px;max-width:100%;box-sizing:border-box;}'
        'p{margin:0.45em 0;}'
        'table{border-collapse:collapse;border:1px solid var(--bd);margin:10px 0;font-size:14px;'
        'table-layout:auto;width:max-content;max-width:100%;}'
        'td,th{border:1px solid var(--bd);padding:6px 8px;vertical-align:top;min-width:1.5em;}'
        '.muted{color:#64748b;font-size:14px;}'
        '.banner{background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:8px 10px;'
        'border-radius:6px;font-size:12px;margin-bottom:12px;line-height:1.45;}'
    )
    banner = (
        '<div class="banner">此为自动生成的网页预览：由系统从 Word 抽取正文与表格（'
        '与印刷 PDF 可能略有差异）。正式文本以原文件为准。</div>'
    )
    return (
        '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<style>{css}</style></head><body>{banner}<article>{inner}</article></body></html>'
    )


def _wrap_libreoffice_exported_icf_html(lo_html: str) -> str:
    """在 LibreOffice 导出的整页 HTML 内插入提示条（尽量插在 body 后）。"""
    banner = (
        '<div class="lo-icf-banner" style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;'
        'padding:8px 10px;border-radius:6px;font-size:12px;margin:0 0 12px 0;line-height:1.45;">'
        '此预览由 LibreOffice 自 Word 导出为 HTML（表格版式通常优于纯文本抽取）。正式文本以原文件为准。</div>'
    )
    m = re.search(r'(<body[^>]*>)', lo_html, re.I)
    if m:
        return lo_html[: m.end()] + banner + lo_html[m.end() :]
    return (
        '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'
        + banner
        + lo_html
        + '</body></html>'
    )


def _icf_preview_html_needs_regen(media_root: str, media_rel_docx: str, abs_html: str) -> bool:
    """源 .docx 比缓存的 *_preview.html 新（或缓存不存在）时需要重新生成。"""
    if not abs_html.startswith(media_root + os.sep) or not os.path.isfile(abs_html):
        return True
    abs_docx = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel_docx)))
    if not abs_docx.startswith(media_root + os.sep) or not os.path.isfile(abs_docx):
        return True
    try:
        return os.path.getmtime(abs_html) < os.path.getmtime(abs_docx)
    except OSError:
        return True


def _icf_cached_preview_should_upgrade_to_lo_html(abs_html: str) -> bool:
    """
    已存在的 *_preview.html 若为旧版「python-docx 抽取」且本机有 LibreOffice，
    则升级为 LO 导出（表格版式更接近 Word，见产品验收样式）。
    """
    if not find_libreoffice_executable():
        return False
    try:
        with open(abs_html, 'r', encoding='utf-8', errors='replace') as f:
            head = f.read(32000)
    except OSError:
        return False
    if 'LibreOffice 自 Word 导出为 HTML' in head or 'lo-icf-banner' in head:
        return False
    if '由系统从 Word 抽取正文与表格' in head:
        return True
    return False


def _convert_docx_to_preview_html_via_libreoffice(abs_docx: str, abs_html_out: str) -> bool:
    """
    python-docx 无法可靠解析的 docx（如部分 LO/textutil 转换结果）时，用 LibreOffice 导出 HTML。
    与 PDF 转换共用 soffice，不增加新依赖。
    """
    soffice = find_libreoffice_executable()
    if not soffice:
        logger.warning('未找到 LibreOffice，无法用 LO 导出 HTML 预览（请安装或设置 LIBREOFFICE_PATH）')
        return False
    try:
        with tempfile.TemporaryDirectory() as tmp:
            lo_profile = tempfile.mkdtemp(prefix='lo_icf_html_')
            profile_url = Path(lo_profile).resolve().as_uri()
            cmd = [
                soffice,
                f'-env:UserInstallation={profile_url}',
                '--headless',
                '--convert-to',
                'html',
                '--outdir',
                tmp,
                abs_docx,
            ]
            try:
                r = subprocess.run(cmd, capture_output=True, timeout=120, text=True)
            finally:
                shutil.rmtree(lo_profile, ignore_errors=True)
            if r.returncode != 0:
                logger.warning(
                    'LibreOffice docx→html 失败 rc=%s err=%s out=%s',
                    r.returncode,
                    r.stderr,
                    r.stdout,
                )
                return False
            expected_name = os.path.splitext(os.path.basename(abs_docx))[0] + '.html'
            expected_html = os.path.join(tmp, expected_name)
            if not os.path.isfile(expected_html):
                logger.warning('LibreOffice 未生成预期 html: %s', expected_html)
                return False
            with open(expected_html, 'r', encoding='utf-8', errors='replace') as f:
                lo_raw = f.read()
            wrapped = _wrap_libreoffice_exported_icf_html(lo_raw)
            os.makedirs(os.path.dirname(abs_html_out) or '.', exist_ok=True)
            with open(abs_html_out, 'w', encoding='utf-8') as f:
                f.write(wrapped)
            logger.info('LibreOffice 已生成 ICF HTML 预览: %s', abs_html_out)
            return True
    except Exception as e:
        logger.warning('LibreOffice docx→html 异常: %s', e)
        return False


def convert_docx_to_preview_html(media_rel_docx: str) -> bool:
    """
    将 .docx 转为同目录 *_preview.html。
    优先 LibreOffice 导出 HTML（表格/版式更接近 Word）；未安装 LO 或 LO 失败时回退 python-docx 抽取。
    """
    low = (media_rel_docx or '').lower()
    if not low.endswith('.docx'):
        return False
    base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    media_root = os.path.abspath(os.path.normpath(base))
    abs_docx = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel_docx)))
    if not abs_docx.startswith(media_root + os.sep) or not os.path.isfile(abs_docx):
        return False
    html_rel = icf_preview_html_relative_path(media_rel_docx)
    if not html_rel:
        return False
    abs_html = os.path.abspath(os.path.normpath(os.path.join(media_root, html_rel)))
    if not abs_html.startswith(media_root + os.sep):
        return False
    if find_libreoffice_executable():
        if _convert_docx_to_preview_html_via_libreoffice(abs_docx, abs_html):
            return True
        logger.warning('LibreOffice 导出 HTML 失败，回退 python-docx: %s', abs_docx)
    html_str = _docx_to_preview_html_string(abs_docx)
    if not html_str:
        logger.warning('python-docx 未生成预览 HTML: %s', abs_docx)
        return False
    try:
        os.makedirs(os.path.dirname(abs_html) or '.', exist_ok=True)
        with open(abs_html, 'w', encoding='utf-8') as f:
            f.write(html_str)
        return True
    except Exception as e:
        logger.warning('写入预览 HTML 失败: %s', e)
        return False


def ensure_icf_preview(media_rel: str) -> bool:
    """
    自动准备内嵌预览。
    .docx：优先生成 HTML（安装 LibreOffice 时用 LO 导出，版式更接近 Word；否则 python-docx），再尝试 LO→PDF。
    生成 HTML 若走 LO，单次可能达约 120s（上传接口已改为后台线程触发本逻辑时可接受）。
    """
    if not (media_rel or '').strip():
        return False
    low = media_rel.lower()
    if low.endswith('.pdf'):
        base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
        media_root = os.path.abspath(os.path.normpath(base))
        p = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel)))
        return p.startswith(media_root + os.sep) and os.path.isfile(p)
    ext = os.path.splitext(media_rel)[1].lower()
    if ext not in ('.doc', '.docx'):
        return False

    base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    media_root = os.path.abspath(os.path.normpath(base))
    pdf_rel = icf_preview_pdf_relative_path(media_rel)

    if ext == '.docx':
        abs_docx = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel)))
        if not abs_docx.startswith(media_root + os.sep) or not os.path.isfile(abs_docx):
            return False
        html_rel = icf_preview_html_relative_path(media_rel)
        if html_rel:
            abs_html = os.path.abspath(os.path.normpath(os.path.join(media_root, html_rel)))
            if abs_html.startswith(media_root + os.sep) and os.path.isfile(abs_html):
                if not _icf_preview_html_needs_regen(media_root, media_rel, abs_html):
                    if _icf_cached_preview_should_upgrade_to_lo_html(abs_html):
                        try:
                            os.remove(abs_html)
                        except OSError:
                            pass
                    else:
                        return True
        if convert_docx_to_preview_html(media_rel):
            return True
        if pdf_rel:
            abs_pdf = os.path.abspath(os.path.normpath(os.path.join(media_root, pdf_rel)))
            if abs_pdf.startswith(media_root + os.sep) and os.path.isfile(abs_pdf):
                return True
        if convert_icf_office_to_preview_pdf(media_rel):
            return True
        return False

    # 旧版 .doc：先 LO→__icf_autoconv.docx，再走与 .docx 相同的 HTML 预览（用户无需手转格式）
    autoconv_rel = icf_autoconv_docx_relative_path(media_rel)
    if autoconv_rel and convert_doc_to_autoconv_docx(media_rel):
        html_rel_ac = icf_preview_html_relative_path(autoconv_rel)
        if html_rel_ac:
            abs_html_ac = os.path.abspath(os.path.normpath(os.path.join(media_root, html_rel_ac)))
            if abs_html_ac.startswith(media_root + os.sep) and os.path.isfile(abs_html_ac):
                if not _icf_preview_html_needs_regen(media_root, autoconv_rel, abs_html_ac):
                    if _icf_cached_preview_should_upgrade_to_lo_html(abs_html_ac):
                        try:
                            os.remove(abs_html_ac)
                        except OSError:
                            pass
                    else:
                        return True
        if convert_docx_to_preview_html(autoconv_rel):
            return True

    if pdf_rel:
        abs_pdf = os.path.abspath(os.path.normpath(os.path.join(media_root, pdf_rel)))
        if abs_pdf.startswith(media_root + os.sep) and os.path.isfile(abs_pdf):
            return True
    return convert_icf_office_to_preview_pdf(media_rel)


def ensure_icf_preview_pdf(media_rel: str) -> bool:
    """兼容旧调用名，等同于 ensure_icf_preview。"""
    return ensure_icf_preview(media_rel)


def ensure_icf_preview_for_http_request(media_rel: str) -> bool:
    """
    供 GET /preview 使用：.docx 复用或生成 *_preview.html（有 LibreOffice 时优先生成 LO 导出 HTML），
    其次已缓存的 PDF。首次生成 LO HTML 可能达约 120s，前端已对 preview 使用较长超时。
    旧版 .doc 仍走 ensure_icf_preview（含 LO 转 docx）。
    """
    if not (media_rel or '').strip():
        return False
    low = media_rel.lower()
    if low.endswith('.pdf'):
        base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
        media_root = os.path.abspath(os.path.normpath(base))
        p = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel)))
        return p.startswith(media_root + os.sep) and os.path.isfile(p)
    ext = os.path.splitext(media_rel)[1].lower()
    if ext == '.docx':
        base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
        media_root = os.path.abspath(os.path.normpath(base))
        abs_docx = os.path.abspath(os.path.normpath(os.path.join(media_root, media_rel)))
        if not abs_docx.startswith(media_root + os.sep) or not os.path.isfile(abs_docx):
            return False
        html_rel = icf_preview_html_relative_path(media_rel)
        if html_rel:
            abs_html = os.path.abspath(os.path.normpath(os.path.join(media_root, html_rel)))
            if abs_html.startswith(media_root + os.sep) and os.path.isfile(abs_html):
                if not _icf_preview_html_needs_regen(media_root, media_rel, abs_html):
                    if _icf_cached_preview_should_upgrade_to_lo_html(abs_html):
                        try:
                            os.remove(abs_html)
                        except OSError:
                            pass
                    else:
                        return True
        if convert_docx_to_preview_html(media_rel):
            return True
        pdf_rel = icf_preview_pdf_relative_path(media_rel)
        if pdf_rel:
            abs_pdf = os.path.abspath(os.path.normpath(os.path.join(media_root, pdf_rel)))
            if abs_pdf.startswith(media_root + os.sep) and os.path.isfile(abs_pdf):
                return True
        return False
    return ensure_icf_preview(media_rel)


def _unwrap_html_body_fragment(html: str) -> str:
    """LibreOffice 导出常为完整 HTML；内嵌展示时仅取 body 内片段。"""
    s = (html or '').strip()
    if not s:
        return ''
    m = re.search(r'<body[^>]*>([\s\S]*)</body>', s, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


def resolve_icf_body_html_for_witness_dev(icf) -> str:
    """
    联调页正文：优先 DB 富文本；否则从上传文件生成预览 HTML（与执行台 ICF 内嵌预览同源）。
    """
    raw = (getattr(icf, 'content', None) or '').strip()
    if raw:
        return raw
    rel = (getattr(icf, 'file_path', None) or '').strip()
    if not rel or '..' in rel:
        return ''
    base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    media_root = os.path.abspath(os.path.normpath(base))
    abs_doc = os.path.abspath(os.path.normpath(os.path.join(media_root, rel)))
    if not abs_doc.startswith(media_root + os.sep) or not os.path.isfile(abs_doc):
        return ''
    low = rel.lower()
    if low.endswith('.pdf'):
        return (
            '<p class="text-slate-500">（该节点正文为 PDF，联调页无法内嵌展示；请在执行台知情配置中预览原文件。）</p>'
        )
    if not low.endswith(('.doc', '.docx')):
        return ''
    html_rel = ''
    if low.endswith('.docx'):
        ensure_icf_preview_for_http_request(rel)
        html_rel = icf_preview_html_relative_path(rel)
    else:
        ensure_icf_preview(rel)
        autoconv = icf_autoconv_docx_relative_path(rel)
        html_rel = icf_preview_html_relative_path(autoconv) if autoconv else ''
    if not html_rel:
        return ''
    abs_html = os.path.abspath(os.path.normpath(os.path.join(media_root, html_rel)))
    if not abs_html.startswith(media_root + os.sep) or not os.path.isfile(abs_html):
        return ''
    try:
        with open(abs_html, 'r', encoding='utf-8', errors='replace') as f:
            html = f.read()
    except OSError:
        return ''
    return _unwrap_html_body_fragment(html)


def resolve_icf_body_html_for_execution(icf) -> str:
    """
    执行台「签署内容审核」弹窗正文：优先 DB 富文本；否则 Word 与联调页同源读 *_preview.html；
    PDF 节点用 MEDIA_URL 内嵌 iframe（依赖运行环境可访问 /media）。
    """
    raw = (getattr(icf, 'content', None) or '').strip()
    if raw:
        return raw
    rel = (getattr(icf, 'file_path', None) or '').strip()
    if not rel or '..' in rel:
        return ''
    base = getattr(settings, 'MEDIA_ROOT', None) or os.path.join(settings.BASE_DIR, 'media')
    media_root = os.path.abspath(os.path.normpath(base))
    abs_doc = os.path.abspath(os.path.normpath(os.path.join(media_root, rel)))
    if not abs_doc.startswith(media_root + os.sep) or not os.path.isfile(abs_doc):
        return ''
    low = rel.lower()
    if low.endswith('.pdf'):
        media_url = getattr(settings, 'MEDIA_URL', '/media/') or '/media/'
        if not media_url.endswith('/'):
            media_url += '/'
        safe_rel = rel.replace('\\', '/').lstrip('/')
        src = f'{media_url}{quote(safe_rel, safe="/")}'
        return (
            '<div class="icf-pdf-preview-embed">'
            f'<iframe title="知情正文" src="{src}" '
            'style="width:100%;height:min(60vh,520px);border:0;border-radius:8px;background:#fff" '
            'loading="lazy"></iframe>'
            '</div>'
        )
    if not low.endswith(('.doc', '.docx')):
        return ''
    html_rel = ''
    if low.endswith('.docx'):
        ensure_icf_preview_for_http_request(rel)
        html_rel = icf_preview_html_relative_path(rel)
    else:
        ensure_icf_preview(rel)
        autoconv = icf_autoconv_docx_relative_path(rel)
        html_rel = icf_preview_html_relative_path(autoconv) if autoconv else ''
    if not html_rel:
        return ''
    abs_html = os.path.abspath(os.path.normpath(os.path.join(media_root, html_rel)))
    if not abs_html.startswith(media_root + os.sep) or not os.path.isfile(abs_html):
        return ''
    try:
        with open(abs_html, 'r', encoding='utf-8', errors='replace') as f:
            html = f.read()
    except OSError:
        return ''
    return _unwrap_html_body_fragment(html)


def parse_filename_as_node_title(filename: str) -> str:
    """从文件名解析节点标题（去掉扩展名，清理后截断至 200 字符）"""
    if not filename or not filename.strip():
        return '未命名'
    stem = os.path.splitext(filename.strip())[0].strip()
    # 移除常见版本后缀 v1.0、_v2 等
    stem = re.sub(r'[-_]?v\d+(\.\d+)?$', '', stem, flags=re.I).strip('-_ ')
    return (stem or '未命名')[:200]


def _optimize_title_for_cosmetic(title: str) -> str:
    """将项目名称优化为化妆品临床功效检测项目格式，保留原文特色，不做统一后缀"""
    import re
    if not title or not title.strip():
        return title or ''
    t = title.strip()
    # 移除末尾数字/日期
    t = re.sub(r'[-_]\d{8,}$', '', t)
    t = re.sub(r'[-_]\d+$', '', t)
    t = t.strip('-_ ')
    # 移除 PROTO-、UPG- 等前缀
    t = re.sub(r'^(PROTO|UPG|P\d+)[-_]?', '', t, flags=re.I)
    t = t.strip('-_ ')
    if not t:
        return title.strip()
    return t[:500]


def create_protocol_from_upload(uploaded_file, title: str = None, created_by_id: int = None) -> Protocol:
    """从上传文件创建协议（知情管理用），项目名称按化妆品临床功效检测规范优化"""
    file_path = save_protocol_upload_file(uploaded_file)
    name = getattr(uploaded_file, 'name', None) or '未命名'
    base_name = os.path.splitext(name)[0]
    raw_title = title or base_name
    return create_protocol(
        title=_optimize_title_for_cosmetic(raw_title),
        file_path=file_path,
        created_by_id=created_by_id,
    )


def batch_create_protocols(rows: List[Dict], created_by_id: int = None) -> Dict:
    """
    批量创建协议（新建项目批量导入）。
    rows: [{'title': str, 'code': str, 'screening_schedule': optional list}, ...] 名称与编号均须非空。
    返回: {'created': int, 'failed': [{'row': int, 'error': str}, ...]}
    """
    created = 0
    failed = []
    seen_codes_in_file: set = set()
    for i, row in enumerate(rows):
        title = (row.get('title') or '').strip()
        if not title:
            failed.append({'row': i + 1, 'error': '项目名称为空'})
            continue
        code = normalize_protocol_code(row.get('code'))
        if not code:
            failed.append({'row': i + 1, 'error': '项目编号为空'})
            continue
        if code in seen_codes_in_file:
            failed.append({'row': i + 1, 'error': '文件内项目编号重复'})
            continue
        try:
            kwargs = {
                'title': _optimize_title_for_cosmetic(title),
                'code': code,
                'created_by_id': created_by_id,
            }
            sched = row.get('screening_schedule')
            if sched:
                kwargs['screening_schedule'] = sched
            create_protocol(**kwargs)
            seen_codes_in_file.add(code)
            created += 1
        except Exception as e:
            failed.append({'row': i + 1, 'error': str(e)})
    return {'created': created, 'failed': failed}


def reorder_consent_protocols(account, id_order: List[int]) -> bool:
    """更新协议的知情管理展示顺序；id_order 为协议 ID 列表，按顺序赋值 0,1,2,..."""
    from apps.identity.filters import filter_queryset_by_scope
    qs = Protocol.objects.filter(is_deleted=False, id__in=id_order)
    qs = filter_queryset_by_scope(qs, account)
    visible_ids = set(qs.values_list('id', flat=True))
    for i, pid in enumerate(id_order):
        if pid in visible_ids:
            Protocol.objects.filter(id=pid).update(consent_display_order=i)
    return True


def update_protocol(protocol_id: int, **kwargs) -> Optional[Protocol]:
    """更新协议信息并同步飞书多维表格"""
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None
    if 'code' in kwargs:
        nc = normalize_protocol_code(kwargs['code'])
        kwargs['code'] = nc
        if nc:
            ensure_protocol_code_available(nc, exclude_protocol_id=protocol_id)
    allow_explicit_none = {'consent_config_account_id'}
    for key, value in kwargs.items():
        if not hasattr(protocol, key):
            continue
        if key in allow_explicit_none:
            setattr(protocol, key, value)
            continue
        if value is not None:
            setattr(protocol, key, value)
    protocol.save()
    # 状态变更时同步飞书多维表格
    if 'status' in kwargs:
        _sync_protocol_to_bitable(protocol)
    return protocol


def evaluate_archive_readiness(protocol_id: int) -> Dict[str, object]:
    """
    评估协议是否允许归档。

    原则：
    1. 协议归档必须走结项链路，不允许绕过 closeout 直接归档
    2. 不允许存在未完成工单
    3. 质量结项门禁需通过
    """
    checks = []

    try:
        from apps.closeout.models import CloseoutStatus, ProjectCloseout

        latest_closeout = (
            ProjectCloseout.objects.filter(protocol_id=protocol_id)
            .order_by('-initiated_at', '-id')
            .first()
        )
        has_closeout = latest_closeout is not None
        checks.append({
            'name': '已发起结项流程',
            'passed': has_closeout,
            'detail': f'closeout_id={latest_closeout.id}' if latest_closeout else '未找到结项记录',
        })
        checks.append({
            'name': '结项记录已归档',
            'passed': bool(latest_closeout and latest_closeout.status == CloseoutStatus.ARCHIVED),
            'detail': (
                f'current={latest_closeout.status}'
                if latest_closeout else
                '请先通过 /closeout/{id}/archive 完成结项归档'
            ),
        })
    except Exception as e:
        checks.append({
            'name': '结项链路可验证',
            'passed': False,
            'detail': f'结项模块检查失败: {e}',
        })

    try:
        from apps.workorder.models import WorkOrder, WorkOrderStatus

        open_workorders = WorkOrder.objects.filter(
            enrollment__protocol_id=protocol_id,
            is_deleted=False,
        ).exclude(
            status__in=[WorkOrderStatus.APPROVED, WorkOrderStatus.CANCELLED],
        ).count()
        checks.append({
            'name': '无未完成工单',
            'passed': open_workorders == 0,
            'detail': f'open_workorders={open_workorders}',
        })
    except Exception as e:
        checks.append({
            'name': '工单状态可验证',
            'passed': False,
            'detail': f'工单检查失败: {e}',
        })

    try:
        from apps.quality.services import check_closeout_gate

        quality_gate = check_closeout_gate(protocol_id)
        checks.append({
            'name': '质量结项门禁通过',
            'passed': bool(quality_gate.get('passed')),
            'detail': quality_gate,
        })
    except Exception as e:
        checks.append({
            'name': '质量结项门禁可验证',
            'passed': False,
            'detail': f'质量门禁检查失败: {e}',
        })

    return {
        'passed': all(item['passed'] for item in checks),
        'checks': checks,
    }


def bump_consent_overview_cache_generation() -> None:
    """
    知情概览 GET 使用短 TTL 缓存；软删除/变更列表后递增世代号，使旧 cache_key 全部失效。
    兼容 LocMem / Redis，不依赖 delete_pattern。
    """
    try:
        from django.core.cache import cache

        k = 'protocol:consent_overview:cache_gen'
        raw = cache.get(k) or 0
        try:
            n = int(raw)
        except (TypeError, ValueError):
            n = 0
        cache.set(k, n + 1, timeout=None)
    except Exception:
        pass


def delete_protocol(protocol_id: int) -> bool:
    """软删除协议"""
    protocol = get_protocol(protocol_id)
    if not protocol:
        return False
    protocol.is_deleted = True
    protocol.save(update_fields=['is_deleted', 'update_time'])
    bump_consent_overview_cache_generation()
    return True


# ============================================================================
# 文件上传与解析
# ============================================================================
def upload_protocol_file(protocol_id: int, file_path: str) -> Optional[Protocol]:
    """上传协议文件并更新状态为 uploaded"""
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None
    protocol.file_path = file_path
    protocol.status = ProtocolStatus.UPLOADED
    protocol.save(update_fields=['file_path', 'status', 'update_time'])
    return protocol


def trigger_parse(protocol_id: int, account_id: Optional[int] = None) -> Optional[ProtocolParseLog]:
    """触发协议 AI 解析

    创建解析日志记录，实际解析由 agent_gateway 完成。
    返回 ProtocolParseLog 供后续轮询状态。

    account_id: 触发解析的用户账号 ID，用于 agent_gateway 会话；未传时使用 0（系统调用）。
    """
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None
    if not protocol.file_path:
        logger.warning(f'Protocol {protocol_id} has no file to parse')
        return None

    # 更新状态为解析中
    protocol.status = ProtocolStatus.PARSING
    protocol.save(update_fields=['status', 'update_time'])

    # 创建解析日志
    parse_log = ProtocolParseLog.objects.create(
        protocol=protocol,
        status=ProtocolStatus.PARSING,
    )

    # 调用 AI 智能体解析（ARK/Kimi 双通道）
    # call_agent 签名为 (account_id, agent_id, message, context=...)
    try:
        from apps.agent_gateway.services import call_agent
        call_agent(
            account_id=account_id if account_id is not None else 0,
            agent_id='protocol-agent',
            message='请解析该协议文件，提取访视、流程等结构化信息。',
            context={
                'protocol_id': protocol_id,
                'file_path': protocol.file_path,
                'parse_log_id': parse_log.id,
            },
        )
    except ImportError:
        logger.warning(f'agent_gateway 模块不可用，协议#{protocol_id} 需手动调用 set_parsed_data 完成解析')
    except Exception as e:
        logger.error(f'协议#{protocol_id} AI 解析触发失败: {e}')

    logger.info(f'Parse triggered for protocol {protocol_id}, log_id={parse_log.id}')
    return parse_log


def set_parsed_data(protocol_id: int, parsed_data: dict) -> Optional[Protocol]:
    """
    手动设置协议解析数据（当 AI 解析不可用时的替代路径）

    parsed_data 结构示例:
    {
        "visits": [
            {"name": "V1 筛选", "day": 0, "window": "0",
             "procedures": [{"name": "知情同意"}, {"name": "体格检查"}]}
        ]
    }
    """
    protocol = get_protocol(protocol_id)
    if not protocol:
        return None

    if not parsed_data or not isinstance(parsed_data, dict):
        raise ValueError('parsed_data 必须是非空字典')

    protocol.parsed_data = parsed_data
    protocol.status = ProtocolStatus.PARSED
    protocol.save(update_fields=['parsed_data', 'status', 'update_time'])

    # 完成关联的解析日志
    from apps.protocol.models import ProtocolParseLog
    parse_log = ProtocolParseLog.objects.filter(
        protocol=protocol, status=ProtocolStatus.PARSING,
    ).order_by('-id').first()
    if parse_log:
        parse_log.status = ProtocolStatus.PARSED
        parse_log.save(update_fields=['status'])

    logger.info(f'协议#{protocol_id} 手动设置 parsed_data 完成')
    return protocol


def complete_parse(parse_log_id: int, parsed_result: dict = None, error_message: str = '') -> Optional[ProtocolParseLog]:
    """完成协议解析（由 agent_gateway 回调调用）"""
    parse_log = ProtocolParseLog.objects.filter(id=parse_log_id).first()
    if not parse_log:
        return None

    if error_message:
        parse_log.status = ProtocolStatus.DRAFT  # 回退状态
        parse_log.error_message = error_message
    else:
        parse_log.status = ProtocolStatus.PARSED
        parse_log.parsed_result = parsed_result
        # 同步到协议主记录
        protocol = parse_log.protocol
        protocol.parsed_data = parsed_result
        protocol.status = ProtocolStatus.PARSED
        protocol.save(update_fields=['parsed_data', 'status', 'update_time'])

    parse_log.finish_time = timezone.now()
    parse_log.save()
    return parse_log


def get_parse_logs(protocol_id: int) -> list:
    """获取协议的解析日志"""
    return list(
        ProtocolParseLog.objects.filter(protocol_id=protocol_id).order_by('-create_time')
    )


def _create_project_chat(protocol: Protocol):
    """
    S3-5：协议创建时自动创建飞书项目群

    群名格式：[CN_KIS] {协议名称}
    自动拉入 ProjectAssignment 成员。
    若未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，则跳过创建（开发/测试环境常见）。
    """
    from django.conf import settings
    if not (getattr(settings, 'FEISHU_APP_ID', '') and getattr(settings, 'FEISHU_APP_SECRET', '')):
        logger.info('协议#%s 跳过项目群创建: 未配置 FEISHU_APP_ID/FEISHU_APP_SECRET', protocol.id)
        return
    try:
        from libs.feishu_client import feishu_client
        chat_name = f'[CN_KIS] {protocol.title}'

        result = feishu_client.create_chat(
            name=chat_name,
            description=f'项目协议: {protocol.code or protocol.title}\n'
                        f'创建时间: {protocol.create_time}',
        )
        chat_id = result.get('chat_id', '')
        if not chat_id:
            logger.warning(f'协议#{protocol.id} 项目群创建返回无 chat_id')
            return

        # 保存 chat_id 到协议
        protocol.feishu_chat_id = chat_id
        protocol.save(update_fields=['feishu_chat_id', 'update_time'])

        # 拉入 ProjectAssignment 成员
        _add_assignment_members_to_chat(protocol.id, chat_id)

        # 发送公告
        import json as _json
        text_content = (
            f'📋 项目群已创建，欢迎团队成员！\n'
            f'协议: {protocol.title}\n'
            f'编码: {protocol.code or "待定"}'
        )
        feishu_client.send_message(
            receive_id=chat_id,
            msg_type='text',
            content=_json.dumps({'text': text_content}),
            receive_id_type='chat_id',
        )
        logger.info(f'协议#{protocol.id} 项目群已创建: {chat_id}')
    except Exception as e:
        logger.error(f'协议#{protocol.id} 项目群创建失败: {e}')


def _add_assignment_members_to_chat(protocol_id: int, chat_id: str):
    """拉入项目分配的成员到群"""
    try:
        from libs.feishu_client import feishu_client
        from apps.hr.models import ProjectAssignment

        assignments = ProjectAssignment.objects.filter(
            protocol_id=protocol_id, is_active=True,
        ).select_related('staff')

        open_ids = [a.staff.feishu_open_id for a in assignments if a.staff.feishu_open_id]
        if open_ids:
            feishu_client.add_chat_members(chat_id, open_ids)
            logger.info(f'项目群 {chat_id} 拉入 {len(open_ids)} 名成员')
    except Exception as e:
        logger.error(f'项目群拉人失败: {e}')
