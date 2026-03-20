#!/usr/bin/env python3
"""
最小飞书连接器测试服务（不依赖旧后端代码）。

能力：
1) 调用服务器 feishu-connector 执行 sync_baseline
2) 从服务器 PostgreSQL 随机抽取最近30天内一个工作日
3) 返回该日按 source_type 的统计与样例

运行：
  python3 scripts/mini_feishu_connector_web.py
默认监听：
  http://0.0.0.0:8001
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a"
SECRETS_FILE = PROJECT_ROOT / "deploy" / "secrets.env"


def load_env(path: Path) -> Dict[str, str]:
    data: Dict[str, str] = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip("'").strip('"')
    return data


def parse_database_url(database_url: str) -> Tuple[str, str, str, str, str]:
    # postgresql+asyncpg://user:pass@host:5432/db
    normalized = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    parsed = urlparse(normalized)
    if not (parsed.hostname and parsed.username and parsed.password and parsed.path):
        raise ValueError("DATABASE_URL 解析失败")
    return (
        parsed.hostname,
        str(parsed.port or 5432),
        parsed.username,
        parsed.password,
        parsed.path.lstrip("/"),
    )


class MiniService:
    def __init__(self) -> None:
        env = load_env(ENV_FILE)
        secrets = load_env(SECRETS_FILE)

        # 执行模式：
        # - local: 直接在本机执行 curl/psql（用于部署在服务器上时，避免 SSH 回连）
        # - remote: 通过 SSH 在远端执行（用于本地开发机访问服务器）
        # - auto: secrets 存在且能组成 SSH 凭据则用 remote，否则 local
        exec_mode = (os.getenv("FEISHU_MINI_EXEC_MODE") or "auto").strip().lower()

        self.ssh_host = secrets.get("VOLCENGINE_SSH_HOST", "118.196.64.48")
        self.ssh_user = secrets.get("VOLCENGINE_SSH_USER", "root")
        self.ssh_pass = secrets.get("VOLCENGINE_SSH_PASS", "")
        self.ssh_key = secrets.get("VOLCENGINE_SSH_KEY", "")

        database_url = env.get("DATABASE_URL", "")
        if not database_url:
            raise RuntimeError("缺少 DATABASE_URL")
        self.db_host, self.db_port, self.db_user, self.db_pass, self.db_name = parse_database_url(database_url)

        if exec_mode not in {"auto", "local", "remote"}:
            exec_mode = "auto"
        self.exec_mode = exec_mode
        if self.exec_mode == "auto":
            # 有 SSH 目标且至少提供一种认证材料，才走 remote
            has_auth = bool(self.ssh_pass) or (self.ssh_key and Path(self.ssh_key).exists())
            self.exec_mode = "remote" if (self.ssh_host and has_auth) else "local"

    def _ssh_base(self) -> List[str]:
        args = [
            "ssh",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "ConnectTimeout=10",
        ]
        if self.ssh_key and Path(self.ssh_key).exists():
            args.extend(["-i", self.ssh_key])
        args.append(f"{self.ssh_user}@{self.ssh_host}")
        return args

    def _run_local(self, command: str) -> str:
        proc = subprocess.run(
            ["/bin/bash", "-lc", command],
            capture_output=True,
            text=True,
            check=True,
        )
        return proc.stdout.strip()

    def _run_remote(self, command: str) -> str:
        if self.exec_mode == "local":
            return self._run_local(command)
        if self.ssh_pass and shutil_which("sshpass"):
            base = ["sshpass", "-p", self.ssh_pass] + self._ssh_base()
        else:
            base = self._ssh_base()
        proc = subprocess.run(base + [command], capture_output=True, text=True, check=True)
        return proc.stdout.strip()

    def trigger_sync_baseline(self, user_id: str, days: int = 30) -> Dict[str, object]:
        payload = {
            "message": {
                "action": "sync_baseline",
                "payload": {
                    "user_id": user_id,
                    "days": days,
                },
            }
        }
        cmd = (
            "curl -sS -X POST http://127.0.0.1:18790/api/v1/agents/feishu-connector/chat "
            "-H 'Content-Type: application/json' "
            f"-d {shlex.quote(json.dumps(payload, ensure_ascii=False))}"
        )
        output = self._run_remote(cmd)
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return {"raw": output}

    def _run_remote_psql(self, sql: str) -> str:
        cmd = (
            f"PGPASSWORD={shlex.quote(self.db_pass)} psql "
            f"-h {shlex.quote(self.db_host)} "
            f"-p {shlex.quote(self.db_port)} "
            f"-U {shlex.quote(self.db_user)} "
            f"-d {shlex.quote(self.db_name)} "
            "-t -A -F '|' "
            f"-c {shlex.quote(sql)}"
        )
        return self._run_remote(cmd)

    def pick_random_workday(self, user_id: str) -> str:
        sql = f"""
