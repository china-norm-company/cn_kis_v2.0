# CN KIS V1.0 开发环境启动脚本
# 用法: .\scripts\start_dev.ps1 [backend|frontend|all]

param([string]$Mode = "all")

$ProjectRoot = "d:\Cursor"
$NodeDir = "$ProjectRoot\_node_extract\node-v20.18.0-win-x64"
$PythonExe = "$ProjectRoot\_python_extract\python.exe"
$SitePackages = "$ProjectRoot\backend\.venv\Lib\site-packages"

# 设置 PATH
if (Test-Path "$NodeDir\node.exe") {
    $env:Path = "$NodeDir;" + $env:Path
}

function Start-Backend {
    Write-Host "启动后端 (http://localhost:8001)..." -ForegroundColor Cyan
    $env:USE_SQLITE = "true"
    $env:DJANGO_SETTINGS_MODULE = "settings"
    $env:PYTHONPATH = "$ProjectRoot\backend"
    Set-Location "$ProjectRoot\backend"
    # 优先使用便携版 Python（依赖已安装到 _python_extract\Lib\site-packages）
    & $PythonExe manage.py runserver 8001
}

function Start-Frontend {
    Write-Host "启动前端秘书台 (http://localhost:3001)..." -ForegroundColor Cyan
    Set-Location $ProjectRoot
    & npx pnpm dev:secretary
}

switch ($Mode.ToLower()) {
    "backend" { Start-Backend }
    "frontend" { Start-Frontend }
    "all" {
        Write-Host "请开两个终端分别运行:" -ForegroundColor Yellow
        Write-Host "  终端1: .\scripts\start_dev.ps1 backend" -ForegroundColor White
        Write-Host "  终端2: .\scripts\start_dev.ps1 frontend" -ForegroundColor White
        Start-Backend
    }
    default { Start-Backend }
}
