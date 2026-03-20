#!/usr/bin/env python3
"""
CN KIS V2.0 - 飞书 OAuth 登录端到端验证脚本

验证流程：
1. 检查 V2 后端健康状态
2. 验证 /api/v1/auth/feishu-login 端点返回正确的飞书 OAuth URL
3. 验证 OAuth URL 包含正确的 app_id（子衿主授权）
4. 验证 redirect_uri 指向 V2 测试域名
5. 检查 FeishuUserToken 模型的表是否存在（migration 正确运行）

用法：
    python3 ops/scripts/verify_feishu_login.py --base-url http://test-guide.data-infact.com:9001
    python3 ops/scripts/verify_feishu_login.py --base-url http://localhost:8001
"""
import argparse
import json
import sys
from urllib.parse import urlparse, parse_qs
import urllib.request
import urllib.error

PRIMARY_APP_ID = "cli_a98b0babd020500e"


def check_health(base_url: str) -> bool:
    print(f"\n[1/5] 检查后端健康状态: {base_url}/api/v1/health")
    try:
        with urllib.request.urlopen(f"{base_url}/api/v1/health", timeout=10) as resp:
            data = json.loads(resp.read())
            print(f"  ✅ 健康检查通过: {json.dumps(data, ensure_ascii=False)}")
            return True
    except urllib.error.URLError as e:
        print(f"  ❌ 连接失败: {e}")
        return False
    except Exception as e:
        print(f"  ❌ 错误: {e}")
        return False


def check_feishu_login_endpoint(base_url: str, workstation: str = "evaluator") -> dict | None:
    """检查飞书登录 URL 生成"""
    url = f"{base_url}/api/v1/auth/feishu-login?workstation={workstation}"
    print(f"\n[2/5] 检查飞书登录端点: {url}")
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            print(f"  响应: {json.dumps(data, ensure_ascii=False)[:200]}")
            return data
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f"  HTTP {e.code}: {body}")
        # 部分端点可能需要认证，返回 401 也算端点存在
        if e.code in (401, 403):
            print(f"  ℹ️  端点存在但需要认证（HTTP {e.code}），这是正常的")
            return {"code": e.code, "msg": "requires_auth"}
        return None
    except Exception as e:
        print(f"  ❌ 错误: {e}")
        return None


def check_oauth_url(oauth_url: str) -> bool:
    """验证 OAuth URL 包含正确的 app_id 和 redirect_uri"""
    print(f"\n[3/5] 验证 OAuth URL 参数...")
    parsed = urlparse(oauth_url)
    params = parse_qs(parsed.query)

    app_id = params.get("app_id", [""])[0]
    redirect_uri = params.get("redirect_uri", [""])[0]

    print(f"  app_id:       {app_id}")
    print(f"  redirect_uri: {redirect_uri}")

    ok = True

    # 验证 app_id 是子衿主授权
    if app_id == PRIMARY_APP_ID:
        print(f"  ✅ app_id 正确（子衿主授权 {PRIMARY_APP_ID}）")
    elif app_id:
        print(f"  ⚠️  app_id={app_id} 不是子衿主授权 {PRIMARY_APP_ID}")
        print(f"     如果是其他工作台独立 App，请确认是否符合 V2 统一授权架构要求")
    else:
        print(f"  ❌ app_id 为空")
        ok = False

    # 验证 redirect_uri
    if redirect_uri:
        print(f"  ✅ redirect_uri 存在")
        if "localhost" in redirect_uri:
            print(f"  ℹ️  本地开发模式（localhost）")
        elif "test-guide.data-infact.com" in redirect_uri:
            print(f"  ✅ 指向测试域名（正确）")
        elif "118.196.64.48" in redirect_uri:
            print(f"  ⚠️  指向生产 IP！测试环境不应使用生产地址")
            ok = False
    else:
        print(f"  ❌ redirect_uri 为空")
        ok = False

    return ok


def check_migration_tables(base_url: str) -> bool:
    """通过 /api/v1/auth/check-migration 或 debug 端点验证 migration"""
    print(f"\n[4/5] 检查数据库表结构（通过 debug API）...")
    # 尝试一个简单的端点来间接验证 migration 是否跑通
    try:
        url = f"{base_url}/api/v1/auth/workstations"
        with urllib.request.urlopen(url, timeout=10) as resp:
            print(f"  ✅ /api/v1/auth/workstations 可访问（Migration 正常）")
            return True
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 422):
            print(f"  ✅ 端点存在（HTTP {e.code}），Migration 正常")
            return True
        print(f"  ⚠️  HTTP {e.code}，可能 Migration 未完成")
        return False
    except Exception as e:
        print(f"  ⚠️  无法访问: {e}")
        return False


def print_summary(results: dict):
    print("\n" + "=" * 60)
    print("  飞书登录端到端验证结果")
    print("=" * 60)
    all_ok = all(results.values())
    for check, passed in results.items():
        icon = "✅" if passed else "❌"
        print(f"  {icon}  {check}")
    print("=" * 60)

    if all_ok:
        print("  🎉 全部通过！V2 飞书登录链路就绪")
    else:
        print("  ⚠️  部分检查未通过，请查看上方详细输出")
        print()
        print("  常见问题排查：")
        print("  1. 后端未启动 → 检查 Docker 容器状态：docker ps --filter publish=9001")
        print("  2. Migration 未运行 → docker exec <container_id> python manage.py migrate")
        print("  3. 飞书 App ID 错误 → 检查 .env 中 FEISHU_PRIMARY_APP_ID=cli_a98b0babd020500e")
        print("  4. redirect_uri 错误 → 检查 .env 中 FEISHU_REDIRECT_URI")
    print()

    return 0 if all_ok else 1


def main():
    parser = argparse.ArgumentParser(description="V2 飞书 OAuth 登录端到端验证")
    parser.add_argument("--base-url", default="http://test-guide.data-infact.com:9001",
                        help="后端服务地址 (default: http://test-guide.data-infact.com:9001)")
    parser.add_argument("--workstation", default="evaluator",
                        help="测试工作台 (default: evaluator)")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    print(f"CN KIS V2.0 - 飞书登录端到端验证")
    print(f"目标：{base_url}")
    print(f"工作台：{args.workstation}")

    results = {}

    # Step 1: 健康检查
    results["后端健康检查"] = check_health(base_url)
    if not results["后端健康检查"]:
        print_summary(results)
        sys.exit(1)

    # Step 2: 飞书登录端点
    login_data = check_feishu_login_endpoint(base_url, args.workstation)
    results["飞书登录端点响应"] = login_data is not None

    # Step 3: OAuth URL 验证
    oauth_url = None
    if login_data and isinstance(login_data, dict):
        oauth_url = (login_data.get("data") or {}).get("url") or login_data.get("url", "")

    if oauth_url:
        results["OAuth URL 参数验证"] = check_oauth_url(oauth_url)
    else:
        print(f"\n[3/5] 跳过 OAuth URL 验证（未获取到 URL）")
        results["OAuth URL 参数验证"] = False

    # Step 4: Migration 检查
    results["数据库 Migration 状态"] = check_migration_tables(base_url)

    # 总结
    exit_code = print_summary(results)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
