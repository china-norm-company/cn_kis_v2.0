# CN KIS V1.0 本地开发环境启动脚本
# 用法: .\scripts\local_dev_start.ps1
# 前置条件: Docker 已安装并运行（用于 PostgreSQL + Redis）

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $ProjectRoot

Write-Host "=== CN KIS 本地开发启动 ===" -ForegroundColor Cyan

# 1. 检查 Docker
$dockerOk = $false
try {
    $null = docker info 2>&1
    $dockerOk = $true
} catch {}

if (-not $dockerOk) {
    Write-Host "`n[Docker 未运行] 请先安装并启动 Docker Desktop，然后重新运行本脚本。" -ForegroundColor Yellow
    Write-Host "下载地址: https://www.docker.com/products/docker-desktop/" -ForegroundColor Gray
    exit 1
}

# 2. 启动 PostgreSQL + Redis
Write-Host "`n启动 PostgreSQL 和 Redis (docker compose)..." -ForegroundColor Green
docker compose up db redis -d
Start-Sleep -Seconds 5

# 3. 后端迁移与启动
Write-Host "`n执行数据库迁移..." -ForegroundColor Green
Push-Location backend
$env:PYTHONUTF8 = "1"
$env:USE_DUMMY_CACHE = "true"
# 使用 docker 网桥时 DB_HOST=localhost（端口映射）
python manage.py migrate --noinput
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "迁移失败。请确认 PostgreSQL 已就绪: docker compose logs db" -ForegroundColor Red
    exit 1
}
python manage.py sync_agents 2>$null
Pop-Location

# 4. 启动后端（后台）
Write-Host "`n启动后端 (Django 8001)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\backend'; `$env:PYTHONUTF8='1'; `$env:USE_DUMMY_CACHE='true'; python manage.py runserver 8001"

# 5. 启动招募台、接待台
Write-Host "`n启动招募台 (3009) 和接待台 (3016)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; pnpm dev:recruitment"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; pnpm dev:reception"

Write-Host "`n=== 启动完成 ===" -ForegroundColor Cyan
Write-Host "招募台:  http://localhost:3009/recruitment/" -ForegroundColor White
Write-Host "接待台:  http://localhost:3016/reception/" -ForegroundColor White
Write-Host "API 文档: http://localhost:8001/api/v1/docs" -ForegroundColor White
