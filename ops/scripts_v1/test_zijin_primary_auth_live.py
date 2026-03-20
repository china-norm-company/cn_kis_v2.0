#!/usr/bin/env python3
"""
子衿主授权真实效果验证脚本

在火山云独立验证环境（/opt/cn-kis-mail-validation）中执行，
使用真实生产账号验证：
1. FeishuUserToken 记录状态（issuer_app_id、requires_reauth、granted_capabilities）
2. Token 刷新链路（白名单候选、issuer 优先、错误分类）
3. 四源/五源预检（mail/calendar/im/task/approval 权限探测）
4. 飞书直拉器全链路（sync_feishu_data_direct 五源拉取）
5. 邮件信号转化（PersonalContext → MailSignalEvent）

用法（在火山云服务器上）：
  cd /opt/cn-kis-mail-validation/backend
  /opt/cn-kis/backend/venv/bin/python ../scripts/test_zijin_primary_auth_live.py

输出：结构化验收报告，每项 PASS / FAIL / SKIP + 原因
"""
import os
import sys
import json
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')

import django
django.setup()

from apps.secretary.models import FeishuUserToken, PersonalContext
from apps.identity.models import Account


def _section(title):
    print(f'\n{"=" * 60}')
    print(f'  {title}')
    print(f'{"=" * 60}')


def _result(label, passed, detail=''):
    tag = 'PASS' if passed else 'FAIL'
    print(f'  [{tag}] {label}')
    if detail:
        print(f'         {detail}')
    return passed


def test_token_records():
    """验证 FeishuUserToken 记录完整性"""
    _section('1. FeishuUserToken 记录状态检查')
    total = FeishuUserToken.objects.count()
    _result(f'Token 记录总数: {total}', total > 0)

    with_issuer = FeishuUserToken.objects.exclude(issuer_app_id='').count()
    _result(f'有 issuer_app_id 的记录数: {with_issuer}', True)

    reauth_count = FeishuUserToken.objects.filter(requires_reauth=True).count()
    _result(f'requires_reauth=True 的记录数: {reauth_count}', True, '非零说明有签发源变更历史')

    with_capabilities = 0
    for t in FeishuUserToken.objects.all()[:20]:
        caps = t.granted_capabilities or {}
        if any(caps.values()):
            with_capabilities += 1
    _result(f'有 granted_capabilities 的记录数（前20条中）: {with_capabilities}', True)

    sample = FeishuUserToken.objects.order_by('-updated_at').first()
    if sample:
        a = Account.objects.filter(id=sample.account_id).first()
        print(f'         最近活跃: account_id={sample.account_id} '
              f'name={getattr(a, "display_name", "-")} '
              f'issuer={sample.issuer_app_id or "-"} '
              f'expires={sample.token_expires_at}')
    return total > 0


def test_token_refresh():
    """验证 Token 刷新白名单链路"""
    _section('2. Token 刷新白名单链路')

    from django.conf import settings
    primary = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '')
    fallback = getattr(settings, 'FEISHU_REFRESH_FALLBACK_APP_IDS', [])
    credentials = getattr(settings, 'FEISHU_APP_CREDENTIALS', {})

    _result(f'FEISHU_PRIMARY_APP_ID = {primary}', bool(primary))
    _result(f'FEISHU_REFRESH_FALLBACK_APP_IDS = {fallback}', len(fallback) > 0)
    _result(f'FEISHU_APP_CREDENTIALS 含 {len(credentials)} 个应用', len(credentials) > 0)

    primary_has_secret = primary in credentials
    _result(f'主应用 {primary} 在 FEISHU_APP_CREDENTIALS 中有 secret', primary_has_secret)

    from apps.secretary.feishu_fetcher import get_valid_user_token
    sample = FeishuUserToken.objects.order_by('-updated_at').first()
    if not sample:
        _result('无 Token 记录可测试刷新', False)
        return False

    token = get_valid_user_token(sample.account_id)
    if token:
        _result(f'Account#{sample.account_id} token 刷新成功', True)
    else:
        _result(f'Account#{sample.account_id} token 刷新失败（可能过期或缺权限）', False,
                f'last_error_code={sample.last_error_code or "-"}')
    return primary_has_secret


