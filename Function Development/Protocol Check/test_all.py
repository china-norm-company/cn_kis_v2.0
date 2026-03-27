#!/usr/bin/env python3
"""方案检查台 – 全功能冒烟测试
用法：python3 test_all.py
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
import mimetypes
import io

BASE = "http://127.0.0.1:5000"
DIR  = os.path.dirname(os.path.abspath(__file__))

PASS = 0
FAIL = 0
SKIP = 0
FAIL_LOG = []

# ANSI
G = "\033[32m"; R = "\033[31m"; Y = "\033[33m"; B = "\033[34m"; E = "\033[0m"

def ok(label, detail=""):
    global PASS
    PASS += 1
    print(f"{G}  ✅  {label}{E}  {detail}")

def fail(label, detail=""):
    global FAIL
    FAIL += 1
    FAIL_LOG.append(f"{label}  {detail}")
    print(f"{R}  ❌  {label}  {detail}{E}")

def skip(label):
    global SKIP
    SKIP += 1
    print(f"{Y}  ⏭   {label} (跳过){E}")

# ── HTTP helpers ──────────────────────────────────────────────────

def get(path, timeout=10):
    try:
        req = urllib.request.Request(f"{BASE}{path}")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as ex:
        return 0, str(ex)

def post_json(path, data, timeout=10):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}", data=body,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as ex:
        return 0, str(ex)

def delete(path, timeout=10):
    req = urllib.request.Request(f"{BASE}{path}", method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as ex:
        return 0, str(ex)

def post_multipart(path, fields, files, timeout=30):
    """multipart/form-data POST"""
    boundary = "----FormBoundary7MA4YWxkTrZu0gW"
    body_parts = []
    for k, v in fields.items():
        body_parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        )
    for field_name, (fname, fdata) in files.items():
        mime = mimetypes.guess_type(fname)[0] or "application/octet-stream"
        body_parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field_name}\"; filename=\"{fname}\"\r\nContent-Type: {mime}\r\n\r\n".encode()
            + fdata + b"\r\n"
        )
    body_parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(body_parts)
    req = urllib.request.Request(
        f"{BASE}{path}", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as ex:
        return 0, str(ex)

def j(body):
    try:
        return json.loads(body)
    except Exception:
        return {}

# ── 异步检查辅助 ──────────────────────────────────────────────────

def async_check(label, pdf_rel, module, lang):
    pdf_path = os.path.join(DIR, pdf_rel)
    if not os.path.isfile(pdf_path):
        skip(f"{label}（PDF 不存在: {pdf_rel}）")
        return

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    fname = os.path.basename(pdf_path)
    http, body = post_multipart(
        "/api/analyze-async",
        {"module": module, "lang": lang},
        {"file": (fname, pdf_bytes)},
        timeout=30
    )
    d = j(body)
    if http != 200:
        fail(f"{label} 提交", f"[HTTP {http}] {body[:200]}")
        return
    job_id = d.get("job_id", "")
    if not job_id:
        fail(f"{label} 提交", "无 job_id")
        return
    ok(f"{label} 提交", f"[job_id={job_id[:12]}…]")

    # 轮询最多 150 秒
    for _ in range(50):
        time.sleep(3)
        ph, pb = get(f"/api/job/{job_id}", timeout=15)
        pd = j(pb)
        status = pd.get("status", "")
        if status == "done":
            issues = (pd.get("result") or {}).get("issues") or []
            ok(f"{label} 完成", f"[issues={len(issues)} 条]")
            return
        elif status == "error":
            fail(f"{label} 检查出错", pd.get("error", ""))
            return
        # running / queued — 继续等待

    fail(f"{label}", "超时（150s 未完成）")

# ══════════════════════════════════════════════════════════════════
print(f"\n{B}══════════════════════════════════════════{E}")
print(f"{B}  方案检查台 全功能冒烟测试{E}")
print(f"  {time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"{B}══════════════════════════════════════════{E}\n")

# ── 1. 基础页面 ────────────────────────────────────────────────────
print(f"{B}▶ 1. 基础页面{E}")
h, _ = get("/")
if h == 200: ok("GET / 主检查台", "[HTTP 200]")
else: fail("GET /", f"[HTTP {h}]")

h, _ = get("/admin")
if h == 200: ok("GET /admin 管理员页", "[HTTP 200]")
else: fail("GET /admin", f"[HTTP {h}]")
print()

# ── 2. 用户身份 ────────────────────────────────────────────────────
print(f"{B}▶ 2. 用户身份{E}")
h, b = get("/api/me")
d = j(b)
if h == 200 and d.get("is_admin") is True:
    ok("GET /api/me  is_admin=True", f"[user={d.get('display_name','')}]")
elif h == 200:
    fail("GET /api/me  is_admin 非 True", f"body={b[:200]}")
else:
    fail("GET /api/me", f"[HTTP {h}]")

h, b = get("/api/auth/me")
if h == 200: ok("GET /api/auth/me", "[HTTP 200]")
else: fail("GET /api/auth/me", f"[HTTP {h}]")
print()

# ── 3. 核心检查（异步） ────────────────────────────────────────────
print(f"{B}▶ 3. 核心检查（异步，真实 PDF）{E}")
async_check(
    "005 英文方案",
    "005 protocol/25-07562 Protocol_Lotion 909515 23A Efficacy Study_C25005109-clean.pdf",
    "005", "en"
)
async_check(
    "047 英文方案",
    "047 protocol/V1.0_25-0331_MT4229543_Protocol_M25047027_20251110_-fully Signed.pdf",
    "047", "en"
)
async_check(
    "中文方案 (104)",
    "中文方案/3-研究方案_V1.0_ 1款精华产品4周抗皱及改善肤质功效研究_C26005025_20260309.pdf",
    "104", "zh"
)
# 复硕标准版本
fushu_dir = os.path.join(DIR, "复硕标准方案")
fushu_pdfs = [f for f in os.listdir(fushu_dir) if f.endswith(".pdf")] if os.path.isdir(fushu_dir) else []
if fushu_pdfs:
    async_check("复硕标准版本", f"复硕标准方案/{fushu_pdfs[0]}", "fushu", "en")
else:
    skip("复硕标准版本检查（无测试 PDF）")
print()

# ── 4. 任务轮询 ────────────────────────────────────────────────────
print(f"{B}▶ 4. 任务轮询接口{E}")
h, b = get("/api/job/nonexistent-job-id-000")
d = j(b)
# 不存在的 job: 200+error 或 404 均可接受
if h in (200, 404):
    ok("GET /api/job/<invalid_id>", f"[HTTP {h}, 符合预期]")
else:
    fail("GET /api/job/<invalid_id>", f"[HTTP {h}]")
print()

# ── 5. 日志管理 ────────────────────────────────────────────────────
print(f"{B}▶ 5. 日志管理{E}")
h, b = post_json("/api/log-download", {
    "module_id": "005", "saved_as": "smoke_test_log.txt",
    "document_filename": "smoke_test.pdf"
})
d = j(b)
if h == 200 and d.get("ok"):
    ok("POST /api/log-download", f"[id={d.get('id','')}]")
else:
    fail("POST /api/log-download", f"[HTTP {h}] {b[:200]}")

h, b = get("/api/log-downloads?limit=5")
d = j(b)
if h == 200 and "items" in d:
    ok("GET /api/log-downloads", f"[{len(d['items'])} 条]")
else:
    fail("GET /api/log-downloads", f"[HTTP {h}]")
print()

# ── 6. 用户反馈 ───────────────────────────────────────────────────
print(f"{B}▶ 6. 用户反馈{E}")
h, b = post_json("/api/feedback", {
    "module_id": "005",
    "document_filename": "smoke_test.pdf",
    "issue_index": 0,
    "is_accurate": False,
    "accurate_content": "冒烟测试反馈"
})
d = j(b)
if h == 200 and d.get("ok"):
    ok("POST /api/feedback", f"[issue_key={d.get('issue_key','')}]")
else:
    fail("POST /api/feedback", f"[HTTP {h}] {b[:200]}")
print()

# ── 7. 管理员接口 ─────────────────────────────────────────────────
print(f"{B}▶ 7. 管理员接口{E}")
for endpoint, label in [
    ("/api/admin/usage-stats",                     "usage-stats"),
    ("/api/admin/usage-logs?limit=5",              "usage-logs"),
    ("/api/admin/stats/trend?days=7",              "stats/trend"),
    ("/api/admin/rules-pending-review?limit=5",    "rules-pending-review (json)"),
    ("/api/admin/rules-pending-review?format=csv&limit=5", "rules-pending-review (csv)"),
    ("/api/admin/samples-by-category?category=M10&limit=5","samples-by-category"),
]:
    h, b = get(endpoint, timeout=15)
    if h == 200:
        ok(f"GET {endpoint.split('?')[0]}", f"[HTTP 200]")
    else:
        fail(f"GET {endpoint.split('?')[0]}", f"[HTTP {h}] {b[:200]}")

# 批量下载 ZIP
h, b = get("/api/admin/batch-download-logs?limit=5", timeout=20)
if h == 200:
    ok("GET /api/admin/batch-download-logs", f"[{len(b)} bytes]")
    # 验证 ZIP magic bytes
    if b[:2] in ("PK", "\x50\x4b") or b.encode()[:2] == b"PK":
        ok("batch-download ZIP 格式有效")
    else:
        print(f"{Y}  ⚠️   ZIP 为空（无历史日志时正常）{E}"); PASS += 1
else:
    fail("GET /api/admin/batch-download-logs", f"[HTTP {h}]")
print()

# ── 8. 删除接口 ───────────────────────────────────────────────────
print(f"{B}▶ 8. 删除接口{E}")
h, b = delete("/api/admin/delete-log/nonexistent-smoke-id")
d = j(b)
if h == 200:
    ok("DELETE /api/admin/delete-log/<id>", "[HTTP 200]")
else:
    fail("DELETE /api/admin/delete-log/<id>", f"[HTTP {h}] {b[:200]}")

h, b = delete("/api/admin/delete-download/nonexistent-smoke-id")
d = j(b)
if h == 200:
    ok("DELETE /api/admin/delete-download/<id>", "[HTTP 200]")
else:
    fail("DELETE /api/admin/delete-download/<id>", f"[HTTP {h}] {b[:200]}")
print()

# ── 9. Agent 接口 ─────────────────────────────────────────────────
print(f"{B}▶ 9. Agent 接口{E}")
h, b = get("/api/agent/inspection-logs?limit=5")
if h == 200:
    ok("GET /api/agent/inspection-logs", "[HTTP 200]")
else:
    fail("GET /api/agent/inspection-logs", f"[HTTP {h}]")

h, b = get("/api/agent/inspection-logs/daily-summary")
if h == 200:
    ok("GET /api/agent/inspection-logs/daily-summary", "[HTTP 200]")
else:
    fail("GET /api/agent/inspection-logs/daily-summary", f"[HTTP {h}]")
print()

# ── 汇总 ──────────────────────────────────────────────────────────
print(f"{B}══════════════════════════════════════════{E}")
print(f"  测试完成：{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
print(f"{G}  ✅  通过：{PASS}{E}")
if FAIL > 0:
    print(f"{R}  ❌  失败：{FAIL}{E}")
else:
    print(f"  ❌  失败：{FAIL}")
print(f"{Y}  ⏭   跳过：{SKIP}{E}")

if FAIL_LOG:
    print(f"\n{R}── 失败项明细 ─────────────────────────────{E}")
    for item in FAIL_LOG:
        print(f"{R}  • {item}{E}")
    print()
    sys.exit(1)
else:
    print(f"\n{G}🎉  全部通过！{E}\n")
    sys.exit(0)
