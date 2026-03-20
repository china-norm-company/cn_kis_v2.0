#!/usr/bin/env python3
"""
火山云 ECS 部署上传与远程配置（Windows 无 sshpass 时使用）。
用法: 在项目根目录执行 ALLOW_LEGACY_SERVER_DEPLOY=true python scripts/deploy_volcengine_upload.py
前置: 已执行 pnpm run build:all，deploy/secrets.env 已配置 VOLCENGINE_SSH_PASS。
"""
import os
import sys
import shutil
import subprocess
import tempfile
from pathlib import Path

# 项目根目录
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
os.chdir(PROJECT_ROOT)

def load_secrets():
    secrets = {}
    env_file = PROJECT_ROOT / "deploy" / "secrets.env"
    if not env_file.exists():
        print("FAIL: deploy/secrets.env 不存在")
        sys.exit(1)
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                secrets[k.strip()] = v.strip().strip("'\"")
    return secrets

def get_workstations():
    import yaml
    with open(PROJECT_ROOT / "config" / "workstations.yaml", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return [ws["key"] for ws in data["workstations"]]

def main():
    if os.environ.get("ALLOW_LEGACY_SERVER_DEPLOY") != "true":
        print("BLOCKED: 请设置 ALLOW_LEGACY_SERVER_DEPLOY=true 后执行")
        sys.exit(1)

    secrets = load_secrets()
    host = secrets.get("VOLCENGINE_SSH_HOST", "118.196.64.48")
    user = secrets.get("VOLCENGINE_SSH_USER", "root")
    password = secrets.get("VOLCENGINE_SSH_PASS", "")
    if not password or password == "请填入服务器root密码":
        print("FAIL: deploy/secrets.env 中 VOLCENGINE_SSH_PASS 未配置")
        sys.exit(1)

    workstations = get_workstations()
    print(f"工作台数量: {len(workstations)}")

    # 创建临时部署目录
    staging = Path(tempfile.mkdtemp(prefix="cn-kis-deploy-"))
    try:
        print("[2/7] 准备部署包...")
        # 后端
        (staging / "backend").mkdir(parents=True)
        for name in ["apps", "middleware", "manage.py", "settings.py", "urls.py", "wsgi.py", "requirements.txt", "db_router.py"]:
            src = PROJECT_ROOT / "backend" / name
            if src.exists():
                if src.is_dir():
                    shutil.copytree(src, staging / "backend" / name, dirs_exist_ok=True)
                else:
                    shutil.copy2(src, staging / "backend" / name)
        if (PROJECT_ROOT / "backend" / "libs").exists():
            shutil.copytree(PROJECT_ROOT / "backend" / "libs", staging / "backend" / "libs")
        # 前端构建产物
        (staging / "frontend_dist").mkdir(parents=True)
        for app in workstations:
            app_dist = PROJECT_ROOT / "apps" / app / "dist"
            if app_dist.exists():
                shutil.copytree(app_dist, staging / "frontend_dist" / app)
        # 部署配置
        shutil.copytree(PROJECT_ROOT / "deploy", staging / "deploy", dirs_exist_ok=True)
        (staging / "config").mkdir(parents=True)
        if (PROJECT_ROOT / "config").exists():
            for p in (PROJECT_ROOT / "config").iterdir():
                if p.is_file():
                    shutil.copy2(p, staging / "config" / p.name)
                else:
                    shutil.copytree(p, staging / "config" / p.name, dirs_exist_ok=True)
        # scripts（部署脚本可能被远端用到）
        shutil.copytree(PROJECT_ROOT / "scripts", staging / "scripts", dirs_exist_ok=True)

        print("[3/7] 上传到服务器...")
        import paramiko

        def sftp_upload_dir(sftp, local: Path, remote: str):
            try:
                sftp.mkdir(remote)
            except OSError:
                pass
            for item in local.iterdir():
                r = remote + "/" + item.name
                if item.is_dir():
                    sftp_upload_dir(sftp, item, r)
                else:
                    sftp.put(str(item), r)

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(host, username=user, password=password, timeout=15)
        sftp = ssh.open_sftp()

        ssh.exec_command("rm -rf /opt/cn-kis && mkdir -p /opt/cn-kis")
        for name in ["backend", "frontend_dist", "deploy", "config", "scripts"]:
            local_dir = staging / name
            if local_dir.exists():
                remote_dir = f"/opt/cn-kis/{name}"
                sftp_upload_dir(sftp, local_dir, remote_dir)
        sftp.close()

        print("  上传完成")

        print("[4/7] 配置服务器环境...")
        rem = "cd /opt/cn-kis/backend && python3 -m venv venv && . venv/bin/activate && pip install -q -U pip && pip install -q -r requirements.txt"
        stdin, stdout, stderr = ssh.exec_command(rem, get_pty=True)
        stdout.channel.recv_exit_status()
        for line in stdout:
            print(" ", line.rstrip())
        # 创建 .env（简化：只写必要变量，飞书等从 deploy/.env.volcengine.plan-a 追加）
        env_content = """DB_NAME=cn_kis
DB_USER=cn_kis
DB_PASSWORD=cn_kis_2026
DB_HOST=localhost
DB_PORT=5432
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=118.196.64.48,localhost,www.utest.cc,utest.cc,mini.china-norm.com
CORS_ORIGINS=http://118.196.64.48
"""
        plan_a = PROJECT_ROOT / "deploy" / ".env.volcengine.plan-a"
        if plan_a.exists():
            with open(plan_a, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k = line.split("=", 1)[0].strip()
                        if k.startswith("FEISHU_") or k.startswith("ARK_") or k.startswith("KIMI_") or k.startswith("VOLCENGINE_") or k.startswith("REDIS_URL"):
                            env_content += line + "\n"
        # 保留服务器上已有的 JWT_SECRET/DJANGO_SECRET_KEY，避免每次部署使旧会话失效
        stdin, stdout, stderr = ssh.exec_command("cat /opt/cn-kis/backend/.env 2>/dev/null || true")
        existing_env = stdout.read().decode("utf-8", errors="ignore")
        for line in existing_env.splitlines():
            line = line.strip()
            if line.startswith("JWT_SECRET=") or line.startswith("DJANGO_SECRET_KEY="):
                env_content += "\n" + line
        if "JWT_SECRET=" not in env_content:
            env_content += "\nJWT_SECRET=cn-kis-jwt-placeholder"
        if "DJANGO_SECRET_KEY=" not in env_content:
            env_content += "\nDJANGO_SECRET_KEY=cn-kis-prod-placeholder"
        # 写入远端 .env（通过 base64 避免引号转义问题）
        import base64
        env_b64 = base64.b64encode(env_content.encode("utf-8")).decode("ascii")
        ssh.exec_command(f"echo {env_b64} | base64 -d > /opt/cn-kis/backend/.env")
        # 占位符替换为随机值（仅当写入的是 placeholder 时）
        ssh.exec_command(
            "grep -q 'JWT_SECRET=cn-kis-jwt-placeholder' /opt/cn-kis/backend/.env && "
            "sed -i 's/JWT_SECRET=cn-kis-jwt-placeholder/JWT_SECRET=cn-kis-jwt-'$(openssl rand -hex 16)'/' /opt/cn-kis/backend/.env || true"
        )
        ssh.exec_command(
            "grep -q 'DJANGO_SECRET_KEY=cn-kis-prod-placeholder' /opt/cn-kis/backend/.env && "
            "sed -i 's/DJANGO_SECRET_KEY=cn-kis-prod-placeholder/DJANGO_SECRET_KEY=cn-kis-prod-'$(openssl rand -hex 16)'/' /opt/cn-kis/backend/.env || true"
        )
        # 数据库
        ssh.exec_command("sudo -u postgres psql -c \"CREATE USER cn_kis WITH PASSWORD 'cn_kis_2026';\" 2>/dev/null || true")
        ssh.exec_command("sudo -u postgres psql -c \"CREATE DATABASE cn_kis OWNER cn_kis;\" 2>/dev/null || true")
        ssh.exec_command("sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE cn_kis TO cn_kis;\" 2>/dev/null || true")
        # 迁移
        stdin, stdout, stderr = ssh.exec_command("cd /opt/cn-kis/backend && . venv/bin/activate && DJANGO_SETTINGS_MODULE=settings python manage.py migrate --noinput 2>&1 | tail -5", get_pty=True)
        stdout.channel.recv_exit_status()
        for line in stdout:
            print(" ", line.rstrip())
        ssh.exec_command("mkdir -p /opt/cn-kis/backend/logs /opt/cn-kis/backend/media")

        print("[5/7] 配置 Nginx...")
        ws_list = " ".join(workstations)
        nginx_cmd = f"""
set -e
REMOTE_DIR=/opt/cn-kis
for app in {ws_list}; do mkdir -p /var/www/cn-kis/$app; cp -r $REMOTE_DIR/frontend_dist/$app/* /var/www/cn-kis/$app/ 2>/dev/null || true; done
cp $REMOTE_DIR/deploy/nginx.conf /etc/nginx/sites-available/cn-kis.conf
sed -i 's/server_name localhost;/server_name 118.196.64.48 mini.utest.cc mini.china-norm.com;/' /etc/nginx/sites-available/cn-kis.conf
ln -sf /etc/nginx/sites-available/cn-kis.conf /etc/nginx/sites-enabled/cn-kis.conf
nginx -t && systemctl reload nginx
echo Nginx OK
"""
        stdin, stdout, stderr = ssh.exec_command(nginx_cmd, get_pty=True)
        stdout.channel.recv_exit_status()
        for line in stdout:
            print(" ", line.rstrip())

        print("[6/7] 配置并启动 API 服务...")
        service_content = """[Unit]
Description=CN KIS V1.0 API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cn-kis/backend
Environment="PATH=/opt/cn-kis/backend/venv/bin:/usr/bin"
EnvironmentFile=/opt/cn-kis/backend/.env
ExecStart=/opt/cn-kis/backend/venv/bin/gunicorn wsgi:application --bind 0.0.0.0:8001 --workers 2 --timeout 120
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
"""
        svc_b64 = base64.b64encode(service_content.encode("utf-8")).decode("ascii")
        ssh.exec_command(f"echo {svc_b64} | base64 -d > /etc/systemd/system/cn-kis-api.service")
        ssh.exec_command("systemctl daemon-reload && systemctl enable cn-kis-api && systemctl restart cn-kis-api && sleep 2")

        print("[7/7] 冒烟测试...")
        stdin, stdout, stderr = ssh.exec_command("curl -s -o /dev/null -w '%{http_code}' http://localhost/api/v1/health 2>/dev/null || echo 000")
        code = stdout.read().decode().strip()
        if code in ("200", "301", "302"):
            print("  ✓ API 健康检查:", code)
        else:
            print("  ✗ API 健康检查:", code)
        for app in workstations[:5]:  # 只测前几个
            stdin, stdout, stderr = ssh.exec_command(f"curl -s -o /dev/null -w '%{{http_code}}' http://localhost/{app}/ 2>/dev/null || echo 000")
            c = stdout.read().decode().strip()
            print(f"  {'✓' if c=='200' else '✗'} {app}: {c}")
        print("  ...")
        print("")
        print("========================================")
        print("  部署完成")
        for app in workstations:
            print(f"  http://118.196.64.48/{app}/")
        print("  API: http://118.196.64.48/api/v1/docs")
        print("========================================")

        ssh.close()
    finally:
        shutil.rmtree(staging, ignore_errors=True)

if __name__ == "__main__":
    main()
