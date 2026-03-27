#!/usr/bin/env python3
"""快速接口测试（跳过 PDF 检查，只验证所有 HTTP 端点）"""
import json, os, sys, time
import urllib.request, urllib.error

BASE = "http://127.0.0.1:5000"
PASS = 0; FAIL = 0
FAIL_LOG = []
G="\033[32m"; R="\033[31m"; Y="\033[33m"; B="\033[34m"; E="\033[0m"

def ok(label, detail=""): global PASS; PASS+=1; print(f"{G}  ✅  {label}{E}  {detail}")
def fail(label, detail=""): global FAIL; FAIL+=1; FAIL_LOG.append(f"{label} {detail}"); print(f"{R}  ❌  {label}  {detail}{E}")

def get(path, timeout=10):
    try:
        with urllib.request.urlopen(f"{BASE}{path}", timeout=timeout) as r:
            return r.status, r.read().decode("utf-8","replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8","replace")
    except Exception as ex:
        return 0, str(ex)

def post_json(path, data, timeout=10):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=body,
        headers={"Content-Type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8","replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8","replace")
    except Exception as ex:
        return 0, str(ex)

def delete(path, timeout=10):
    req = urllib.request.Request(f"{BASE}{path}", method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8","replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8","replace")
    except Exception as ex:
        return 0, str(ex)

def j(b):
    try: return json.loads(b)
    except: return {}

print(f"\n{B}══════════════════════════════{E}")
print(f"{B}  快速接口测试（跳过 PDF）{E}")
print(f"  {time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"{B}══════════════════════════════{E}\n")

# 1. 基础页面
print(f"{B}▶ 1. 基础页面{E}")
h,_ = get("/"); (ok if h==200 else fail)("GET /", f"[HTTP {h}]")
h,_ = get("/admin"); (ok if h==200 else fail)("GET /admin", f"[HTTP {h}]")

# 2. 用户身份
print(f"\n{B}▶ 2. 用户身份{E}")
h,b = get("/api/me"); d=j(b)
if h==200 and d.get("is_admin") is True: ok("GET /api/me  is_admin=True", f"[user={d.get('display_name','')}]")
elif h==200: fail("GET /api/me  is_admin 非 True", b[:150])
else: fail("GET /api/me", f"[HTTP {h}]")
h,_ = get("/api/auth/me"); (ok if h==200 else fail)("GET /api/auth/me", f"[HTTP {h}]")

# 3. 任务轮询（无效 ID）
print(f"\n{B}▶ 3. 任务轮询接口{E}")
h,b = get("/api/job/nonexistent-id-000"); d=j(b)
if h in (200,404) and (d.get("error") or h==404):
    ok("GET /api/job/<invalid_id>", f"[HTTP {h}, error字段存在]")
elif h == 200:
    ok("GET /api/job/<invalid_id>", f"[HTTP {h}]")
else:
    fail("GET /api/job/<invalid_id>", f"[HTTP {h}]")

# 4. 日志管理
print(f"\n{B}▶ 4. 日志管理{E}")
h,b = post_json("/api/log-download",{"module_id":"005","saved_as":"quick_test.txt","document_filename":"quick.pdf"}); d=j(b)
if h==200 and d.get("ok"): ok("POST /api/log-download", f"[id={d.get('id','')}]")
else: fail("POST /api/log-download", f"[HTTP {h}] {b[:150]}")
h,b = get("/api/log-downloads?limit=5"); d=j(b)
if h==200 and "items" in d: ok("GET /api/log-downloads", f"[{len(d['items'])} 条]")
else: fail("GET /api/log-downloads", f"[HTTP {h}]")

# 5. 用户反馈
print(f"\n{B}▶ 5. 用户反馈{E}")
h,b = post_json("/api/feedback",{"module_id":"005","document_filename":"quick.pdf","issue_index":0,"is_accurate":False,"accurate_content":"快速测试"}); d=j(b)
if h==200 and d.get("ok"): ok("POST /api/feedback", f"[key={d.get('issue_key','')}]")
else: fail("POST /api/feedback", f"[HTTP {h}] {b[:150]}")

# 6. 管理员接口
print(f"\n{B}▶ 6. 管理员接口{E}")
admin_endpoints = [
    ("/api/admin/usage-stats",                     "usage-stats"),
    ("/api/admin/usage-logs?limit=5",              "usage-logs"),
    ("/api/admin/stats/trend?days=7",              "stats/trend"),
    ("/api/admin/rules-pending-review?limit=5",    "rules-pending-review (json)"),
    ("/api/admin/rules-pending-review?format=csv&limit=5","rules-pending-review (csv)"),
    ("/api/admin/samples-by-category?category=M10&limit=5","samples-by-category"),
    ("/api/admin/batch-download-logs?limit=5",     "batch-download-logs"),
]
for ep, label in admin_endpoints:
    h,b = get(ep, timeout=15)
    (ok if h==200 else fail)(f"GET {ep.split('?')[0]}", f"[HTTP {h}]")

# 7. 删除接口
print(f"\n{B}▶ 7. 删除接口{E}")
h,b = delete("/api/admin/delete-log/nonexistent-smoke-id")
(ok if h==200 else fail)("DELETE /api/admin/delete-log/<id>", f"[HTTP {h}]")
h,b = delete("/api/admin/delete-download/nonexistent-smoke-id")
(ok if h==200 else fail)("DELETE /api/admin/delete-download/<id>", f"[HTTP {h}]")

# 8. Agent 接口
print(f"\n{B}▶ 8. Agent 接口{E}")
h,_ = get("/api/agent/inspection-logs?limit=5"); (ok if h==200 else fail)("GET /api/agent/inspection-logs", f"[HTTP {h}]")
h,_ = get("/api/agent/inspection-logs/daily-summary"); (ok if h==200 else fail)("GET /api/agent/inspection-logs/daily-summary", f"[HTTP {h}]")

# 汇总
print(f"\n{B}══════════════════════════════{E}")
print(f"  {time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"{G}  ✅ 通过：{PASS}{E}")
print(f"{R if FAIL else ''}  ❌ 失败：{FAIL}{E if FAIL else ''}")
if FAIL_LOG:
    print(f"\n{R}── 失败明细 ──{E}")
    for i in FAIL_LOG: print(f"{R}  • {i}{E}")
    sys.exit(1)
else:
    print(f"\n{G}🎉  全部通过！{E}\n")
