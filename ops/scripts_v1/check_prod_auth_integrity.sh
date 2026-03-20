#!/bin/bash
# 线上认证链路完整性体检（发布后快速验收）
# 用法:
#   bash scripts/check_prod_auth_integrity.sh
#   bash scripts/check_prod_auth_integrity.sh --quick   # 仅 3 项关键检查，约 2s
# 可选环境变量:
#   SSH_KEY=/path/to/key.pem
#   SSH_HOST=root@118.196.64.48
#   BASE_URL=http://118.196.64.48

set -euo pipefail

QUICK=0
for arg in "$@"; do
  [[ "$arg" == "--quick" ]] && QUICK=1
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${SSH_KEY:-/Users/aksu/Downloads/openclaw1.1.pem}"
SSH_HOST="${SSH_HOST:-root@118.196.64.48}"
BASE_URL="${BASE_URL:-http://118.196.64.48}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10)

PASS=0
FAIL=0

pass() {
  echo "  ✓ $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  ✗ $1"
  FAIL=$((FAIL + 1))
}

check_http_code() {
  local url="$1"
  local expect="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
  if [[ "$code" == "$expect" ]]; then
    pass "$url -> HTTP $code"
  else
    fail "$url -> HTTP $code (expect $expect)"
  fi
}

echo "========================================"
echo "  线上认证链路完整性体检"
[[ "$QUICK" -eq 1 ]] && echo "  模式: --quick（仅 3 项关键检查）"
echo "  host=$SSH_HOST"
echo "  base=$BASE_URL"
echo "========================================"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "FAIL: SSH_KEY 不存在: $SSH_KEY"
  exit 2
fi

echo "[1/6] 服务与基础依赖检查..."
if ssh "${SSH_OPTS[@]}" "$SSH_HOST" "systemctl is-active cn-kis-api >/dev/null"; then
  pass "cn-kis-api 服务运行中"
else
  fail "cn-kis-api 服务未运行"
fi

if [[ "$QUICK" -eq 0 ]]; then
  if ssh -n "${SSH_OPTS[@]}" "$SSH_HOST" "systemctl is-active redis-server >/dev/null && redis-cli -h 127.0.0.1 -p 6379 ping | grep -q PONG"; then
    pass "redis-server 运行且可访问"
  else
    fail "redis-server 不可用（会影响 state 防重放缓存）"
  fi
fi

echo "[2/6] 线上认证核心标记检查..."
if ssh -n "${SSH_OPTS[@]}" "$SSH_HOST" "python3 - <<'PY'
from pathlib import Path
import sys
p = Path('/opt/cn-kis/backend/apps/identity/services.py')
if not p.exists():
    print('missing services.py')
    sys.exit(2)
text = p.read_text(errors='ignore')
required = ['def _normalize_oauth_code', 'AUTH_CODE_MISSING', 'feishu_oauth_exchange_failed']
missing = [m for m in required if m not in text]
if missing:
    print('missing markers:', ','.join(missing))
    sys.exit(3)
print('ok')
PY"; then
  pass "线上认证核心版本正确"
else
  fail "线上认证核心版本异常（可能旧代码覆盖）"
fi

if [[ "$QUICK" -eq 0 ]]; then
  echo "[3/6] 本地-线上关键文件哈希一致性..."
  python3 - <<'PY' >/tmp/cn_kis_hash_pairs.txt
from pathlib import Path
import hashlib
pairs = [
    ('/Users/aksu/Cursor/CN_KIS_V1.0/backend/apps/identity/services.py', '/opt/cn-kis/backend/apps/identity/services.py'),
    ('/Users/aksu/Cursor/CN_KIS_V1.0/backend/apps/identity/api.py', '/opt/cn-kis/backend/apps/identity/api.py'),
    ('/Users/aksu/Cursor/CN_KIS_V1.0/deploy/nginx.conf', '/opt/cn-kis/deploy/nginx.conf'),
    ('/Users/aksu/Cursor/CN_KIS_V1.0/backend/settings.py', '/opt/cn-kis/backend/settings.py'),
    ('/Users/aksu/Cursor/CN_KIS_V1.0/backend/db_router.py', '/opt/cn-kis/backend/db_router.py'),
]
for local, remote in pairs:
    h = hashlib.sha256(Path(local).read_bytes()).hexdigest()
    print(local, remote, h)
PY

  while read -r local remote local_hash; do
    remote_hash="$(ssh -n "${SSH_OPTS[@]}" "$SSH_HOST" "python3 - <<'PY'
from pathlib import Path
import hashlib
p = Path('$remote')
print(hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else 'MISSING')
PY")"
    if [[ "$remote_hash" == "$local_hash" ]]; then
      pass "$remote 与本地一致"
    else
      fail "$remote 与本地不一致"
    fi
  done < /tmp/cn_kis_hash_pairs.txt
  rm -f /tmp/cn_kis_hash_pairs.txt
fi

if [[ "$QUICK" -eq 0 ]]; then
  echo "[4/6] HTTP 健康检查..."
  check_http_code "$BASE_URL/api/v1/health" "200"
fi

echo "[5/6] 认证回调行为检查..."
callback_resp="$(curl -s -X POST "$BASE_URL/api/v1/auth/feishu/callback" \
  -H "Content-Type: application/json" \
  -d '{"code":"test invalid code","workstation":"secretary","app_id":"cli_a907f21f0723dbce"}' || true)"
if [[ "$callback_resp" == *"AUTH_OAUTH_FAILED"* && "$callback_resp" == *"error_code"* ]]; then
  pass "认证回调返回结构化错误（非旧版 None）"
else
  fail "认证回调返回异常: $callback_resp"
fi

if [[ "$QUICK" -eq 0 ]]; then
  echo "[6/6] Nginx 冲突检查..."
  nginx_conflict_count="$(ssh -n "${SSH_OPTS[@]}" "$SSH_HOST" "python3 - <<'PY'
from pathlib import Path
base = Path('/etc/nginx/sites-enabled')
hits = [p.name for p in base.glob('*') if 'cn-kis.conf.bak' in p.name]
print(len(hits))
PY")"
  if [[ "$nginx_conflict_count" == "0" ]]; then
    pass "未发现 Nginx 备份配置冲突"
  else
    fail "发现 $nginx_conflict_count 个 Nginx 备份冲突配置"
  fi
fi

echo ""
echo "========================================"
if [[ "$FAIL" -gt 0 ]]; then
  echo "  体检未通过: PASS=$PASS FAIL=$FAIL"
  echo "========================================"
  exit 1
else
  echo "  体检通过: PASS=$PASS FAIL=$FAIL"
  echo "========================================"
fi
