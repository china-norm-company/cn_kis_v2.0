#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CN KIS V1.0 - Volcengine Deployment Script (Windows Compatible)
Uses paramiko for SSH connection, avoiding sshpass dependency
"""
import os
import sys
import tarfile
import tempfile
import shutil
from pathlib import Path

# Fix Windows console encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except:
        pass

try:
    import paramiko
    from scp import SCPClient
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "scp", "-q"])
    import paramiko
    from scp import SCPClient

# Config
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DEPLOY_DIR = PROJECT_DIR / "deploy"
REMOTE_DIR = "/opt/cn-kis"

def load_secrets():
    """Load SSH credentials"""
    secrets_file = DEPLOY_DIR / "secrets.env"
    secrets = {}
    if secrets_file.exists():
        with open(secrets_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    secrets[key.strip()] = value.strip()
    return secrets

def create_ssh_client(host, user, password):
    """Create SSH client"""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"  Connecting to {user}@{host}...")
    client.connect(host, username=user, password=password, timeout=30)
    print("  [OK] SSH connected")
    return client

def exec_remote(client, cmd, show_output=True):
    """Execute remote command"""
    stdin, stdout, stderr = client.exec_command(cmd, timeout=600)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    exit_code = stdout.channel.recv_exit_status()
    if show_output:
        if out:
            for line in out.strip().split("\n")[-10:]:
                print(f"    {line}")
        if err and exit_code != 0:
            for line in err.strip().split("\n")[-5:]:
                print(f"    [ERR] {line}")
    return exit_code, out, err

def prepare_deploy_package():
    """Prepare deployment package"""
    staging = Path(tempfile.mkdtemp())
    print(f"  Staging dir: {staging}")
    
    # Backend
    backend_src = PROJECT_DIR / "backend"
    backend_dst = staging / "backend"
    backend_dst.mkdir(parents=True)
    
    for item in ["apps", "middleware", "libs", "manage.py", "settings.py", 
                 "urls.py", "wsgi.py", "requirements.txt", "db_router.py", "_api_holder.py"]:
        src = backend_src / item
        if src.exists():
            dst = backend_dst / item
            if src.is_dir():
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)
    
    # Deploy config
    deploy_dst = staging / "deploy"
    shutil.copytree(DEPLOY_DIR, deploy_dst)
    
    # Config files
    config_src = PROJECT_DIR / "config"
    if config_src.exists():
        shutil.copytree(config_src, staging / "config")
    
    # Create tar.gz
    archive_path = staging.parent / "cn-kis-deploy.tar.gz"
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(staging, arcname=".")
    
    return archive_path, staging

def main():
    print("=" * 50)
    print("  CN KIS V1.0 Deploy to Volcengine")
    print("=" * 50)
    
    # Load credentials
    secrets = load_secrets()
    host = secrets.get("VOLCENGINE_SSH_HOST", "118.196.64.48")
    user = secrets.get("VOLCENGINE_SSH_USER", "root")
    password = secrets.get("VOLCENGINE_SSH_PASS")
    
    if not password:
        print("ERROR: SSH password not found, check deploy/secrets.env")
        return 1
    
    # Connect to server
    print("\n[1/6] Connect to server...")
    client = create_ssh_client(host, user, password)
    scp = SCPClient(client.get_transport())
    
    # Prepare deploy package
    print("\n[2/6] Prepare deploy package...")
    archive_path, staging = prepare_deploy_package()
    size_mb = archive_path.stat().st_size // 1024 // 1024
    print(f"  [OK] Package: {archive_path} ({size_mb} MB)")
    
    # Upload
    print("\n[3/6] Upload to server...")
    exec_remote(client, f"rm -rf {REMOTE_DIR} && mkdir -p {REMOTE_DIR}")
    scp.put(str(archive_path), "/tmp/cn-kis-deploy.tar.gz")
    exec_remote(client, f"tar -xzf /tmp/cn-kis-deploy.tar.gz -C {REMOTE_DIR} && rm -f /tmp/cn-kis-deploy.tar.gz")
    print("  [OK] Upload complete")
    
    # Server setup
    print("\n[4/6] Configure server environment...")
    setup_script = """
set -e
cd /opt/cn-kis/backend

echo "  Creating Python venv..."
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate

echo "  Installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --default-timeout=120

