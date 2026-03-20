#!/usr/bin/env python3
"""
飞书多维表格（Bitable）医美信息深度采集

针对第一轮搜索发现的关键多维表格，读取其表结构和数据记录。

用法：
  cd CN_KIS_V1.0
  python scripts/collect_medical_beauty_bitable.py
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import urlencode

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://open.feishu.cn/open-apis"
OUTPUT_DIR = PROJECT_ROOT / "docs" / "medical_beauty_analysis"

PRIORITY_BITABLES = [
    ("JQ7cbRlTRaulPmsJu8rcLLPCnIh", "客户关系管理系统"),
    ("bascnUx51094FhBpHq0aT8zv5kb", "美容美体连锁管理"),
    ("bascn6rP5I8x9h6zmEbqinc7BIb", "库存管理"),
    ("KbZIbHsPIa9jyqsTtuqcQG3Rn6b", "客户之声分析系统 副本"),
    ("NKYsbT0HTadS60skoGHctU3anDd", "任务管理"),
    ("Lr1mbxPTOaMJEVsjhmBcbNWpnF1", "线上/线下活动数据分析"),
    ("DwyQbW9nAa2BwwseRExcqKQhnnw", "年会礼品投票"),
]

SEARCH_KEYWORDS = [
    "医美", "医疗美容", "功效评价", "皮肤", "抗衰", "美容",
    "化妆品", "防晒", "保湿", "长宁", "检测", "仪器",
]


def load_env():
    env_file = PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a"
    if not env_file.exists():
        sys.exit(f"[ERROR] 找不到: {env_file}")
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


_token_cache: Dict[str, Tuple[str, float]] = {}

def get_token(app_id: str, app_secret: str) -> str:
    cached = _token_cache.get(app_id)
    if cached and time.time() < cached[1]:
        return cached[0]
    url = f"{BASE_URL}/auth/v3/tenant_access_token/internal"
    data = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read().decode())
    if body.get("code") != 0:
        raise RuntimeError(f"获取 token 失败: {body}")
    token = body["tenant_access_token"]
    _token_cache[app_id] = (token, time.time() + body.get("expire", 7200) - 300)
    return token


def api(method: str, path: str, token: str, params=None, data=None, timeout=15.0) -> Dict:
    url = f"{BASE_URL}/{path.lstrip('/')}"
    if params:
        url += "?" + urlencode(params)
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err = ""
        try:
            err = e.read().decode()
        except Exception:
            pass
        try:
            return json.loads(err)
        except Exception:
            return {"code": e.code, "msg": err[:500]}


def list_tables(token: str, app_token: str) -> List[Dict]:
    resp = api("GET", f"bitable/v1/apps/{app_token}/tables", token, params={"page_size": 100})
    if resp.get("code") != 0:
        return []
    return resp.get("data", {}).get("items", [])


def list_fields(token: str, app_token: str, table_id: str) -> List[Dict]:
    resp = api("GET", f"bitable/v1/apps/{app_token}/tables/{table_id}/fields", token, params={"page_size": 100})
    if resp.get("code") != 0:
        return []
    return resp.get("data", {}).get("items", [])


def list_records(token: str, app_token: str, table_id: str, page_size: int = 50) -> List[Dict]:
    resp = api("GET", f"bitable/v1/apps/{app_token}/tables/{table_id}/records", token,
               params={"page_size": page_size})
    if resp.get("code") != 0:
        return []
    return resp.get("data", {}).get("items", [])


def extract_cell_text(value: Any) -> str:
    """从 bitable cell value 中提取可读文本"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict):
                parts.append(item.get("text", "") or item.get("name", "") or item.get("val", "") or str(item))
            elif isinstance(item, str):
                parts.append(item)
        return ", ".join(parts) if parts else str(value)
    if isinstance(value, dict):
        return value.get("text", "") or value.get("name", "") or value.get("val", "") or json.dumps(value, ensure_ascii=False)[:200]
    return str(value)[:200]