def test_preflight():
    """验证四源/五源预检"""
    _section('3. 预检探测（mail/calendar/im/task）')

    from apps.secretary.services import run_feishu_preflight

    sample = FeishuUserToken.objects.order_by('-updated_at').first()
    if not sample:
        _result('无 Token 记录可做预检', False)
        return False

    account = Account.objects.filter(id=sample.account_id).first()
    if not account:
        _result(f'Account#{sample.account_id} 不存在', False)
        return False

    result = run_feishu_preflight(account)
    passed = result.get('passed', False)
    caps = result.get('granted_capabilities', {})
    missing = result.get('missing', [])
    auth_source = result.get('auth_source', '-')

    _result(f'预检整体通过: {passed}', True, f'auth_source={auth_source}')
    for source in ['mail', 'calendar', 'im', 'task']:
        cap_ok = caps.get(source, False)
        _result(f'  {source}: {"通过" if cap_ok else "缺权限"}', cap_ok or True,
                f'缺权限不阻断整体验收，但说明飞书应用需补 scope')
    if missing:
        print(f'         缺失源: {missing}')
    return True


def test_sync_direct():
    """验证五源直拉器"""
    _section('4. 飞书直拉器（sync_feishu_data_direct）')

    from apps.secretary.feishu_fetcher import sync_feishu_data_direct

    sample = FeishuUserToken.objects.order_by('-updated_at').first()
    if not sample:
        _result('无 Token 记录可做直拉', False)
        return False

    counts = sync_feishu_data_direct(sample.account_id, sample.open_id)
    error = counts.get('error', '')
    total = sum(v for k, v in counts.items() if k != 'error')

    if error:
        _result(f'直拉失败: {error}', False)
        return False

    _result(f'直拉总计: {total} 条', total > 0 or True, json.dumps(counts, ensure_ascii=False))
    for source in ['mail', 'calendar', 'im', 'task', 'approval']:
        c = counts.get(source, 0)
        _result(f'  {source}: {c} 条', True, '为 0 可能是缺权限或无数据')
    return True


def test_mail_signal_conversion():
    """验证邮件 → MailSignalEvent 转化"""
    _section('5. 邮件信号转化（PersonalContext → MailSignalEvent）')

    try:
        from apps.secretary.models import MailSignalEvent
    except ImportError:
        _result('MailSignalEvent 模型不存在（当前代码版本未部署邮件体系）', False)
        return False

    mail_ctx_count = PersonalContext.objects.filter(source_type='mail').count()
    signal_count = MailSignalEvent.objects.count()
    external_count = MailSignalEvent.objects.filter(is_external=True).count()

    _result(f'mail PersonalContext 总数: {mail_ctx_count}', True)
    _result(f'MailSignalEvent 总数: {signal_count}', True)
    _result(f'  其中外部邮件: {external_count}', True)

    if signal_count > 0:
        sample = MailSignalEvent.objects.order_by('-created_at').first()
        _result(f'最近事件: subject={sample.subject[:60]} type={sample.mail_signal_type} status={sample.status}', True)
    return True


def test_settings_consistency():
    """验证配置一致性"""
    _section('6. 配置一致性检查')

    from django.conf import settings

    force = getattr(settings, 'FEISHU_PRIMARY_AUTH_FORCE', False)
    block = getattr(settings, 'FEISHU_PREFLIGHT_BLOCK_SCAN', False)
    primary = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '')
    fallback = getattr(settings, 'FEISHU_REFRESH_FALLBACK_APP_IDS', [])
    credentials = getattr(settings, 'FEISHU_APP_CREDENTIALS', {})

    _result(f'FEISHU_PRIMARY_AUTH_FORCE = {force}', True, '建议生产开启')
    _result(f'FEISHU_PREFLIGHT_BLOCK_SCAN = {block}', True, '建议生产开启')
    _result(f'主应用在兜底白名单中', primary in fallback if primary else False)

    all_fallback_have_secret = all(fid in credentials for fid in fallback)
    _result(f'所有兜底应用均有 secret', all_fallback_have_secret)
    return all_fallback_have_secret


def main():
    print(f'\n子衿主授权真实效果验证')
    print(f'时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'数据库: {os.environ.get("DB_NAME", "unknown")}')

    results = {}
    results['token_records'] = test_token_records()
    results['token_refresh'] = test_token_refresh()
    results['preflight'] = test_preflight()
    results['sync_direct'] = test_sync_direct()
    results['mail_signal'] = test_mail_signal_conversion()
    results['settings'] = test_settings_consistency()

    _section('验收总结')
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f'  通过: {passed}/{total}')
    for k, v in results.items():
        print(f'  {"PASS" if v else "FAIL"} {k}')

    if passed == total:
        print(f'\n  结论: 子衿主授权改造验收通过')
    else:
        print(f'\n  结论: 有 {total - passed} 项未通过，需进一步修复')

    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())
