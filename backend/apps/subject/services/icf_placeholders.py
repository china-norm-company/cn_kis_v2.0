"""
知情文书占位符替换（与 packages/consent-placeholders 字面量一致）。
供回执 PDF、执行台预览等使用；避免 consent_service 与重型逻辑循环依赖。
"""
from __future__ import annotations

import base64
import re
from datetime import datetime
from typing import Any, Dict, Optional

from django.utils import timezone


def _escape_html(s: str) -> str:
    return (
        (s or '')
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
    )


def apply_icf_placeholders(
    html_or_text: str,
    values: Dict[str, str],
    *,
    escape_values: bool = True,
    raw_html_by_token: Optional[Dict[str, str]] = None,
) -> str:
    """将 {{ICF_*}} 替换为对应值；raw_html_by_token 中的 token 按 HTML 片段插入（不转义）。"""
    raw = raw_html_by_token or {}
    entries: list[tuple[str, str, str]] = []
    for k, v in raw.items():
        entries.append((k, v, 'raw'))
    for k, v in values.items():
        if k not in raw:
            entries.append((k, v, 'text'))
    entries.sort(key=lambda x: len(x[0]), reverse=True)
    out = html_or_text or ''
    for token, raw_val, kind in entries:
        if kind == 'raw':
            repl = raw_val or ''
        else:
            repl = _escape_html(raw_val or '') if escape_values else (raw_val or '')
        out = out.replace(token, repl)
    return out


def _digits_only(s: str) -> str:
    return re.sub(r'\D', '', s or '')


def _last4(s: str) -> str:
    d = _digits_only(s)
    return d[-4:] if len(d) >= 4 else d


def _format_local_date_ymd(dt: datetime) -> str:
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return f'{dt.year:04d}-{dt.month:02d}-{dt.day:02d}'


def _load_sig_bytes_for_placeholder(ref: str) -> Optional[bytes]:
    """与 consent_service._load_signature_image_bytes 一致的最小子集。"""
    import os
    from pathlib import Path

    from django.conf import settings

    ref = (ref or '').strip()
    if not ref:
        return None
    try:
        raw = base64.b64decode(ref, validate=True)
        if raw:
            return raw
    except Exception:
        pass
    if ref.startswith('data:image'):
        try:
            b64 = ref.split(',', 1)[1].strip()
            return base64.b64decode(b64, validate=True)
        except Exception:
            return None
    if '..' in ref or ref.startswith('/'):
        return None
    mr = os.path.abspath(os.path.normpath(str(settings.MEDIA_ROOT)))
    ap = os.path.abspath(os.path.normpath(os.path.join(mr, ref.replace('\\', '/'))))
    if not ap.startswith(mr + os.sep) or not os.path.isfile(ap):
        return None
    try:
        return Path(ap).read_bytes()
    except OSError:
        return None


def _inline_sig_img_html(ref: str) -> str:
    b = _load_sig_bytes_for_placeholder(ref)
    if not b:
        return '<span style="color:#94a3b8;font-size:12px">（无签名影像）</span>'
    b64 = base64.b64encode(b).decode('ascii')
    return (
        f'<img src="data:image/png;base64,{b64}" alt="" '
        f'style="max-height:120px;max-width:100%;vertical-align:middle;" />'
    )


