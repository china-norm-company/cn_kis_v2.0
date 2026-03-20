# CN KIS V1.0 一键安装与启动脚本
# 用法: .\scripts\run_setup.ps1
# 前置: Node 便携版已解压到 _node_extract，或系统已安装 Node

$ErrorActionPreference = "Stop"
$ProjectRoot = "d:\Cursor"
Set-Location $ProjectRoot

# Node 便携版路径（若存在）
$NodePortable = "$ProjectRoot\_node_extract\node-v20.18.0-win-x64"
if (Test-Path "$NodePortable\node.exe") {
    $env:Path = "$NodePortable;" + $env:Path
    Write-Host "使用便携版 Node: $NodePortable" -ForegroundColor Gray
}

# 1. 前端依赖
Write-Host "`n[1/4] 安装前端依赖 (pnpm install)..." -ForegroundColor Yellow
& npx pnpm install 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    & npx pnpm install
    if ($LASTEXITCODE -ne 0) { exit 1 }
}
Write-Host "  OK" -ForegroundColor Green

# 2. Python 后端（需系统已安装 Python 3.11）
Write-Host "`n[2/4] 配置后端..." -ForegroundColor Yellow
$venvPath = "$ProjectRoot\backend\.venv"
if (-not (Test-Path $venvPath)) {
    python -m venv $venvPath
}
& "$venvPath\Scripts\pip.exe" install -r "$ProjectRoot\backend\requirements.txt" -q
Write-Host "  OK" -ForegroundColor Green

# 3. 数据库迁移
Write-Host "`n[3/4] 数据库迁移..." -ForegroundColor Yellow
$env:USE_SQLITE = "true"
$env:DJANGO_SETTINGS_MODULE = "settings"
$env:PYTHONPATH = "$ProjectRoot\backend"
& "$venvPath\Scripts\python.exe" "$ProjectRoot\backend\manage.py" migrate --noinput 2>&1 | Out-Null
& "$venvPath\Scripts\python.exe" "$ProjectRoot\backend\manage.py" sync_agents 2>&1 | Out-Null
Write-Host "  OK" -ForegroundColor Green

# 4. 完成
Write-Host "`n[4/4] 完成" -ForegroundColor Green
Write-Host @"

启动命令:
  后端:  cd backend && .\.venv\Scripts\activate && `$env:USE_SQLITE='true'; python manage.py runserver 8001
  前端:  pnpm dev:secretary
  或:    npx pnpm dev:secretary

API 文档: http://localhost:8001/api/v1/docs
"@ -ForegroundColor White
