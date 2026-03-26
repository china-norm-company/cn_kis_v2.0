"""
本地端口转发：本机 DB_PORT -> 远端 localhost:5432（PostgreSQL）。
需密码时：在**本机终端**设置环境变量 SSH_TUNNEL_PWD 后运行（勿把密码写入仓库或提交到 Git）。

  pip install sshtunnel paramiko
  $env:SSH_TUNNEL_PWD = "你的SSH密码"
  python scripts/pg_ssh_tunnel.py

可选：密钥则设置 SSH_TUNNEL_KEY 为 .pem 路径，可不设密码。
默认连接：root@118.196.64.48，本机 5432；可用环境变量覆盖。
"""
from __future__ import annotations

import os
import sys
import threading

HOST = os.environ.get("VOLCENGINE_SSH_HOST", "118.196.64.48")
USER = os.environ.get("VOLCENGINE_SSH_USER", "root")
LOCAL_PORT = int(os.environ.get("SSH_TUNNEL_LOCAL_PORT", "5432"))
KEY_PATH = os.environ.get("SSH_TUNNEL_KEY", "") or os.environ.get("VOLCENGINE_SSH_KEY", "")


def main() -> None:
    try:
        from sshtunnel import SSHTunnelForwarder
    except ImportError:
        print("请先安装: pip install sshtunnel paramiko", file=sys.stderr)
        sys.exit(1)

    ssh_password = os.environ.get("SSH_TUNNEL_PWD") or os.environ.get("VOLCENGINE_SSH_PASS")
    ssh_pkey = None
    if KEY_PATH and os.path.isfile(KEY_PATH):
        ssh_pkey = KEY_PATH

    if not ssh_pkey and not ssh_password:
        print(
            "请设置 SSH_TUNNEL_KEY 指向 .pem，或设置 SSH_TUNNEL_PWD（仅本机环境变量，勿写入仓库）。",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"隧道: 127.0.0.1:{LOCAL_PORT} -> {USER}@{HOST} 上 PostgreSQL (远端 5432)")
    print("保持本进程运行；另开终端启动 backend。Ctrl+C 退出。")

    with SSHTunnelForwarder(
        (HOST, 22),
        ssh_username=USER,
        ssh_password=ssh_password if ssh_password else None,
        ssh_pkey=ssh_pkey,
        ssh_private_key_password=None,
        remote_bind_address=("127.0.0.1", 5432),
        local_bind_address=("127.0.0.1", LOCAL_PORT),
    ) as tunnel:
        tunnel.start()
        # 后台/无 TTY 时 input() 会立即 EOF；用事件阻塞保持隧道常驻
        threading.Event().wait()


if __name__ == "__main__":
    main()
