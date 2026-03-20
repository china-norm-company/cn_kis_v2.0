# 启动后端(8001) + 衡技工作台前端(3013)
# 用法:
#   .\scripts\start_evaluator_local.ps1              # 默认：在当前终端(Cursor)里起，不弹窗
#   .\scripts\start_evaluator_local.ps1 -ShowWindows # 弹出两个独立窗口（桌面）

param([switch]$ShowWindows)

$ErrorActionPreference = "Stop"
$ProjectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { "f:\KIS_V1.0\cn_kis_v1.0" }
if (-not (Test-Path "$ProjectRoot\backend\manage.py")) {
    $ProjectRoot = "f:\KIS_V1.0\cn_kis_v1.0"
}

Write-Host "=== 启动 后端 + 衡技(评估台) ===" -ForegroundColor Cyan
Write-Host "后端: http://127.0.0.1:8001/  前端: http://localhost:3013/evaluator/" -ForegroundColor Gray

if ($ShowWindows) {
    # 显式要弹窗：开两个独立 PowerShell 窗口
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot\backend'; `$env:USE_SQLITE='true'; .\.venv\Scripts\python.exe manage.py runserver 8001"
    Start-Sleep -Seconds 3
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; pnpm run dev:evaluator"
    Write-Host "`n已打开两个窗口。访问 http://localhost:3013/evaluator/" -ForegroundColor Green
} else {
    # 默认：不弹窗，在当前终端(Cursor)里起，输出也在当前终端
    $env:USE_SQLITE = "true"
    $backendExe = "$ProjectRoot\backend\.venv\Scripts\python.exe"

    Start-Process -FilePath $backendExe -ArgumentList "manage.py runserver 8001" -WorkingDirectory "$ProjectRoot\backend" -NoNewWindow -PassThru | Out-Null
    Start-Sleep -Seconds 2
    # Windows 上 pnpm 非 exe，用 cmd /c 启动
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm run dev:evaluator" -WorkingDirectory $ProjectRoot -NoNewWindow -PassThru | Out-Null

    Write-Host "`n已在当前终端启动后端与前端（无新窗口）。访问 http://localhost:3013/evaluator/" -ForegroundColor Green
    Write-Host "关闭：在本终端 Ctrl+C 或执行 Get-Process python,node -ErrorAction SilentlyContinue | Stop-Process -Force" -ForegroundColor Gray
}
