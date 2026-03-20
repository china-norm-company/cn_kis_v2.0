#!/usr/bin/env python3
"""
部署后工作台验收脚本
请求部署服务器上各工作台及 API，校验 HTTP 状态与基础内容。
"""
import os
import urllib.request
import urllib.error
import ssl
import json

BASE = os.environ.get("DEPLOY_BASE_URL", "http://118.196.64.48")
WORKSTATIONS = [
    "secretary", "finance", "research", "execution", "quality", "hr",
    "crm", "recruitment", "equipment", "material", "facility",
    "evaluator", "lab-personnel", "ethics", "reception",
]

# 跳过 SSL 校验（仅内网/测试）
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def fetch(url, follow_redirects=True):
    req = urllib.request.Request(url, headers={"User-Agent": "CN-KIS-Deploy-Verify/1.0"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
            if follow_redirects and r.status in (301, 302, 303, 307, 308):
                loc = r.headers.get("Location")
                if loc and not loc.startswith("http"):
                    from urllib.parse import urlparse
                    parsed = urlparse(url)
                    loc = f"{parsed.scheme}://{parsed.netloc}{loc}"
                return fetch(loc, follow_redirects=True)
            return r.status, r.read(64 * 1024).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(8192).decode("utf-8", errors="replace") if e.fp else ""
    except Exception as e:
        return None, str(e)


def main():
    print("=" * 60)
    print("  CN KIS V1.0 部署验收 — 工作台与 API")
    print("  Base URL:", BASE)
    print("=" * 60)

    # 1. API 健康
    print("\n[1] API 健康检查")
    code, body = fetch(f"{BASE}/api/v1/health", follow_redirects=False)
    if code == 200:
        try:
            data = json.loads(body)
            print(f"    HTTP {code} — status={data.get('data', {}).get('status', '')} version={data.get('data', {}).get('version', '')}")
        except Exception:
            print(f"    HTTP {code} — {body[:80]}")
    else:
        print(f"    失败: HTTP {code}")

    # 2. 各工作台
    print("\n[2] 工作台入口 (GET /{path}/)")
    ok = 0
    fail = []
    for path in WORKSTATIONS:
        code, body = fetch(f"{BASE}/{path}/")
        if code == 200:
            has_html = "DOCTYPE" in body or "id=\"root\"" in body or "<html" in body
            status = "OK (含 HTML)" if has_html else "OK"
            print(f"    {path:16} HTTP 200  {status}")
            ok += 1
        else:
            print(f"    {path:16} HTTP {code}  失败")
            fail.append(path)

    # 3. 汇总
    print("\n" + "=" * 60)
    total = len(WORKSTATIONS)
    if fail:
        print(f"  结果: {ok}/{total} 通过，失败: {', '.join(fail)}")
    else:
        print(f"  结果: {total}/{total} 工作台验收通过")
    print("=" * 60)
    return 0 if not fail else 1


if __name__ == "__main__":
    exit(main())