def build_icf_placeholder_map_for_consent_record(
    *,
    signature_data: dict,
    protocol_code: str,
    protocol_title: str,
    node_title: str,
    version_label: str,
    signed_at: Optional[datetime],
    receipt_no: str,
    protocol: Any = None,
    icf: Any = None,
) -> Dict[str, str]:
    """
    构造 {{ICF_*}} 替换表；手写签名位填入 img（供 HTML 摘要；PDF strip_tags 仍会去掉图，附录另附 RLImage）。
    """
    sig = dict(signature_data or {})
    ident = sig.get('consent_test_scan_identity') if isinstance(sig.get('consent_test_scan_identity'), dict) else {}
    mc = sig.get('mini_sign_confirm') if isinstance(sig.get('mini_sign_confirm'), dict) else {}

    name = (mc.get('subject_name') or ident.get('declared_name') or '').strip()
    id_full = re.sub(r'[\s]', '', str(ident.get('declared_id_card') or ''))
    id_full = re.sub(r'[^0-9Xx]', '', id_full)
    phone_full = _digits_only(str(ident.get('declared_phone') or ''))
    screening = (mc.get('screening_number') or ident.get('declared_screening_number') or '').strip()
    initials = (mc.get('initials') or ident.get('declared_pinyin_initials') or '').strip()

    sa = signed_at
    signed_date = ''
    signed_iso = ''
    if sa:
        try:
            if timezone.is_aware(sa):
                sa = timezone.localtime(sa)
            signed_iso = sa.isoformat()
            signed_date = _format_local_date_ymd(sa)
        except Exception:
            pass

    out: Dict[str, str] = {
        '{{ICF_PROTOCOL_CODE}}': (protocol_code or '').strip(),
        '{{ICF_PROTOCOL_TITLE}}': (protocol_title or '').strip(),
        '{{ICF_NODE_TITLE}}': (node_title or '').strip(),
        '{{ICF_VERSION_LABEL}}': (version_label or '').strip(),
        '{{ICF_SUBJECT_NAME}}': name,
        '{{ICF_DECLARED_NAME}}': name,
        '{{ICF_ID_CARD}}': id_full,
        '{{ICF_ID_CARD_LAST4}}': _last4(id_full) if id_full else (mc.get('id_card_last4') or '').strip(),
        '{{ICF_PHONE}}': phone_full,
        '{{ICF_PHONE_LAST4}}': _last4(phone_full) if phone_full else (mc.get('phone_last4') or '').strip(),
        '{{ICF_SCREENING_NUMBER}}': screening,
        '{{ICF_INITIALS}}': initials,
        '{{ICF_SIGNED_DATE}}': signed_date,
        '{{ICF_SIGNED_AT_ISO}}': signed_iso,
        '{{ICF_RECEIPT_NO}}': (receipt_no or '').strip(),
    }

    # 受试者签名占位（正文内嵌）
    sig_refs: list[str] = []
    if isinstance(sig.get('consent_test_scan_signature_images'), list) and sig.get('consent_test_scan_signature_images'):
        sig_refs = [str(x).strip() for x in sig['consent_test_scan_signature_images'] if str(x).strip()]
    elif isinstance(sig.get('signature_images'), list) and sig.get('signature_images'):
        sig_refs = [str(x).strip() for x in sig['signature_images'] if str(x).strip()]
    else:
        for k in ('signature_image', 'signature_image_2'):
            v = (sig.get(k) or '').strip()
            if v:
                sig_refs.append(v)

    sub_times = 1
    staff_times = 0
    if protocol is not None and icf is not None:
        from apps.subject.services.consent_service import get_effective_mini_sign_rules
        from apps.protocol.api import _clamp_1_or_2

        mr = get_effective_mini_sign_rules(protocol, icf)
        en_sub = bool(mr.get('enable_subject_signature', True))
        try:
            st_raw = int(mr.get('subject_signature_times') or 1)
        except (TypeError, ValueError):
            st_raw = 1
        sub_times = 0 if not en_sub else (2 if st_raw >= 2 else 1)
        en_staff = bool(mr.get('enable_staff_signature', False))
        try:
            staff_raw = int(mr.get('staff_signature_times') or 1)
        except (TypeError, ValueError):
            staff_raw = 1
        staff_times = 0 if not en_staff else _clamp_1_or_2(staff_raw, 1)

    out['{{ICF_SUBJECT_SIG_1}}'] = _inline_sig_img_html(sig_refs[0]) if sub_times >= 1 and len(sig_refs) > 0 else ''
    out['{{ICF_SUBJECT_SIG_2}}'] = _inline_sig_img_html(sig_refs[1]) if sub_times >= 2 and len(sig_refs) > 1 else ''

    staff_refs: list[str] = []
    if protocol is not None and staff_times > 0:
        try:
            from apps.protocol.api import _get_consent_settings
            from apps.protocol.models import WitnessStaff

            first_rel: str = ''
            snap_ids = sig.get('witness_staff_signature_order_ids')
            if isinstance(snap_ids, list) and snap_ids:
                for sid in snap_ids:
                    try:
                        iid = int(sid)
                    except (TypeError, ValueError):
                        continue
                    ws = WitnessStaff.objects.filter(id=iid, is_deleted=False).only('signature_file').first()
                    if not ws:
                        continue
                    rel = (ws.signature_file or '').strip()
                    if rel:
                        first_rel = rel
                        break
            if not first_rel:
                settings_json = _get_consent_settings(protocol)
                rows = list(settings_json.get('dual_sign_staffs') or [])
                for row in rows:
                    sid = row.get('staff_id')
                    if not sid:
                        continue
                    ws = WitnessStaff.objects.filter(id=int(sid), is_deleted=False).only('signature_file').first()
                    if not ws:
                        continue
                    rel = (ws.signature_file or '').strip()
                    if rel:
                        first_rel = rel
                        break
            if first_rel:
                staff_refs = [first_rel] * staff_times
        except Exception:
            pass

    out['{{ICF_STAFF_SIG_1}}'] = _inline_sig_img_html(staff_refs[0]) if staff_times >= 1 and len(staff_refs) > 0 else ''
    out['{{ICF_STAFF_SIG_2}}'] = _inline_sig_img_html(staff_refs[1]) if staff_times >= 2 and len(staff_refs) > 1 else ''

    return out
