#!/usr/bin/env python3
"""
本地 PostgreSQL SSH 隧道（sshtunnel），与 scripts/ssh_tunnel_postgres.sh 等价。

密码仅从环境变量读取，勿写入仓库：
  SSH_TUNNEL_PASS 或 VOLCENGINE_SSH_PASS

可选：deploy/secrets.env 中的 VOLCENGINE_SSH_HOST / VOLCENGINE_SSH_USER（由父 shell source 后传入，或自行 export）。

本机端口默认 5432；被占用时可：
  set SSH_TUNNEL_LOCAL_PORT=5433
  且 backend/.env 中 DB_PORT=5433
"""
from __future__ import annotations

import os
import sys
import time


def _load_secrets_env() -> None:
    """若存在 deploy/secrets.env，仅注入未设置的键（不覆盖已有环境变量）。"""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "deploy", "secrets.env")
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def main() -> None:
    _load_secrets_env()
    pw = (os.environ.get("SSH_TUNNEL_PASS") or os.environ.get("VOLCENGINE_SSH_PASS") or "").strip()
    if not pw:
        print(
            "请设置环境变量 SSH_TUNNEL_PASS 或 VOLCENGINE_SSH_PASS（或写入 deploy/secrets.env 的 VOLCENGINE_SSH_PASS）",
            file=sys.stderr,
        )
        sys.exit(1)
    host = (os.environ.get("VOLCENGINE_SSH_HOST") or "118.196.64.48").strip()
    user = (os.environ.get("VOLCENGINE_SSH_USER") or "root").strip()
    local_port = int(os.environ.get("SSH_TUNNEL_LOCAL_PORT", "5432"))
    remote_host = (os.environ.get("SSH_TUNNEL_REMOTE_HOST") or "127.0.0.1").strip()
    remote_port = int(os.environ.get("SSH_TUNNEL_REMOTE_PORT", "5432"))

    from sshtunnel import SSHTunnelForwarder

    with SSHTunnelForwarder(
        (host, 22),
        ssh_username=user,
        ssh_password=pw,
        remote_bind_address=(remote_host, remote_port),
        local_bind_address=("127.0.0.1", local_port),
    ) as tunnel:
        print(f"隧道: 本机 127.0.0.1:{local_port} -> {user}@{host} 的 PostgreSQL {remote_host}:{remote_port}")
        print("保持本窗口打开；另开终端: cd backend && python manage.py migrate && python manage.py runserver 0.0.0.0:8001")
        print("退出: Ctrl+C")
        try:
            while True:
                time.sleep(300)
        except KeyboardInterrupt:
            print("隧道已关闭")


if __name__ == "__main__":
    main()
