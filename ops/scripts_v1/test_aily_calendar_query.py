#!/usr/bin/env python3
"""测试 Aily 对话调用，查询公司近30天日历

用法：
  cd CN_KIS_V1.0
  python scripts/test_aily_calendar_query.py          # 完整测试（需 IP 在白名单）
  python scripts/test_aily_calendar_query.py --dry-run # 仅验证 token，不调用 Aily
  python scripts/test_aily_calendar_query.py --show-ip # 显示当前出口 IP（用于配置白名单）
  python scripts/test_aily_calendar_query.py --use-user-token # 使用 FEISHU_USER_ACCESS_TOKEN 直接调用

本地经火山云代理（免部署、免白名单）：
  1. 终端1: ssh -D 1080 -N root@118.196.64.48
  2. 终端2: pip install PySocks && FEISHU_PROXY=socks5://127.0.0.1:1080 python scripts/test_aily_calendar_query.py

从 deploy/.env.volcengine.plan-a 读取：
  FEISHU_APP_ID_DEV_ASSISTANT、FEISHU_APP_SECRET_DEV_ASSISTANT
  FEISHU_AILY_APP_ID、FEISHU_AILY_SKILL_ID（可选，用于「调用技能」API，无需会话）
  FEISHU_AILY_WEBHOOK_URL、FEISHU_AILY_WEBHOOK_BEARER_TOKEN（可选，Agent 推荐）
前置条件：Aily 应用已创建并发布到智能开发助手机器人，且具备日历权限
"""

import json
import os
import re
import sys
import uuid
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import urlparse

# SOCKS5 代理：本地经火山云访问飞书，避免 IP 白名单
_PROXY_INIT = False
def _init_proxy():
    global _PROXY_INIT
    if _PROXY_INIT:
        return True
    proxy = os.environ.get("FEISHU_PROXY", "").strip()
    if not proxy or not proxy.startswith("socks5://"):
        _PROXY_INIT = True
        return False
    try:
        import socks
        p = urlparse(proxy)
        host = p.hostname or "127.0.0.1"
        port = p.port or 1080
        socks.set_default_proxy(socks.SOCKS5, host, port)
        import socket
        socket.socket = socks.socksocket
        _PROXY_INIT = True
        return True
    except ImportError:
        print("WARN: FEISHU_PROXY 已设置但未安装 PySocks，请运行: pip install PySocks")
        _PROXY_INIT = True
        return False


def get_outbound_ip() -> str:
    """获取当前出口 IP（用于配置飞书 IP 白名单）"""
    services = [
        ("https://api.ipify.org?format=json", lambda r: json.loads(r.read().decode()).get("ip", "")),
        ("https://ifconfig.me/ip", lambda r: r.read().decode().strip()),
        ("https://icanhazip.com", lambda r: r.read().decode().strip()),
    ]
    for url, parser in services:
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                ip = parser(resp)
                if ip:
                    return ip
        except Exception:
            continue
    return "unknown"

