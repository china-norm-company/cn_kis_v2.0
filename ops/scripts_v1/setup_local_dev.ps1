# CN KIS V1.0 本地开发环境一键配置脚本 (Windows)
# 用法: .\scripts\setup_local_dev.ps1
# 依赖: Node.js 18+, Python 3.11, 详见 docs/PROJECT_DEPENDENCIES_ANALYSIS.md

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$ProjectRoot\package.json")) {
    $ProjectRoot = $PSScriptRoot
}
Set-Location $ProjectRoot

Write-Host "=== CN KIS V1.0 本地开发环境配置 ===" -ForegroundColor Cyan
Write-Host "项目根目录: $ProjectRoot" -ForegroundColor Gray
Write-Host "完整依赖分析: docs/PROJECT_DEPENDENCIES_ANALYSIS.md`n" -ForegroundColor Gray

# 1. 检查 Node.js
Write-Host "[1/6] 检查 Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node --version 2>$null
    if ($nodeVer) { Write-Host "  OK: Node $nodeVer" -ForegroundColor Green }
    else { throw "未找到" }
} catch {
    Write-Host "  未安装 Node.js。请从 https://nodejs.org 安装 LTS 版本，或运行: winget install OpenJS.NodeJS.LTS" -ForegroundColor Red
    exit 1
}

# 2. 安装 pnpm
Write-Host "`n[2/6] 检查 pnpm..." -ForegroundColor Yellow
try {
    $pnpmVer = pnpm --version 2>$null
    if ($pnpmVer) { Write-Host "  OK: pnpm $pnpmVer" -ForegroundColor Green }
    else { throw "未找到" }
} catch {
    Write-Host "  安装 pnpm..." -ForegroundColor Gray
    npm install -g pnpm
    Write-Host "  OK: pnpm 已安装" -ForegroundColor Green
}

# 3. 安装前端依赖
Write-Host "`n[3/6] 安装前端依赖 (pnpm install)..." -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) { Write-Host "  pnpm install 失败" -ForegroundColor Red; exit 1 }
Write-Host "  OK: 前端依赖已安装" -ForegroundColor Green

# 4. 检查 Python
Write-Host "`n[4/6] 检查 Python..." -ForegroundColor Yellow
try {
    $pyVer = python --version 2>$null
    if ($pyVer) { Write-Host "  OK: $pyVer" -ForegroundColor Green }
    else { throw "未找到" }
} catch {
    Write-Host "  未安装 Python。请运行: winget install Python.Python.3.11" -ForegroundColor Red
    exit 1
}

# 5. 创建 Python 虚拟环境并安装后端依赖
Write-Host "`n[5/6] 配置后端环境..." -ForegroundColor Yellow
$venvPath = "$ProjectRoot\backend\.venv"
if (-not (Test-Path $venvPath)) {
    python -m venv $venvPath
    Write-Host "  已创建虚拟环境: backend\.venv" -ForegroundColor Gray
}
& "$venvPath\Scripts\pip.exe" install -r "$ProjectRoot\backend\requirements.txt" -q
Write-Host "  OK: 后端依赖已安装" -ForegroundColor Green

# 6. 环境文件检查
Write-Host "`n[6/6] 检查环境配置..." -ForegroundColor Yellow
$envFile = "$ProjectRoot\deploy\.env.volcengine.plan-a"
if (Test-Path $envFile) {
    Write-Host "  OK: deploy/.env.volcengine.plan-a 已存在" -ForegroundColor Green
} else {
    Copy-Item "$ProjectRoot\deploy\.env.volcengine.plan-a.example" $envFile
    Write-Host "  已从 example 创建 deploy/.env.volcengine.plan-a（请按需填入飞书、Kimi 等凭证）" -ForegroundColor Gray
}

# 数据库迁移
Write-Host "`n执行数据库迁移 (USE_SQLITE=true)..." -ForegroundColor Yellow
$env:USE_SQLITE = "true"
$env:DJANGO_SETTINGS_MODULE = "settings"
$env:PYTHONPATH = "$ProjectRoot\backend"
& "$venvPath\Scripts\python.exe" "$ProjectRoot\backend\manage.py" migrate --noinput 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK: 数据库迁移完成" -ForegroundColor Green
} else {
    Write-Host "  迁移可能失败，请手动执行: cd backend && USE_SQLITE=true python manage.py migrate" -ForegroundColor Yellow
}

# 同步智能体
& "$venvPath\Scripts\python.exe" "$ProjectRoot\backend\manage.py" sync_agents 2>$null
Write-Host "  OK: 智能体配置已同步" -ForegroundColor Green

Write-Host "`n=== 配置完成 ===" -ForegroundColor Cyan
Write-Host @"

启动命令:
  后端:  cd backend && .\.venv\Scripts\activate && USE_SQLITE=true python manage.py runserver 8001
  前端:  pnpm dev:secretary    (秘书台 3001)
         pnpm dev:research   (研究台 3002)
         pnpm dev:quality    (质量台 3003)
         ...

Docker 全栈 (需先安装 Docker Desktop):
  docker compose up db redis backend

API 文档: http://localhost:8001/api/v1/docs
"@ -ForegroundColor White
