#!/usr/bin/env python3
"""
飞书医美信息采集与分析脚本

使用智能开发助手的 tenant_access_token 从飞书全域搜集医美相关信息：
1. 搜索云文档（doc/docx/sheet/bitable/wiki）
2. 遍历知识空间（Wiki）
3. 搜索云空间文件（Drive）
4. 读取匹配文档内容

用法：
  cd CN_KIS_V1.0
  python scripts/collect_medical_beauty_info.py                  # 完整采集
  python scripts/collect_medical_beauty_info.py --dry-run        # 仅验证凭证
  python scripts/collect_medical_beauty_info.py --proxy          # 经火山云代理

本地经火山云代理（免 IP 白名单）：
  1. 终端1: ssh -D 1080 -N root@118.196.64.48
  2. 终端2: python scripts/collect_medical_beauty_info.py --proxy
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlencode

# ============================================================================
# 配置
# ============================================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://open.feishu.cn/open-apis"
OUTPUT_DIR = PROJECT_ROOT / "docs" / "medical_beauty_analysis"

SEARCH_KEYWORDS = [
    "医美",
    "医疗美容",
    "化妆品功效",
    "功效评价",
    "皮肤检测",
    "光电仪器",
    "注射填充",
    "激光美容",
    "皮肤管理",
    "抗衰",
    "美容仪器",
    "人体功效",
    "化妆品人体功效评价",
    "皮肤屏障",
    "保湿功效",
    "美白功效",
    "祛痘",
    "祛斑",
    "防晒",
    "长宁",
    "医美实验室",
    "CRO 医美",
    "化妆品检测",
    "VISIA",
    "皮肤测试",
]

# ============================================================================
# 代理 & 环境变量
# ============================================================================

def init_proxy():
    """初始化 SOCKS5 代理（经火山云出口避免 IP 白名单）"""
    proxy_url = os.environ.get("FEISHU_PROXY", "socks5://127.0.0.1:1080")
    try:
        import socks
        p = urlparse(proxy_url)
        host = p.hostname or "127.0.0.1"
        port = p.port or 1080
        socks.set_default_proxy(socks.SOCKS5, host, port)
        import socket
        socket.socket = socks.socksocket
        print(f"[PROXY] 已启用 SOCKS5 代理: {host}:{port}")
        return True
    except ImportError:
        print("[WARN] 未安装 PySocks，请运行: pip install PySocks")
        return False


def load_env():
    """从 deploy/.env.volcengine.plan-a 加载环境变量"""
    env_file = PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a"
    if not env_file.exists():
        print(f"[ERROR] 找不到环境配置: {env_file}")
        sys.exit(1)
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip("'\"")
            os.environ.setdefault(k, v)


# ============================================================================
# 飞书 API 封装
# ============================================================================

_tenant_token_cache: Dict[str, Tuple[str, float]] = {}


def get_tenant_access_token(app_id: str, app_secret: str) -> str:
    """获取 tenant_access_token（带缓存）"""
    cached = _tenant_token_cache.get(app_id)
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
    expire = body.get("expire", 7200)
    _tenant_token_cache[app_id] = (token, time.time() + expire - 300)
    return token


def feishu_request(
    method: str,
    path: str,
    token: str,
    params: Dict = None,
    data: Dict = None,
    timeout: float = 15.0,
) -> Dict:
    """通用飞书 API 请求"""
    url = f"{BASE_URL}/{path.lstrip('/')}"
    if params:
        url += "?" + urlencode(params)
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "CN_KIS_MedBeauty_Collector/1.0")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read().decode())
        return result
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode()
        except Exception:
            pass
        try:
            return json.loads(err_body)
        except Exception:
            return {"code": e.code, "msg": err_body[:500]}


# ============================================================================
# 数据采集功能
# ============================================================================

class FeishuCollector:
    def __init__(self, app_id: str, app_secret: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self.token = ""
        self.results: List[Dict] = []
        self.errors: List[str] = []

    def refresh_token(self):
        self.token = get_tenant_access_token(self.app_id, self.app_secret)

    def _api(self, method: str, path: str, params=None, data=None) -> Dict:
        return feishu_request(method, path, self.token, params=params, data=data)

    # --- 1. 搜索云文档 ---
    def search_docs(self, keyword: str, count: int = 20, offset: int = 0) -> List[Dict]:
        """搜索云文档（使用 suite/docs-api/search/object）"""
        body = {"search_key": keyword, "count": count, "offset": offset}
        resp = self._api("POST", "suite/docs-api/search/object", data=body)
        if resp.get("code") != 0:
            self.errors.append(f"搜索文档 [{keyword}] 失败: code={resp.get('code')} msg={resp.get('msg', '')[:200]}")
            return []
        data = resp.get("data", {})
        docs = data.get("docs_entities", [])
        return docs

    # --- 2. 列出 Wiki 空间 ---
    def list_wiki_spaces(self) -> List[Dict]:
        resp = self._api("GET", "wiki/v2/spaces", params={"page_size": 50})
        if resp.get("code") != 0:
            self.errors.append(f"列出 Wiki 空间失败: {resp.get('msg', '')[:200]}")
            return []
        return resp.get("data", {}).get("items", [])

    # --- 3. 遍历 Wiki 节点 ---
    def get_wiki_nodes(self, space_id: str, parent_token: str = "") -> List[Dict]:
        params: Dict[str, Any] = {"page_size": 50}
        if parent_token:
            params["parent_node_token"] = parent_token
        resp = self._api("GET", f"wiki/v2/spaces/{space_id}/nodes", params=params)
        if resp.get("code") != 0:
            return []
        return resp.get("data", {}).get("items", [])

    # --- 4. 读取文档内容 ---
    def get_document_content(self, doc_token: str) -> str:
        """获取 docx 文档的纯文本内容"""
        resp = self._api("GET", f"docx/v1/documents/{doc_token}/blocks", params={"page_size": 500})
        if resp.get("code") != 0:
            return ""
        blocks = resp.get("data", {}).get("items", [])
        texts = []
        for block in blocks:
            block_type = block.get("block_type", 0)
            # text / heading blocks
            if block_type in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 18, 22):
                elements = []
                for key in ("text", "heading1", "heading2", "heading3", "heading4",
                            "heading5", "heading6", "heading7", "heading8", "heading9",
                            "bullet", "ordered", "code", "quote", "todo", "callout"):
                    content = block.get(key, {})
                    if isinstance(content, dict):
                        elems = content.get("elements", [])
                        for e in elems:
                            tr = e.get("text_run", {})
                            if tr:
                                texts.append(tr.get("content", ""))
                            mr = e.get("mention_doc", {})
                            if mr:
                                texts.append(f'[文档:{mr.get("title", "")}]')
        return "\n".join(t for t in texts if t.strip())

    # --- 5. 搜索 Drive 文件 ---
    def list_drive_files(self, folder_token: str = "") -> List[Dict]:
        params: Dict[str, Any] = {"page_size": 50}
        if folder_token:
            params["folder_token"] = folder_token
        resp = self._api("GET", "drive/v1/files", params=params)
        if resp.get("code") != 0:
            self.errors.append(f"列出 Drive 文件失败: {resp.get('msg', '')[:200]}")
            return []
        return resp.get("data", {}).get("files", [])

    # --- 6. 获取文档元信息 ---
    def get_doc_meta(self, doc_token: str) -> Dict:
        resp = self._api("GET", f"docx/v1/documents/{doc_token}")
        if resp.get("code") != 0:
            return {}
        return resp.get("data", {}).get("document", {})

    # --- 综合采集 ---
    def collect_all(self, keywords: List[str]) -> Dict[str, Any]:
        print("\n" + "=" * 60)
        print("阶段 1/3：搜索云文档")
        print("=" * 60)

        doc_map: Dict[str, Dict] = {}  # token -> info
        for kw in keywords:
            print(f"\n  搜索关键词: {kw}")
            try:
                docs = self.search_docs(kw)
                print(f"    找到 {len(docs)} 个文档")
                for doc in docs:
                    token = doc.get("docs_token", "")
                    if token and token not in doc_map:
                        doc_map[token] = {
                            "title": doc.get("title", ""),
                            "docs_type": doc.get("docs_type", ""),
                            "url": doc.get("url", ""),
                            "owner_id": doc.get("owner_id", ""),
                            "create_time": doc.get("create_time", ""),
                            "update_time": doc.get("update_time", ""),
                            "matched_keywords": [kw],
                        }
                    elif token in doc_map:
                        doc_map[token]["matched_keywords"].append(kw)
            except Exception as e:
                self.errors.append(f"搜索 [{kw}] 异常: {e}")
                print(f"    [ERROR] {e}")

        print(f"\n  去重后共找到 {len(doc_map)} 个独立文档")

        print("\n" + "=" * 60)
        print("阶段 2/3：遍历 Wiki 知识空间")
        print("=" * 60)

        wiki_results: List[Dict] = []
        try:
            spaces = self.list_wiki_spaces()
            print(f"\n  发现 {len(spaces)} 个知识空间")
            for space in spaces:
                sid = space.get("space_id", "")
                sname = space.get("name", "(未命名)")
                print(f"\n  知识空间: [{sname}] (id={sid})")

                try:
                    nodes = self.get_wiki_nodes(sid)
                    print(f"    顶层节点: {len(nodes)} 个")
                    for node in nodes:
                        title = node.get("title", "")
                        node_token = node.get("node_token", "")
                        obj_token = node.get("obj_token", "")
                        obj_type = node.get("obj_type", "")
                        is_relevant = any(kw in title for kw in keywords[:8])  # 用前几个核心关键词
                        if is_relevant:
                            print(f"    ★ 匹配节点: {title}")
                        wiki_results.append({
                            "space_name": sname,
                            "space_id": sid,
                            "title": title,
                            "node_token": node_token,
                            "obj_token": obj_token,
                            "obj_type": obj_type,
                            "relevant": is_relevant,
                        })
                        # 递归一层子节点
                        try:
                            child_nodes = self.get_wiki_nodes(sid, node_token)
                            for child in child_nodes:
                                ctitle = child.get("title", "")
                                child_relevant = any(kw in ctitle for kw in keywords[:8])
                                if child_relevant:
                                    print(f"      ★ 匹配子节点: {ctitle}")
                                wiki_results.append({
                                    "space_name": sname,
                                    "space_id": sid,
                                    "title": ctitle,
                                    "node_token": child.get("node_token", ""),
                                    "obj_token": child.get("obj_token", ""),
                                    "obj_type": child.get("obj_type", ""),
                                    "relevant": child_relevant,
                                    "parent_title": title,
                                })
                        except Exception:
                            pass
                except Exception as e:
                    self.errors.append(f"遍历知识空间 [{sname}] 失败: {e}")
        except Exception as e:
            self.errors.append(f"获取 Wiki 空间失败: {e}")

        relevant_wiki = [w for w in wiki_results if w.get("relevant")]
        print(f"\n  Wiki 中匹配的节点: {len(relevant_wiki)} 个")

        print("\n" + "=" * 60)
        print("阶段 3/3：读取重点文档内容")
        print("=" * 60)

        doc_contents: List[Dict] = []
        docs_to_read = list(doc_map.items())[:30]  # 最多读 30 个
        for i, (token, info) in enumerate(docs_to_read, 1):
            dtype = info.get("docs_type", "")
            title = info.get("title", "(无标题)")
            # docx 类型才能读取 blocks
            if dtype in ("docx", "doc", ""):
                print(f"\n  [{i}/{len(docs_to_read)}] 读取文档: {title}")
                try:
                    content = self.get_document_content(token)
                    if content:
                        doc_contents.append({
                            "token": token,
                            "title": title,
                            "content_preview": content[:2000],
                            "content_length": len(content),
                            "url": info.get("url", ""),
                            "keywords": info.get("matched_keywords", []),
                        })
                        print(f"    内容长度: {len(content)} 字符")
                    else:
                        print(f"    (无可读内容或需要权限)")
                except Exception as e:
                    print(f"    [ERROR] {e}")
            else:
                print(f"\n  [{i}/{len(docs_to_read)}] 跳过非文档类型: {title} (type={dtype})")

        # 读取匹配的 Wiki 节点
        for w in relevant_wiki[:15]:
            obj_token = w.get("obj_token", "")
            obj_type = w.get("obj_type", "")
            title = w.get("title", "")
            if obj_type in ("doc", "docx") and obj_token:
                print(f"\n  读取 Wiki 节点: {title}")
                try:
                    content = self.get_document_content(obj_token)
                    if content:
                        doc_contents.append({
                            "token": obj_token,
                            "title": f"[Wiki] {title}",
                            "content_preview": content[:2000],
                            "content_length": len(content),
                            "keywords": [],
                            "source": "wiki",
                            "space_name": w.get("space_name", ""),
                        })
                        print(f"    内容长度: {len(content)} 字符")
                except Exception as e:
                    print(f"    [ERROR] {e}")

        return {
            "search_docs": doc_map,
            "wiki_nodes": wiki_results,
            "wiki_relevant": relevant_wiki,
            "doc_contents": doc_contents,
            "errors": self.errors,
            "stats": {
                "total_docs_found": len(doc_map),
                "total_wiki_nodes": len(wiki_results),
                "relevant_wiki_nodes": len(relevant_wiki),
                "docs_read": len(doc_contents),
                "keywords_used": len(keywords),
                "errors": len(self.errors),
            },
        }


# ============================================================================
# 分析与报告
# ============================================================================

def analyze_and_report(collected: Dict) -> str:
    """分析采集结果并生成 Markdown 报告"""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    stats = collected.get("stats", {})
    doc_map = collected.get("search_docs", {})
    wiki_relevant = collected.get("wiki_relevant", [])
    doc_contents = collected.get("doc_contents", [])
    errors = collected.get("errors", [])

    lines = [
        f"# 飞书医美信息采集报告",
        f"",
        f"> 采集时间: {now_str}",
        f"> 搜索关键词数: {stats.get('keywords_used', 0)}",
        f"",
        f"## 采集统计",
        f"",
        f"| 指标 | 数量 |",
        f"|---|---|",
        f"| 搜索到的独立文档 | {stats.get('total_docs_found', 0)} |",
        f"| Wiki 节点总数 | {stats.get('total_wiki_nodes', 0)} |",
        f"| 匹配的 Wiki 节点 | {stats.get('relevant_wiki_nodes', 0)} |",
        f"| 成功读取的文档 | {stats.get('docs_read', 0)} |",
        f"| 错误/跳过 | {stats.get('errors', 0)} |",
        f"",
    ]

    # 文档索引
    if doc_map:
        lines.append("## 搜索到的文档清单")
        lines.append("")
        lines.append("| 序号 | 标题 | 类型 | 匹配关键词 | 链接 |")
        lines.append("|---|---|---|---|---|")
        for i, (token, info) in enumerate(doc_map.items(), 1):
            title = info.get("title", "(无标题)").replace("|", "\\|")
            dtype = info.get("docs_type", "?")
            kws = ", ".join(info.get("matched_keywords", [])[:3])
            url = info.get("url", "")
            link = f"[打开]({url})" if url else "-"
            lines.append(f"| {i} | {title} | {dtype} | {kws} | {link} |")
        lines.append("")

    # Wiki 匹配节点
    if wiki_relevant:
        lines.append("## 匹配的 Wiki 知识节点")
        lines.append("")
        lines.append("| 序号 | 知识空间 | 标题 | 类型 |")
        lines.append("|---|---|---|---|")
        for i, w in enumerate(wiki_relevant, 1):
            sname = w.get("space_name", "")
            title = w.get("title", "").replace("|", "\\|")
            otype = w.get("obj_type", "?")
            parent = w.get("parent_title", "")
            full_title = f"{parent} > {title}" if parent else title
            lines.append(f"| {i} | {sname} | {full_title} | {otype} |")
        lines.append("")

    # 文档内容摘要
    if doc_contents:
        lines.append("## 文档内容摘要")
        lines.append("")
        for i, dc in enumerate(doc_contents, 1):
            title = dc.get("title", "(无标题)")
            content = dc.get("content_preview", "")
            length = dc.get("content_length", 0)
            kws = dc.get("keywords", [])
            source = dc.get("source", "search")
            space = dc.get("space_name", "")
            lines.append(f"### {i}. {title}")
            lines.append(f"")
            lines.append(f"- 来源: {'Wiki - ' + space if source == 'wiki' else '云文档搜索'}")
            lines.append(f"- 内容长度: {length} 字符")
            if kws:
                lines.append(f"- 匹配关键词: {', '.join(kws)}")
            lines.append(f"")
            if content:
                lines.append("```")
                lines.append(content[:1500])
                if length > 1500:
                    lines.append(f"\n... (共 {length} 字符，已截断)")
                lines.append("```")
            lines.append("")

    # 内容分析
    lines.append("## 信息分类分析")
    lines.append("")
    categories = {
        "化妆品功效评价": ["功效评价", "人体功效", "保湿", "美白", "祛痘", "祛斑", "防晒", "皮肤屏障"],
        "医美技术与设备": ["光电", "激光", "注射", "仪器", "VISIA", "皮肤检测"],
        "医美项目运营": ["医美", "医疗美容", "长宁", "实验室", "CRO"],
        "皮肤管理": ["皮肤管理", "抗衰", "皮肤测试"],
        "行业法规与标准": ["化妆品", "检测", "标准"],
    }
    for cat_name, cat_kws in categories.items():
        matched_docs = []
        for token, info in doc_map.items():
            title = info.get("title", "")
            doc_kws = info.get("matched_keywords", [])
            if any(ck in title or ck in " ".join(doc_kws) for ck in cat_kws):
                matched_docs.append(info)
        for dc in doc_contents:
            ct = dc.get("content_preview", "")
            if any(ck in ct for ck in cat_kws):
                if not any(d.get("title") == dc.get("title") for d in matched_docs):
                    matched_docs.append(dc)

        lines.append(f"### {cat_name} ({len(matched_docs)} 项)")
        if matched_docs:
            for doc in matched_docs[:10]:
                lines.append(f"- {doc.get('title', '(无标题)')}")
        else:
            lines.append("- (未找到相关文档)")
        lines.append("")

    # 错误记录
    if errors:
        lines.append("## 采集错误记录")
        lines.append("")
        for err in errors:
            lines.append(f"- {err}")
        lines.append("")

    lines.append("---")
    lines.append(f"*报告由 CN_KIS_V1.0 医美信息采集脚本自动生成*")
    return "\n".join(lines)


# ============================================================================
# 主入口
# ============================================================================

def main():
    DRY_RUN = "--dry-run" in sys.argv
    USE_PROXY = "--proxy" in sys.argv

    print("=" * 60)
    print("飞书医美信息采集与分析")
    print("=" * 60)

    load_env()

    if USE_PROXY:
        if not init_proxy():
            print("[WARN] 代理初始化失败，尝试直连")

    app_id = os.getenv("FEISHU_APP_ID_DEV_ASSISTANT") or os.getenv("FEISHU_APP_ID")
    app_secret = os.getenv("FEISHU_APP_SECRET_DEV_ASSISTANT") or os.getenv("FEISHU_APP_SECRET")

    if not app_id or not app_secret or app_id == "cli_xxx":
        print("[ERROR] 未找到有效的飞书应用凭证")
        sys.exit(1)

    print(f"[OK] 应用凭证已加载 (App ID: {app_id[:12]}...)")

    collector = FeishuCollector(app_id, app_secret)

    try:
        collector.refresh_token()
        print("[OK] tenant_access_token 获取成功")
    except Exception as e:
        print(f"[FAIL] 获取 tenant_access_token 失败: {e}")
        print("\n提示: 如果是 IP 白名单问题，请使用 --proxy 参数经火山云代理")
        sys.exit(1)

    if DRY_RUN:
        print("\n[DRY-RUN] 凭证验证通过，跳过实际采集")
        sys.exit(0)

    # 执行采集
    collected = collector.collect_all(SEARCH_KEYWORDS)

    # 生成报告
    print("\n" + "=" * 60)
    print("生成分析报告...")
    print("=" * 60)

    report = analyze_and_report(collected)

    # 保存报告
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report_file = OUTPUT_DIR / f"feishu_medical_beauty_report_{datetime.now().strftime('%Y%m%d_%H%M')}.md"
    report_file.write_text(report, encoding="utf-8")
    print(f"\n[OK] 报告已保存: {report_file}")

    # 保存原始数据
    raw_file = OUTPUT_DIR / f"feishu_medical_beauty_raw_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
    json_safe = {
        "stats": collected.get("stats", {}),
        "search_docs": {k: v for k, v in collected.get("search_docs", {}).items()},
        "wiki_relevant": collected.get("wiki_relevant", []),
        "doc_contents": [
            {k: v for k, v in dc.items() if k != "content_preview" or len(str(v)) < 3000}
            for dc in collected.get("doc_contents", [])
        ],
        "errors": collected.get("errors", []),
    }
    raw_file.write_text(json.dumps(json_safe, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] 原始数据已保存: {raw_file}")

    # 打印统计摘要
    stats = collected.get("stats", {})
    print(f"\n{'=' * 60}")
    print(f"采集完成!")
    print(f"  - 搜索到独立文档: {stats.get('total_docs_found', 0)}")
    print(f"  - Wiki 匹配节点: {stats.get('relevant_wiki_nodes', 0)}")
    print(f"  - 成功读取文档: {stats.get('docs_read', 0)}")
    print(f"  - 错误数: {stats.get('errors', 0)}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