# 加载环境变量
PROJECT_ROOT = Path(__file__).resolve().parent.parent
for env_file in [
    PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a",
    PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a.example",
]:
    if env_file.exists():
        with open(env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    v = v.strip().strip("'\"")
                    if k == "FEISHU_APP_ID_DEV_ASSISTANT":
                        os.environ.setdefault("FEISHU_APP_ID_DEV_ASSISTANT", v)
                    elif k == "FEISHU_APP_SECRET_DEV_ASSISTANT":
                        os.environ.setdefault("FEISHU_APP_SECRET_DEV_ASSISTANT", v)
                    elif k == "FEISHU_AILY_APP_ID":
                        os.environ.setdefault("FEISHU_AILY_APP_ID", v)
                    elif k == "FEISHU_AILY_SKILL_ID":
                        os.environ.setdefault("FEISHU_AILY_SKILL_ID", v)
                    elif k == "FEISHU_AILY_WEBHOOK_URL":
                        os.environ.setdefault("FEISHU_AILY_WEBHOOK_URL", v)
                    elif k == "FEISHU_AILY_WEBHOOK_BEARER_TOKEN":
                        os.environ.setdefault("FEISHU_AILY_WEBHOOK_BEARER_TOKEN", v)
                    elif k == "FEISHU_APP_ID" and "FINANCE" not in line and "DEV_ASSISTANT" not in line:
                        os.environ.setdefault("FEISHU_APP_ID", v)
                    elif k == "FEISHU_APP_SECRET" and "FINANCE" not in line and "DEV_ASSISTANT" not in line:
                        os.environ.setdefault("FEISHU_APP_SECRET", v)
        break

# 优先使用智能开发助手，未配置时可用 --use-secretary 使用子衿凭证测试
APP_ID = os.getenv("FEISHU_APP_ID_DEV_ASSISTANT")
APP_SECRET = os.getenv("FEISHU_APP_SECRET_DEV_ASSISTANT")
AILY_APP_ID = os.getenv("FEISHU_AILY_APP_ID")  # Aily 应用 ID，格式 spring_xxx__c
AILY_SKILL_ID = os.getenv("FEISHU_AILY_SKILL_ID")  # 技能 ID，格式 skill_xxx
AILY_WEBHOOK_URL = os.getenv("FEISHU_AILY_WEBHOOK_URL", "").strip()
AILY_WEBHOOK_BEARER_TOKEN = os.getenv("FEISHU_AILY_WEBHOOK_BEARER_TOKEN", "").strip()
USER_ACCESS_TOKEN = os.getenv("FEISHU_USER_ACCESS_TOKEN", "").strip()
USE_SECRETARY = "--use-secretary" in sys.argv
USE_USER_TOKEN = "--use-user-token" in sys.argv
if USE_SECRETARY and (not APP_ID or APP_ID == "cli_xxx"):
    APP_ID = os.getenv("FEISHU_APP_ID")
    APP_SECRET = os.getenv("FEISHU_APP_SECRET")
    print("(使用子衿凭证进行测试，正式环境请配置智能开发助手)\n")

BASE_URL = "https://open.feishu.cn/open-apis"


def get_tenant_access_token() -> str:
    """获取 tenant_access_token"""
    url = f"{BASE_URL}/auth/v3/tenant_access_token/internal"
    data = json.dumps({"app_id": APP_ID, "app_secret": APP_SECRET}).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")

    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read().decode())
    if body.get("code") != 0:
        raise RuntimeError(f"获取 token 失败: {body}")
    return body["tenant_access_token"]


def aily_request(method: str, path: str, token: str, data: dict = None) -> dict:
    """调用 Aily API（不传递任何 IP，飞书从 TCP 连接获取客户端 IP）"""
    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "CN_KIS_Aily_Test/1.0",
    }
    # 显式处理 body：空对象 {} 与 None 不同，部分 API 可能对空 body 敏感
    if data is not None:
        body = json.dumps(data).encode("utf-8")
    else:
        body = None
    req = urllib.request.Request(url, data=body, method=method, headers=headers)

    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def webhook_request(url: str, bearer_token: str, data: dict) -> dict:
    """调用 Aily 自定义触发器 Webhook（Agent 推荐，不依赖机器人渠道发布）"""
    body = json.dumps({"data": data}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {bearer_token}")
    req.add_header("User-Agent", "CN_KIS_Aily_Webhook_Test/1.0")
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode()
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw}


