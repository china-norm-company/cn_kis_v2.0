#!/usr/bin/env python3
import posixpath
from pathlib import Path

import paramiko


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = PROJECT_ROOT / "apps" / "control-plane" / "dist"
SECRETS_FILE = PROJECT_ROOT / "deploy" / "secrets.env"
REMOTE_DIR = "/var/www/cn-kis/control-plane"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = [part for part in remote_dir.split("/") if part]
    current = "/"
    for part in parts:
        current = posixpath.join(current, part)
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_tree(sftp: paramiko.SFTPClient, local_dir: Path, remote_dir: str) -> None:
    ensure_remote_dir(sftp, remote_dir)
    for item in local_dir.iterdir():
        remote_path = posixpath.join(remote_dir, item.name)
        if item.is_dir():
            upload_tree(sftp, item, remote_path)
        else:
            sftp.put(str(item), remote_path)


def main() -> int:
    if not DIST_DIR.exists():
        raise SystemExit("control-plane dist 不存在，请先执行构建")

    env = load_env(SECRETS_FILE)
    host = env.get("VOLCENGINE_SSH_HOST", "118.196.64.48")
    user = env.get("VOLCENGINE_SSH_USER", "root")
    password = env.get("VOLCENGINE_SSH_PASS", "")
    if not password or password == "请填入服务器root密码":
        raise SystemExit("deploy/secrets.env 中缺少有效 VOLCENGINE_SSH_PASS")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password, timeout=15)
    try:
        ssh.exec_command(f"rm -rf {REMOTE_DIR}/*")
        sftp = ssh.open_sftp()
        try:
            upload_tree(sftp, DIST_DIR, REMOTE_DIR)
        finally:
            sftp.close()
        stdin, stdout, _stderr = ssh.exec_command("nginx -t && systemctl reload nginx && echo OK")
        exit_code = stdout.channel.recv_exit_status()
        print(stdout.read().decode("utf-8", errors="ignore"))
        return exit_code
    finally:
        ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
