#!/usr/bin/env python3
"""
远程执行项目分析命令

通过 SSH 连接火山云服务器，执行 analyze_recent_projects 管理命令，
将结果拉回本地进行分析。

用法:
  python3 scripts/run_project_analysis.py [--days 60] [--local]
"""
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SECRETS_FILE = PROJECT_ROOT / "deploy" / "secrets.env"
ENV_FILE = PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a"


def load_env(path: Path) -> dict:
    data = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip("'").strip('"')
    return data


def run_remote(days: int = 60):
    """通过 SSH 在服务器执行分析"""
    secrets = load_env(SECRETS_FILE)

    ssh_host = secrets.get("VOLCENGINE_SSH_HOST", "118.196.64.48")
    ssh_user = secrets.get("VOLCENGINE_SSH_USER", "root")
    ssh_key = secrets.get("VOLCENGINE_SSH_KEY", "")

    ssh_args = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=30",
    ]
    if ssh_key and Path(ssh_key).exists():
        ssh_args.extend(["-i", ssh_key])
    ssh_args.append(f"{ssh_user}@{ssh_host}")

    remote_cmd = (
        "cd /opt/cn_kis && "
        "source venv/bin/activate 2>/dev/null; "
        "cd backend && "
        f"python manage.py analyze_recent_projects --days {days} --output /tmp/project_analysis.json 2>&1"
    )

    print(f"连接 {ssh_host}...")
    print(f"执行分析（回溯 {days} 天）...\n")

    result = subprocess.run(
        ssh_args + [remote_cmd],
        capture_output=True,
        text=True,
    )

    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr[:2000])

    if result.returncode != 0:
        print(f"\n远程命令退出码: {result.returncode}")
        return

    # 拉取结果文件
    output_local = PROJECT_ROOT / "data" / "project_analysis.json"
    output_local.parent.mkdir(parents=True, exist_ok=True)

    scp_args = ["scp", "-o", "StrictHostKeyChecking=no"]
    if ssh_key and Path(ssh_key).exists():
        scp_args.extend(["-i", ssh_key])
    scp_args.extend([
        f"{ssh_user}@{ssh_host}:/tmp/project_analysis.json",
        str(output_local),
    ])

    scp_result = subprocess.run(scp_args, capture_output=True, text=True)
    if scp_result.returncode == 0:
        print(f"\n分析报告已下载至: {output_local}")
        try:
            report = json.loads(output_local.read_text(encoding="utf-8"))
            print(f"报告包含 {len(report)} 个分析维度")
        except Exception as e:
            print(f"报告解析失败: {e}")
    else:
        print(f"SCP 下载失败: {scp_result.stderr[:500]}")


def run_local(days: int = 60):
    """在本地执行（需要数据库可达）"""
    output_path = PROJECT_ROOT / "data" / "project_analysis.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "manage.py",
        "analyze_recent_projects",
        "--days", str(days),
        "--output", str(output_path),
    ]

    result = subprocess.run(
        cmd,
        cwd=PROJECT_ROOT / "backend",
        text=True,
    )

    if result.returncode == 0:
        print(f"\n分析报告已保存至: {output_path}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="运行项目启动分析")
    parser.add_argument("--days", type=int, default=60, help="回溯天数")
    parser.add_argument("--local", action="store_true", help="本地执行（需数据库可达）")
    args = parser.parse_args()

    if args.local:
        run_local(args.days)
    else:
        run_remote(args.days)


if __name__ == "__main__":
    main()