def scan_bitable(token: str, app_token: str, bitable_name: str) -> Dict:
    """扫描一个 bitable 的全部表、字段和数据"""
    result = {
        "name": bitable_name,
        "app_token": app_token,
        "tables": [],
        "relevant_records": [],
        "error": None,
    }

    tables = list_tables(token, app_token)
    if not tables:
        result["error"] = "无法获取表列表（可能无权限）"
        return result

    print(f"    发现 {len(tables)} 个数据表")

    for tbl in tables:
        table_id = tbl.get("table_id", "")
        table_name = tbl.get("name", "(未命名)")
        table_info = {"table_id": table_id, "name": table_name, "fields": [], "record_count": 0}

        fields = list_fields(token, app_token, table_id)
        field_names = [f.get("field_name", "") for f in fields]
        table_info["fields"] = field_names
        print(f"      表: {table_name} | 字段: {', '.join(field_names[:8])}")

        records = list_records(token, app_token, table_id, page_size=100)
        table_info["record_count"] = len(records)

        for rec in records:
            rec_fields = rec.get("fields", {})
            row_texts = []
            for fname, fval in rec_fields.items():
                text = extract_cell_text(fval)
                if text:
                    row_texts.append(f"{fname}: {text}")

            row_str = " | ".join(row_texts)
            is_relevant = any(kw in row_str for kw in SEARCH_KEYWORDS)
            if is_relevant:
                result["relevant_records"].append({
                    "table": table_name,
                    "record_id": rec.get("record_id", ""),
                    "fields": {k: extract_cell_text(v) for k, v in rec_fields.items()},
                    "matched": [kw for kw in SEARCH_KEYWORDS if kw in row_str],
                })

        result["tables"].append(table_info)

    return result


def main():
    print("=" * 60)
    print("飞书多维表格（Bitable）医美信息深度采集")
    print("=" * 60)

    load_env()
    app_id = os.getenv("FEISHU_APP_ID_DEV_ASSISTANT") or os.getenv("FEISHU_APP_ID")
    app_secret = os.getenv("FEISHU_APP_SECRET_DEV_ASSISTANT") or os.getenv("FEISHU_APP_SECRET")
    if not app_id or not app_secret:
        sys.exit("[ERROR] 未找到飞书凭证")

    token = get_token(app_id, app_secret)
    print(f"[OK] tenant_access_token 已获取\n")

    all_results = []
    for bitable_token, bitable_name in PRIORITY_BITABLES:
        print(f"\n  扫描: {bitable_name} ({bitable_token})")
        try:
            result = scan_bitable(token, bitable_token, bitable_name)
            all_results.append(result)
            if result.get("error"):
                print(f"    [WARN] {result['error']}")
            else:
                rel_count = len(result.get("relevant_records", []))
                print(f"    匹配记录: {rel_count} 条")
        except Exception as e:
            print(f"    [ERROR] {e}")
            all_results.append({"name": bitable_name, "error": str(e)})

    # 生成报告
    print("\n" + "=" * 60)
    print("生成 Bitable 深度分析报告...")
    print("=" * 60)

    report_lines = [
        "# 飞书多维表格（Bitable）医美信息深度分析",
        "",
        f"> 采集时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"> 扫描的多维表格数: {len(PRIORITY_BITABLES)}",
        "",
    ]

    total_relevant = 0
    for r in all_results:
        name = r.get("name", "")
        tables = r.get("tables", [])
        relevant = r.get("relevant_records", [])
        error = r.get("error")
        total_relevant += len(relevant)

        report_lines.append(f"## {name}")
        report_lines.append("")

        if error:
            report_lines.append(f"**状态**: 访问失败 - {error}")
            report_lines.append("")
            continue

        report_lines.append(f"**数据表数量**: {len(tables)}")
        report_lines.append("")

        if tables:
            report_lines.append("| 数据表 | 字段 | 记录数 |")
            report_lines.append("|---|---|---|")
            for t in tables:
                fields_str = ", ".join(t.get("fields", [])[:6])
                if len(t.get("fields", [])) > 6:
                    fields_str += f" (+{len(t['fields']) - 6})"
                report_lines.append(f"| {t['name']} | {fields_str} | {t.get('record_count', 0)} |")
            report_lines.append("")

        if relevant:
            report_lines.append(f"### 匹配的医美相关记录 ({len(relevant)} 条)")
            report_lines.append("")
            for i, rec in enumerate(relevant[:20], 1):
                report_lines.append(f"**记录 {i}** (表: {rec.get('table', '')}, 匹配: {', '.join(rec.get('matched', []))})")
                report_lines.append("")
                for fname, fval in rec.get("fields", {}).items():
                    if fval and str(fval).strip():
                        report_lines.append(f"- **{fname}**: {str(fval)[:300]}")
                report_lines.append("")
        else:
            report_lines.append("*未发现与医美直接相关的记录*")
            report_lines.append("")

    report_lines.append("---")
    report_lines.append(f"*共扫描 {len(all_results)} 个多维表格，发现 {total_relevant} 条医美相关记录*")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    report_file = OUTPUT_DIR / f"bitable_deep_analysis_{ts}.md"
    report_file.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"\n[OK] 报告已保存: {report_file}")

    raw_file = OUTPUT_DIR / f"bitable_deep_raw_{ts}.json"
    raw_file.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] 原始数据已保存: {raw_file}")

    print(f"\n总计医美相关记录: {total_relevant} 条")


if __name__ == "__main__":
    main()
