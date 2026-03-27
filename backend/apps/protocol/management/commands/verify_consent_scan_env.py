"""检查知情签署测试「手机扫码」所需后端环境变量（执行台 H5，不依赖小程序）。"""
import json
from urllib.parse import urlparse

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.protocol.consent_scan_url_utils import normalize_consent_test_scan_public_base


def _read_wechat_mini_project_appid() -> str | None:
    """与 apps/wechat-mini/project.config.json 的 appid 对齐检查（避免白名单配错小程序）。"""
    try:
        p = settings.BASE_DIR.parent / 'apps' / 'wechat-mini' / 'project.config.json'
        if not p.is_file():
            return None
        with open(p, encoding='utf-8') as f:
            data = json.load(f)
        aid = (data.get('appid') or '').strip()
        return aid or None
    except Exception:
        return None


def _is_ipv4(host: str) -> bool:
    parts = host.split('.')
    if len(parts) != 4:
        return False
    try:
        nums = [int(p) for p in parts]
    except ValueError:
        return False
    return all(0 <= n <= 255 for n in nums)


class Command(BaseCommand):
    help = '检查 CONSENT_TEST_SCAN_PUBLIC_BASE（知情管理列表二维码 → 执行台 H5 知情测试）'

    def handle(self, *args, **options):
        base = (getattr(settings, 'CONSENT_TEST_SCAN_PUBLIC_BASE', None) or '').strip()
        appid = (getattr(settings, 'WECHAT_APPID', None) or '').strip()
        secret = (getattr(settings, 'WECHAT_SECRET', None) or '').strip()

        self.stdout.write('知情签署测试 · 扫码环境（执行台 H5）\n')
        ok = True
        if not base:
            self.stdout.write(
                self.style.WARNING(
                    '[ ] CONSENT_TEST_SCAN_PUBLIC_BASE 未设置 — 二维码将为 localhost，手机无法打开执行台页面'
                )
            )
            ok = False
        else:
            preview = base if len(base) <= 72 else base[:69] + '...'
            self.stdout.write(self.style.SUCCESS(f'[✓] CONSENT_TEST_SCAN_PUBLIC_BASE = {preview}'))
            base_norm = normalize_consent_test_scan_public_base(base)
            if base_norm.rstrip('/') != base.strip().rstrip('/'):
                self.stdout.write(
                    self.style.SUCCESS(
                        f'[✓] 私网 http 无端口已按开发约定规范为: {base_norm}（未写端口时补 :8001，'
                        f'二维码生成时若为主机会再换为执行台 :3007）'
                    )
                )
            try:
                pu = urlparse(base_norm)
                host = (pu.hostname or '').strip()
                if pu.scheme == 'http' and host and _is_ipv4(host) and pu.port is None:
                    self.stdout.write(
                        self.style.WARNING(
                            '[!] 上述地址为 http + 局域网 IPv4 且未写端口 — 手机将连 **80** 端口。'
                            '请显式写执行台端口，例如 http://<IP>:3007（pnpm run dev:execution）。'
                        )
                    )
                elif pu.scheme == 'http' and host and _is_ipv4(host) and pu.port in (3007, 8001):
                    self.stdout.write(
                        '提示：手机与电脑同网；执行台须 `host: true` 监听 3007，'
                        'Django 监听 8001（Vite 代理 /api）。'
                    )
            except ValueError:
                self.stdout.write(self.style.WARNING('[!] CONSENT_TEST_SCAN_PUBLIC_BASE 不是合法 URL，请检查。'))

        if not appid or not secret:
            self.stdout.write(
                self.style.WARNING(
                    '[ ] WECHAT_APPID / WECHAT_SECRET 未齐 — 仅影响小程序等能力；「知情测试」H5 扫码不依赖此项'
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS('[✓] WECHAT_APPID / WECHAT_SECRET 已配置（小程序等能力可用）'))
            proj_appid = _read_wechat_mini_project_appid()
            if proj_appid and appid != proj_appid:
                self.stdout.write(
                    self.style.ERROR(
                        f'[!] AppID 与小程序工程不一致：backend/.env 中 WECHAT_APPID={appid}，'
                        f'apps/wechat-mini/project.config.json 中 appid={proj_appid}。'
                    )
                )
                ok = False

        self.stdout.write('')
        if ok:
            self.stdout.write(
                self.style.SUCCESS(
                    '二维码将指向执行台 /#/consent-test-scan（协议须为可测试态）。'
                    '刷新执行台列表后扫码即可。'
                )
            )
        else:
            self.stdout.write(
                '请编辑 backend/.env 后重启 runserver，并刷新执行台列表使二维码更新。'
                '说明见 backend/.env.example。'
            )
