# 建立 SSH 隧道：本机 $LocalPort -> 服务器 PostgreSQL 5432
# 与 scripts/ssh_tunnel_postgres.sh 行为一致；保持本窗口打开，另开终端跑 backend。
#
# 用法（项目根目录）:
#   .\scripts\ssh_tunnel_postgres.ps1
# 本机端口被占用时:
#   $env:SSH_TUNNEL_LOCAL_PORT = "5433"; .\scripts\ssh_tunnel_postgres.ps1
#   并在 backend\.env 中设置 DB_PORT=5433

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

$Secrets = Join-Path $Root "deploy\secrets.env"
if (Test-Path $Secrets) {
  Get-Content $Secrets -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $name = $line.Substring(0, $i).Trim()
    $val = $line.Substring($i + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Trim('"') }
    Set-Item -Path "Env:$name" -Value $val
  }
}

$User = if ($env:VOLCENGINE_SSH_USER) { $env:VOLCENGINE_SSH_USER } else { "root" }
$HostAddr = if ($env:VOLCENGINE_SSH_HOST) { $env:VOLCENGINE_SSH_HOST } else { "118.196.64.48" }
$Key = if ($env:VOLCENGINE_SSH_KEY) { $env:VOLCENGINE_SSH_KEY } else { "" }
$LocalPort = if ($env:SSH_TUNNEL_LOCAL_PORT) { $env:SSH_TUNNEL_LOCAL_PORT } else { "5432" }

Write-Host "隧道: 本机 ${LocalPort} -> ${User}@${HostAddr} 的 PostgreSQL (远端 5432)" -ForegroundColor Cyan
Write-Host "保持本窗口打开；另开终端: cd backend && python manage.py runserver 8001" -ForegroundColor Gray
Write-Host "退出请按 Ctrl+C`n" -ForegroundColor Gray

$SshArgs = @(
  "-N",
  "-L", "${LocalPort}:localhost:5432",
  "-o", "StrictHostKeyChecking=no",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=10",
  "-o", "TCPKeepAlive=yes"
)
if ($Key -ne "" -and (Test-Path -LiteralPath $Key)) {
  $SshArgs = @("-i", $Key) + $SshArgs
} elseif ($Key -ne "") {
  Write-Warning "VOLCENGINE_SSH_KEY 已设置但文件不存在: $Key"
}

$SshArgs = $SshArgs + "${User}@${HostAddr}"
& ssh @SshArgs