WITH workdays AS (
  SELECT DISTINCT DATE(created_at) AS day
  FROM personal_context
  WHERE user_id = '{user_id}'
    AND created_at >= NOW() - INTERVAL '30 days'
    AND EXTRACT(ISODOW FROM created_at) BETWEEN 1 AND 5
)
SELECT day::text
FROM workdays
ORDER BY random()
LIMIT 1;
"""
        output = self._run_remote_psql(sql)
        return output.strip()

    def query_day_summary(self, user_id: str, day: str) -> Dict[str, object]:
        count_sql = f"""
SELECT source_type, COUNT(*)::text
FROM personal_context
WHERE user_id = '{user_id}'
  AND DATE(created_at) = DATE '{day}'
GROUP BY source_type
ORDER BY COUNT(*) DESC;
"""
        sample_sql = f"""
SELECT source_type, COALESCE(summary, '')
FROM personal_context
WHERE user_id = '{user_id}'
  AND DATE(created_at) = DATE '{day}'
ORDER BY created_at DESC
LIMIT 20;
"""
        count_raw = self._run_remote_psql(count_sql)
        sample_raw = self._run_remote_psql(sample_sql)

        counts: Dict[str, int] = {}
        for line in count_raw.splitlines():
            if not line.strip():
                continue
            source_type, cnt = line.split("|", 1)
            counts[source_type] = int(cnt)

        samples: Dict[str, List[str]] = {}
        for line in sample_raw.splitlines():
            if not line.strip():
                continue
            source_type, summary = line.split("|", 1)
            if source_type not in samples:
                samples[source_type] = []
            if len(samples[source_type]) < 3:
                text = summary.strip().replace("\n", " ")
                samples[source_type].append(text[:120] if text else "(空摘要)")

        return {
            "day": day,
            "counts_by_source_type": counts,
            "samples": samples,
            "total_items": sum(counts.values()),
        }


def shutil_which(name: str) -> bool:
    return subprocess.call(["/usr/bin/env", "bash", "-lc", f"command -v {shlex.quote(name)} >/dev/null 2>&1"]) == 0


def validate_user_id(user_id: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_.-]{3,128}", user_id))


class Handler(BaseHTTPRequestHandler):
    service = MiniService()

    def _set_headers(self, code: int = 200) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def _write_json(self, code: int, body: Dict[str, object]) -> None:
        self._set_headers(code)
        self.wfile.write(json.dumps(body, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._set_headers(204)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/v1/feishu-mini/health":
            self._write_json(200, {"code": 200, "msg": "OK", "data": {"service": "feishu-mini"}})
            return
        self._write_json(404, {"code": 404, "msg": "Not Found", "data": None})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/v1/feishu-mini/random-workday":
            self._write_json(404, {"code": 404, "msg": "Not Found", "data": None})
            return

        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length", "0"))).decode("utf-8") or "{}"
            payload = json.loads(raw)
            user_id = payload.get("user_id") or "ou_bf5204666b86bfcc508c7d31c0297507"
            if not validate_user_id(user_id):
                self._write_json(400, {"code": 400, "msg": "user_id 格式不合法", "data": None})
                return

            sync_result = self.service.trigger_sync_baseline(user_id=user_id, days=30)
            day = self.service.pick_random_workday(user_id=user_id)
            if not day:
                self._write_json(
                    200,
                    {
                        "code": 200,
                        "msg": "OK",
                        "data": {
                            "user_id": user_id,
                            "sync_result": sync_result,
                            "random_workday": None,
                            "summary": None,
                        },
                    },
                )
                return

            summary = self.service.query_day_summary(user_id=user_id, day=day)
            self._write_json(
                200,
                {
                    "code": 200,
                    "msg": "OK",
                    "data": {
                        "user_id": user_id,
                        "sync_result": sync_result,
                        "random_workday": day,
                        "summary": summary,
                    },
                },
            )
        except subprocess.CalledProcessError as e:
            self._write_json(
                500,
                {
                    "code": 500,
                    "msg": "远程命令执行失败",
                    "data": {"stderr": (e.stderr or "")[:1000]},
                },
            )
        except Exception as e:  # noqa: BLE001
            self._write_json(500, {"code": 500, "msg": f"服务异常: {e}", "data": None})


def main() -> None:
    host = "0.0.0.0"
    port = int(os.getenv("FEISHU_MINI_PORT", "8011"))
    server = HTTPServer((host, port), Handler)
    print(f"[feishu-mini] listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
