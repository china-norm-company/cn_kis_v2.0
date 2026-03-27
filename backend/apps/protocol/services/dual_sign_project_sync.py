"""
跨协议同步「启用工作人员见证双签」及双签名单。

范围（与产品线/委托方一致时缩小；否则同步到除本协议外的全部未删除协议）：
- 有产品线：同 product_line_id
- 否则有委托方：同 sponsor_id
- 否则：全部其他协议（试点/单机常见）

新建协议时从同组内已有配置复用；保存知情配置或节点小程序规则时写回同组全部协议，
并更新各协议下已保存 mini_sign_rules 中的双签字段。
"""
from __future__ import annotations

import logging
from typing import Any, List

from apps.protocol.models import Protocol
from apps.subject.models import ICFVersion

logger = logging.getLogger(__name__)


def peer_protocols_qs(protocol: Protocol):
    qs = Protocol.objects.filter(is_deleted=False).exclude(pk=protocol.pk)
    if protocol.product_line_id is not None:
        return qs.filter(product_line_id=protocol.product_line_id)
    if protocol.sponsor_id is not None:
        return qs.filter(sponsor_id=protocol.sponsor_id)
    return qs


def seed_dual_sign_for_new_protocol(protocol: Protocol) -> None:
    """新建协议后，从同组协议复用双签开关与名单（若存在可复用配置）。"""
    from apps.protocol.api import (
        _get_consent_settings,
        _save_consent_settings,
        _merge_witness_staff_verification,
        _normalize_dual_sign_staffs,
    )

    peers = peer_protocols_qs(protocol).order_by('-update_time')
    source_settings = None
    for p in peers[:80]:
        cs = _get_consent_settings(p)
        if cs.get('require_dual_sign') and (cs.get('dual_sign_staffs') or []):
            source_settings = cs
            break
    if source_settings is None:
        for p in peers[:80]:
            cs = _get_consent_settings(p)
            if cs.get('dual_sign_staffs'):
                source_settings = cs
                break
    if source_settings is None:
        return
    cur = _get_consent_settings(protocol)
    cur['require_dual_sign'] = bool(source_settings.get('require_dual_sign', False))
    cur['dual_sign_staffs'] = _merge_witness_staff_verification(
        _normalize_dual_sign_staffs(source_settings.get('dual_sign_staffs'))
    )
    _save_consent_settings(protocol, cur)


def _patch_saved_icf_dual_sign_for_protocol(
    protocol_id: int,
    require_dual_sign: bool,
    staffs: List[dict],
) -> None:
    qs = ICFVersion.objects.filter(protocol_id=protocol_id, mini_sign_rules_saved=True)
    for icf in qs:
        mr = dict(icf.mini_sign_rules) if isinstance(icf.mini_sign_rules, dict) else {}
        mr['require_dual_sign'] = require_dual_sign
        mr['dual_sign_staffs'] = staffs
        icf.mini_sign_rules = mr
        icf.save(update_fields=['mini_sign_rules', 'update_time'])


def propagate_dual_sign_across_project(
    protocol: Protocol,
    require_dual_sign: bool,
    dual_sign_staffs_raw: Any,
) -> None:
    """
    将双签开关与名单同步到同组全部协议（含当前协议），跳过已发布协议；
    并更新各协议下 mini_sign_rules_saved=True 的节点 JSON。
    """
    from django.db import transaction

    from apps.protocol.api import (
        _get_consent_settings,
        _save_consent_settings,
        _merge_witness_staff_verification,
        _normalize_dual_sign_staffs,
        _is_consent_launched,
    )

    staffs = _merge_witness_staff_verification(_normalize_dual_sign_staffs(dual_sign_staffs_raw))
    target_ids = [protocol.pk] + list(peer_protocols_qs(protocol).values_list('pk', flat=True))

    try:
        with transaction.atomic():
            for pid in target_ids:
                p = Protocol.objects.filter(pk=pid, is_deleted=False).first()
                if not p:
                    continue
                if _is_consent_launched(p):
                    continue
                cur = _get_consent_settings(p)
                cur['require_dual_sign'] = bool(require_dual_sign)
                cur['dual_sign_staffs'] = staffs
                _save_consent_settings(p, cur)
                _patch_saved_icf_dual_sign_for_protocol(pid, bool(require_dual_sign), staffs)
    except Exception:
        # 当前协议主保存已成功；同步失败仅记日志，避免 500
        logger.exception(
            'propagate_dual_sign_across_project failed source_protocol_id=%s',
            getattr(protocol, 'id', None),
        )