def main():
    SHOW_IP = "--show-ip" in sys.argv
    DRY_RUN = "--dry-run" in sys.argv

    _init_proxy()
    if os.environ.get("FEISHU_PROXY", "").strip().startswith("socks5://"):
        print("(使用 FEISHU_PROXY 代理，请求经火山云出口)\n")

    print("=== 智能开发助手 Aily 日历查询测试 ===\n")

    if SHOW_IP:
        ip = get_outbound_ip()
        print(f"当前出口 IP: {ip}")
        print("\n请将此 IP 添加到飞书开放平台 → 应用 → 安全设置 → IP 白名单")
        print("  https://open.feishu.cn/app → 选择应用 → 安全设置")
        sys.exit(0)

    # Agent 场景优先：若配置了 Webhook，优先走 Webhook（不依赖机器人渠道发布）
    if AILY_WEBHOOK_URL and AILY_WEBHOOK_BEARER_TOKEN:
        print("检测到 Agent Webhook 配置，优先使用 Webhook 调用（推荐）\n")
        try:
            payload = {
                "query": "请查询公司近30天日历安排，并按日期汇总",
                "source": "cn_kis_script_test",
            }
            resp = webhook_request(AILY_WEBHOOK_URL, AILY_WEBHOOK_BEARER_TOKEN, payload)
            print("OK: Webhook 调用成功")
            print(json.dumps(resp, ensure_ascii=False, indent=2)[:1500])
            print("\n=== 测试完成 ===")
            print("说明：当前使用 Agent/Webhook 调用链，不依赖飞书机器人渠道发布。")
            return
        except urllib.error.HTTPError as e:
            err_body = e.read().decode() if e.fp else ""
            print(f"FAIL: Webhook HTTP {e.code}")
            print(f"响应: {err_body[:1200]}")
            print("\n提示：请检查 FEISHU_AILY_WEBHOOK_URL / FEISHU_AILY_WEBHOOK_BEARER_TOKEN 是否来自 Aily 自定义触发器。")
            sys.exit(1)
        except Exception as e:
            print(f"FAIL: Webhook 调用异常: {e}")
            sys.exit(1)

    if USE_USER_TOKEN:
        if not USER_ACCESS_TOKEN:
            print("FAIL: 使用 --use-user-token 时，需配置 FEISHU_USER_ACCESS_TOKEN")
            sys.exit(1)
        token = USER_ACCESS_TOKEN
        print("OK: 使用 user_access_token 调用\n")
    else:
        if not APP_ID or not APP_SECRET or APP_ID == "cli_xxx" or APP_SECRET == "xxx":
            print("FAIL: 未配置智能开发助手凭证")
            print("  请在 deploy/.env.volcengine.plan-a 中填入:")
            print("    FEISHU_APP_ID_DEV_ASSISTANT=cli_xxx")
            print("    FEISHU_APP_SECRET_DEV_ASSISTANT=xxx")
            print("  或使用 --use-secretary 以子衿凭证测试（需 Aily 已发布到子衿）")
            print("  或使用 --use-user-token + FEISHU_USER_ACCESS_TOKEN")
            sys.exit(1)
        label = "子衿" if USE_SECRETARY else "智能开发助手"
        print(f"OK: 已加载{label}凭证 (App ID: {APP_ID[:16]}...)")

        try:
            token = get_tenant_access_token()
            print("OK: tenant_access_token 获取成功\n")
        except Exception as e:
            print(f"FAIL: 获取 tenant_access_token 失败: {e}")
            sys.exit(1)

    if DRY_RUN:
        print("(dry-run 模式，跳过 Aily 调用)")
        print("OK: 凭证验证通过，可进行完整测试")
        sys.exit(0)

    out_ip = get_outbound_ip()
    print(f"当前出口 IP: {out_ip}（仅用于诊断，代码不向飞书传递 IP，飞书从 TCP 连接获取）\n")

    # 尝试 Aily 接口（路径以飞书开放平台文档为准，可能需调整）
    # 参考: open.feishu.cn/document/aily-v1/aily_session/create
    session_id = None

    # 1. 创建会话
    # 注意：代码不传递 IP，飞书服务端从 TCP 连接自动获取客户端 IP
    print(">>> 创建 Aily 会话...")
    try:
        create_paths = [
            "/aily/v1/sessions",
            "/aily/v1/aily_sessions",
            "/aily/v1/aily_session/create",
        ]
        bodies_to_try = [{}]
        if APP_ID:
            bodies_to_try.append({"app_id": APP_ID})
        for path in create_paths:
            for req_body in bodies_to_try:
                try:
                    resp = aily_request("POST", path, token, req_body)
                    # 解析 session_id：可能在 data.session_id、data.id、data.aily_session_id、data 为字符串等
                    data = resp.get("data")
                    session_id = None
                    if isinstance(data, dict):
                        session_id = (
                            data.get("session_id")
                            or data.get("aily_session_id")
                            or data.get("id")
                        )
                    elif isinstance(data, str) and len(data) >= 9:
                        session_id = data  # 部分接口直接返回 id 字符串
                    if resp.get("code") == 0 and session_id:
                        print(f"OK: 会话创建成功 (path={path})")
                        print(f"    session_id: {session_id}")
                        print(f"    响应: {json.dumps(resp, ensure_ascii=False, indent=2)[:600]}...")
                        break
                    # 200 但未解析到 session_id：打印调试信息
                    if resp.get("code") == 0 and not session_id:
                        print(f"    尝试 {path} body={list(req_body.keys()) or ['empty']}: code=0 但未解析到 session_id")
                        print(f"    完整响应: {json.dumps(resp, ensure_ascii=False, indent=2)}")
                    elif resp.get("code") != 0:
                        print(f"    尝试 {path} body={list(req_body.keys()) or ['empty']}: code={resp.get('code')} msg={resp.get('msg', '')[:200]}")
                        print(f"    完整响应: {json.dumps(resp, ensure_ascii=False, indent=2)[:600]}")
                except urllib.error.HTTPError as e:
                    err_body = e.read().decode() if e.fp else ""
                    if e.code == 404:
                        continue
                    print(f"    尝试 {path} body={list(req_body.keys()) or ['empty']}: HTTP {e.code}")
                    print(f"    完整响应: {err_body}")
                    try:
                        err_json = json.loads(err_body)
                        if err_json.get("error", {}).get("troubleshooter"):
                            print(f"    排查建议: {err_json['error']['troubleshooter']}")
                        # 99991401: 解析飞书实际看到的 IP（可能与 get_outbound_ip 不同，因出口路径不同）
                        if "99991401" in err_body:
                            msg = err_json.get("msg", "")
                            m = re.search(r"ip\s+([\d.]+)\s+is denied", msg, re.I)
                            if m:
                                feishu_seen_ip = m.group(1)
                                print(f"    >>> 飞书实际看到的 IP: {feishu_seen_ip}（请将此 IP 加入白名单，而非 get_outbound_ip 结果）")
                    except json.JSONDecodeError:
                        pass
                    if "99991401" in err_body:
                        break  # IP 白名单问题，其他路径同样会失败
                except Exception as e:
                    print(f"    尝试 {path}: {e}")
                if session_id:
                    break
            if session_id:
                break

        if not session_id and AILY_APP_ID and AILY_SKILL_ID:
            # 尝试「调用技能」API：无需会话，单轮调用
            # POST /aily/v1/apps/:app_id/skills/:skill_id/start
            print("\n>>> 尝试调用技能 API（无需会话）...")
            try:
                path = f"/aily/v1/apps/{AILY_APP_ID}/skills/{AILY_SKILL_ID}/start"
                body = {
                    "input": json.dumps({"query": "查询公司近30天日历"}),
                }
                resp = aily_request("POST", path, token, body)
                print(f"    技能 API 响应: code={resp.get('code')} msg={resp.get('msg', '')[:100]}")
                if resp.get("code") == 0:
                    print("OK: 技能调用成功")
                    print(json.dumps(resp, ensure_ascii=False, indent=2))
                else:
                    print(f"    完整响应: {json.dumps(resp, ensure_ascii=False, indent=2)[:600]}")
            except urllib.error.HTTPError as e:
                err_body = e.read().decode() if e.fp else ""
                print(f"    技能 API: HTTP {e.code} - {err_body[:400]}")
            except Exception as e:
                print(f"    技能 API: {e}")

        if not session_id:
            # 若创建会话接口路径不对，尝试直接发消息（部分实现可能合并）
            print("\n>>> 尝试发送消息（部分 Aily 实现可能无需先创建会话）...")
            msg_paths = [
                "/aily/v1/aily_session-aily_message/create",
                "/aily/v1/sessions/0/messages",  # 占位
            ]
            for path in msg_paths:
                try:
                    body = {
                        "content": "查询公司近30天日历",
                        "msg_type": "text",
                    }
                    resp = aily_request("POST", path, token, body)
                    print(f"OK: 消息接口响应 (path={path})")
                    print(json.dumps(resp, ensure_ascii=False, indent=2))
                    break
                except urllib.error.HTTPError as e:
                    err_body = e.read().decode() if e.fp else ""
                    print(f"    尝试 {path}: HTTP {e.code}")
                    if e.code == 400 or e.code == 422:
                        print(f"    响应: {err_body[:300]}")
                except Exception as e:
                    print(f"    尝试 {path}: {e}")

    except Exception as e:
        print(f"FAIL: Aily 调用异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    if session_id:
        # 2. 发送消息：查询公司近30天日历
        # 官方文档: POST /open-apis/aily/v1/sessions/:aily_session_id/messages
        # 必填: idempotent_id, content_type (TEXT|MDX|...), content
        print(f"\n>>> 发送消息: 查询公司近30天日历 (session_id={session_id})...")
        try:
            path = f"/aily/v1/sessions/{session_id}/messages"
            body = {
                "idempotent_id": f"idempotent_{uuid.uuid4().hex[:16]}",
                "content_type": "TEXT",
                "content": "请查询公司近30天的日历安排",
            }
            resp = aily_request("POST", path, token, body)
            print("OK: 消息发送成功")
            print(json.dumps(resp, ensure_ascii=False, indent=2))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode() if e.fp else ""
            print(f"HTTP {e.code}: {err_body[:500]}")
        except Exception as e:
            print(f"FAIL: {e}")

    print("\n=== 测试完成 ===")
    print("提示:")
    print("  0. 若使用 Agent（agent_xxx）且看不到发布渠道，推荐配置 Webhook 触发器并设置：")
    print("     FEISHU_AILY_WEBHOOK_URL / FEISHU_AILY_WEBHOOK_BEARER_TOKEN")
    print("  1. 若遇 2320008：Aily 应用需在 aily.feishu.cn 创建并发布到「智能开发助手」飞书机器人渠道")
    print("  2. 若遇 99991672：应用需开通 aily:session:write 权限")
    print("  3. 若遇 99991401：安全设置 → IP 白名单 添加出口 IP")
    print("  4. 接口文档: https://open.feishu.cn/api-explorer 搜索 aily")


if __name__ == "__main__":
    main()