echo "  Configuring PostgreSQL..."
sudo -u postgres psql -c "CREATE USER cn_kis WITH PASSWORD 'cn_kis_2026';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE cn_kis OWNER cn_kis;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cn_kis TO cn_kis;" 2>/dev/null || true

echo "  Creating .env..."
cat > /opt/cn-kis/backend/.env << 'ENV'
DB_NAME=cn_kis
DB_USER=cn_kis
DB_PASSWORD=cn_kis_2026
DB_HOST=localhost
DB_PORT=5432
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=118.196.64.48,localhost,www.utest.cc,utest.cc,mini.china-norm.com
DJANGO_SECRET_KEY=cn-kis-prod-secret-$(openssl rand -hex 16)
CORS_ORIGINS=http://118.196.64.48
JWT_SECRET=cn-kis-jwt-secret-$(openssl rand -hex 16)
ENV

if [ -f "/opt/cn-kis/deploy/.env.volcengine.plan-a" ]; then
  grep -E '^FEISHU_|^ARK_|^KIMI_|^VOLCENGINE_|^REDIS_URL=|^WECHAT_' "/opt/cn-kis/deploy/.env.volcengine.plan-a" >> /opt/cn-kis/backend/.env 2>/dev/null || true
fi

echo "  Running database migrations..."
DJANGO_SETTINGS_MODULE=settings python manage.py migrate --noinput 2>&1 | tail -5

echo "  Seeding roles and permissions..."
DJANGO_SETTINGS_MODULE=settings python manage.py seed_roles 2>&1 | tail -3

mkdir -p /opt/cn-kis/backend/logs
mkdir -p /opt/cn-kis/backend/media
echo "  [OK] Server environment configured"
"""
    exit_code, _, _ = exec_remote(client, setup_script)
    if exit_code != 0:
        print("  WARNING: Some commands may have failed, continuing...")
    
    # Configure Nginx
    print("\n[5/6] Configure Nginx...")
    nginx_script = """
set -e
REMOTE_DIR='/opt/cn-kis'

if [ -f $REMOTE_DIR/deploy/nginx.conf ]; then
  cp $REMOTE_DIR/deploy/nginx.conf /etc/nginx/sites-available/cn-kis.conf
  sed -i 's/server_name localhost;/server_name 118.196.64.48 mini.utest.cc mini.china-norm.com;/' /etc/nginx/sites-available/cn-kis.conf
  ln -sf /etc/nginx/sites-available/cn-kis.conf /etc/nginx/sites-enabled/cn-kis.conf
  nginx -t && systemctl reload nginx
  echo "  [OK] Nginx configured"
else
  echo "  Skip Nginx config: nginx.conf not found"
fi
"""
    exec_remote(client, nginx_script)
    
    # Configure systemd service
    print("\n[6/6] Configure and start service...")
    service_script = """
set -e
cat > /etc/systemd/system/cn-kis-api.service << 'SERVICE'
[Unit]
Description=CN KIS V1.0 API (Django Ninja)
After=network.target postgresql@16-main.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/cn-kis/backend
Environment="PATH=/opt/cn-kis/backend/venv/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/cn-kis/backend/.env
ExecStart=/opt/cn-kis/backend/venv/bin/gunicorn wsgi:application --bind 0.0.0.0:8001 --workers 2 --timeout 120 --access-logfile /opt/cn-kis/backend/logs/access.log --error-logfile /opt/cn-kis/backend/logs/error.log
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable cn-kis-api
systemctl restart cn-kis-api
sleep 3
systemctl status cn-kis-api --no-pager | head -10
"""
    exec_remote(client, service_script)
    
    # Health check
    print("\n[Health Check]")
    exit_code, out, _ = exec_remote(client, "curl -s -o /dev/null -w '%{http_code}' http://localhost/api/v1/health || echo 'FAIL'", show_output=False)
    if "200" in out or "301" in out or "302" in out:
        print(f"  [OK] API health check: HTTP {out.strip()}")
    else:
        print(f"  [FAIL] API health check: {out.strip()}")
    
    # Cleanup
    shutil.rmtree(staging)
    archive_path.unlink()
    client.close()
    
    print("\n" + "=" * 50)
    print("  Deployment Complete!")
    print("=" * 50)
    print(f"  API: http://{host}/api/v1/docs")
    print(f"  Secretary: http://{host}/secretary/")
    print(f"  Evaluator: http://{host}/evaluator/")
    print("=" * 50)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
